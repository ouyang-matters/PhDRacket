;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname cond-recursion) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; cond and structural recursion on a list.
(define (len l)
  (cond
    [(empty? l) 0]
    [else (+ 1 (len (rest l)))]))
(len (cons 7 (cons 8 empty)))
