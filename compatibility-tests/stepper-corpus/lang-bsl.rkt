#lang htdp/bsl
;; Stepping a #lang htdp/bsl module.
(define (double n) (* 2 n))
(+ 1 (double 3))
(check-expect (double 2) 4)
