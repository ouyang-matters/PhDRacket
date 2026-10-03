#lang htdp/bsl
;; area-of-disk : Number -> Number
;; computes the area of a disk with radius r
(check-expect (area-of-disk 1) pi)
(define (area-of-disk r) (* pi r r))
