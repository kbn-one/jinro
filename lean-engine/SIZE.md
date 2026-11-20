# How big is the Lean engine's wasm?

Measured 2026-11-20 with `@lasm/cli` 0.10.0 (Lean 4.35.0), `--target wasi` (release, `-Oz`).
The output has no name section, so the breakdown comes from building variants and taking
differences. Compressed sizes: gzip -9, brotli quality 11.

| Build | raw (B) | gzip (B) | brotli (B) |
| --- | ---: | ---: | ---: |
| V1 hello: read stdin, print one line | 617,270 | 154,760 | 123,446 |
| V2 V1 + `Lean.Data.Json` (parse + compress) | 733,129 | 180,419 | 142,512 |
| V3 V1 + `Jinro.Engine` (no JSON) | 654,343 | 165,345 | 131,423 |
| V4 engine + JSON protocol (`Jinro.Wire`), no proofs | 839,363 | 200,720 | 158,439 |
| V5 V4 + `Jinro.Proofs`, 14 theorems (what ships) | 839,559 | 200,730 | 158,444 |
| V6 V4 + `Jinro.Proofs`, 1 theorem | 839,559 | 200,730 | 158,444 |
| Rust `jinro-wasi` (same protocol, for comparison) | 193,262 | 70,363 | 57,959 |

## Where the bytes go (raw)

| Part | Bytes | Share |
| --- | ---: | ---: |
| Lean runtime, allocator (mimalloc), libc/libc++, WASI glue (V1) | ~617 K | 74 % |
| `Lean.Data.Json` (V2 − V1) | ~116 K | 14 % |
| Our JSON protocol, `Jinro.Wire` (V4 − V1 − JSON − engine) | ~69 K | 8 % |
| The rules, `Jinro.Engine` (V3 − V1) | ~37 K | 4 % |
| Proofs | 0 per theorem; 196 B once for the module's (empty) initializer | — |

- **Proofs are free.** 1 theorem or 14, the wasm is byte-for-byte the same size: theorems
  compile to nothing. Importing the module costs a constant 196 B (its initializer).
- **Most of it is fixed cost.** The Lean runtime is ~617 KB before any of our code. The rules
  themselves are ~37 KB, about the size of the whole Rust engine's rules.
- **JSON is the biggest thing we chose.** `Lean.Data.Json` plus the wire layer is ~185 KB (22 %).
  A small hand-written JSON reader/writer is the obvious place to shrink.
- On the wire (brotli), the Lean engine is ~158 KB against ~58 KB for Rust.

## Reproducing

Each variant is a copy of this project with a different `Main.lean` / `Jinro.lean`, built with
`npx lasm build Main.lean --target wasi` (Node 24+):

- V1: `IO.getStdin >>= readToEnd`, print its length.
- V2: `Lean.Json.parse` stdin, print `compress`.
- V3: build roles from stdin bytes, run `processDay` twice with every action type, build
  `Today`, print a few counts (so nothing is dead code).
- V4: this `Main.lean` without `import Jinro.Proofs`.
- V6: `Jinro/Proofs.lean` cut down to one `rfl` theorem.
