import Demo

/-!
# The same tree, in wasm-friendly types

`U.Tree` stores `UInt32` keys and counts in `UInt32`, so the compiled IR uses only i32 scalars
and GC objects — no arbitrary-precision `Nat`, no runtime support beyond single wasm instructions.
The theorems below tie it to the `Nat` version in `Demo`, which is where one would prove things.
-/

namespace U

inductive Tree where
  | leaf
  | node (l : Tree) (v : UInt32) (r : Tree)

def Tree.insert : Tree → UInt32 → Tree
  | .leaf, x => .node .leaf x .leaf
  | .node l v r, x =>
    if x < v then .node (l.insert x) v r else if v < x then .node l v (r.insert x) else .node l v r

def Tree.size : Tree → UInt32
  | .leaf => 0
  | .node l _ r => l.size + 1 + r.size

/-- Insert `(i * 7919) % n` for `i = 0 .. n-1`, as `Demo.build` does. -/
def buildLoop (n i : UInt32) (t : Tree) : Tree :=
  if h : i < n then buildLoop n (i + 1) (t.insert ((i * 7919) % n)) else t
termination_by n.toNat - i.toNat
decreasing_by
  have := UInt32.lt_iff_toNat_lt.mp h
  have h1 : (i + 1).toNat = i.toNat + 1 := by
    rw [UInt32.toNat_add]; simp; have := n.toNat_lt; omega
  omega

def build (n : UInt32) : Tree := buildLoop n 0 .leaf

def treeSize (n : UInt32) : UInt32 := (build n).size

/-! ## Compatibility with the `Nat` version -/

/-- Read a `UInt32` tree as a `Nat` tree. -/
def Tree.toNat : Tree → _root_.Tree
  | .leaf => .leaf
  | .node l v r => .node l.toNat v.toNat r.toNat

/-- Insertion agrees with the `Nat` version, key for key. -/
theorem Tree.toNat_insert (t : Tree) (x : UInt32) :
    (t.insert x).toNat = t.toNat.insert x.toNat := by
  induction t with
  | leaf => simp [Tree.insert, Tree.toNat, _root_.Tree.insert]
  | node l v r ihl ihr =>
    simp only [Tree.insert, Tree.toNat, _root_.Tree.insert, UInt32.lt_iff_toNat_lt]
    by_cases h1 : x.toNat < v.toNat
    · simp [h1, Tree.toNat, ihl]
    · by_cases h2 : v.toNat < x.toNat
      · simp [h1, h2, Tree.toNat, ihr]
      · simp [h1, h2, Tree.toNat]

/-- The size agrees with the `Nat` version modulo 2^32 (exactly, whenever it is below 2^32). -/
theorem Tree.toNat_size (t : Tree) : t.size.toNat = t.toNat.size % 2 ^ 32 := by
  induction t with
  | leaf => simp [Tree.size, Tree.toNat, _root_.Tree.size]
  | node l v r ihl ihr =>
    simp only [Tree.size, Tree.toNat, _root_.Tree.size, UInt32.toNat_add, ihl, ihr]
    simp

end U
