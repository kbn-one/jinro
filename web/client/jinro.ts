/**
 * The jinro engine in the browser: the wasm component from `rust/jinro-wasm`, transpiled by jco.
 *
 * `deno task wasm` builds the component and runs `jco transpile --instantiation async`, which
 * writes the JS glue to `jinro_wasm/` (bundled with the islands) and the core modules to
 * `static/jinro/` (fetched here). Both are generated and git-ignored.
 *
 * The component imports a handful of WASI interfaces (stdio, clocks) that the engine itself never
 * really uses; the browser build of `@bytecodealliance/preview2-shim` answers them.
 */

import type { ImportObject } from "./jinro_wasm/jinro.d.ts";

import { base } from "./base.ts";

export type * from "./jinro_wasm/interfaces/kuboon-jinro-engine.d.ts";
export type Engine =
  typeof import("./jinro_wasm/interfaces/kuboon-jinro-engine.d.ts");

let engine: Promise<Engine> | null = null;

/**
 * Instantiates the component once and hands out its `engine` export.
 *
 * The glue and the WASI shim are imported here, on first use, rather than at the top: the server
 * renders the island too, and evaluating the shim there (its Node build) is neither needed nor
 * allowed. The bundler splits them into a chunk of their own.
 */
export function loadEngine(): Promise<Engine> {
  engine ??= (async () => {
    const [{ instantiate }, { WASIShim }] = await Promise.all([
      // @ts-types="./jinro_wasm/jinro.d.ts"
      import("./jinro_wasm/jinro.js"),
      import("@bytecodealliance/preview2-shim/instantiation"),
    ]);
    const root = await instantiate(
      // Not `compileStreaming`: that insists on `application/wasm`, which not every static host
      // (nor the dev file server) sends for `.wasm`.
      async (path: string) => {
        const res = await fetch(`${base}/static/jinro/${path}`);
        if (!res.ok) throw new Error(`${res.status} ${res.url}`);
        return WebAssembly.compile(await res.arrayBuffer());
      },
      new WASIShim().getImportObject() as unknown as ImportObject,
    );
    return root.engine;
  })();
  return engine;
}

/** The message of a thrown engine error: a WIT `data-error` payload, or a plain `Error`. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "payload" in e) {
    const payload = (e as { payload: unknown }).payload;
    if (payload && typeof payload === "object" && "val" in payload) {
      return String((payload as { val: unknown }).val);
    }
    return JSON.stringify(payload);
  }
  return e instanceof Error ? e.message : String(e);
}
