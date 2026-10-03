#lang racket/base
;; Recognition of DrRacket's teaching-language metadata header.
;;
;; DrRacket saves teaching-language files with a three-line prefix:
;;
;;   ;; The first three lines of this file were inserted by DrRacket. ...
;;   ;; about the language level of this file in a form that our tools ...
;;   #reader(lib "htdp-beginner-reader.ss" "lang")((modname m) ... (htdp-settings #(...)))
;;
;; This module only *reads* that header. It never produces or rewrites one.
;; The facts encoded in `teaching-languages` below were transcribed from
;; htdp-lib/lang/htdp-langs.rkt (Racket 9.3) -- see docs/COMPATIBILITY.md.

(require racket/match
         racket/list
         racket/string)

(provide (struct-out teaching-language)
         (struct-out teaching-settings)
         (struct-out source-language)
         teaching-languages
         analyze-source
         header-line-count)

;; Number of lines DrRacket treats as metadata (`get-metadata-lines` in htdp-langs.rkt).
(define header-line-count 3)

;; The two comment lines from lang/htdp-langs-save-file-prefix.rkt.
(define drracket-prefix-lines
  (list ";; The first three lines of this file were inserted by DrRacket. They record metadata"
        ";; about the language level of this file in a form that our tools can easily process."))

