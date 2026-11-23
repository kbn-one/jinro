# Lean IR → WasmGC: a small experiment

Can Lean programs run as WebAssembly **without Lean's C runtime**, using WasmGC
for memory? This is a backend of about 800 lines of Lean (`Emit.lean`) and 400
of hand-written WAT (its prelude and `strings.wat`) that reads the IR Lean's own
compiler produces — the input of its C backend — and prints a WasmGC text
module.

## Result 3: strings, and the real JSON protocol (2026-11-23)

`lean-engine/Jinro/Wire.lean` — `Lean.Json`, its parser and printer, `String`s
throughout — compiles **unchanged** too (`JinroWire.lean` only wraps it:
`run : String → String`). The host side is `JSON.stringify` and `JSON.parse`
(`jinro_wire_gc.ts`); nothing mirrors `Wire.lean` any more.

| Build                                      |      raw |   brotli | 40 games |
| ------------------------------------------ | -------: | -------: | -------: |
| Lasm (Lean C runtime + `Lean.Json`, WASI)  | 839.6 KB | 158.4 KB |   857 ms |
| WasmGC, JSON protocol (`wire.wasm`)        | 114.8 KB |  32.4 KB |   381 ms |
| WasmGC, `List Nat` boundary (`jinro.wasm`) |  32.8 KB |   9.6 KB |   125 ms |

(debug names stripped; times in Deno, all 40 games of `engine_games.ts` with
hashing; the Lasm build is a WASI command, instantiated afresh for every call.)

Where `wire.wasm`'s 109 KB of code comes from: `Lean.Json` 46 KB, `Init` (List,
Array, Nat, Repr, …) 27 KB, `Jinro.Wire` 21 KB, the rules 9 KB, the hand-written
runtime 4 KB.

**Checked:** `regression.ts` — all 40 games match the fixture, for both WasmGC
builds. `differential.ts` sends 534 requests to Lasm and to `wire.wasm` and
compares the response _text_: every request of the 40 games, plus malformed
JSON, unknown ops and roles, duplicate and unknown ids, Japanese and emoji ids
and options, `\u` escapes and surrogate pairs, decimals and exponents. All 534
are byte-identical, and no `panic!` is reached.

How strings work:

- **Inside, a Lean `String` is UTF-8**, as Lean defines it: every string
  operation (`get`, `next`, `extract`, …) takes byte positions, so a UTF-16 JS
  string inside would turn each of them into a scan. `strings.wat` implements
  the ~25 string externs, each from the Lean definition it stands for.
- **A string is a view `(buffer, length)`**, and the buffer records how far
  anyone has written. Appending to a view that ends where the buffer ends writes
  in place; any other append copies. Nothing is ever changed under anyone, no
  reference counts are needed, and building a string a character at a time —
  which is how `Json.compress` works — stays linear.
- **At the boundary, the JS String Builtins** (`wasm:js-string`: `length`,
  `charCodeAt`, `fromCharCodeArray`; enabled with
  `WebAssembly.compile(bytes, { builtins: ["js-string"] })`) let `run` take and
  return a real JS string. UTF-16 becomes UTF-8 on the way in (lone surrogates
  become U+FFFD) and back on the way out.

Two things the C backend does that this one first did not:

- **Constants are computed once.** Lean evaluates a declaration without
  parameters (`_closed_N`, tables such as `Json.escapeTable`) at startup; here
  it was recomputed at every use, and rebuilding the escape table cost 68% of
  the time (111 ms per request). Now the first use stores it in a global: 3.2
  ms.
- **`USize` is 32 bits.** `Lean.Json`'s number parser computes `USize.size`,
  2^`numBits`; with 64 bits that is 2^64, past what a `Nat` here holds (no
  bignums: they trap above 2^63). Wasm with 32-bit indices is a 32-bit platform,
  so `System.Platform.numBits` is now 32 and `USize` an `i32`, which also makes
  `USize` arithmetic wrap where Lean says it does.

`Int` is new as well: a small non-negative `Int` is the same `i31ref` as that
`Nat`, any other an `$int { i64 }`.

