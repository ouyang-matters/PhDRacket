#lang racket
;; Full Racket module with output, a test submodule and a main submodule.
(define (greet name) (format "Hello, ~a!" name))
(displayln (greet "world"))
(eprintf "to stderr\n")
(greet "value")
(module+ test (displayln "test submodule ran"))
(module+ main (displayln "main submodule ran"))
