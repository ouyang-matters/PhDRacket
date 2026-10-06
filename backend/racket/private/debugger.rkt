#lang racket/base
;; Debugging a Run: breakpoints, pausing, and stepping into, over and out of
;; expressions. It uses DrRacket's own debugger annotator
;; (gui-debugger/annotator), which instruments the expanded program so that
;; every expression can pause before it is evaluated and after it produces
;; its value; the program's meaning is unchanged.
;;
;; The bridge evaluates the program as for Run, with `current-eval` replaced
;; by `debug-eval`, which annotates the forms of the program's own source.
;; While paused, the program's thread waits for a command from the UI
;; (`debug-control!`, called from the bridge's input thread).
;;
;; Positions sent to the UI are 0-based character offsets into the source,
;; like the analysis results.

(require racket/list
         racket/port
         racket/set
         racket/string
         gui-debugger/annotator
         gui-debugger/marks)

(provide start-debugging! debug-eval debug-control! debugging?)

(define debugging? (make-parameter #f))

(struct session
  (emit                ; (event-symbol . key/values) -> void
   id                  ; request id
   source              ; the program's syntax source (a path or symbol)
   line-starts         ; vector: 1-based position where each line starts
   [lines #:mutable]   ; requested breakpoint lines (1-based)
   [positions #:mutable] ; resolved breakpoint positions (1-based)
   [breakable #:mutable] ; every breakable position annotated so far
   [mode #:mutable]    ; 'run 'step-into 'step-over 'step-out
   [depth #:mutable]   ; target depth for step-over / step-out
   [last-pos #:mutable]
   pause-requested     ; box
   commands)           ; channel of commands while paused
  #:transparent)

(define current-session #f)

(define (line-starts-of src)
  (list->vector
   (cons 1 (for/list ([c (in-string src)] [i (in-naturals 1)] #:when (char=? c #\newline)) (add1 i)))))

(define (pos->line s pos)
  (define starts (session-line-starts s))
  ;; last line whose start <= pos
  (let loop ([lo 0] [hi (sub1 (vector-length starts))])
    (if (>= lo hi)
        (add1 lo)
        (let ([mid (quotient (+ lo hi 1) 2)])
          (if (<= (vector-ref starts mid) pos) (loop mid hi) (loop lo (sub1 mid)))))))

;; Sources compare as complete, simplified paths (a program read under a
;; relative path is still the same program).
(define (same-source? a b)
  (define (norm s) (if (path? s) (simplify-path (path->complete-path s)) s))
  (equal? (norm a) (norm b)))

(define (start-debugging! emit id source src lines)
  (set! current-session
        (session emit id source (line-starts-of src)
                 (list->set lines) (set) '() 'run 0 #f (box #f) (make-channel))))

;; Resolves requested lines to the first breakable position on each line.
(define (resolve! s)
  (define by-line (make-hash))
  (for ([p (in-list (session-breakable s))])
    (define l (pos->line s p))
    (when (set-member? (session-lines s) l)
      (hash-update! by-line l (λ (old) (min old p)) p)))
  (set-session-positions! s (list->set (hash-values by-line)))
  ((session-emit s) 'breakpoints 'id (session-id s) 'lines (sort (hash-keys by-line) <)))

;; --- formatting -------------------------------------------------------------

(define max-value-length 300)

(define (show v)
  (define text
    (with-handlers ([(λ (_) #t) (λ (_) "#<value>")])
      (string-trim (with-output-to-string (λ () (print v))) "\n" #:left? #f)))
  (if (> (string-length text) max-value-length)
      (string-append (substring text 0 max-value-length) " …")
      text))

(define (range-of stx)
  (if (and (syntax? stx) (syntax-position stx))
      (list (sub1 (syntax-position stx)) (or (syntax-span stx) 0))
      #f))

(define (frame->jsexpr mark)
  (define exposed (with-handlers ([exn:fail? (λ (_) #f)]) (expose-mark mark)))
  (cond
    [(not exposed) #f]
    [else
     (define-values (src label bindings) (apply values exposed))
     (define r (range-of src))
     (hasheq 'label (if label (format "~a" label) "")
             'position (if r (car r) (json-null))
             'span (if r (cadr r) 0)
             'line (if (and (syntax? src) (syntax-line src)) (syntax-line src) (json-null))
             'bindings (for/list ([b (in-list bindings)]
                                  #:when (identifier? (car b)))
                         (hasheq 'name (symbol->string (syntax-e (car b)))
                                 'value (show (cadr b)))))]))

(define (json-null) 'null)

;; --- pausing ----------------------------------------------------------------

(define (frames-of info marks)
  (cons info (continuation-mark-set->list marks debug-key)))

(define (should-pause? s kind frames)
  (define depth (length frames))
  (cond
    [(unbox (session-pause-requested s)) #t]
    [else
     (case (session-mode s)
       [(step-into) #t]
       [(step-over) (<= depth (session-depth s))]
       [(step-out) (< depth (session-depth s))]
       [else (and (eq? kind 'before) (set-member? (session-positions s) (session-last-pos s)))])]))

(define (pause! s kind frames vals)
  (set-box! (session-pause-requested s) #f)
  (define top (car frames))
  (define src (with-handlers ([exn:fail? (λ (_) #f)]) (mark-source top)))
  (define r (range-of src))
  ((session-emit s) 'paused
                    'id (session-id s)
                    'kind (symbol->string kind)
                    'position (if r (car r) (sub1 (or (session-last-pos s) 1)))
                    'span (if r (cadr r) 1)
                    'line (if (and (syntax? src) (syntax-line src)) (syntax-line src) (pos->line s (or (session-last-pos s) 1)))
                    'value (if vals (string-join (map show vals) "\n") (json-null))
                    'frames (filter values (map frame->jsexpr frames)))
  (let loop ()
    (define cmd (channel-get (session-commands s)))
    (case (car cmd)
      [(continue) (set-session-mode! s 'run)]
      [(step-into) (set-session-mode! s 'step-into)]
      [(step-over) (set-session-mode! s 'step-over) (set-session-depth! s (length frames))]
      [(step-out) (set-session-mode! s 'step-out) (set-session-depth! s (length frames))]
      [else (loop)]))
  ((session-emit s) 'resumed 'id (session-id s)))

(define (break? source)
  (define s current-session)
  (if (and s (same-source? source (session-source s)))
      (λ (pos)
        (set-session-last-pos! s pos)
        (or (not (eq? (session-mode s) 'run))
            (unbox (session-pause-requested s))
            (set-member? (session-positions s) pos)))
      (λ (pos) #f)))

(define (break-before info marks)
  (define s current-session)
  (define frames (frames-of info marks))
  (when (should-pause? s 'before frames)
    (pause! s 'before frames #f))
  #f)

(define (break-after info marks . vals)
  (define s current-session)
  (define frames (frames-of info marks))
  (when (should-pause? s 'after frames)
    (pause! s 'after frames vals))
  (apply values vals))

;; --- evaluation -------------------------------------------------------------

;; `current-eval` while debugging: forms from the program's source are
;; expanded and annotated; everything else (Interactions) is evaluated as is.
(define (debug-eval old-eval)
  (λ (form)
    (define s current-session)
    ;; An untitled program: its first form tells the source the program has.
    (when (and s (syntax? form) (eq? (session-source s) 'unset))
      (set! current-session (struct-copy session s [source (syntax-source form)]))
      (set! s current-session))
    (cond
      [(and s (syntax? form) (same-source? (syntax-source form) (session-source s)))
       (define expanded (expand-syntax form))
       (define-values (annotated posns)
         (annotate-for-single-stepping expanded break? break-before break-after
                                       void void (session-source s)))
       (set-session-breakable! s (append posns (session-breakable s)))
       (resolve! s)
       (old-eval annotated)]
      [else (old-eval form)])))

;; Commands from the UI, from the bridge's input thread.
;;   ("continue") ("step-into") ("step-over") ("step-out") ("pause")
;;   ("breakpoints" lines)
(define (debug-control! action lines)
  (define s current-session)
  (when s
    (case action
      [("pause") (set-box! (session-pause-requested s) #t)]
      [("breakpoints")
       (set-session-lines! s (list->set lines))
       (resolve! s)]
      [("continue" "step-into" "step-over" "step-out")
       ;; Only a paused program is waiting; otherwise the command is dropped.
       (sync/timeout 0 (channel-put-evt (session-commands s) (list (string->symbol action))))]
      [else (void)])))