## Result 2: the jinro engine behind a `List Nat` boundary (2026-11-22)

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

| Build                 |         raw |      brotli | output vs native Lean                         |
| --------------------- | ----------: | ----------: | --------------------------------------------- |
| This backend (WasmGC) | **2,364 B** | **1,050 B** | identical (`out/native.txt` = `out/wasm.txt`) |

(Measured with the first backend. The prelude is not trimmed to what a program
uses, so as the backend grew the same demo became 3,467 B.) | Lasm (Lean C
runtime → wasm, WASI) | 620,735 B | 123,727 B | — |

About 260× smaller: no allocator, no libc/libc++, no reference counting, no Lean
runtime. Speed of the same calls is similar (3.7 ms Lasm vs 4.3 ms WasmGC per
run, Deno).

## How the IR maps to WasmGC

| Lean IR                                      | WasmGC                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| object with fields                           | `struct $obj { tag: mut i32, fields: array anyref, scalars: array i64? }`       |
| scalar constructor, small `Nat` (`lean_box`) | `i31ref`                                                                        |
| `Nat` ≥ 2^30                                 | `struct $big { i64 }` (traps above 2^63 — no bignums)                           |
| `u8`/`u16`/`u32`/`usize`, `u64`              | `i32`, `i64` (a 32-bit platform: `numBits` = 32)                                |
| `inc` / `dec` / `del`                        | nothing (the GC owns memory)                                                    |
| `isShared`                                   | always `1`, so the destructive-update path (`set` after `reset`) is never taken |
| `reset` / `reuse`                            | `null` / a fresh allocation                                                     |
| join point `block_j (xs) := v; b`            | `block $j  b  end  v`; `jmp` sets the parameters and `br $j`                    |
| `case`                                       | nested blocks + `br_table` on the constructor index                             |
| call in tail position                        | `return_call`                                                                   |
| `@[extern "lean_nat_add"]` etc.              | a hand-written WAT function per C name (`externImpl`)                           |
| `Array`                                      | `array (mut anyref)` of exactly its size; every update copies                   |
| closure (`pap`), `ap`                        | `struct $clo { arity, funcref, args }`, called through `call_ref`               |
| constant (no parameters)                     | computed on first use, kept in a global                                         |
| `String`                                     | `struct $str { buf, len }` over a shared append-only UTF-8 buffer               |
| string literal                               | a passive data segment, `array.new_data`                                        |
| `Int`                                        | `i31ref` if 0 ≤ n < 2^30, else `struct $int { i64 }` (wraps past 64 bits)       |

Anything else stops the build with `unsupported: …` (`usize` fields, floats,
thunks, tasks, IO) or traps at run time (bignums past 2^63): that is the to-do
list, and also the definition of the subset.

## Trust

The kernel checks the definitions; everything after it — Lean's compiler down to
IR, and here this backend and its extern implementations — is trusted, exactly
as Lean's C path is. What this experiment adds to the trusted base is
`Emit.lean` and the WAT in its `prelude` and `strings.wat`.

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
3. Dead-code elimination of the prelude, and a look at what `Lean.Json` and
   `Init` bring in (73 of `wire.wasm`'s 109 KB of code).
4. Build this in CI and run `regression.ts` and `differential.ts` next to the
   Lasm tests; then the `/wasm` page could offer the WasmGC engine.
5. Bignums, so that `Nat` is `Nat` everywhere and not only below 2^63.

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
# the jinro engine with its JSON protocol
lake exe emitwasm --js-string JinroWire Jinro.WireGC.run > out/wire.wat
wasm-tools parse out/wire.wat -o out/wire.wasm && wasm-tools validate out/wire.wasm
deno run -R --allow-env=BASE_URL regression.ts     # needs `deno task wasm` for the Lasm timing
deno run -R --allow-env=BASE_URL differential.ts   # needs `deno task wasm`
```

Needs Lean 4.35.0 (elan), `wasm-tools` (`cargo install wasm-tools`) and Deno.
