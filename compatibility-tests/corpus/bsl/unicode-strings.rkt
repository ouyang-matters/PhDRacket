;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname unicode-strings) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; Non-ASCII text in strings and comments: café, λ, 你好, émoji 🙂.
(define greeting "café λ 你好 🙂")
(string-length greeting)
greeting
(check-expect (string-append "λ" "x") "λx")
