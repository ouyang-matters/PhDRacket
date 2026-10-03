;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname mutation) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
;; Mutation and sharing output in Advanced Student.
(define counter 0)
(define (bump!) (begin (set! counter (+ counter 1)) counter))
(bump!)
(bump!)
(define-struct box2 (v))
(define b (make-box2 1))
(set-box2-v! b 5)
b
(check-expect (box2-v b) 5)
