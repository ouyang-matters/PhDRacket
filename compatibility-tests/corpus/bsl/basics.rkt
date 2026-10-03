;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname basics) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; Numbers, Booleans, strings, conditionals and structures in BSL.
(define-struct node (left right))

(define (tree-height t)
  (cond
    [(empty? t) 0]
    [else (+ 1 (max (tree-height (node-left t))
                    (tree-height (node-right t))))]))

(define example-tree (make-node (make-node empty empty) empty))

(tree-height example-tree)
(/ 1 3)
(sqrt 2)
#true
"hello"
(make-node 1 (cons 2 empty))
'sym

(check-expect (tree-height empty) 0)
(check-expect (tree-height example-tree) 2)
(check-within (sqrt 2) 1.414 0.001)
(check-expect (tree-height example-tree) 3)