;; Per-language constants from the `add-htdp-language` calls in htdp-langs.rkt.
(struct teaching-language
  (id                                ; symbol, stable PhDRacket identifier
   name                              ; DrRacket's display name
   reader-spec                       ; datum appearing after #reader
   module                            ; language module DrRacket evaluates the program in
   sharing-printing?                 ; default for show-sharing
   abbreviate-cons-as-list?
   use-function-output-syntax?
   output-function-instead-of-lambda?
   accept-quasiquote?
   read-accept-dot?)
  #:transparent)

(define teaching-languages
  (list
   (teaching-language 'beginner "Beginning Student"
                      '(lib "htdp-beginner-reader.ss" "lang") '(lib "lang/htdp-beginner.ss")
                      #f #f #f #t #f #f)
   (teaching-language 'beginner-abbr "Beginning Student with List Abbreviations"
                      '(lib "htdp-beginner-abbr-reader.ss" "lang") '(lib "lang/htdp-beginner-abbr.ss")
                      #f #t #f #t #t #f)
   (teaching-language 'intermediate "Intermediate Student"
                      '(lib "htdp-intermediate-reader.ss" "lang") '(lib "lang/htdp-intermediate.ss")
                      #f #t #t #t #t #f)
   (teaching-language 'intermediate-lambda "Intermediate Student with lambda"
                      '(lib "htdp-intermediate-lambda-reader.ss" "lang")
                      '(lib "lang/htdp-intermediate-lambda.ss")
                      #f #t #t #f #t #f)
   (teaching-language 'advanced "Advanced Student"
                      '(lib "htdp-advanced-reader.ss" "lang") '(lib "lang/htdp-advanced.ss")
                      #t #t #t #f #t #f)))

;; Mirrors htdp-lang-settings (drracket simple-settings + tracing?, teachpacks,
;; true/false/empty-as-ids?).
(struct teaching-settings
  (case-sensitive? printing-style fraction-style show-sharing? insert-newlines?
   annotations tracing? teachpacks true/false/empty-as-ids?)
  #:transparent)

;; kind : (or/c 'teaching 'module 'none 'unrecognized-metadata)
;; For 'teaching: language, settings, modname, body-start (char offset of line 4).
;; For 'module: lang-line (string or #f).
(struct source-language (kind language settings modname body-start lang-line problem)
  #:transparent)

(define (default-settings lang)
  ;; `default-settings` in htdp-langs.rkt; teachpacks default to '() here because
  ;; DrRacket's default comes from a GUI preference that does not apply to files.
  (teaching-settings #t 'constructor 'repeating-decimal
                     (teaching-language-sharing-printing? lang)
                     #t 'none #f '() #f))

;; analyze-source : string -> source-language
(define (analyze-source src)
  (define lines (take-lines src (add1 (length drracket-prefix-lines))))
  (cond
    [(and (= (length lines) 3)
          (equal? (take lines 2) drracket-prefix-lines)
          (regexp-match? #rx"^#reader" (caddr lines)))
     (analyze-teaching-header src (caddr lines))]
    [else
     (source-language 'module #f #f #f 0 (find-lang-line src) #f)]))

;; Returns the first n lines (without terminators), splitting like read-line 'any.
(define (take-lines src n)
  (define in (open-input-string src))
  (let loop ([i 0] [acc '()])
    (define l (and (< i n) (read-line in 'any)))
    (if (string? l) (loop (add1 i) (cons l acc)) (reverse acc))))

(define (analyze-teaching-header src reader-line)
  (define parsed
    (with-handlers ([exn:fail:read? (λ (e) #f)])
      (parameterize ([read-accept-reader #f] [read-accept-lang #f])
        (define in (open-input-string (substring reader-line (string-length "#reader"))))
        (define spec (read in))
        (define table (read in))
        (cons spec table))))
  (define body-start (line-start-offset src header-line-count))
  (define (unrecognized why)
    (source-language 'unrecognized-metadata #f #f #f body-start #f why))
  (cond
    [(not parsed) (unrecognized "The #reader metadata line could not be read.")]
    [else
     (define spec (car parsed))
     (define table (massage-table (cdr parsed)))
     (define lang (findf (λ (l) (equal? (teaching-language-reader-spec l) spec)) teaching-languages))
     (cond
       [(not lang)
        (unrecognized (format "Unrecognized DrRacket language reader: ~s" spec))]
       [else
        (define modname (let ([m (assq 'modname table)]) (and m (pair? (cdr m)) (cadr m))))
        (source-language 'teaching lang (metadata->settings lang table) modname body-start #f #f)])]))

(define (massage-table md)
  (if (and (list? md) (andmap (λ (x) (and (pair? x) (symbol? (car x)))) md)) md '()))

;; Mirrors `metadata->settings` in htdp-langs.rkt.
(define (metadata->settings lang table)
  (define ssv (assq 'htdp-settings table))
  (define v (and ssv (pair? (cdr ssv)) (cadr ssv)))
  (define arity 9) ; (procedure-arity make-htdp-lang-settings)
  (cond
    [(and (vector? v) (memv (vector-length v) (list arity (sub1 arity))))
     (define l (vector->list v))
     (define full (if (= (length l) arity) l (append l '(#f))))
     (match full
       [(list cs ps fs sh nl an tr tps tfe)
        (if (valid-settings? cs ps fs sh nl tr tps tfe)
            (teaching-settings cs ps fs sh nl an tr (unmarshall-teachpacks tps) tfe)
            (default-settings lang))])]
    [else (default-settings lang)]))

(define (valid-settings? cs ps fs sh nl tr tps tfe)
  (and (boolean? cs)
       (memq ps '(constructor quasiquote write trad-write print))
       (memq fs '(mixed-fraction mixed-fraction-e repeating-decimal repeating-decimal-e))
       (boolean? sh) (boolean? nl) (boolean? tr) (boolean? tfe)
       (list? tps)
       #t))

;; `unmarshall-teachpack-settings`: (lib "c.rkt" "a" "b") => (lib "a/b/c.rkt")
(define (unmarshall-teachpacks obj)
  (for/list ([tp (in-list obj)])
    (match tp
      [`(lib ,(? string? s1) ,(? string? s2) ...)
       `(lib ,(string-join (append s2 (list s1)) "/"))]
      [_ tp])))

;; Character offset at which line number (n+1) starts (0-based offset).
(define (line-start-offset src n)
  (define in (open-input-string src))
  (for ([_ (in-range n)]) (read-line in 'any))
  (define-values (line col pos) (port-next-location in))
  ;; port-next-location without line counting gives position only
  (sub1 pos))

(define (find-lang-line src)
  (define m (regexp-match #px"(?m:^#lang[ ]+([^\r\n]*))" src))
  (and m (string-trim (cadr m))))
