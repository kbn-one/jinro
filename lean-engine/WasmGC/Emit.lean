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
* `@[extern]` functions are looked up by their C name in a small table of WAT implementations;
  `Array`s are WasmGC arrays, copied on every update;
* closures are `$clo { arity, funcref, args }`, applied through `call_ref`.

Anything outside that subset (strings, `usize` fields, floats, bignums) stops with an error
naming it — that list is the to-do list.

Usage: emitwasm [--list-io] <Module> <root> [<root> ...]  >  out.wat
       emitwasm --needs <Module> <root> ...      (the externs and IR forms a program uses)
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
  /-- String literals, emitted as passive data segments `$s0`, `$s1`, … -/
  lits : Array String := #[]

abbrev M := StateT St (ExceptT String IO)

def line (s : String) : M Unit := modify fun st => { st with out := st.out.push s }
def fresh : M Nat := modifyGet fun st => (st.labels, { st with labels := st.labels + 1 })

def unsupported {α} (what : String) : M α := throw s!"unsupported: {what}"

/-! ## Types -/

def wasmTy : IRType → M String
  | .object | .tobject | .tagged | .erased | .void => pure "anyref"
  -- USize is 32 bits: wasm here is a 32-bit platform (`System.Platform.numBits` = 32).
  | .uint8 | .uint16 | .uint32 | .usize => pure "i32"
  | .uint64 => pure "i64"
  | t => unsupported s!"type {format t}"

def isScalar (t : IRType) : Bool := t.isScalar

/-! ## Externs: C name → WAT function (all defined in `prelude`) -/

/-- Implemented in `strings.wat`, which is included only when a program uses one of them. -/
def stringExterns : List (String × String) :=
  [("lean_string_append", "$str_append"), ("lean_string_compare", "$str_compare"),
   ("lean_string_dec_eq", "$str_eq"), ("lean_string_get_byte_fast", "$str_get_byte"),
   ("lean_string_length", "$str_length"), ("lean_string_memcmp", "$str_memcmp"),
   ("lean_string_mk", "$str_of_list"), ("lean_string_of_usize", "$usize_repr"),
   ("lean_string_offsetofpos", "$str_offset_of_pos"), ("lean_string_posof", "$str_pos_of"),
   ("lean_string_push", "$str_push"), ("lean_string_pushn", "$str_pushn"),
   ("lean_string_utf8_byte_size", "$str_byte_size"), ("lean_string_utf8_extract", "$str_extract"),
   ("lean_string_utf8_get", "$str_get"), ("lean_string_utf8_get_fast", "$str_get"),
   ("lean_string_utf8_next", "$str_next"), ("lean_string_utf8_next_fast", "$str_next"),
   ("lean_string_utf8_prev", "$str_prev"),
   ("lean_byte_array_mk", "$bytes_of_array"), ("lean_byte_array_fget", "$bytes_get"),
   ("lean_panic_fn_borrowed", "$panic"), ("lean_system_platform_nbits", "$num_bits"),
   ("lean_nat_to_int", "$int_of_nat"), ("lean_nat_abs", "$int_nat_abs"),
   ("lean_int_add", "$int_add"), ("lean_int_sub", "$int_sub"), ("lean_int_mul", "$int_mul"),
   ("lean_int_neg", "$int_neg"), ("lean_int_dec_eq", "$int_eq"), ("lean_int_dec_le", "$int_le"),
   ("lean_int_dec_lt", "$int_lt"), ("lean_nat_pow", "$nat_pow"), ("lean_nat_shiftr", "$nat_shiftr"),
   ("lean_uint16_dec_lt", "$u16_lt"), ("lean_uint16_lor", "$u16_or"),
   ("lean_uint16_shift_left", "$u16_shl"), ("lean_uint16_to_uint32", "$u16_to_u32"),
   ("lean_uint32_land", "$u32_and"), ("lean_uint32_lor", "$u32_or"),
   ("lean_uint32_shift_left", "$u32_shl"), ("lean_uint32_to_nat", "$u32_to_nat"),
   ("lean_uint32_to_uint16", "$u32_to_u16"), ("lean_uint8_dec_eq", "$u8_eq"),
   ("lean_uint8_to_nat", "$u8_to_nat"), ("lean_usize_sub", "$usize_sub"),
   ("lean_array_pop", "$arr_pop")]

