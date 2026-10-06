#lang racket/base
;; PhDRacket bridge.
;;
;; This program runs inside the user's official Racket installation and is the
;; only part of PhDRacket that evaluates student code. It deliberately reuses
;; the same htdp-lib / DrRacket entry points that DrRacket uses, so that Racket
;; remains the semantic authority:
;;
;;   teaching languages:  lang/run-teaching-program  (expand-teaching-program)
;;                        htdp/bsl/runtime           (configure/settings)
;;                        test-engine                (test, test-object)
;;   #lang modules:       the module-language sequence in
;;                        drracket/private/module-language.rkt
;;
;; One bridge process hosts exactly one Run. "Run" in the IDE terminates the
;; previous process and uses a fresh one, which is the strongest possible
;; form of DrRacket's "reset the interactions".
;;
;; Protocol: one JSON object per line.
;;   stdin  (commands): {"op":"run","id":N,"path":P,"source":S}
;;                      {"op":"debug","id":N,"path":P,"source":S,"breakpoints":[line ...]}
;;                      {"op":"debug-control","action":A,"lines":[line ...]}
;;                      {"op":"eval","id":N,"text":S}
;;                      {"op":"check","id":N,"path":P,"source":S,"exports":B}
;;                      {"op":"shutdown"}
;; Commands are read on their own thread, so debug-control reaches a program
;; that is running or paused.
;;   stdout (events):   see docs/ARCHITECTURE.md ("Bridge protocol").
;; Everything the student program writes is captured and forwarded as events;
;; the bridge's real stdout carries protocol messages only.

(require racket/port
         racket/list
         racket/string
         json
         racket/async-channel
         racket/runtime-path
         "private/metadata.rkt"
         "private/stepper-adapter.rkt")

