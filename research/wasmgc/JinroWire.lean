import Jinro.Wire

/-!
# jinro with its real JSON protocol, for the WasmGC backend

`Jinro.Wire` unchanged — `Lean.Json`, `String`s and all. The host hands over a JS string and gets
one back (`--js-string`); inside, strings are Lean's UTF-8.
-/

/-- One JSON request in, one JSON response out: what `lean-engine/Main.lean` does over stdio. -/
def Jinro.WireGC.run (input : String) : String :=
  (Jinro.Wire.handle input).compress