def stringRuntime : String := include_str "strings.wat"

def externImpl : List (String × String) :=
  [("lean_nat_add", "$nat_add"), ("lean_nat_sub", "$nat_sub"), ("lean_nat_mul", "$nat_mul"),
   ("lean_nat_div", "$nat_div"), ("lean_nat_mod", "$nat_mod"),
   ("lean_nat_dec_eq", "$nat_dec_eq"), ("lean_nat_dec_lt", "$nat_dec_lt"),
   ("lean_nat_dec_le", "$nat_dec_le"),
   -- Fixed-width integers are single wasm instructions.
   ("lean_uint32_add", "$u32_add"), ("lean_uint32_sub", "$u32_sub"),
   ("lean_uint32_mul", "$u32_mul"), ("lean_uint32_div", "$u32_div"),
   ("lean_uint32_mod", "$u32_mod"), ("lean_uint32_dec_eq", "$u32_eq"),
   ("lean_uint32_dec_lt", "$u32_lt"), ("lean_uint32_dec_le", "$u32_le"),
   ("lean_usize_of_nat", "$usize_of_nat"), ("lean_usize_to_nat", "$usize_to_nat"),
   ("lean_usize_add", "$usize_add"), ("lean_usize_dec_eq", "$usize_eq"),
   ("lean_usize_dec_lt", "$usize_lt"),
   -- Arrays are WasmGC arrays, never updated in place (see `prelude`).
   ("lean_mk_empty_array_with_capacity", "$arr_empty"), ("lean_mk_array", "$arr_replicate"),
   ("lean_array_mk", "$arr_of_list"), ("lean_array_to_list", "$arr_to_list"),
   ("lean_array_get_size", "$arr_size"), ("lean_array_size", "$arr_usize"),
   ("lean_array_fget", "$arr_fget"), ("lean_array_fget_borrowed", "$arr_fget"),
   ("lean_array_get", "$arr_get"), ("lean_array_get_borrowed", "$arr_get"),
   ("lean_array_uget", "$arr_uget"), ("lean_array_uget_borrowed", "$arr_uget"),
   ("lean_array_fset", "$arr_fset"), ("lean_array_uset", "$arr_uset"),
   ("lean_array_push", "$arr_push")] ++ stringExterns



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
  let d := findEnvDecl env c
  let ps := d.map (·.params) |>.getD #[]
  -- As in Lean's C backend, an extern's erased parameters (types, proofs) are not passed.
  let isExtern := d.any (· matches .extern ..)
  for h : i in [0:ys.size] do
    let ty := ps[i]?.map (·.ty) |>.getD .object
    unless isExtern && ty.isErased do argWith ty ys[i]

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
    match t with
    -- may not fit an i31: box as a Nat
    | .uint32 | .usize => line s!"(call $nat_mk (i64.extend_i32_u (local.get {var x})))"
    | _ =>
    match ← wasmTy t with
    | "i32" => line s!"(ref.i31 (local.get {var x}))"
    | "i64" => line s!"(call $nat_mk (local.get {var x}))"
    | _ => line s!"local.get {var x}"
  | .unbox x => do
    match ty with
    | .uint32 | .usize => line s!"(i32.wrap_i64 (call $nat_val (local.get {var x})))"
    | _ =>
    match ← wasmTy ty with
    | "i32" => line s!"(i31.get_u (ref.cast (ref i31) (local.get {var x})))"
    | "i64" => line s!"(call $nat_val (local.get {var x}))"
    | _ => line s!"local.get {var x}"
  | .lit (.num v) => do
    match ← wasmTy ty with
    | "i32" => line s!"i32.const {v % 2 ^ 32}"
    | "i64" => line s!"i64.const {v % 2 ^ 64}"
    | _ =>
      if v < 2 ^ 30 then line s!"(ref.i31 (i32.const {v}))"
      else line s!"(struct.new $big (i64.const {v}))"
  | .isShared _ => line "i32.const 1"
  | .lit (.str v) => do
    let k ← modifyGet fun st => (st.lits.size, { st with lits := st.lits.push v })
    let n := v.utf8ByteSize
    line s!"(struct.new $str (struct.new $buf (array.new_data $bytes $s{k} (i32.const 0) (i32.const {n}))"
    line s!"  (i32.const {n})) (i32.const {n}))"
  | .pap c ys => do
    -- A closure: the function (always a boxed variant, all `anyref`), its arity, the arguments.
    let ps := (findEnvDecl env c).map (·.params) |>.getD #[]
    for p in ps do
      if (← wasmTy p.ty) != "anyref" then unsupported s!"closure over unboxed {c}"
    line s!"i32.const {ps.size}"
    line s!"ref.func {← funRef env c}"
    for y in ys do argWith .object y
    line s!"array.new_fixed $fields {ys.size}"
    line "struct.new $clo"
  | .ap x ys => do
    line s!"local.get {var x}"
    for y in ys do argWith .object y
    line s!"array.new_fixed $fields {ys.size}"
    line "call $apply"
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
    -- A constant (no parameters, e.g. `_closed_N`) is computed once, as Lean's C backend does at
    -- startup: here on first use, kept in a global.
    let memo := xs.isEmpty && (← wasmTy ty) == "anyref"
    if memo then
      line s!"(global {id}_g (mut anyref) (ref.null any))"
      line s!"(func {id}{exp} (result anyref)"
      line s!"  (if (ref.is_null (global.get {id}_g)) (then (global.set {id}_g (call {id}_init))))"
      line s!"  (global.get {id}_g))"
    let id := if memo then s!"{id}_init" else id
    let exp := if memo then "" else exp
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
(func $usize_add (param i32 i32) (result i32) (i32.add (local.get 0) (local.get 1)))
(func $usize_eq (param i32 i32) (result i32) (i32.eq (local.get 0) (local.get 1)))
(func $usize_lt (param i32 i32) (result i32) (i32.lt_u (local.get 0) (local.get 1)))
;; USize.ofNat is `n % 2^32`
(func $usize_of_nat (param $n anyref) (result i32) (i32.wrap_i64 (call $nat_val (local.get $n))))
(func $usize_to_nat (param $n i32) (result anyref) (call $nat_mk (i64.extend_i32_u (local.get $n))))