;; Background analysis and the debugger load DrRacket's Check Syntax and
;; debugger libraries, which take a while to load; only the processes that
;; check or debug load them.
(define-runtime-path analysis-module "private/analysis.rkt")
(define-runtime-path debugger-module "private/debugger.rkt")
(define (check-program . args) (apply (dynamic-require analysis-module 'check-program) args))
(define (start-debugging! . args) (apply (dynamic-require debugger-module 'start-debugging!) args))
(define (debug-eval old) ((dynamic-require debugger-module 'debug-eval) old))
(define (debug-control! . args)
  ;; Only a process that is debugging has loaded the debugger.
  (when (module-declared? debugger-module #f)
    (apply (dynamic-require debugger-module 'debug-control!) args)))

(define protocol-version 1)

;; ---------------------------------------------------------------------------
;; Event output

(define proto-out (current-output-port))
(define emit-lock (make-semaphore 1))

(define (emit! ev . kvs)
  (define h
    (let loop ([h (hasheq 'ev (symbol->string ev))] [kvs kvs])
      (if (null? kvs) h (loop (hash-set h (car kvs) (cadr kvs)) (cddr kvs)))))
  (call-with-semaphore
   emit-lock
   (λ ()
     (write-json h proto-out)
     (newline proto-out)
     (flush-output proto-out))))

(define replacement-char (integer->char #xFFFD))

;; An output port that forwards everything written to it as `kind` events.
;; Incomplete UTF-8 sequences are held back until the next write.
(define (make-forwarding-port kind)
  (define pending #"")
  (make-output-port
   kind
   always-evt
   (λ (bs start end non-block? breakable?)
     (define chunk (bytes-append pending (subbytes bs start end)))
     (define cut (complete-utf8-prefix-length chunk))
     (set! pending (subbytes chunk cut))
     (when (> cut 0)
       (emit! kind 'text (bytes->string/utf-8 (subbytes chunk 0 cut) replacement-char)))
     (- end start))
   (λ ()
     (unless (zero? (bytes-length pending))
       (emit! kind 'text (bytes->string/utf-8 pending replacement-char))
       (set! pending #"")))))

;; Length of the longest prefix of bs that does not end inside a UTF-8 sequence.
(define (complete-utf8-prefix-length bs)
  (define n (bytes-length bs))
  (let loop ([i (sub1 n)] [back 0])
    (cond
      [(or (< i 0) (> back 3)) n]
      [else
       (define b (bytes-ref bs i))
       (cond
         [(< b #x80) n]                                 ; ASCII: complete
         [(= (bitwise-and b #xC0) #x80) (loop (sub1 i) (add1 back))] ; continuation byte
         [else                                          ; lead byte
          (define need (cond [(>= b #xF0) 4] [(>= b #xE0) 3] [else 2]))
          (if (>= (- n i) need) n i)])])))

(define user-out (make-forwarding-port 'stdout))
(define user-err (make-forwarding-port 'stderr))

(define (flush-user-ports!)
  (flush-output user-out)
  (flush-output user-err))

;; ---------------------------------------------------------------------------
;; Errors and source locations

(define (srcloc->jsexpr s)
  (and (srcloc? s)
       (hasheq 'source (let ([src (srcloc-source s)])
                         (cond [(path? src) (path->string src)]
                               [(string? src) src]
                               [else (format "~a" src)]))
               'line (srcloc-line s)
               'column (srcloc-column s)
               'position (srcloc-position s)
               'span (srcloc-span s))))

(define (exn-srclocs e)
  (if (exn:srclocs? e)
      (filter values (map srcloc->jsexpr ((exn:srclocs-accessor e) e)))
      '()))

(define (exn-kind e)
  (cond
    [(exn:fail:read? e) "read"]
    [(exn:fail:syntax? e) "syntax"]
    [(exn:break? e) "break"]
    [(exn? e) "runtime"]
    [else "raise"]))

;; The message DrRacket would display for this exception in the current
;; language. For teaching languages this is htdp's rewritten message
;; (teaching-languages-error-display-handler); otherwise exn-message.
(define current-message-rewriter (make-parameter (λ (e) (exn-message e))))

(define (emit-exn! id e)
  (flush-user-ports!)
  (cond
    [(exn? e)
     (define shown
       (with-handlers ([(λ (_) #t) (λ (_) (exn-message e))])
         ((current-message-rewriter) e)))
     (emit! 'error
            'id id
            'kind (exn-kind e)
            'message shown
            'originalMessage (exn-message e)
            'srclocs (exn-srclocs e))]
    [else
     (emit! 'error 'id id 'kind "raise"
            'message (format "uncaught exception: ~e" e)
            'originalMessage (format "uncaught exception: ~e" e)
            'srclocs '())]))

;; ---------------------------------------------------------------------------
;; Value printing (DrRacket REPL: print each non-void result on its own line)

(define current-request-id (make-parameter #f))

(define (bridge-print v)
  (unless (void? v)
    (define s (with-output-to-string (λ () (print v))))
    (flush-user-ports!)
    (emit! 'value 'id (current-request-id) 'text (string-trim s "\n" #:left? #f))))

(define (eval/print stx)
  (call-with-values (λ () (eval stx))
                    (λ vs (for-each (current-print) vs))))

;; ---------------------------------------------------------------------------
;; Test results (rendering only; pass/fail is decided by test-engine)

(define test-hooks #f) ; set when a teaching program runs

(define (install-test-display!)
  (define test-markup-ns 'test-engine/test-markup)
  (define display-param (dynamic-require test-markup-ns 'display-test-results-parameter))
  (define display-markup (dynamic-require 'simple-tree-text-markup/text 'display-markup))
  (define current-test-object (dynamic-require 'test-engine/test-engine 'current-test-object))
  (define test-object-tests (dynamic-require 'test-engine/test-engine 'test-object-tests))
  (define test-object-failed-checks (dynamic-require 'test-engine/test-engine 'test-object-failed-checks))
  (define test-object-signature-violations
    (dynamic-require 'test-engine/test-engine 'test-object-signature-violations))
  (define failed-check-reason (dynamic-require 'test-engine/test-engine 'failed-check-reason))
  (define fail-reason-srcloc (dynamic-require 'test-engine/test-engine 'fail-reason-srcloc))
  (display-param
   (λ (markup)
     (define text (with-output-to-string (λ () (display-markup markup))))
     (define to (current-test-object))
     (flush-user-ports!)
     (emit! 'tests
            'id (current-request-id)
            'total (length (test-object-tests to))
            'failed (length (test-object-failed-checks to))
            'signatureViolations (length (test-object-signature-violations to))
            'failures (for/list ([fc (in-list (reverse (test-object-failed-checks to)))])
                        (or (srcloc->jsexpr (fail-reason-srcloc (failed-check-reason fc)))
                            (json-null)))
            'report text))))

;; ---------------------------------------------------------------------------
;; Run: teaching languages (mirrors htdp-langs.rkt on-execute + front-end)

;; The namespace that hosts the one Run of this process. Created at startup so
;; that library preloading warms the registry the program will actually use.
(define user-namespace (make-base-empty-namespace))

(define interaction-reader #f)   ; (src port) -> syntax or eof
(define after-interaction #f)    ; thunk run after each interaction batch
(define run-done? #f)

;; Configures the current thread and `user-namespace` the way DrRacket's
;; htdp-langs.rkt `on-execute` does, and returns the reader and the thunk
;; from `expand-teaching-program` (front-end/complete-program).
(define (setup-teaching! info path src)
  (define lang (source-language-language info))
  (define settings (source-language-settings info))
  (current-namespace user-namespace)

  ;; htdp-langs.rkt on-execute, first block
  (read-accept-quasiquote (teaching-language-accept-quasiquote? lang))
  (error-print-source-location #f)
  (read-decimal-as-inexact #f)
  (read-accept-dot (teaching-language-read-accept-dot? lang))
  (namespace-require 'test-engine/racket-tests)
  (namespace-require 'deinprogramm/signature/signature-english)

  ;; drracket language.rkt: initialize-simple-module-based-language /
  ;; initialize-module-based-language (use-copy? #f)
  (read-case-sensitive (teaching-settings-case-sensitive? settings))
  (namespace-require/constant (teaching-language-module lang))
  (namespace-require '(for-syntax mzscheme))

  ;; htdp-langs.rkt on-execute, second block
  ((dynamic-require 'test-engine/test-engine 'initialize-test-object!))
  ((dynamic-require 'test-engine/syntax 'test-execute) #t)
  (install-test-display!)
  ((dynamic-require 'deinprogramm/signature/signature 'signature-checking-enabled?) #t)
  (define sl-runtime-settings (dynamic-require 'htdp/bsl/runtime 'sl-runtime-settings))
  ((dynamic-require 'htdp/bsl/runtime 'configure/settings)
   (sl-runtime-settings (teaching-settings-printing-style settings)
                        (teaching-settings-fraction-style settings)
                        (teaching-settings-show-sharing? settings)
                        (teaching-settings-insert-newlines? settings)
                        (teaching-settings-tracing? settings)
                        (teaching-settings-true/false/empty-as-ids? settings)
                        (teaching-language-abbreviate-cons-as-list? lang)
                        (teaching-language-use-function-output-syntax? lang)
                        (teaching-language-output-function-instead-of-lambda? lang)))

  ;; teaching-languages-error-display-handler shows the rewritten message
  (define rewrite (dynamic-require 'lang/private/rewrite-error-message 'get-rewriten-error-message))
  (current-message-rewriter rewrite)

  ;; DrRacket's default reader for simple module-based languages
  (define (reader src port)
    (define v (parameterize ([read-accept-reader #t]) (read-syntax src port)))
    (if (eof-object? v) v (namespace-syntax-introduce v)))

  ;; The program body starts after the three metadata lines. Line counting
  ;; starts at the top of the file so source locations refer to file lines.
  (define port (open-input-string src path))
  (port-count-lines! port)
  (for ([_ (in-range header-line-count)]) (read-line port 'any))

  (define expand-teaching-program
    (dynamic-require 'lang/run-teaching-program 'expand-teaching-program))
  (values reader
          (expand-teaching-program port reader (teaching-language-module lang)
                                   (teaching-settings-teachpacks settings))))

(define (run-teaching id path src info)
  (define-values (reader next) (setup-teaching! info path src))
  (emit-run-started! id info)
  (define ok?
    (with-handlers ([(λ (_) #t) (λ (e) (emit-exn! id e) #f)])
      (let loop ()
        (define stx (next))
        (unless (eof-object? stx)
          (eval/print stx)
          (loop)))
      #t))

  ;; htdp-langs.rkt front-end/interaction
  (define test-object-copy (dynamic-require 'test-engine/test-engine 'test-object-copy))
  (define test-object=? (dynamic-require 'test-engine/test-engine 'test-object=?))
  (define current-test-object (dynamic-require 'test-engine/test-engine 'current-test-object))
  (set! interaction-reader
        (λ (src port)
          (define s (parameterize ([read-accept-lang #f]) (reader src port)))
          (if (eof-object? s)
              s
              (namespace-syntax-introduce (datum->syntax #f (cons '#%top-interaction s) s)))))
  (set! after-interaction
        (let ([snapshot #f])
          (case-lambda
            [() (set! snapshot (test-object-copy (current-test-object)))]
            [(_) (unless (test-object=? snapshot (current-test-object))
                   ;; DrRacket's #`(test) is bound via test-engine/racket-tests,
                   ;; which on-execute required into the top-level namespace.
                   (parameterize ([current-namespace user-namespace])
                     (eval/print (namespace-syntax-introduce (datum->syntax #f '(test))))))])))
  ok?)

;; ---------------------------------------------------------------------------
;; Run: #lang modules (mirrors drracket/private/module-language.rkt)

(define (run-module id path src info)
  (current-namespace user-namespace)
  ;; `#lang htdp/...` programs report through the same test engine.
  (when htdp-available? (install-test-display!))
  (emit-run-started! id info)
  (define port (open-input-string src path))
  (port-count-lines! port)
  (define (read-one)
    (parameterize ([read-accept-reader #t] [read-accept-lang #t])
      (read-syntax path port)))
  (define modpath (and path (simplify-path (path->complete-path path))))
  (define resolved (if modpath (make-resolved-module-path modpath) (make-resolved-module-path 'phdracket-program)))
  (define modspec (if modpath modpath ''phdracket-program))
  (define ok?
    (with-handlers ([(λ (_) #t) (λ (e) (emit-exn! id e) #f)])
      (define expr (read-one))
      (when (eof-object? expr)
        (raise-user-error
         (string-append "There must be a valid module in the definitions window. "
                        "Try starting your program with #lang racket or #lang htdp/bsl.")))
      (unless (eof-object? (read-one))
        (raise-user-error "there can only be one expression in the definitions window"))
      (parameterize ([current-module-declare-name resolved]
                     [current-module-declare-source modpath])
        (eval (check-module-form (namespace-syntax-introduce expr) path)))
      ;; *init: configure the runtime, instantiate, run test and main submodules
      (define info (module->language-info modspec #t))
      (when (and (vector? info) (= 3 (vector-length info)))
        (define get-info ((dynamic-require (vector-ref info 0) (vector-ref info 1)) (vector-ref info 2)))
        (for ([config (in-list (get-info 'configure-runtime '()))])
          ((dynamic-require (vector-ref config 0) (vector-ref config 1)) (vector-ref config 2))))
      (define cr-submod `(submod ,modspec configure-runtime))
      (when (module-declared? cr-submod #t)
        (dynamic-require cr-submod #f))
      (call-with-continuation-prompt
       (λ ()
         (namespace-require modspec)
         (for ([sub (in-list '((test) (main)))])
           (define spec `(submod ,modspec ,@sub))
           (when (module-declared? spec #t)
             (dynamic-require spec #f)))))
      #t))
  (with-handlers ([(λ (_) #t) (λ (e) (void))])
    (when (module-declared? modspec)
      (current-namespace (module->namespace modspec))))
  (set! interaction-reader
        (λ (src port)
          (define s ((current-read-interaction) src port))
          (if (eof-object? s)
              s
              (namespace-syntax-introduce (datum->syntax #f (cons '#%top-interaction s) s)))))
  (set! after-interaction (case-lambda [() (void)] [(_) (void)]))
  ok?)

;; The reader produces `(module name lang body ...)`; its `module` identifier
;; has no binding in the empty user namespace, so -- like DrRacket's
;; transform-module -- rebuild the form with the kernel's `module`.
(define (check-module-form stx path)
  (define parts (syntax->list stx))
  (unless (and parts
               (>= (length parts) 3)
               (identifier? (car parts))
               (eq? (syntax-e (car parts)) 'module))
    (raise-syntax-error #f "expected a module (start the file with #lang)" stx))
  (datum->syntax stx (cons (quote-syntax module) (cdr parts)) stx stx))

;; ---------------------------------------------------------------------------

(define (language-jsexpr info)
  (case (source-language-kind info)
    [(teaching)
     (define lang (source-language-language info))
     (hasheq 'kind "teaching"
             'id (symbol->string (teaching-language-id lang))
             'name (teaching-language-name lang)
             'module (format "~s" (teaching-language-module lang)))]
    [(module)
     (hasheq 'kind "module" 'lang (or (source-language-lang-line info) (json-null)))]
    [else (hasheq 'kind (symbol->string (source-language-kind info)))]))

(define (emit-run-started! id info)
  (emit! 'run-started 'id id 'language (language-jsexpr info)))

(define (handle-run id path-str src [debug-lines #f])
  (when run-done?
    (error 'phdracket-bridge "a bridge process hosts exactly one Run"))
  (set! run-done? #t)
  (define path (and path-str (string->path path-str)))
  (define info (analyze-source src))
  (when path
    (define-values (dir _name _d?) (split-path (path->complete-path path)))
    (when (path? dir)
      (current-directory dir)
      (current-load-relative-directory dir)))
  ;; Debug: the program's own forms are annotated by the debugger
  ;; (private/debugger.rkt); breakpoints stay active for Interactions too.
  (when debug-lines
    (start-debugging! emit! id (if path (path->complete-path path) 'unset) src debug-lines))
  (define ok?
    (parameterize ([current-output-port user-out]
                   [current-error-port user-err]
                   [current-input-port (open-input-string "")]
                   [current-print bridge-print]
                   [current-request-id id]
                   [current-eval (if debug-lines (debug-eval (current-eval)) (current-eval))])
      (begin0
        (case (source-language-kind info)
          [(teaching) (run-teaching id path src info)]
          [(module) (run-module id path src info)]
          [else
           (emit-run-started! id info)
           (emit! 'error 'id id 'kind "language"
                  'message (or (source-language-problem info) "Unrecognized language metadata.")
                  'originalMessage (or (source-language-problem info) "") 'srclocs '())
           #f])
        (flush-user-ports!))))
  (emit! 'done 'id id 'ok ok?))

;; Step: run the official HtDP stepper over the program (one stepping session
;; per process, like Run). Every step is emitted; the UI keeps the history.
;;
;; Teaching files with DrRacket metadata: settings from htdp-langs.rkt.
;; `#lang htdp/...` files: settings from the language's own reader options,
;; as lang/private/sl-stepper-button.rkt does (no let-lifting; stepping is
;; disabled for languages whose options include 'disable-stepper).
(define (handle-step id path-str src)
  (when run-done?
    (error 'phdracket-bridge "a bridge process hosts exactly one Run"))
  (set! run-done? #t)
  (define path (and path-str (string->path path-str)))
  (define info (analyze-source src))
  (when path
    (define-values (dir _name _d?) (split-path (path->complete-path path)))
    (when (path? dir)
      (current-directory dir)
      (current-load-relative-directory dir)))
  (define (refuse msg)
    (emit! 'error 'id id 'kind "language" 'message msg 'originalMessage msg 'srclocs '())
    #f)
  (define (emit-step-fn)
    (define n 0)
    (values (λ (step)
              (flush-user-ports!)
              (emit! 'step 'id id 'index n 'step step)
              (set! n (add1 n)))
            (λ () n)))
  (define ok?
    (parameterize ([current-output-port user-out]
                   [current-error-port user-err]
                   [current-input-port (open-input-string "")]
                   [current-print bridge-print]
                   [current-request-id id])
      (emit-run-started! id info)
      (case (source-language-kind info)
        [(teaching)
         (define lang (source-language-language info))
         (define opts (hash-ref stepper-support (teaching-language-id lang)))
         (cond
           [(not (car opts))
            (refuse (format "The Stepper does not support ~a." (teaching-language-name lang)))]
           [else
            (with-handlers ([(λ (_) #t) (λ (e) (emit-exn! id e) #f)])
              (define-values (reader next) (setup-teaching! info path src))
              (define-values (emit-step count) (emit-step-fn))
              (define outcome
                (run-stepper (teaching-program-expander next) void emit-step
                             #:lifting? (cadr opts)
                             #:show-lambdas-as-lambdas? (caddr opts)))
              (flush-user-ports!)
              (emit! 'stepper-finished 'id id 'outcome (symbol->string outcome) 'count (count))
              #t)])]
        [(module)
         (define lang-line (source-language-lang-line info))
         (define reader-mod
           (and lang-line
                (member lang-line '("htdp/bsl" "htdp/bsl+" "htdp/isl" "htdp/isl+" "htdp/asl"))
                (string->symbol (string-append lang-line "/lang/reader"))))
         (define options (and reader-mod (dynamic-require reader-mod 'options (λ () #f))))
         (cond
           [(not options) (refuse "The Stepper requires a teaching language.")]
           [(memq 'disable-stepper options)
            (refuse (format "The Stepper does not support #lang ~a." lang-line))]
           [else
            (with-handlers ([(λ (_) #t) (λ (e) (emit-exn! id e) #f)])
              (define-values (emit-step count) (emit-step-fn))
              (define outcome (step-htdp-module id path src options emit-step))
              (flush-user-ports!)
              (emit! 'stepper-finished 'id id 'outcome (symbol->string outcome) 'count (count))
              #t)])]
        [else (refuse "The Stepper requires a teaching language.")])))
  (emit! 'done 'id id 'ok ok?))

;; Steps a `#lang htdp/...` module the way DrRacket's module language and
;; stepper-tool.rkt do.
(define (step-htdp-module id path src options emit-step)
  (current-namespace user-namespace)
  (namespace-require ''#%kernel)
  (define runtime-settings
    ((dynamic-require 'htdp/bsl/runtime 'options->sl-runtime-settings) options))
  ((dynamic-require 'htdp/bsl/runtime 'configure/settings) runtime-settings)
  (current-message-rewriter
   (dynamic-require 'lang/private/rewrite-error-message 'get-rewriten-error-message))
  (install-test-display!)
  (define modpath (if path (simplify-path (path->complete-path path)) #f))
  (define declare-name (make-resolved-module-path (or modpath 'phdracket-program)))
  (define modspec (or modpath ''phdracket-program))
  (define (module-stx)
    (define port (open-input-string src path))
    (port-count-lines! port)
    (define stx (parameterize ([read-accept-reader #t] [read-accept-lang #t])
                  (read-syntax path port)))
    (check-module-form (namespace-syntax-introduce stx) path))
  (run-stepper (module-program-expander module-stx declare-name)
               ;; module-language.rkt *init: instantiate, then test and main submodules
               (λ ()
                 (namespace-require modspec)
                 (for ([sub (in-list '((test) (main)))])
                   (define spec `(submod ,modspec ,@sub))
                   (when (module-declared? spec #t)
                     (dynamic-require spec #f))))
               emit-step
               #:lifting? #f
               #:show-lambdas-as-lambdas?
               ((dynamic-require 'htdp/bsl/runtime 'sl-runtime-settings-use-function-output-syntax?)
                runtime-settings)))

(define (handle-eval id text)
  (cond
    [(not interaction-reader)
     (emit! 'error 'id id 'kind "bridge" 'message "Nothing has been run yet."
            'originalMessage "" 'srclocs '())
     (emit! 'done 'id id 'ok #f)]
    [else
     (define port (open-input-string text 'interactions))
     (port-count-lines! port)
     (define ok?
       (parameterize ([current-output-port user-out]
                      [current-error-port user-err]
                      [current-input-port (open-input-string "")]
                      [current-print bridge-print]
                      [current-request-id id])
         (after-interaction)
         (begin0
           (with-handlers ([(λ (_) #t) (λ (e) (emit-exn! id e) #f)])
             (let loop ()
               (define stx (interaction-reader 'interactions port))
               (unless (eof-object? stx)
                 (eval/print stx)
                 (loop)))
             (after-interaction 'done)
             #t)
           (flush-user-ports!))))
     (emit! 'done 'id id 'ok ok?)]))

(define htdp-available?
  (and (collection-file-path "run-teaching-program.rkt" "lang" #:fail (λ (_) #f)) #t))

(define (main)
  (emit! 'ready
         'protocol protocol-version
         'racketVersion (version)
         'vm (symbol->string (system-type 'vm))
         'htdp htdp-available?)
  ;; Commands arrive on this thread; debug-control is handled at once (the
  ;; main thread may be running or paused), everything else in order.
  (define inbox (make-async-channel))
  (thread
   (λ ()
     (let read-loop ()
       ;; Malformed JSON is reported; an unreadable input ends the process
       ;; like end of input (otherwise the main loop would wait forever).
       (define cmd (with-handlers ([exn:fail:read? (λ (e) 'bad)]
                                   [exn:fail? (λ (e) eof)])
                     (read-json (current-input-port))))
       (cond
         [(and (hash? cmd) (equal? (hash-ref cmd 'op #f) "debug-control"))
          (define lines (hash-ref cmd 'lines '()))
          (debug-control! (hash-ref cmd 'action "") (if (list? lines) (filter exact-positive-integer? lines) '()))
          (read-loop)]
         [else
          (async-channel-put inbox cmd)
          (unless (eof-object? cmd) (read-loop))]))))
  (let loop ()
    (define cmd (async-channel-get inbox))
    (cond
      [(eof-object? cmd) (void)]
      [(not (hash? cmd))
       (emit! 'protocol-error 'message "expected a JSON object")
       (loop)]
      [else
       (define op (hash-ref cmd 'op #f))
       (define id (hash-ref cmd 'id (json-null)))
       (case op
         [("run")
          (define path (hash-ref cmd 'path #f))
          (with-handlers ([exn:fail? (λ (e)
                                       (emit! 'protocol-error 'message (exn-message e))
                                       (emit! 'done 'id id 'ok #f))])
            (handle-run id (and (string? path) path) (hash-ref cmd 'source "")))
          (loop)]
         [("step")
          (define path (hash-ref cmd 'path #f))
          (with-handlers ([exn:fail? (λ (e)
                                       (emit! 'protocol-error 'message (exn-message e))
                                       (emit! 'done 'id id 'ok #f))])
            (handle-step id (and (string? path) path) (hash-ref cmd 'source "")))
          (loop)]
         [("debug")
          (define path (hash-ref cmd 'path #f))
          (define lines (hash-ref cmd 'breakpoints '()))
          (with-handlers ([exn:fail? (λ (e)
                                       (emit! 'protocol-error 'message (exn-message e))
                                       (emit! 'done 'id id 'ok #f))])
            (handle-run id (and (string? path) path) (hash-ref cmd 'source "")
                        (if (list? lines) (filter exact-positive-integer? lines) '())))
          (loop)]
         [("eval")
          (handle-eval id (hash-ref cmd 'text ""))
          (loop)]
         [("check")
          (define path (hash-ref cmd 'path #f))
          (define result
            (with-handlers ([exn:fail? (λ (e) (hasheq 'diagnostics '() 'failure (exn-message e)))])
              (check-program (and (string? path) path) (hash-ref cmd 'source "") (eq? #t (hash-ref cmd 'exports #f)))))
          (emit! 'check-result 'id id 'result result)
          (loop)]
         [("shutdown") (void)]
         [else
          (emit! 'protocol-error 'message (format "unknown op: ~a" op))
          (loop)])])))

(define preload-modules
  '(lang/run-teaching-program htdp/bsl/runtime test-engine/racket-tests
    test-engine/test-markup simple-tree-text-markup/text
    deinprogramm/signature/signature-english lang/private/rewrite-error-message
    lang/htdp-beginner lang/htdp-beginner-abbr lang/htdp-intermediate
    lang/htdp-intermediate-lambda lang/htdp-advanced
    stepper/private/model stepper/private/model-settings mzlib/pconvert))

(module+ main
  ;; Instantiating these modules has no observable effect on a program: each
  ;; Run still initializes the test object and runtime configuration itself.
  (unless (getenv "PHDRACKET_NO_PRELOAD")
    (parameterize ([current-namespace user-namespace])
      (for ([m (in-list preload-modules)])
        (with-handlers ([exn:fail? void]) (dynamic-require m #f)))))
  (main))
