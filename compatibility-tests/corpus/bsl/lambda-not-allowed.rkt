;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname lambda-not-allowed) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; Test C: BSL only allows `lambda` as the right-hand side of a definition
;; (`(define f (lambda (x) ...))` is legal BSL). Anywhere else it is rejected.
(define (keep x) x)
(keep (lambda (x) x))