;; Array: a $fields array of exactly its size. Lean updates an array in place when it holds the
;; only reference; without reference counts we cannot know that, so every update copies.
(func $arr (param $a anyref) (result (ref $fields)) (ref.cast (ref $fields) (local.get $a)))
(func $arr_empty (param $cap anyref) (result anyref) (array.new_fixed $fields 0))
(func $arr_replicate (param $n anyref) (param $v anyref) (result anyref)
  (array.new $fields (local.get $v) (i32.wrap_i64 (call $nat_val (local.get $n)))))
(func $arr_size (param $a anyref) (result anyref)
  (ref.i31 (array.len (call $arr (local.get $a)))))
(func $arr_usize (param $a anyref) (result i32) (array.len (call $arr (local.get $a))))
(func $arr_fget (param $a anyref) (param $i anyref) (result anyref)
  (array.get $fields (call $arr (local.get $a)) (i32.wrap_i64 (call $nat_val (local.get $i)))))
(func $arr_uget (param $a anyref) (param $i i32) (result anyref)
  (array.get $fields (call $arr (local.get $a)) (local.get $i)))
;; `a[i]!`: the default (the `Inhabited` value) when out of bounds. Lean would also report a panic.
(func $arr_get (param $d anyref) (param $a anyref) (param $i anyref) (result anyref)
  (local $j i64)
  (local.set $j (call $nat_val (local.get $i)))
  (if (result anyref)
      (i64.lt_u (local.get $j) (i64.extend_i32_u (array.len (call $arr (local.get $a)))))
    (then (array.get $fields (call $arr (local.get $a)) (i32.wrap_i64 (local.get $j))))
    (else (local.get $d))))
