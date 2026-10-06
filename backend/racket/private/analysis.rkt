#lang racket/base
;; Background analysis of the program being edited (PhDRacket's "check while
;; typing"). It uses DrRacket's own Check Syntax (drracket/check-syntax), so
;; errors, bindings and scopes are exactly those of the official expander:
;;
;;   - read and syntax errors, with the teaching languages' own messages;
;;   - binding arrows (definition -> each use), for highlighting occurrences,
;;     Go to Definition and scope-aware Rename;
;;   - unused bindings, hover texts ("imported from ...", "2 bound occurrences"),
;;     documentation links;
;;   - the names the language provides, for suggestions.
;;
;; Analysis expands the program but never runs it. Expansion does run macros
;; at compile time, as DrRacket's background expansion does; each check runs
;; under its own custodian with a time and memory limit.
;;
;; Positions in results are 0-based character offsets into the source text,
;; with exclusive ends, as Check Syntax reports them.

(require racket/list
         racket/port
         net/uri-codec
         racket/string
         racket/path
         setup/dirs
         drracket/check-syntax
         "metadata.rkt")

(provide check-program language-exports)

;; A namespace whose module registry keeps the language modules loaded, so
;; each check (in a fresh namespace) attaches them instead of reloading.
(define master (make-base-namespace))

(define (attachable? spec)
  (or (symbol? spec)
      (and (pair? spec) (memq (car spec) '(lib)))))

(define (fresh-namespace lang-spec)
  (define ns (make-base-namespace))
  (when (and lang-spec (attachable? lang-spec))
    (with-handlers ([exn:fail? void])
      (parameterize ([current-namespace master])
        (dynamic-require lang-spec (void)))
      (namespace-attach-module master lang-spec ns)))
  ns)

;; --- reading ----------------------------------------------------------------

(struct program (stx lang-spec rewrite) #:transparent)

(define (diag message line column position span [severity "error"])
  (hasheq 'severity severity 'message message
          'line line 'column column 'position position 'span span))

(define (exn->diagnostics e rewrite)
  (define message
    ;; Without the "path:line:col: " prefix: the editor shows where.
    (regexp-replace #rx"^[^
]*?:[0-9]+:[0-9]+: "
                    (with-handlers ([(λ (_) #t) (λ (_) (exn-message e))]) (rewrite e))
                    ""))
  (define locs (if (exn:srclocs? e) ((exn:srclocs-accessor e) e) '()))
  (define located
    (for/list ([s (in-list locs)] #:when (and (srcloc? s) (srcloc-position s)))
      (diag message (srcloc-line s) (srcloc-column s) (sub1 (srcloc-position s)) (or (srcloc-span s) 1))))
  (if (null? located) (list (diag message 1 0 0 0)) located))

(define default-rewrite exn-message)

(define (teaching-rewrite)
  (with-handlers ([exn:fail? (λ (_) default-rewrite)])
    (dynamic-require 'lang/private/rewrite-error-message 'get-rewriten-error-message)))

;; Reads the program as the module Check Syntax will expand. Teaching files
;; with DrRacket's metadata header become `(module name <language> body ...)`
;; with every body form carrying its source location.
(define (read-program path src)
  (define info (analyze-source src))
  (case (and (or (not (eq? (source-language-kind info) 'module)) (source-language-lang-line info))
             (source-language-kind info))
    [(teaching)
     (define lang (source-language-language info))
     (define settings (source-language-settings info))
     (define port (open-input-string src))
     (port-count-lines! port)
     (for ([_ (in-range header-line-count)]) (read-line port 'any))
     (define body
       (parameterize ([read-accept-reader #t]
                      [read-accept-lang #f]
                      [read-case-sensitive (teaching-settings-case-sensitive? settings)]
                      [read-accept-quasiquote (teaching-language-accept-quasiquote? lang)]
                      [read-decimal-as-inexact #f]
                      [read-accept-dot (teaching-language-read-accept-dot? lang)])
         (let loop ([acc '()])
           (define v (read-syntax path port))
           (if (eof-object? v) (reverse acc) (loop (cons v acc))))))
     (define lang-spec (teaching-language-module lang))
     (define requires
       (for/list ([tp (in-list (teaching-settings-teachpacks settings))])
         (datum->syntax #f `(require ,tp))))
     (define modname (source-language-modname info))
     (define name (cond [(symbol? modname) modname]
                        [(string? modname) (string->symbol modname)]
                        [else 'program]))
     (define top (vector path 1 0 1 (string-length src)))
     (program (datum->syntax #f `(module ,name ,lang-spec ,@requires ,@body) top)
              lang-spec
              (teaching-rewrite))]
    [(module)
     (define port (open-input-string src))
     (port-count-lines! port)
     (define (read-one)
       (parameterize ([read-accept-reader #t] [read-accept-lang #t])
         (read-syntax path port)))
     (define stx (read-one))
     (when (eof-object? stx)
       (raise-user-error "There must be a valid module in the definitions window. Try starting your program with #lang racket or #lang htdp/bsl."))
     (define extra (read-one))
     (unless (eof-object? extra)
       (raise-syntax-error #f "there can only be one expression in the definitions window" extra))
     (define parts (syntax->list stx))
     (define lang-spec (and parts (>= (length parts) 3) (syntax->datum (caddr parts))))
     (program stx lang-spec
              (if (and (pair? lang-spec) (eq? (car lang-spec) 'lib)) default-rewrite
                  (if (and (symbol? lang-spec) (regexp-match? #rx"^lang/htdp" (symbol->string lang-spec)))
                      (teaching-rewrite)
                      default-rewrite)))]
    [else #f]))

;; --- results ----------------------------------------------------------------

(define online-docs "https://docs.racket-lang.org/")

;; A documentation link for a local docs file and anchor, as a docs.racket-lang.org URL.
(define (doc-url file anchor)
  (with-handlers ([exn:fail? (λ (_) #f)])
    (define dirs (filter values (list (find-doc-dir) (find-user-doc-dir))))
    (define rel
      (for/or ([d (in-list dirs)])
        (define r (find-relative-path (simple-form-path d) (simple-form-path file)))
        (and (relative-path? r) (not (regexp-match? #rx"^[.][.]" (path->string r))) r)))
    (and rel
         (string-append online-docs
                        (string-join (map path->string (explode-path rel)) "/")
                        (if anchor (string-append "#" (uri-encode anchor)) "")))))

;; Check Syntax's results (vectors without the source object; only
;; annotations for the program's own text are reported).
(define (summarize results len)
  (define (in-text? l r) (and (exact-nonnegative-integer? l) (exact-nonnegative-integer? r) (<= 0 l r len)))
  (define arrows '())
  (define hovers '())
  (define unused '())
  (define definitions '())
  (define docs '())
  (for ([r (in-list results)])
    (case (vector-ref r 0)
      [(syncheck:add-arrow/name-dup/pxpy)
       ;; #(_ start-l start-r px py end-l end-r px py actual? phase require-arrow name-dup?)
       (define-values (sl sr el er) (values (vector-ref r 1) (vector-ref r 2) (vector-ref r 5) (vector-ref r 6)))
       (when (and (not (vector-ref r 11)) (in-text? sl sr) (in-text? el er))
         (set! arrows (cons (hasheq 'from (list sl sr) 'to (list el er)) arrows)))]
      [(syncheck:add-mouse-over-status)
       (define-values (l rr text) (values (vector-ref r 1) (vector-ref r 2) (vector-ref r 3)))
       (when (and (in-text? l rr) (string? text))
         (set! hovers (cons (hasheq 'from (list l rr) 'text text) hovers))
         (when (equal? text "no bound occurrences")
           (set! unused (cons (list l rr) unused))))]
      [(syncheck:add-definition-target/phase-level+space)
       (define-values (l rr) (values (vector-ref r 1) (vector-ref r 2)))
       (when (in-text? l rr)
         (set! definitions (cons (hasheq 'from (list l rr) 'name (format "~a" (vector-ref r 3))) definitions)))]
      [(syncheck:add-docs-menu)
       ;; #(_ l r id label path definition-tag anchor)
       (define-values (l rr file anchor) (values (vector-ref r 1) (vector-ref r 2) (vector-ref r 5) (vector-ref r 7)))
       (define url (and (in-text? l rr) (path? file) (doc-url file (and (string? anchor) anchor))))
       (when url
         (set! docs (cons (hasheq 'from (list l rr) 'label (format "~a" (vector-ref r 3)) 'url url) docs)))]
      [else (void)]))
  (values (remove-duplicates (reverse arrows))
          (remove-duplicates (reverse hovers))
          (remove-duplicates (reverse unused))
          (remove-duplicates (reverse definitions))
          (remove-duplicates (reverse docs))))

;; --- language exports (suggestions) ----------------------------------------

(define exports-cache (make-hash))

;; Names provided by a language module at phase 0: (listof (list name kind)),
;; kind "value" or "syntax".
(define (language-exports lang-spec)
  (hash-ref! exports-cache lang-spec
             (λ ()
               (with-handlers ([exn:fail? (λ (_) '())])
                 (parameterize ([current-namespace master])
                   (dynamic-require lang-spec (void))
                   (define-values (vars stxs) (module->exports lang-spec))
                   (define (names lst kind)
                     (for*/list ([phase+names (in-list lst)]
                                 #:when (eqv? (car phase+names) 0)
                                 [n (in-list (cdr phase+names))]
                                 #:unless (regexp-match? #rx"^#%" (symbol->string (car n))))
                       (list (symbol->string (car n)) kind)))
                   (sort (remove-duplicates (append (names vars "value") (names stxs "syntax")) #:key car)
                         string<? #:key car))))))

;; --- entry point ------------------------------------------------------------

(define time-limit-ms 10000)

;; Checks `src` (the editor's text) as the file at `path-str` (or an untitled
;; file). Returns a jsexpr. `want-exports?` adds the language's names.
(define (check-program path-str src want-exports?)
  (define path
    (simple-form-path
     (if path-str
         (string->path path-str)
         (build-path (find-system-path 'temp-dir) "untitled.rkt"))))
  (define-values (dir _name _d?) (split-path path))
  (define result (box #f))
  (define cust (make-custodian))
  (when (custodian-memory-accounting-available?)
    (custodian-limit-memory cust (* 1024 1024 1024) cust))
  (define worker
    (parameterize ([current-custodian cust])
      (thread
       (λ ()
         (set-box!
          result
          (let/ec return
            (define prog
              (with-handlers ([exn:fail? (λ (e) (return (hasheq 'diagnostics (exn->diagnostics e default-rewrite))))])
                (read-program path src)))
            (unless prog
              (return (hasheq 'diagnostics '() 'language #f)))
            (define rewrite (program-rewrite prog))
            (define results
              (with-handlers ([exn:fail? (λ (e) (return (hasheq 'diagnostics (exn->diagnostics e rewrite)
                                                                'language (format "~s" (program-lang-spec prog)))))])
                (parameterize ([current-namespace (fresh-namespace (program-lang-spec prog))]
                               [current-directory (if (path? dir) dir (current-directory))]
                               [current-load-relative-directory (and (path? dir) dir)]
                               [current-output-port (open-output-nowhere)]
                               [current-error-port (open-output-nowhere)])
                  (show-content (program-stx prog)))))
            (define-values (arrows hovers unused definitions docs) (summarize results (string-length src)))
            (define lang-key (format "~s" (program-lang-spec prog)))
            (hasheq 'diagnostics '()
                    'language lang-key
                    'arrows arrows
                    'hovers hovers
                    'unused unused
                    'definitions definitions
                    'docs docs
                    'exports (if (and want-exports? (program-lang-spec prog))
                                 (for/list ([e (in-list (language-exports (program-lang-spec prog)))])
                                   (hasheq 'name (car e) 'kind (cadr e)))
                                 (json-null-value)))))))))
  (define finished (sync/timeout (/ time-limit-ms 1000.0) worker))
  (custodian-shutdown-all cust)
  (cond
    [(and finished (unbox result)) (unbox result)]
    [finished (hasheq 'diagnostics (list (diag "The program could not be checked (it uses too much memory)." 1 0 0 0 "warning")))]
    [else (hasheq 'diagnostics (list (diag "Checking took too long; the program was not checked." 1 0 0 0 "warning")))]))

(define (json-null-value) 'null)
