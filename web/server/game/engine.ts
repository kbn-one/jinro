/**
 * The engine on the server: the same `jinro.wasm` the browser runs (`client/jinro.ts`), compiled
 * once per process.
 *
 * Deno reads it from `client/static/jinro/jinro.wasm` (`deno task wasm`). A Cloudflare Worker may
 * not compile wasm from bytes at run time, so `worker.ts` hands over the module the platform
 * compiled from the bundle instead ({@link useEngineModule}).
 */

import { compileEngine, type Engine, engineFrom } from "../../client/jinro.ts";

let load: () => Promise<WebAssembly.Module> = async () =>
  compileEngine(
    await Deno.readFile(
      new URL("../../client/static/jinro/jinro.wasm", import.meta.url),
    ),
  );

let engine: Promise<Engine> | undefined;

export function getEngine(): Promise<Engine> {
  return engine ??= load().then(engineFrom);
}

/** Use an already compiled module (a Worker's `jinro.wasm` import). */
export function useEngineModule(module: () => Promise<WebAssembly.Module>) {
  load = module;
  engine = undefined;
}
