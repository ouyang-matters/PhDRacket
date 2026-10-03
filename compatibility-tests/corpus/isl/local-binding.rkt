;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname local-binding) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; `local` is available in Intermediate Student.
(define (sum-squares lon)
  (local [(define (sq n) (* n n))]
    (foldr + 0 (map sq lon))))
(sum-squares (list 1 2 3))
(check-expect (sum-squares empty) 0)
sum-squares
