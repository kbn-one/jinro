/**
 * The jinro engine compiled with its JSON protocol (`Jinro.Wire`, `Lean.Json`) by the WasmGC
 * backend: `run(request: string): string`. Strings cross as JS strings through the JS String
 * Builtins, so the host does nothing but `JSON.stringify` and `JSON.parse` — the same requests
 * and responses as the Lasm build over stdin/stdout.
 */
import type { Engine } from "../../web/client/jinro.ts";

/** Compiles `wire.wasm` with the `wasm:js-string` builtins switched on. */
export function compileWire(bytes: BufferSource): Promise<WebAssembly.Module> {
  // The second argument (WebAssembly JS String Builtins) is not in TypeScript's lib yet.
  const compile = WebAssembly.compile as (
    b: BufferSource,
    options: { builtins: string[] },
  ) => Promise<WebAssembly.Module>;
  return compile(bytes, { builtins: ["js-string"] });
}

type Response<T> = { ok: T } | { error: string };

export function engineFromWire(module: WebAssembly.Module): Engine {
  const x = new WebAssembly.Instance(module, {}).exports as unknown as {
    run(request: string): string;
  };
  const call = <T>(request: object): T => {
    const response: Response<T> = JSON.parse(x.run(JSON.stringify(request)));
    if ("error" in response) throw new Error(response.error);
    return response.ok;
  };
  return {
    createVillage(roles, rule) {
      const r = call<{ village: never; today: never }>({
        op: "createVillage",
        roles,
        rule,
      });
      return [r.village, r.today];
    },
    processDay(village, actions) {
      const r = call<{ result: never; village: never; today: never }>({
        op: "processDay",
        village,
        actions,
      });
      return [r.result, r.village, r.today];
    },
  };
}
