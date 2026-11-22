/-
A tiny Lean IR → WasmGC backend (research prototype).

Reads the compiled IR of a module (from its .olean, the same IR Lean's own C backend consumes),
starting at the given roots and following calls, and prints a WebAssembly text module (WAT) that
uses WasmGC instead of Lean's C runtime:

* objects are GC structs `$obj { tag : i32, fields : array anyref }`; scalar constructors and
  small naturals are `i31ref` (Lean's `lean_box`), larger naturals a `$big { i64 }`;
* reference counting is dropped: `inc`/`dec`/`del` emit nothing, and `isShared` always answers
  "shared" so code never takes the destructive-update path (`set` on a fresh object is harmless);
* join points become blocks, `case` a `br_table`, a call in tail position `return_call`;
* `@[extern]` functions are looked up by their C name in a small table of WAT implementations.

Anything outside that subset (closures, strings, arrays, scalar fields, floats) stops with an
error naming it — that list is the to-do list.

Usage: emitwasm <Module> <root> [<root> ...]  >  out.wat
-/
import Lean
open Lean IR

namespace WasmGC

/-! ## Output -/

structure St where
  out : Array String := #[]
  /-- Function name → wasm index name, in emission order. -/
  funIds : Std.HashMap Name Nat := {}
  labels : Nat := 0

abbrev M := StateT St (ExceptT String IO)

def line (s : String) : M Unit := modify fun st => { st with out := st.out.push s }
def fresh : M Nat := modifyGet fun st => (st.labels, { st with labels := st.labels + 1 })

def unsupported {α} (what : String) : M α := throw s!"unsupported: {what}"

/-! ## Types -/

def wasmTy : IRType → M String
  | .object | .tobject | .tagged | .erased | .void => pure "anyref"
  | .uint8 | .uint16 | .uint32 => pure "i32"
  | .uint64 | .usize => pure "i64"
  | t => unsupported s!"type {format t}"

def isScalar (t : IRType) : Bool := t.isScalar

/-! ## Externs: C name → WAT function (all defined in `prelude`) -/

def externImpl : List (String × String) :=
  [("lean_nat_add", "$nat_add"), ("lean_nat_sub", "$nat_sub"), ("lean_nat_mul", "$nat_mul"),
   ("lean_nat_div", "$nat_div"), ("lean_nat_mod", "$nat_mod"),
   ("lean_nat_dec_eq", "$nat_dec_eq"), ("lean_nat_dec_lt", "$nat_dec_lt"),
   ("lean_nat_dec_le", "$nat_dec_le"),
   -- Fixed-width integers are single wasm instructions.
   ("lean_uint32_add", "$u32_add"), ("lean_uint32_sub", "$u32_sub"),
   ("lean_uint32_mul", "$u32_mul"), ("lean_uint32_div", "$u32_div"),
   ("lean_uint32_mod", "$u32_mod"), ("lean_uint32_dec_eq", "$u32_eq"),
   ("lean_uint32_dec_lt", "$u32_lt"), ("lean_uint32_dec_le", "$u32_le")]

def externName (d : ExternAttrData) : Option String :=
  d.entries.findSome? fun
    | .standard _ s => some s
    | _ => none

/-! ## Collecting the program -/

partial def calls : FnBody → Array Name
  | .vdecl _ _ e b =>
    let here := match e with
      | .fap c _ | .pap c _ => #[c]
      | _ => #[]
    here ++ calls b
  | .jdecl _ _ v b => calls v ++ calls b
  | .case _ _ _ alts => alts.foldl (fun acc a => acc ++ calls a.body) #[]
  | b => if b.isTerminal then #[] else calls b.body

/-- Every declaration reachable from the roots. -/
partial def collect (env : Environment) (roots : List Name) : Except String (Array Decl) := do
  let mut seen : Std.HashSet Name := {}
  let mut todo := roots
  let mut out := #[]
  while true do
    match todo with
    | [] => break
    | n :: rest =>
      todo := rest
      if seen.contains n then continue
      seen := seen.insert n
      match findEnvDecl env n with
      | none => throw s!"no IR for {n}"
      | some d =>
        out := out.push d
        if let .fdecl _ _ _ body _ := d then todo := todo ++ (calls body).toList
  return out

/-! ## Locals -/

def var (x : VarId) : String := s!"$x{x.idx}"

partial def localsOf : FnBody → Array (VarId × IRType)
  | .vdecl x t _ b => #[(x, t)] ++ localsOf b
  | .jdecl _ xs v b => xs.map (fun p => (p.x, p.ty)) ++ localsOf v ++ localsOf b
  | .case _ _ _ alts => alts.foldl (fun acc a => acc ++ localsOf a.body) #[]
  | b => if b.isTerminal then #[] else localsOf b.body

/-! ## Expressions (leave one value on the stack) -/

def funRef (env : Environment) (c : Name) : M String := do
  match findEnvDecl env c with
  | some (.extern _ _ _ ext) =>
    match externName ext with
    | some cname =>
      match externImpl.lookup cname with
      | some f => pure f
      | none => unsupported s!"extern {c} ({cname})"
    | none => unsupported s!"extern {c} without a C name"
  | _ =>
    match (← get).funIds.get? c with
    | some i => pure s!"$f{i}"
    | none => throw s!"unknown function {c}"

def argWith (ty : IRType) : Arg → M Unit
  | .var x => line s!"local.get {var x}"
  | .erased => do
    match ← wasmTy ty with
    | "anyref" => line "ref.null any"
    | "i64" => line "i64.const 0"
    | _ => line "i32.const 0"

def emitArgs (env : Environment) (c : Name) (ys : Array Arg) : M Unit := do
  let ps := (findEnvDecl env c).map (·.params) |>.getD #[]
  for h : i in [0:ys.size] do
    argWith (ps[i]?.map (·.ty) |>.getD .object) ys[i]

def emitExpr (env : Environment) (ty : IRType) : IR.Expr → M Unit
  | .ctor i ys => do
    if i.usize > 0 then unsupported s!"usize fields in {i.name}"
    if i.size == 0 && i.ssize == 0 then
      line s!"(ref.i31 (i32.const {i.cidx}))"
    else
      line s!"i32.const {i.cidx}"
      for y in ys do argWith .object y
      line s!"array.new_fixed $fields {ys.size}"
      if i.ssize > 0 then line s!"(array.new_default $scalars (i32.const {i.ssize}))"
      else line "ref.null $scalars"
      line "struct.new $obj"
  | .reset _ _ => line "ref.null any"
  | .reuse _ i _ ys => emitExpr env ty (.ctor i ys)
  | .proj i x => do
    line s!"(struct.get $obj $fields (ref.cast (ref $obj) (local.get {var x})))"
    line s!"i32.const {i}"
    line "array.get $fields"
  | .fap c ys => do emitArgs env c ys; line s!"call {← funRef env c}"
  | .box t x => do
    match ← wasmTy t with
    | "i32" => line s!"(ref.i31 (local.get {var x}))"
    | "i64" => line s!"(call $nat_mk (local.get {var x}))"
    | _ => line s!"local.get {var x}"
  | .unbox x => do
    match ← wasmTy ty with
    | "i32" => line s!"(i31.get_u (ref.cast (ref i31) (local.get {var x})))"
    | "i64" => line s!"(call $nat_val (local.get {var x}))"
    | _ => line s!"local.get {var x}"
  | .lit (.num v) => do
    match ← wasmTy ty with
    | "i32" => line s!"i32.const {v}"
    | "i64" => line s!"i64.const {v}"
    | _ =>
      if v < 2 ^ 30 then line s!"(ref.i31 (i32.const {v}))"
      else line s!"(struct.new $big (i64.const {v}))"
  | .isShared _ => line "i32.const 1"
  | .lit (.str _) => unsupported "string literals"
  | .pap c _ => unsupported s!"partial application of {c} (closures)"
  | .ap _ _ => unsupported "closure application"
  | .sproj _ offset x => do
    line s!"(struct.get $obj $scalars (ref.cast (ref $obj) (local.get {var x})))"
    line s!"i32.const {offset}"
    line "array.get $scalars"
    match ← wasmTy ty with
    | "i32" => line "i32.wrap_i64"
    | "i64" => pure ()
    | t => unsupported s!"scalar projection to {t}"
  | .uproj .. => unsupported "usize projections"

/-! ## Bodies -/

/-- Skip reference-counting instructions, which mean nothing under a GC. -/
partial def skipRC : FnBody → FnBody
  | .inc _ _ _ _ b | .dec _ _ _ _ b | .del _ b => skipRC b
  | b => b

partial def emitBody (env : Environment) (jps : Std.HashMap Nat (String × Array Param))
    : FnBody → M Unit
  | .vdecl x ty e b => do
    -- A call whose result is returned right away is a tail call.
    match e, skipRC b with
    | .fap c ys, .ret (.var y) =>
      if y == x && (findEnvDecl env c).all (fun d => !(d matches .extern ..)) then
        emitArgs env c ys
        line s!"return_call {← funRef env c}"
        return
    | _, _ => pure ()
    emitExpr env ty e
    line s!"local.set {var x}"
    emitBody env jps b
  | .jdecl j xs v b => do
    let label := s!"$j{← fresh}"
    line s!"block {label}"
    emitBody env (jps.insert j.idx (label, xs)) b
    line "end"
    emitBody env jps v
  | .set x i y b => do
    line s!"(struct.get $obj $fields (ref.cast (ref $obj) (local.get {var x})))"
    line s!"i32.const {i}"
    argWith .object y
    line "array.set $fields"
    emitBody env jps b
  | .setTag x c b => do
    line s!"(struct.set $obj $tag (ref.cast (ref $obj) (local.get {var x})) (i32.const {c}))"
    emitBody env jps b
  | .inc _ _ _ _ b | .dec _ _ _ _ b | .del _ b => emitBody env jps b
  | .sset x _ offset y ty b => do
    line s!"(struct.get $obj $scalars (ref.cast (ref $obj) (local.get {var x})))"
    line s!"i32.const {offset}"
    line s!"local.get {var y}"
    match ← wasmTy ty with
    | "i32" => line "i64.extend_i32_u"
    | "i64" => pure ()
    | t => unsupported s!"scalar field of type {t}"
    line "array.set $scalars"
    emitBody env jps b
  | .uset .. => unsupported "usize field updates"
  | .case _ x xty alts => do
    let k ← fresh
    let n := alts.size
    -- one block per alternative, innermost first; br_table picks by constructor index
    for i in [0:n] do line s!"block $c{k}_{n - 1 - i}"
    if isScalar xty then line s!"local.get {var x}" else line s!"(call $tag (local.get {var x}))"
    let defaultIdx := alts.findIdx? (·.isDefault)
    let maxTag := alts.foldl (fun m a => match a with | .ctor i _ => max m (i.cidx + 1) | _ => m) 0
    let targetOf (t : Nat) : Nat :=
      match alts.findIdx? (fun a => match a with | .ctor i _ => i.cidx == t | _ => false) with
      | some i => i
      | none => defaultIdx.getD 0
    let table := (List.range maxTag).map fun t => s!"$c{k}_{targetOf t}"
    line s!"br_table {" ".intercalate table} $c{k}_{defaultIdx.getD (n - 1)}"
    for i in [0:n] do
      line "end"
      emitBody env jps alts[i]!.body
  | .ret a => do argWith .object a; line "return"
  | .jmp j ys => do
    let some (label, ps) := jps.get? j.idx | throw s!"unknown join point {j.idx}"
    for h : i in [0:ys.size] do argWith (ps[i]?.map (·.ty) |>.getD .object) ys[i]
    for p in ps.reverse do line s!"local.set {var p.x}"
    line s!"br {label}"
  | .unreachable => line "unreachable"

def emitDecl (env : Environment) (exports : List Name) : Decl → M Unit
  | .extern .. => pure ()
  | .fdecl f xs ty body _ => do
    let id ← funRef env f
    let params ← xs.mapM fun p => do pure s!"(param {var p.x} {← wasmTy p.ty})"
    let exp := if exports.contains f then s!" (export \"{f}\")" else ""
    line s!"(func {id}{exp} {" ".intercalate params.toList} (result {← wasmTy ty})"
    let ps := xs.map (·.x.idx)
    let mut declared : Std.HashSet Nat := {}
    for (x, t) in localsOf body do
      if !ps.contains x.idx && !declared.contains x.idx then
        declared := declared.insert x.idx
        line s!"(local {var x} {← wasmTy t})"
    emitBody env {} body
    line "unreachable)"

/-! ## The runtime: a few dozen lines instead of Lean's C runtime -/

def prelude : String := "
(type $fields (array (mut anyref)))
;; Scalar fields (Lean's `sset`/`sproj`): one i64 slot per byte offset — wasteful, simple.
(type $scalars (array (mut i64)))
(type $obj (struct (field $tag (mut i32)) (field $fields (ref $fields))
  (field $scalars (ref null $scalars))))
(type $big (struct (field i64)))

;; Constructor index of a value: boxed scalars carry it in the i31, objects in $tag.
(func $tag (param $v anyref) (result i32)
  (if (result i32) (ref.test (ref i31) (local.get $v))
    (then (i31.get_u (ref.cast (ref i31) (local.get $v))))
    (else (struct.get $obj $tag (ref.cast (ref $obj) (local.get $v))))))

;; Nat: i31 below 2^30, $big up to 2^63; beyond that we trap (no bignums yet).
(func $nat_val (param $v anyref) (result i64)
  (if (result i64) (ref.test (ref i31) (local.get $v))
    (then (i64.extend_i32_u (i31.get_u (ref.cast (ref i31) (local.get $v)))))
    (else (struct.get $big 0 (ref.cast (ref $big) (local.get $v))))))
(func $nat_mk (param $n i64) (result anyref)
  (if (result anyref) (i64.lt_u (local.get $n) (i64.const 0x40000000))
    (then (ref.i31 (i32.wrap_i64 (local.get $n))))
    (else
      (if (i64.ge_u (local.get $n) (i64.const 0x8000000000000000)) (then unreachable))
      (struct.new $big (local.get $n)))))
(func $nat_add (param $a anyref) (param $b anyref) (result anyref)
  (call $nat_mk (i64.add (call $nat_val (local.get $a)) (call $nat_val (local.get $b)))))
(func $nat_sub (param $a anyref) (param $b anyref) (result anyref)
  (local $x i64) (local $y i64)
  (local.set $x (call $nat_val (local.get $a)))
  (local.set $y (call $nat_val (local.get $b)))
  (call $nat_mk (select (i64.sub (local.get $x) (local.get $y)) (i64.const 0)
    (i64.gt_u (local.get $x) (local.get $y)))))
(func $nat_mul (param $a anyref) (param $b anyref) (result anyref)
  (local $x i64) (local $y i64)
  (local.set $x (call $nat_val (local.get $a)))
  (local.set $y (call $nat_val (local.get $b)))
  ;; trap instead of overflowing 2^63
  (if (i64.ne (local.get $x) (i64.const 0))
    (then
      (if (i64.gt_u (local.get $y) (i64.div_u (i64.const 0x7fffffffffffffff) (local.get $x)))
        (then unreachable))))
  (call $nat_mk (i64.mul (local.get $x) (local.get $y))))
(func $nat_div (param $a anyref) (param $b anyref) (result anyref)
  (local $y i64)
  (local.set $y (call $nat_val (local.get $b)))
  (if (result anyref) (i64.eqz (local.get $y))
    (then (ref.i31 (i32.const 0)))
    (else (call $nat_mk (i64.div_u (call $nat_val (local.get $a)) (local.get $y))))))
(func $nat_mod (param $a anyref) (param $b anyref) (result anyref)
  (local $y i64)
  (local.set $y (call $nat_val (local.get $b)))
  (if (result anyref) (i64.eqz (local.get $y))
    (then (local.get $a))
    (else (call $nat_mk (i64.rem_u (call $nat_val (local.get $a)) (local.get $y))))))
(func $nat_dec_eq (param $a anyref) (param $b anyref) (result i32)
  (i64.eq (call $nat_val (local.get $a)) (call $nat_val (local.get $b))))
(func $nat_dec_lt (param $a anyref) (param $b anyref) (result i32)
  (i64.lt_u (call $nat_val (local.get $a)) (call $nat_val (local.get $b))))
(func $u32_add (param i32 i32) (result i32) (i32.add (local.get 0) (local.get 1)))
(func $u32_sub (param i32 i32) (result i32) (i32.sub (local.get 0) (local.get 1)))
(func $u32_mul (param i32 i32) (result i32) (i32.mul (local.get 0) (local.get 1)))
;; Lean: x / 0 = 0 and x % 0 = x
(func $u32_div (param i32 i32) (result i32)
  (if (result i32) (local.get 1) (then (i32.div_u (local.get 0) (local.get 1))) (else (i32.const 0))))
(func $u32_mod (param i32 i32) (result i32)
  (if (result i32) (local.get 1) (then (i32.rem_u (local.get 0) (local.get 1))) (else (local.get 0))))
(func $u32_eq (param i32 i32) (result i32) (i32.eq (local.get 0) (local.get 1)))
(func $u32_lt (param i32 i32) (result i32) (i32.lt_u (local.get 0) (local.get 1)))
(func $u32_le (param i32 i32) (result i32) (i32.le_u (local.get 0) (local.get 1)))
(func $nat_dec_le (param $a anyref) (param $b anyref) (result i32)
  (i64.le_u (call $nat_val (local.get $a)) (call $nat_val (local.get $b))))
"

def emitModule (env : Environment) (roots : List Name) : M Unit := do
  let decls ← match collect env roots with
    | .ok ds => pure ds
    | .error e => throw e
  for h : i in [0:decls.size] do
    modify fun st => { st with funIds := st.funIds.insert decls[i].name i }
  line "(module"
  line prelude
  for d in decls do
    line s!";; {d.name}"
    emitDecl env roots d
  line ")"

end WasmGC

unsafe def main (args : List String) : IO UInt32 := do
  let mod :: roots := args | IO.eprintln "usage: emitwasm <Module> <root>..."; return 2
  enableInitializersExecution
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := mod.toName }] {} (loadExts := true)
  match ← (WasmGC.emitModule env (roots.map String.toName)).run {} |>.run with
  | .ok ((), st) => IO.println ("\n".intercalate st.out.toList); return 0
  | .error e => IO.eprintln e; return 1
