# Lean IR → WasmGC: a small experiment

Can Lean programs run as WebAssembly **without Lean's C runtime**, using WasmGC
for memory? This is a ~400-line backend (`Emit.lean`, itself Lean) that reads
the IR Lean's own compiler produces — the input of its C backend — and prints a
WasmGC text module.

## Result (2026-11-22, Lean 4.35.0, V8 via Deno)

`Demo.lean` (a binary search tree over `Nat`, `fib`, a `for` loop) exported as
`fib`, `sumTo`, `treeSize`:

| Build                              |         raw |      brotli | output vs native Lean                         |
| ---------------------------------- | ----------: | ----------: | --------------------------------------------- |
| This backend (WasmGC)              | **2,364 B** | **1,050 B** | identical (`out/native.txt` = `out/wasm.txt`) |
| Lasm (Lean C runtime → wasm, WASI) |   620,735 B |   123,727 B | —                                             |

About 260× smaller: no allocator, no libc/libc++, no reference counting, no Lean
runtime. Speed of the same calls is similar (3.7 ms Lasm vs 4.3 ms WasmGC per
run, Deno).

## How the IR maps to WasmGC

| Lean IR                                      | WasmGC                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| object with fields                           | `struct $obj { tag: mut i32, fields: array anyref, scalars: array i64? }`       |
| scalar constructor, small `Nat` (`lean_box`) | `i31ref`                                                                        |
| `Nat` ≥ 2^30                                 | `struct $big { i64 }` (traps above 2^63 — no bignums)                           |
| `u8`/`u16`/`u32`, `u64`/`usize`              | `i32`, `i64`                                                                    |
| `inc` / `dec` / `del`                        | nothing (the GC owns memory)                                                    |
| `isShared`                                   | always `1`, so the destructive-update path (`set` after `reset`) is never taken |
| `reset` / `reuse`                            | `null` / a fresh allocation                                                     |
| join point `block_j (xs) := v; b`            | `block $j  b  end  v`; `jmp` sets the parameters and `br $j`                    |
| `case`                                       | nested blocks + `br_table` on the constructor index                             |
| call in tail position                        | `return_call`                                                                   |
| `@[extern "lean_nat_add"]` etc.              | a hand-written WAT function per C name (`externImpl`)                           |

Anything else stops the build with `unsupported: …` (closures, strings, arrays,
`usize` fields, floats): that is the to-do list, and also the definition of the
subset.

## Trust

The kernel checks the definitions; everything after it — Lean's compiler down to
IR, and here this backend and its extern implementations — is trusted, exactly
as Lean's C path is. What this experiment adds to the trusted base is
`Emit.lean` and the WAT in its `prelude`.

## The subset idea: wasm-shaped types, proved compatible

`DemoU32.lean` is the same tree over `UInt32`. Its IR uses only `i32` scalars
and GC objects, and its externs are single wasm instructions (`i32.add`,
`i32.lt_u`, …). Two theorems tie it to the `Nat` version, which is where
properties would be proved:

- `U.Tree.toNat_insert`: insertion agrees with the `Nat` tree, key for key;
- `U.Tree.toNat_size`: the size agrees modulo 2^32 (exactly, below 2^32).

`compare_u32.ts` checks the two builds agree on `treeSize` for n up to 20,000
(they do). The `UInt32` build is 1,975 B (it still carries the unused `Nat`
helpers).

It is _slower_ (19.8 ms vs 12.9 ms for n = 20,000): a scalar field lives in a
separate `i64` array, so each node costs three allocations instead of two. Typed
structs per inductive type (e.g. `struct { l: ref, v: i32, r: ref }`) would fix
that — easier from LCNF, which still has the types, than from IR.

## Next steps

1. Typed structs per constructor (from LCNF or by recovering types), instead of
   the generic `$obj`.
2. Closures (`pap`/`ap`) as structs holding a `funcref`, and `Array` as WasmGC
   arrays — the two things `lean-engine` needs most.
3. Drop unused prelude functions (or run a DCE pass) so the size reflects only
   what is used.
4. A checker that a module stays inside the subset, run in CI next to the
   proofs.

## Running it

```sh
lake build                                   # Demo, DemoU32, the emitwasm backend
lake exe emitwasm Demo fib treeSize sumTo > out/demo.wat
wasm-tools parse out/demo.wat -o out/demo.wasm && wasm-tools validate out/demo.wasm
deno run -R run.ts > out/wasm.txt            # same lines as: lake env lean --run native.lean
lake exe emitwasm DemoU32 U.treeSize > out/u32.wat && wasm-tools parse out/u32.wat -o out/u32.wasm
deno run -R compare_u32.ts
```

Needs Lean 4.35.0 (elan), `wasm-tools` (`cargo install wasm-tools`) and Deno.
