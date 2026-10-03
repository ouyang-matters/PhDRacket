#lang htdp/bsl
;; Insertion sort, built with the HtDP design recipe.

;; A ListOfNumbers (LoN) is one of:
;; - empty
;; - (cons Number LoN)

;; sort> : LoN -> LoN
;; arranges the numbers in l in descending order
(check-expect (sort> empty) empty)
(check-expect (sort> (cons 3 (cons 1 (cons 2 empty))))
              (cons 3 (cons 2 (cons 1 empty))))

(define (sort> l)
  (cond
    [(empty? l) empty]
    [else (insert (first l) (sort> (rest l)))]))

;; insert : Number LoN -> LoN
;; places n into the descending list l
(check-expect (insert 5 empty) (cons 5 empty))
(check-expect (insert 2 (cons 3 (cons 1 empty)))
              (cons 3 (cons 2 (cons 1 empty))))

(define (insert n l)
  (cond
    [(empty? l) (cons n empty)]
    [(>= n (first l)) (cons n l)]
    [else (cons (first l) (insert n (rest l)))]))

(sort> (cons 12 (cons 20 (cons -5 empty))))