(func $arr_copy (param $a anyref) (param $n i32) (result (ref $fields))
  (local $b (ref $fields))
  (local.set $b (array.new_default $fields (local.get $n)))
  (array.copy $fields $fields (local.get $b) (i32.const 0) (call $arr (local.get $a)) (i32.const 0)
    (array.len (call $arr (local.get $a))))
  (local.get $b))
(func $arr_uset (param $a anyref) (param $i i32) (param $v anyref) (result anyref)
  (local $b (ref $fields))
  (local.set $b (call $arr_copy (local.get $a) (array.len (call $arr (local.get $a)))))
  (array.set $fields (local.get $b) (local.get $i) (local.get $v))
  (local.get $b))
(func $arr_fset (param $a anyref) (param $i anyref) (param $v anyref) (result anyref)
  (call $arr_uset (local.get $a) (i32.wrap_i64 (call $nat_val (local.get $i))) (local.get $v)))
(func $arr_push (param $a anyref) (param $v anyref) (result anyref)
  (local $b (ref $fields)) (local $n i32)
  (local.set $n (array.len (call $arr (local.get $a))))
  (local.set $b (call $arr_copy (local.get $a) (i32.add (local.get $n) (i32.const 1))))
  (array.set $fields (local.get $b) (local.get $n) (local.get $v))
  (local.get $b))
;; List: [] is the scalar constructor 0, x :: xs an $obj with tag 1 and fields [x, xs].
(func $arr_of_list (param $l anyref) (result anyref)
  (local $n i32) (local $p anyref) (local $b (ref $fields))
  (local.set $p (local.get $l))
  (block $done (loop $count
    (br_if $done (ref.test (ref i31) (local.get $p)))
    (local.set $n (i32.add (local.get $n) (i32.const 1)))
    (local.set $p (array.get $fields (struct.get $obj $fields (ref.cast (ref $obj) (local.get $p)))
      (i32.const 1)))
    (br $count)))
  (local.set $b (array.new_default $fields (local.get $n)))
  (local.set $p (local.get $l))
  (local.set $n (i32.const 0))
  (block $done (loop $fill
    (br_if $done (ref.test (ref i31) (local.get $p)))
    (array.set $fields (local.get $b) (local.get $n)
      (array.get $fields (struct.get $obj $fields (ref.cast (ref $obj) (local.get $p))) (i32.const 0)))
    (local.set $n (i32.add (local.get $n) (i32.const 1)))
    (local.set $p (array.get $fields (struct.get $obj $fields (ref.cast (ref $obj) (local.get $p)))
      (i32.const 1)))
    (br $fill)))
  (local.get $b))
(func $arr_to_list (param $a anyref) (result anyref)
  (local $i i32) (local $l anyref)
  (local.set $i (array.len (call $arr (local.get $a))))
  (local.set $l (ref.i31 (i32.const 0)))
  (block $done (loop $build
    (br_if $done (i32.eqz (local.get $i)))
    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
    (local.set $l (struct.new $obj (i32.const 1)
      (array.new_fixed $fields 2 (array.get $fields (call $arr (local.get $a)) (local.get $i))
        (local.get $l))
      (ref.null $scalars)))
    (br $build)))
  (local.get $l))
"

/-! ## Closures

A closure is `$clo { arity, fn: funcref, args }`. `ap` appends arguments: too few makes a new
closure, exactly enough calls `fn` through `call_ref` on its arity's type, too many calls and
applies the result to the rest. Only arities that some `pap` uses get a function type. -/

