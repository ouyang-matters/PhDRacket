;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-abbr-reader.ss" "lang")((modname lists) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; Lists and quote abbreviations in Beginning Student with List Abbreviations.
(define lst (list 1 2 3))
lst
'(a b c)
(cons 0 lst)
(first (rest lst))
(empty? empty)
(check-expect (length lst) 3)
