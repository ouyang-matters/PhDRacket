;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname tests-mixed) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; Test D: check-expect, check-within, check-error, check-member-of, check-range.
(define (safe-div a b)
  (if (= b 0)
      (error 'safe-div "division by zero")
      (/ a b)))

(check-expect (safe-div 6 3) 2)
(check-expect (safe-div 1 4) 0.25)
(check-within (safe-div 1 3) 0.333 0.001)
(check-error (safe-div 1 0) "safe-div: division by zero")
(check-member-of (safe-div 4 2) 1 2 3)
(check-range (safe-div 9 3) 0 10)
(check-expect (safe-div 1 1) 2)
(check-error (safe-div 1 1))
(check-expect (safe-div 1 0) 0)
