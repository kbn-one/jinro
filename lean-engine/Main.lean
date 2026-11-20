/-
The jinro engine as a WASI command (built by Lasm: `deno task wasm:lean`).
Reads one JSON request from stdin and writes one JSON response to stdout — the protocol of
`Jinro.Wire`, shared with `rust/jinro-wasi`. Exits 1 when the response is an error.
-/
import Jinro.Wire
-- Imported so that building the command also checks the proofs; theorems compile to nothing.
import Jinro.Proofs

def main : IO UInt32 := do
  let input ← (← IO.getStdin).readToEnd
  let out := Jinro.Wire.handle input
  IO.println out.compress
  return if (out.getObjVal? "error").toOption.isSome then 1 else 0