partial def paps : FnBody → Array Name
  | .vdecl _ _ e b => (match e with | .pap c _ => #[c] | _ => #[]) ++ paps b
  | .jdecl _ _ v b => paps v ++ paps b
  | .case _ _ _ alts => alts.foldl (fun acc a => acc ++ paps a.body) #[]
  | b => if b.isTerminal then #[] else paps b.body

def closureRuntime (arities : List Nat) : String := Id.run do
  let anys (k : Nat) := " ".intercalate ((List.range k).map fun _ => "anyref")
  let mut out := "(type $clo (struct (field $arity i32) (field $fn funcref) (field $args (ref $fields))))\n"
  for k in arities do
    out := out ++ s!"(type $fn{k} (func (param {anys k}) (result anyref)))\n"
  -- $call: dispatch on the arity
  out := out ++ "(func $call (param $fn funcref) (param $a i32) (param $xs (ref $fields)) (result anyref)\n"
  let maxA := arities.foldl max 0
  for k in (List.range (maxA + 1)).reverse do out := out ++ s!"block $a{k}\n"
  let table := (List.range (maxA + 1)).map fun k => if arities.contains k then s!"$a{k}" else "$a0"
  out := out ++ s!"(local.get $a) (br_table {" ".intercalate table} $a0)\nend unreachable\n"
  for k in List.range' 1 maxA do
    out := out ++ "end\n"
    if arities.contains k then
      let args := (List.range k).map fun i => s!"(array.get $fields (local.get $xs) (i32.const {i}))"
      out := out ++ s!"(return (call_ref $fn{k} {" ".intercalate args} (ref.cast (ref $fn{k}) (local.get $fn))))\n"
    else out := out ++ "unreachable\n"
  out := out ++ "unreachable)\n"
  out := out ++ "
(func $apply (param $f anyref) (param $ys (ref $fields)) (result anyref)
  (local $c (ref $clo)) (local $k i32) (local $n i32) (local $all (ref $fields))
  (local $r anyref) (local $rest (ref $fields))
  (local.set $c (ref.cast (ref $clo) (local.get $f)))
  (local.set $k (array.len (struct.get $clo $args (local.get $c))))
  (local.set $n (i32.add (local.get $k) (array.len (local.get $ys))))
  (local.set $all (array.new_default $fields (local.get $n)))
  (array.copy $fields $fields (local.get $all) (i32.const 0)
    (struct.get $clo $args (local.get $c)) (i32.const 0) (local.get $k))
  (array.copy $fields $fields (local.get $all) (local.get $k)
    (local.get $ys) (i32.const 0) (array.len (local.get $ys)))
  (if (i32.lt_u (local.get $n) (struct.get $clo $arity (local.get $c)))
    (then (return (struct.new $clo (struct.get $clo $arity (local.get $c))
      (struct.get $clo $fn (local.get $c)) (local.get $all)))))
  (local.set $r (call $call (struct.get $clo $fn (local.get $c))
    (struct.get $clo $arity (local.get $c)) (local.get $all)))
  (if (i32.eq (local.get $n) (struct.get $clo $arity (local.get $c)))
    (then (return (local.get $r))))
  (local.set $k (struct.get $clo $arity (local.get $c)))
  (local.set $rest (array.new_default $fields (i32.sub (local.get $n) (local.get $k))))
  (array.copy $fields $fields (local.get $rest) (i32.const 0)
    (local.get $all) (local.get $k) (i32.sub (local.get $n) (local.get $k)))
  (return_call $apply (local.get $r) (local.get $rest)))
"
  return out

/-- For a host that talks to the program in `List Nat`s, through `i32`s only: `input(n)` makes
    an input buffer, `set(i, v)` fills it, `run()` calls the first root on it as a list and
    returns the length of the answer, `get(i)` reads the answer. No GC reference crosses to JS
    (see README: passing them back and forth gave wrong answers under V8's optimizing tiers). -/
def listHelpers (entry : String) : String := s!"
(type $i32s (array (mut i32)))
(global $in (mut (ref null $i32s)) (ref.null $i32s))
(global $out (mut (ref null $i32s)) (ref.null $i32s))
(func (export \"input\") (param $n i32)
  (global.set $in (array.new_default $i32s (local.get $n))))
(func (export \"set\") (param $i i32) (param $v i32)
  (array.set $i32s (global.get $in) (local.get $i) (local.get $v)))
(func (export \"get\") (param $i i32) (result i32)
  (array.get $i32s (global.get $out) (local.get $i)))
(func (export \"run\") (result i32)
  (local $l anyref) (local $i i32) (local $n i32) (local $p anyref) (local $b (ref $i32s))
  ;; the input as a list, built from the end
  (local.set $l (ref.i31 (i32.const 0)))
  (local.set $i (array.len (global.get $in)))
  (block $done (loop $build
    (br_if $done (i32.eqz (local.get $i)))
    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
    (local.set $l (struct.new $obj (i32.const 1)
      (array.new_fixed $fields 2
        (call $nat_mk (i64.extend_i32_u (array.get $i32s (global.get $in) (local.get $i))))
        (local.get $l))
      (ref.null $scalars)))
    (br $build)))
  (local.set $l (call {entry} (local.get $l)))
  ;; the answer's length, then its elements
  (local.set $p (local.get $l))
  (block $done (loop $count
    (br_if $done (ref.test (ref i31) (local.get $p)))
    (local.set $n (i32.add (local.get $n) (i32.const 1)))
    (local.set $p (array.get $fields (struct.get $obj $fields (ref.cast (ref $obj) (local.get $p)))
      (i32.const 1)))
    (br $count)))
  (local.set $b (array.new_default $i32s (local.get $n)))
  (local.set $p (local.get $l))
  (local.set $i (i32.const 0))
  (block $done (loop $fill
    (br_if $done (ref.test (ref i31) (local.get $p)))
    (array.set $i32s (local.get $b) (local.get $i) (i32.wrap_i64 (call $nat_val
      (array.get $fields (struct.get $obj $fields (ref.cast (ref $obj) (local.get $p))) (i32.const 0)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (local.set $p (array.get $fields (struct.get $obj $fields (ref.cast (ref $obj) (local.get $p)))
      (i32.const 1)))
    (br $fill)))
  (global.set $out (local.get $b))
  (local.get $n))
"

/-- How the host talks to the program. -/
inductive HostIO where
  /-- Only the roots, exported under their Lean names. -/
  | plain
  /-- `List Nat` in and out, through `i32`s (`listHelpers`). -/
  | listNat
  /-- `String` in and out, as JS strings (`jsStringHelpers`). -/
  | jsString

/-- For a host that hands over a JS string and gets one back: `run(string) -> string` calls the
    first root (`String → String`). Uses the JS String Builtins (`wasm:js-string`), which the
    host enables with `WebAssembly.compile(bytes, { builtins: [\"js-string\"] })`; UTF-16 is
    turned into Lean's UTF-8 on the way in and back on the way out. -/
def jsStringImports : String := "
(type $u16s (array (mut i16)))
(import \"wasm:js-string\" \"length\" (func $js_length (param externref) (result i32)))
(import \"wasm:js-string\" \"charCodeAt\" (func $js_char_code_at (param externref i32) (result i32)))
(import \"wasm:js-string\" \"fromCharCodeArray\"
  (func $js_from_char_code_array (param (ref null $u16s) i32 i32) (result (ref extern))))
"

def jsStringHelpers (entry : String) : String := s!"
;; For hosts without the JS String Builtins: their JS stand-in for `fromCharCodeArray` reads the
;; array through this (`web/client/jinro.ts`).
(func (export \"u16_at\") (param $a (ref null $u16s)) (param $i i32) (result i32)
  (array.get_u $u16s (local.get $a) (local.get $i)))
(func (export \"run\") (param $in externref) (result externref)
  (local $n i32) (local $i i32) (local $c i32) (local $d i32) (local $s anyref)
  (local $out anyref) (local $u (ref $u16s)) (local $j i32) (local $k i32)
  (local.set $n (call $js_length (local.get $in)))
  (local.set $s (call $str_alloc (i32.mul (local.get $n) (i32.const 3))))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $c (call $js_char_code_at (local.get $in) (local.get $i)))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (if (i32.eq (i32.and (local.get $c) (i32.const 0xfc00)) (i32.const 0xd800))
      (then
        (local.set $c (i32.const 0xfffd))
        (if (i32.lt_u (local.get $i) (local.get $n))
          (then
            (local.set $d (call $js_char_code_at (local.get $in) (local.get $i)))
            (if (i32.eq (i32.and (local.get $d) (i32.const 0xfc00)) (i32.const 0xdc00))
              (then
                (local.set $c (i32.add (i32.const 0x10000) (i32.or
                  (i32.shl (i32.and (call $js_char_code_at (local.get $in) (i32.sub (local.get $i) (i32.const 1)))
                    (i32.const 0x3ff)) (i32.const 10))
                  (i32.and (local.get $d) (i32.const 0x3ff)))))
                (local.set $i (i32.add (local.get $i) (i32.const 1)))))))))
    (if (i32.eq (i32.and (local.get $c) (i32.const 0xfc00)) (i32.const 0xdc00))
      (then (local.set $c (i32.const 0xfffd))))
    (local.set $s (call $str_push (local.get $s) (local.get $c)))
    (br $more)))
  (local.set $out (call {entry} (local.get $s)))
  ;; UTF-8 back to UTF-16: never more code units than bytes
  (local.set $n (call $slen (local.get $out)))
  (local.set $u (array.new_default $u16s (local.get $n)))
  (local.set $i (i32.const 0))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $c (call $str_decode (local.get $out) (local.get $i)))
    (local.set $i (i32.add (local.get $i) (call $lead_size (call $sbyte (local.get $out) (local.get $i)))))
    (if (i32.ge_u (local.get $c) (i32.const 0x10000))
      (then
        (local.set $c (i32.sub (local.get $c) (i32.const 0x10000)))
        (array.set $u16s (local.get $u) (local.get $j)
          (i32.or (i32.const 0xd800) (i32.shr_u (local.get $c) (i32.const 10))))
        (array.set $u16s (local.get $u) (i32.add (local.get $j) (i32.const 1))
          (i32.or (i32.const 0xdc00) (i32.and (local.get $c) (i32.const 0x3ff))))
        (local.set $j (i32.add (local.get $j) (i32.const 2))))
      (else
        (array.set $u16s (local.get $u) (local.get $j) (local.get $c))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))))
    (br $more)))
  (call $js_from_char_code_array (local.get $u) (i32.const 0) (local.get $j)))
"

partial def usesStrings (env : Environment) : FnBody → Bool
  | .vdecl _ _ e b =>
    (match e with
      | .lit (.str _) => true
      | .fap c _ => match findEnvDecl env c with
        | some (.extern _ _ _ ext) =>
          (externName ext).any fun n => stringExterns.any (·.1 == n)
        | _ => false
      | _ => false) || usesStrings env b
  | .jdecl _ _ v b => usesStrings env v || usesStrings env b
  | .case _ _ _ alts => alts.any (usesStrings env ·.body)
  | b => !b.isTerminal && usesStrings env b.body

/-- A string's bytes as a WAT string literal. -/
def watBytes (v : String) : String :=
  let hex (n : Nat) : Char := Char.ofNat (if n < 10 then 48 + n else 87 + n)
  v.toUTF8.foldl (fun acc b => (acc.push '\\').push (hex (b.toNat / 16)) |>.push (hex (b.toNat % 16))) ""

def emitModule (env : Environment) (roots : List Name) (io := HostIO.plain) : M Unit := do
  let decls ← match collect env roots with
    | .ok ds => pure ds
    | .error e => throw e
  for h : i in [0:decls.size] do
    modify fun st => { st with funIds := st.funIds.insert decls[i].name i }
  let targets := decls.foldl (fun acc d => match d with
    | .fdecl _ _ _ b _ => acc ++ paps b
    | _ => acc) #[]
  let arities := targets.foldl (fun acc c =>
    let k := (findEnvDecl env c).map (·.params.size) |>.getD 0
    if acc.contains k then acc else acc ++ [k]) ([] : List Nat)
  let strings := io matches .jsString || decls.any fun
    | .fdecl _ _ _ b _ => usesStrings env b
    | _ => false
  line "(module"
  -- imports come before every definition
  if io matches .jsString then line jsStringImports
  line prelude
  if strings then line stringRuntime
  match io, roots.head? with
  | .listNat, some r => line (listHelpers (← funRef env r))
  | .jsString, some r => line (jsStringHelpers (← funRef env r))
  | .plain, _ => pure ()
  | _, none => throw "the host interface needs a root"
  if !targets.isEmpty then
    line (closureRuntime arities)
    let refs ← targets.toList.mapM (funRef env)
    line s!"(elem declare func {" ".intercalate refs.eraseDups})"
  for d in decls do
    line s!";; {d.name}"
    emitDecl env roots d
  let lits := (← get).lits
  for h : k in [0:lits.size] do
    line s!"(data $s{k} \"{watBytes lits[k]}\")"
  line ")"

end WasmGC

/-- What a program needs from the backend: the externs it calls and the IR forms it uses. -/
partial def needs (env : Environment) : FnBody → Array String
  | .vdecl _ t e b =>
    let here := match e with
      | .fap c _ => match findEnvDecl env c with
        | some (.extern _ _ _ ext) => #[s!"extern {(WasmGC.externName ext).getD c.toString}"]
        | _ => #[]
      | .pap c _ => #[s!"pap {c}"]
      | .ap .. => #["ap"]
      | .lit (.str _) => #["string literal"]
      | .uproj .. => #["uproj"]
      | .ctor i _ => if i.usize > 0 then #[s!"usize field {i.name}"] else #[]
      | _ => #[]
    let ty := match t with
      | .float | .float32 => #["float"]
      | _ => #[]
    here ++ ty ++ needs env b
  | .jdecl _ _ v b => needs env v ++ needs env b
  | .case tid _ xty alts =>
    let here := if [``Int, ``String, ``Nat, ``Array, ``ByteArray, ``Thunk, ``Task].contains tid
      then #[s!"case on {tid} ({format xty})"] else #[]
    alts.foldl (fun acc a => acc ++ needs env a.body) here
  | .uset .. => #["uset"]
  | b => if b.isTerminal then #[] else needs env b.body

unsafe def main (args : List String) : IO UInt32 := do
  if let "--needs" :: mod :: roots := args then
    enableInitializersExecution
    initSearchPath (← findSysroot)
    let env ← importModules #[{ module := mod.toName }] {} (loadExts := true)
    match WasmGC.collect env (roots.map String.toName) with
    | .error e => IO.eprintln e; return 1
    | .ok ds =>
      let mut seen : Std.HashSet String := {}
      for d in ds do
        if let .fdecl _ _ _ b _ := d then
          for n in needs env b do
            unless seen.contains n do
              seen := seen.insert n; IO.println n
      IO.println s!"{ds.size} declarations"
      return 0
  let (io, args) := match args with
    | "--list-io" :: rest => (WasmGC.HostIO.listNat, rest)
    | "--js-string" :: rest => (.jsString, rest)
    | _ => (.plain, args)
  let mod :: roots := args
    | IO.eprintln "usage: emitwasm [--needs | --list-io | --js-string] <Module> <root>..."; return 2
  enableInitializersExecution
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := mod.toName }] {} (loadExts := true)
  match ← (WasmGC.emitModule env (roots.map String.toName) io).run {} |>.run with
  | .ok ((), st) => IO.println ("\n".intercalate st.out.toList); return 0
  | .error e => IO.eprintln e; return 1
