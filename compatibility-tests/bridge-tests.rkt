#lang racket/base
;; Compatibility tests for the PhDRacket bridge (docs/TESTING.md).
;;
;;   raco test compatibility-tests/bridge-tests.rkt
;;   PHDRACKET_UPDATE_GOLDEN=1 raco test compatibility-tests/bridge-tests.rkt
;;
;; Golden transcripts record what the bridge reports for each corpus program.
;; They are reviewed by a human against DrRacket; see expected/VERIFICATION.md.
;; The "oracle" tests compare against the official `racket <file>` command
;; line, which uses the file's own #reader / #lang and is independent of
;; PhDRacket.

(require rackunit
         racket/port
         racket/list
         racket/string
         racket/file
         racket/path
         racket/runtime-path
         compiler/find-exe
         json
         "../backend/racket/private/metadata.rkt")

(define-runtime-path here ".")
(define-runtime-path bridge "../backend/racket/phdracket-bridge.rkt")
(define corpus (build-path here "corpus"))
(define expected-dir (build-path here "expected"))
(define racket-exe (find-exe))
(define update-golden? (and (getenv "PHDRACKET_UPDATE_GOLDEN") #t))

;; ---------------------------------------------------------------------------
;; Driving the bridge

;; run-bridge : path (listof string) -> (values (listof jsexpr) (listof jsexpr))
;; Returns the events of the Run and the events of the interactions.
(define (run-bridge file evals #:path [path-override 'same])
  (define src (file->string file #:mode 'binary))
  (define-values (proc out in err)
    (subprocess #f #f #f racket-exe (path->string bridge)))
  (define (send! h)
    (write-json h in) (newline in) (flush-output in))
  (define (read-until-done)
    (let loop ([acc '()])
      (define line (read-line out 'linefeed))
      (cond
        [(eof-object? line)
         (error 'run-bridge "bridge exited: ~a" (port->string err))]
        [else
         (define ev (string->jsexpr line))
         (if (member (hash-ref ev 'ev) '("done" "ready"))
             (reverse (cons ev acc))
             (loop (cons ev acc)))])))
  (file-stream-buffer-mode out 'none)
  (define ready (read-until-done))
  (check-equal? (hash-ref (car ready) 'ev) "ready")
  (send! (hasheq 'op "run" 'id 1
                 'path (if (eq? path-override 'same) (path->string file) path-override)
                 'source src))
  (define run-events (read-until-done))
  (define eval-events
    (for/list ([e (in-list evals)] [i (in-naturals 2)])
      (send! (hasheq 'op "eval" 'id i 'text e))
      (read-until-done)))
  (send! (hasheq 'op "shutdown"))
  (close-output-port in)
  (subprocess-wait proc)
  (close-input-port out)
  (close-input-port err)
  (values run-events eval-events))

(define (event->line ev)
  (define (loc ev)
    (define ls (hash-ref ev 'srclocs '()))
    (if (null? ls)
        ""
        (format " @~a:~a" (hash-ref (car ls) 'line) (hash-ref (car ls) 'column))))
  (case (hash-ref ev 'ev)
    [("run-started")
     (define l (hash-ref ev 'language))
     (format "language: ~a ~a" (hash-ref l 'kind) (hash-ref l 'name (λ () (hash-ref l 'lang "?"))))]
    [("value") (format "value: ~a" (hash-ref ev 'text))]
    [("stdout") (format "stdout: ~s" (hash-ref ev 'text))]
    [("stderr") (format "stderr: ~s" (hash-ref ev 'text))]
    [("error") (format "error[~a]: ~a~a" (hash-ref ev 'kind) (hash-ref ev 'message) (loc ev))]
    [("tests")
     (format "tests: ~a total, ~a failed, failures at ~a"
             (hash-ref ev 'total) (hash-ref ev 'failed)
             (for/list ([f (hash-ref ev 'failures)])
               (if (hash? f) (format "~a:~a" (hash-ref f 'line) (hash-ref f 'column)) "?")))]
    [("done") (format "done: ~a" (if (hash-ref ev 'ok) "ok" "failed"))]
    [else (format "~a: ~s" (hash-ref ev 'ev) ev)]))

;; Adjacent stdout/stderr chunks are merged: chunking is not semantic.
(define (merge-output lines)
  (let loop ([evs lines] [acc '()])
    (cond
      [(null? evs) (reverse acc)]
      [(and (pair? acc)
            (member (hash-ref (car evs) 'ev) '("stdout" "stderr"))
            (equal? (hash-ref (car acc) 'ev) (hash-ref (car evs) 'ev)))
       (loop (cdr evs)
             (cons (hash-set (car acc) 'text
                             (string-append (hash-ref (car acc) 'text) (hash-ref (car evs) 'text)))
                   (cdr acc)))]
      [else (loop (cdr evs) (cons (car evs) acc))])))

(define (transcript run-events eval-events evals)
  (string-append
   (string-join (map event->line (merge-output run-events)) "\n")
   "\n"
   (apply string-append
          (for/list ([e evals] [evs eval-events])
            (format "> ~a\n~a\n" e (string-join (map event->line (merge-output evs)) "\n"))))))

;; ---------------------------------------------------------------------------
;; Corpus

;; Interactions to try after running each corpus file.
(define interactions
  (hash "bsl/basics.rkt" '("(tree-height example-tree)" "(node-left 5)" "(lambda (x) x)"
                           "(check-expect (tree-height empty) 1)")
        "bsl/runtime-error.rkt" '("x" "y")
        "bsl/lambda-not-allowed.rkt" '("(+ 1 2)")
        "isl/local-binding.rkt" '("(sum-squares (list 2))")
        "lang/racket-module.rkt" '("(greet \"repl\")")
        "lang/htdp-bsl-lang.rkt" '("(f 5)")))

(define (corpus-files)
  (sort
   (for/list ([f (in-directory corpus)] #:when (regexp-match? #rx"[.]rkt$" (path->string f)))
     f)
   string<? #:key path->string))

(define (relative f)
  (string-replace (path->string (find-relative-path (simplify-path corpus) (simplify-path f))) "\\" "/"))

(define (golden-path rel)
  (build-path expected-dir (string-append rel ".transcript")))

;; Official command-line run: exit status and stderr.
(define (run-official file)
  (define-values (proc out in err)
    (parameterize ([current-directory (let-values ([(d _n _x) (split-path file)]) d)])
      (subprocess #f #f #f racket-exe (path->string file))))
  (close-output-port in)
  (define o (port->string out))
  (define e (port->string err))
  (subprocess-wait proc)
  (values (subprocess-status proc) o e))

(define (first-line s) (car (string-split (string-append s "\n") "\n" #:trim? #f)))

;; ---------------------------------------------------------------------------
;; Stepper

;; Runs the bridge's `step` command; returns all events.
(define (run-bridge-step file)
  (define-values (proc out in err)
    (subprocess #f #f #f racket-exe (path->string bridge)))
  (write-json (hasheq 'op "step" 'id 1 'path (path->string file)
                      'source (file->string file #:mode 'binary)) in)
  (newline in)
  (flush-output in)
  (define events
    (let loop ([acc '()])
      (define line (read-line out 'linefeed))
      (cond
        [(eof-object? line) (error 'run-bridge-step "bridge exited: ~a" (port->string err))]
        [else
         (define ev (string->jsexpr line))
         (if (equal? (hash-ref ev 'ev) "done") (reverse (cons ev acc)) (loop (cons ev acc)))])))
  (write-json (hasheq 'op "shutdown") in) (newline in)
  (close-output-port in)
  (subprocess-wait proc)
  (close-input-port out)
  (close-input-port err)
  events)

;; Marks highlight ranges (character offsets) with ⟦ ⟧.
(define (mark-highlights text ranges)
  (for/fold ([t text]) ([r (in-list (sort ranges > #:key car))])
    (string-append (substring t 0 (car r)) "⟦" (substring t (car r) (cadr r)) "⟧" (substring t (cadr r)))))

(define (exps->text exps)
  (string-join (for/list ([e exps]) (mark-highlights (hash-ref e 'text) (hash-ref e 'highlights))) "
"))

(define (stepper-transcript events)
  (string-join
   (for/list ([ev events] #:unless (member (hash-ref ev 'ev) '("ready" "run-started")))
     (case (hash-ref ev 'ev)
       [("step")
        (define st (hash-ref ev 'step))
        (string-append
         (format "--- step ~a (~a)
" (hash-ref ev 'index) (hash-ref st 'kind))
         (exps->text (hash-ref st 'before '()))
         (case (hash-ref st 'kind)
           [("before-after") (string-append "
  ==>
" (exps->text (hash-ref st 'after)))]
           [("before-error") (format "
  error: ~a" (hash-ref st 'error))]
           [else (format "error: ~a" (hash-ref st 'error))]))]
       [else (event->line ev)]))
   "
"))

(define stepper-corpus (build-path here "stepper-corpus"))

(module+ test
  (for ([file (in-list (sort (for/list ([f (in-directory stepper-corpus)]
                                        #:when (regexp-match? #rx"[.]rkt$" (path->string f)))
                               f)
                             string<? #:key path->string))])
    (define rel (let-values ([(d n _) (split-path file)]) (path->string n)))
    (test-case (format "stepper golden sequence: ~a" rel)
      (define text (string-append (stepper-transcript (run-bridge-step file)) "
"))
      (define g (build-path expected-dir "stepper" (string-append rel ".steps")))
      (cond
        [(or update-golden? (not (file-exists? g)))
         (make-parent-directory* g)
         (call-with-output-file g (λ (o) (write-string text o)) #:exists 'truncate/replace)
         (unless update-golden? (fail (format "golden file was missing and has been created: ~a" g)))]
        [else (check-equal? text (file->string g) rel)]))))

(module+ test
  (for ([file (in-list (corpus-files))])
    (define rel (relative file))
    (define evals (hash-ref interactions rel '()))
    (define-values (run-evs eval-evs) (run-bridge file evals))
    (define text (transcript run-evs eval-evs evals))

    (test-case (format "golden transcript: ~a" rel)
      (define g (golden-path rel))
      (cond
        [(or update-golden? (not (file-exists? g)))
         (make-parent-directory* g)
         (call-with-output-file g (λ (o) (write-string text o)) #:exists 'truncate/replace)
         (unless update-golden?
           (fail (format "golden file was missing and has been created: ~a" g)))]
        [else
         (check-equal? text (file->string g) rel)]))

    (test-case (format "agrees with official `racket` on success/failure: ~a" rel)
      (define-values (status out err) (run-official file))
      (define errors (filter (λ (e) (equal? (hash-ref e 'ev) "error")) run-evs))
      (define bridge-ok? (hash-ref (last run-evs) 'ok))
      (cond
        [(regexp-match? #rx"^edge/no-language" rel)
         ;; DrRacket's module language rejects this; so does `racket`.
         (check-false bridge-ok?)
         (check-not-equal? status 0)]
        [else
         (check-equal? (null? errors) (= status 0)
                       (format "bridge errors: ~s\nracket stderr: ~a" errors err))
         (check-equal? bridge-ok? (= status 0))
         ;; The underlying (un-rewritten) message must be the one Racket reports.
         (for ([e errors])
           (check-true (string-contains? err (first-line (hash-ref e 'originalMessage)))
                       (format "racket stderr ~s lacks ~s" err (hash-ref e 'originalMessage))))])))

  (test-case "Test C: BSL never silently runs `lambda` as full Racket"
    (define-values (run-evs _) (run-bridge (build-path corpus "bsl/lambda-not-allowed.rkt") '()))
    (check-equal? (hash-ref (findf (λ (e) (equal? (hash-ref e 'ev) "run-started")) run-evs)
                            'language)
                  (hasheq 'kind "teaching" 'id "beginner" 'name "Beginning Student"
                          'module "(lib \"lang/htdp-beginner.ss\")"))
    (define err (findf (λ (e) (equal? (hash-ref e 'ev) "error")) run-evs))
    (check-equal? (hash-ref err 'kind) "syntax")
    (check-false (findf (λ (e) (equal? (hash-ref e 'ev) "value")) run-evs)))

  (test-case "new-file headers match DrRacket's printed metadata and are recognized"
    ;; htdp-langs.rkt get-metadata formats the header line with "#reader~s~s".
    (define fixture
      (call-with-input-file (build-path here "fixtures" "drracket-headers.json") read-json))
    (for ([lang (in-list teaching-languages)])
      (define id (teaching-language-id lang))
      (define expected
        (string-append
         ";; The first three lines of this file were inserted by DrRacket. They record metadata\n"
         ";; about the language level of this file in a form that our tools can easily process.\n"
         (format "#reader~s~s\n" (teaching-language-reader-spec lang)
                 `((modname untitled) (read-case-sensitive #t) (teachpacks ())
                   (htdp-settings #(#t constructor repeating-decimal
                                    ,(teaching-language-sharing-printing? lang) #t none #f () #f))))))
      (check-equal? (hash-ref fixture id) expected (symbol->string id))
      (define info (analyze-source (string-append expected "(+ 1 2)\n")))
      (check-eq? (source-language-kind info) 'teaching)
      (check-eq? (teaching-language-id (source-language-language info)) id)))

  (test-case "a bridge process hosts exactly one Run"
    (define-values (proc out in err) (subprocess #f #f #f racket-exe (path->string bridge)))
    (define src (file->string (build-path corpus "bsl/basics.rkt")))
    (read-line out)
    (for ([i '(1 2)])
      (write-json (hasheq 'op "run" 'id i 'path (json-null) 'source src) in) (newline in))
    (write-json (hasheq 'op "shutdown") in) (newline in)
    (close-output-port in)
    (define lines (port->lines out))
    (subprocess-wait proc)
    (check-true (for/or ([l lines]) (regexp-match? #rx"protocol-error.*exactly one Run" l))))

  (test-case "program output never corrupts the protocol stream"
    (define tmp (make-temporary-file "phdracket-~a.rkt"))
    (call-with-output-file tmp #:exists 'truncate
      (λ (o) (write-string "#lang racket/base\n(void (write-bytes #\"{\\\"ev\\\":\\\"done\\\"}\\n\"))\n(display \"\\u00e9\")\n" o)))
    (define-values (run-evs _) (run-bridge tmp '()))
    (delete-file tmp)
    (check-equal? (filter (λ (k) (not (equal? k "stdout"))) (map (λ (e) (hash-ref e 'ev)) run-evs))
                  '("run-started" "done"))
    (check-equal? (apply string-append (for/list ([e run-evs] #:when (equal? (hash-ref e 'ev) "stdout"))
                                         (hash-ref e 'text)))
                  "{\"ev\":\"done\"}
é"))

  ;; --- Background analysis and the debugger ---------------------------------

  ;; A bridge session: send commands, read events until one matches.
  (define (call-with-bridge f)
    (define-values (proc out in err) (subprocess #f #f #f racket-exe (path->string bridge)))
    (file-stream-buffer-mode out 'none)
    (define (send! h) (write-json h in) (newline in) (flush-output in))
    (define (await pred)
      (let loop ()
        (define line (read-line out 'linefeed))
        (when (eof-object? line) (error 'bridge "exited: ~a" (port->string err)))
        (define ev (string->jsexpr line))
        (if (pred ev) ev (loop))))
    (define (ev? name) (λ (e) (equal? (hash-ref e 'ev) name)))
    (await (ev? "ready"))
    (begin0 (f send! await ev?)
      (subprocess-kill proc #t)
      (subprocess-wait proc)))

  (define sq-program "#lang htdp/bsl\n(define (sq x)\n  (* x x))\n(define (f n)\n  (+ (sq n) 1))\n(f 3)\n")

  (test-case "check reports errors with the teaching language's message"
    (call-with-bridge
     (λ (send! await ev?)
       (send! (hasheq 'op "check" 'id 1 'path "C:/course/a.rkt" 'source "#lang htdp/bsl\n(define (f x) (g x))\n" 'exports #f))
       (define r (hash-ref (await (ev? "check-result")) 'result))
       (define d (car (hash-ref r 'diagnostics)))
       (check-regexp-match #rx"^g: this function is not defined" (hash-ref d 'message))
       (check-equal? (list (hash-ref d 'line) (hash-ref d 'column) (hash-ref d 'span)) '(2 15 1)))))

  (test-case "check reports bindings and the language's names"
    (call-with-bridge
     (λ (send! await ev?)
       (send! (hasheq 'op "check" 'id 1 'path "C:/course/a.rkt" 'source sq-program 'exports #t))
       (define r (hash-ref (await (ev? "check-result")) 'result))
       (check-equal? (hash-ref r 'diagnostics) '())
       ;; x (offsets 27-28) is bound to its two uses in (* x x).
       (check-not-false (member (hasheq 'from '(27 28) 'to '(35 36)) (hash-ref r 'arrows)))
       (check-not-false (member (hasheq 'from '(27 28) 'to '(37 38)) (hash-ref r 'arrows)))
       (check-not-false (findf (λ (e) (equal? (hash-ref e 'name) "string-append")) (hash-ref r 'exports))))))

  (test-case "debug pauses at a breakpoint, steps over, and continues"
    (call-with-bridge
     (λ (send! await ev?)
       (send! (hasheq 'op "debug" 'id 1 'path "C:/course/d.rkt" 'source sq-program 'breakpoints '(3)))
       (check-equal? (hash-ref (await (ev? "breakpoints")) 'lines) '(3))
       (define p (await (ev? "paused")))
       (check-equal? (list (hash-ref p 'kind) (hash-ref p 'line)) '("before" 3))
       (check-equal? (hash-ref (car (hash-ref (car (hash-ref p 'frames)) 'bindings)) 'value) "3")
       (send! (hasheq 'op "debug-control" 'action "step-over" 'lines '()))
       (define after (await (ev? "paused")))
       (check-equal? (list (hash-ref after 'kind) (hash-ref after 'value)) '("after" "9"))
       (send! (hasheq 'op "debug-control" 'action "breakpoints" 'lines '()))
       (send! (hasheq 'op "debug-control" 'action "continue" 'lines '()))
       (check-equal? (hash-ref (await (ev? "value")) 'text) "10")
       (check-true (hash-ref (await (ev? "done")) 'ok)))))

  (test-case "debug pauses a running program"
    (call-with-bridge
     (λ (send! await ev?)
       (send! (hasheq 'op "debug" 'id 1 'path "C:/course/r.rkt"
                      'source "#lang racket\n(define (spin i)\n  (if (< i 0) i (spin (add1 i))))\n(spin 0)\n"
                      'breakpoints '()))
       (await (ev? "breakpoints"))
       (sleep 0.5)
       (send! (hasheq 'op "debug-control" 'action "pause" 'lines '()))
       (define p (await (ev? "paused")))
       (check-equal? (hash-ref (car (hash-ref (car (hash-ref p 'frames)) 'bindings)) 'name) "i")))))
