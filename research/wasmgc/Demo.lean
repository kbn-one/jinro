inductive Tree where
  | leaf
  | node (l : Tree) (v : Nat) (r : Tree)

def Tree.insert : Tree → Nat → Tree
  | .leaf, x => .node .leaf x .leaf
  | .node l v r, x => if x < v then .node (l.insert x) v r else if v < x then .node l v (r.insert x) else .node l v r

def Tree.size : Tree → Nat
  | .leaf => 0
  | .node l _ r => l.size + 1 + r.size

def fib : Nat → Nat
  | 0 => 0
  | 1 => 1
  | n + 2 => fib n + fib (n + 1)

def sumTo (n : Nat) : Nat := Id.run do
  let mut s := 0
  for i in [0:n] do s := s + i
  return s

def build (n : Nat) : Tree := (List.range n).foldl (fun t i => t.insert ((i * 7919) % n)) .leaf

def treeSize (n : Nat) : Nat := (build n).size
