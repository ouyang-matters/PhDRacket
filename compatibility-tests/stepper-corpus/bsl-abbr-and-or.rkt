;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-abbr-reader.ss" "lang")((modname and-or) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; and/or and structures in BSL with list abbreviations.
(define-struct p (a b))
(and (> 2 1) (p-a (make-p 3 4)))
(or false (empty? (list)))
