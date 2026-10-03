#lang htdp/bsl
;; f->c : Number -> Number
;; converts a Fahrenheit temperature to Celsius
(check-expect (f->c 32) 0)
(check-expect (f->c 212) 100)
(define (f->c f) (* 5/9 (- f 32)))
