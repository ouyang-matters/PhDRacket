;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname higher-order) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; Higher-order functions and lambda in Intermediate Student with lambda.
(define add1-all (lambda (lon) (map (lambda (n) (+ n 1)) lon)))
(add1-all (list 1 2 3))
(filter (lambda (s) (string=? s "b")) (list "a" "b"))
(check-expect (add1-all (list 0)) (list 1))
(lambda (x) x)
