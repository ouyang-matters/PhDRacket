#lang htdp/bsl
;; A teaching language selected with #lang instead of DrRacket metadata.
(define (f x) (* x 2))
(f 21)
(check-expect (f 1) 2)
(check-expect (f 1) 3)
