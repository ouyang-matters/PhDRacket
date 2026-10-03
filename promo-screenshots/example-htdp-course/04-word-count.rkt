#lang htdp/isl+
;; count-long : [List-of String] Number -> Number
(check-expect (count-long (list "a" "racket" "ide") 3) 1)
(define (count-long words n)
  (length (filter (lambda (w) (> (string-length w) n)) words)))
