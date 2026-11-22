# Lean IR → WasmGC: a small experiment

Can Lean programs run as WebAssembly **without Lean's C runtime**, using WasmGC
for memory? This is a ~600-line backend (`Emit.lean`, itself Lean) that reads
the IR Lean's own compiler produces — the input of its C backend — and prints a
WasmGC text module.

## Result 2: the real jinro engine (2026-11-22)

`lean-engine/Jinro/Engine.lean` compiles **unchanged**. Only the boundary is
new: instead of `Lean.Json` (strings, a parser, bignum numbers), requests and
responses are `List Nat` (`JinroFlat.lean`), and the host does the JSON
(`jinro_gc.ts`, the counterpart of `Wire.lean`).

| Build                                     |      raw |   brotli |
| ----------------------------------------- | -------: | -------: |
| Lasm (Lean C runtime + `Lean.Json`, WASI) | 839.6 KB | 158.4 KB |
| This backend, debug names stripped        |  31.5 KB |   9.2 KB |
| … of which the rules                      |   ~16 KB |    ~5 KB |
| … the `List Nat` codec                    |   ~14 KB |    ~3 KB |
| … runtime (Nat, Array, closures)          |    ~1 KB |    <1 KB |
| `jinro_gc.ts` (host side, unminified)     |   9.8 KB |   3.0 KB |

About 27× smaller raw, 17× compressed. `regression.ts` replays the 40 seeded
games of `web/server/engine_games.ts` through the same `Engine` interface: **all
40 match the fixture** the Lasm build is tested against. They take 106 ms
against Lasm's 804 ms (Deno; the Lasm build is a WASI command, instantiated
afresh for every call).

What the engine needed beyond the first demo: `Array` (16 externs, as WasmGC
arrays that every update copies, since without reference counts we never know an
array is unshared) and closures (`pap`/`ap`, as a struct of arity, `funcref` and
arguments, applied through `call_ref`). Lean's specializer had already turned
almost every `filter`/`foldl` lambda into a first-order loop: one closure is
left in the whole engine. No strings, floats or bignums are reached.
`lake exe emitwasm --needs <Module> <root>` lists what a program uses.

### The subset, made precise

`JinroFlat.lean` gives every wire type a codec and proves
`dec (enc x ++ rest) = some (x, rest)` for each (`LawfulCodec`), from a few
generic instances (`Nat`, `Option`, `List`, `Array`, pairs, enums, and “encode
through a type that has a codec”). Two theorems state the boundary on values:
`handle (1 :: enc v ++ enc actions)` is exactly the encoding of
`processDay v actions` and `buildToday` of its result, and likewise for
`createVillage`. So the wasm-shaped part adds nothing to the rules; what stays
trusted is the backend, its runtime WAT, and the host reader mirroring `dec`.

### A bug this found in the test harness

The WasmGC build first matched only 19 of 40 games, and only when run after
about 18 others. Native Lean, fed the same requests, gave byte-identical
answers, and `--v8-flags=--no-maglev` made all 40 pass. The cause was `playGame`
shuffling with `actions.sort(() => rand() - 0.5)`: with an inconsistent
comparator the order is implementation-defined, and V8 sorts differently once
the JIT has optimized the caller. The Lasm build had passed by luck of timing.
The harness now uses Fisher–Yates, and the fixture was regenerated with the Lasm
build (both builds match it, with or without the JIT).

## Result 1: a demo (2026-11-22, Lean 4.35.0, V8 via Deno)

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
| `Array`                                      | `array (mut anyref)` of exactly its size; every update copies                   |
| closure (`pap`), `ap`                        | `struct $clo { arity, funcref, args }`, called through `call_ref`               |

Anything else stops the build with `unsupported: …` (strings, `usize` fields,
floats, bignums): that is the to-do list, and also the definition of the subset.

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
2. In-place array updates where they are safe (a uniqueness analysis, or Lean's
   own borrow annotations), instead of copying on every update.
3. A smaller codec (the generic instances are specialized once per type), and
   dead-code elimination of the prelude.
4. Build this in CI and run `regression.ts` next to the Lasm tests; then the
   `/wasm` page could offer both engines.

## Running it

```sh
lake build                                   # Demo, DemoU32, the emitwasm backend
lake exe emitwasm Demo fib treeSize sumTo > out/demo.wat
wasm-tools parse out/demo.wat -o out/demo.wasm && wasm-tools validate out/demo.wasm
deno run -R run.ts > out/wasm.txt            # same lines as: lake env lean --run native.lean
lake exe emitwasm DemoU32 U.treeSize > out/u32.wat && wasm-tools parse out/u32.wat -o out/u32.wasm
deno run -R compare_u32.ts
# the jinro engine
lake exe emitwasm --list-io JinroFlat Jinro.Flat.handle > out/jinro.wat
wasm-tools parse out/jinro.wat -o out/jinro.wasm && wasm-tools validate out/jinro.wasm
deno run -R --allow-env=BASE_URL regression.ts   # needs `deno task wasm` for the Lasm timing
```

Needs Lean 4.35.0 (elan), `wasm-tools` (`cargo install wasm-tools`) and Deno.
