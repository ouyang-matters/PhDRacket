#lang racket/base
;; PhDRacket Stepper adapter.
;;
;; Drives the official HtDP stepper (htdp-lib `stepper/private/model`, an
;; internal interface) without a GUI, the way DrRacket's stepper-tool.rkt and
;; view-controller.rkt do, and renders each step to text with highlight
;; ranges the way stepper/private/mred-extensions.rkt renders it to an editor.
;; All stepping semantics come from the stepper model; this file only adapts
;; its inputs and outputs. See docs/STEPPER.md.

(require racket/list
         racket/port
         racket/pretty)

(provide stepper-support
         run-stepper
         teaching-program-expander
         module-program-expander)

;; Per-language stepper settings from htdp-langs.rkt (`stepper:supported`,
;; `stepper:enable-let-lifting`, `stepper:show-lambdas-as-lambdas`), Racket 9.3.
;; id -> (list supported? let-lifting? show-lambdas-as-lambdas?)
(define stepper-support
  (hasheq 'beginner '(#t #t #f)
          'beginner-abbr '(#t #t #f)
          'intermediate '(#t #t #f)
          'intermediate-lambda '(#t #t #t)
          'advanced '(#f #t #t)))

(define (model name) (dynamic-require 'stepper/private/model name))
(define (model-settings name) (dynamic-require 'stepper/private/model-settings name))
(define (shared-typed name) (dynamic-require 'stepper/private/shared-typed name))

;; A program expander, in the sense of `go`: (init iter) -> void.
;; Mirrors drracket/private/eval.rkt `expand-program` plus stepper-tool.rkt's
;; init. An exception escaping the program goes to the error-display-handler
;; the model installs, as in DrRacket's user eventspace.

;; For DrRacket-metadata teaching files: `next` is the
;; front-end/complete-program thunk from expand-teaching-program.
(define ((teaching-program-expander next) init iter)
  (init)
  (stepper-init!)
  (with-handlers ([exn:fail? (λ (e) ((error-display-handler) (exn-message e) e))])
    (let loop ()
      (define in (next))
      (if (eof-object? in)
          (iter in void)
          (iter (expand in) loop)))))

;; For `#lang htdp/...` files: DrRacket's module language yields the one
;; module form, declared under the file's name; stepping happens when the
;; dynamic requirer instantiates it.
(define ((module-program-expander module-stx declare-name) init iter)
  (init)
  (stepper-init!)
  (with-handlers ([exn:fail? (λ (e) ((error-display-handler) (exn-message e) e))])
    (parameterize ([current-module-declare-name declare-name])
      (iter (expand (module-stx)) (λ () (iter eof void))))))

(define (stepper-init!)
  (error-value->string-handler
   (λ (v len)
     (define s (with-output-to-string (λ () (print v))))
     (if (<= (string-length s) len) s (string-append (substring s 0 (max 0 (- len 3))) "..."))))
  (current-print void))

;; run-stepper : program-expander (-> void) (jsexpr -> void) -> (or/c 'finished 'error 'limit)
;; `emit-step!` receives one rendered step at a time.
(define (run-stepper program-expander dynamic-requirer emit-step!
                     #:lifting? lifting?
                     #:show-lambdas-as-lambdas? show-lambdas?
                     #:max-steps [max-steps 5000]
                     #:columns [columns 60])
  (define go (model 'go))
  (define get-render-settings (model-settings 'get-render-settings))
  (define stepper-syntax-property
    (dynamic-require 'stepper/private/syntax-property 'stepper-syntax-property))
  (define sstx-s (dynamic-require 'stepper/private/syntax-hider 'sstx-s))
  (define print-convert (dynamic-require 'mzlib/pconvert 'print-convert))
  (define Before-After-Result? (shared-typed 'Before-After-Result?))
  (define Before-After-Result-pre-exps (shared-typed 'Before-After-Result-pre-exps))
  (define Before-After-Result-post-exps (shared-typed 'Before-After-Result-post-exps))
  (define Before-After-Result-pre-src (shared-typed 'Before-After-Result-pre-src))
  (define Before-After-Result-post-src (shared-typed 'Before-After-Result-post-src))
  (define Before-Error-Result? (shared-typed 'Before-Error-Result?))
  (define Before-Error-Result-pre-exps (shared-typed 'Before-Error-Result-pre-exps))
  (define Before-Error-Result-err-msg (shared-typed 'Before-Error-Result-err-msg))
  (define Before-Error-Result-pre-src (shared-typed 'Before-Error-Result-pre-src))
  (define Error-Result? (shared-typed 'Error-Result?))
  (define Error-Result-err-msg (shared-typed 'Error-Result-err-msg))
  (define Posn-Info-posn (shared-typed 'Posn-Info-posn))
  (define Posn-Info-span (shared-typed 'Posn-Info-span))

  ;; DrRacket: (send language render-value v settings port) = sl-render-value/format
  (define (render-to-string v) (with-output-to-string (λ () (print v))))
  ;; stepper-tool.rkt default stepper:render-to-sexp (htdp-langs does not override it)
  (define (render-to-sexp v) (or (and (procedure? v) (object-name v)) (print-convert v)))

  ;; The language's pretty-print hooks, installed by configure/settings.
  (define lang-size-hook (pretty-print-size-hook))
  (define lang-print-hook (pretty-print-print-hook))

  ;; mred-extensions.rkt strip-to-sexp
  (define (strip-to-sexp stx table)
    (let strip ([stx stx])
      (define it
        (cond [(pair? stx) (cons (strip (car stx)) (strip (cdr stx)))]
              [(syntax? stx) (strip (syntax-e stx))]
              [else stx]))
      (if (and (syntax? stx) (stepper-syntax-property stx 'stepper-highlight))
          (if (pair? it)
              (begin (hash-set! table it 'non-confusable) it)
              (let ([placeholder (gensym "-placeholder")])
                (hash-set! table placeholder (list it))
                placeholder))
          it)))

  ;; mred-extensions.rkt stepper-sub-text% printing, into a string port.
  (define (render-exp stx)
    (define table (make-weak-hasheq))
    (define sexp (strip-to-sexp stx table))
    (define out (open-output-string))
    (port-count-lines! out)
    (define (pos) (let-values ([(l c p) (port-next-location out)]) (sub1 p)))
    (define highlights '())
    (define begin-at #f)
    (parameterize
        ([pretty-print-show-inexactness #t]
         [pretty-print-columns columns]
         [print-boolean-long-form #t]
         [pretty-print-size-hook
          (λ (value display? port)
            (define looked-up (hash-ref table value #f))
            (cond
              [(and looked-up (not (eq? looked-up 'non-confusable)))
               (or (lang-size-hook (car looked-up) display? port)
                   (string-length (format "~s" (car looked-up))))]
              [else (lang-size-hook value display? port)]))]
         [pretty-print-print-hook
          (λ (value display? port)
            (define looked-up (hash-ref table value #f))
            (cond
              [(and looked-up (not (eq? looked-up 'non-confusable)))
               (define v (car looked-up))
               (if (lang-size-hook v display? port)
                   (lang-print-hook v display? port)
                   (write-string (format "~s" v) port))]
              [else (lang-print-hook value display? port)]))]
         [pretty-print-print-line
          (λ (number port old-length dest-columns)
            (when (and number (not (eq? number 0))) (newline port))
            0)]
         [pretty-print-pre-print-hook
          (λ (value p) (when (hash-ref table value #f) (set! begin-at (pos))))]
         [pretty-print-post-print-hook
          (λ (value p)
            (when (and begin-at (hash-ref table value #f))
              (set! highlights (cons (list begin-at (pos)) highlights))
              (set! begin-at #f)))]
         [read-case-sensitive #t])
      (pretty-write sexp out))
    (hasheq 'text (string-trim-right (get-output-string out))
            'highlights (reverse highlights)))

  (define (render-exps sstxs) (map (λ (s) (render-exp (sstx-s s))) sstxs))
  (define (posn p)
    (and p (hasheq 'position (or (Posn-Info-posn p) 'null) 'span (or (Posn-Info-span p) 'null))))

  (define count 0)
  (define outcome 'finished)
  (let/ec escape
    (define (receive r)
      (cond
        [(eq? r 'finished-stepping) (void)]
        [(Before-After-Result? r)
         (set! count (add1 count))
         (emit-step! (hasheq 'kind "before-after"
                             'before (render-exps (Before-After-Result-pre-exps r))
                             'after (render-exps (Before-After-Result-post-exps r))
                             'beforeSource (or (posn (Before-After-Result-pre-src r)) 'null)
                             'afterSource (or (posn (Before-After-Result-post-src r)) 'null)))
         (when (>= count max-steps)
           (set! outcome 'limit)
           (escape (void)))]
        [(Before-Error-Result? r)
         (set! outcome 'error)
         (emit-step! (hasheq 'kind "before-error"
                             'before (render-exps (Before-Error-Result-pre-exps r))
                             'error (Before-Error-Result-err-msg r)
                             'beforeSource (or (posn (Before-Error-Result-pre-src r)) 'null)))]
        [(Error-Result? r)
         (set! outcome 'error)
         (emit-step! (hasheq 'kind "error" 'error (Error-Result-err-msg r)))]
        [else (void)]))
    (go program-expander
        (λ ()
          (with-handlers ([exn:fail? (λ (e) ((error-display-handler) (exn-message e) e))])
            (dynamic-requirer)))
        receive
        (get-render-settings render-to-string render-to-sexp
                             lifting?
                             #t            ; show-consumed-and/or-clauses? (stepper-tool default)
                             show-lambdas?)))
  outcome)

(define (string-trim-right s)
  (regexp-replace #rx"[ \n]+$" s ""))
