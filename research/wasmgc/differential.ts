// Sends the same JSON requests to the Lasm build (WASI, stdin/stdout) and to the WasmGC JSON build
// (wire.wasm, JS strings) and compares the response text byte for byte: the 40 regression games,
// plus requests that are malformed, non-ASCII or otherwise off the happy path.
//
//   deno run -R --allow-env=BASE_URL differential.ts
import { runWasi } from "../../web/client/wasi.ts";
import type { Engine } from "../../web/client/jinro.ts";
import { playGame, SEEDS } from "../../web/server/engine_games.ts";
import { compileWire } from "./jinro_wire_gc.ts";

const lasmModule = await WebAssembly.compile(
  await Deno.readFile(
    new URL("../../web/client/static/jinro/jinro.wasm", import.meta.url),
  ),
);
const wire = new WebAssembly.Instance(
  await compileWire(
    await Deno.readFile(new URL("./out/wire.wasm", import.meta.url)),
  ),
  {},
).exports as unknown as { run(s: string): string; panics: WebAssembly.Global };

const lasm = (req: string) =>
  new TextDecoder().decode(
    runWasi(lasmModule, new TextEncoder().encode(req)).stdout,
  )
    .replace(/\n$/, "");

const requests: string[] = [];
// Every request of the 40 games, recorded through an engine that answers with the Lasm build.
const recorder: Engine = {
  createVillage(roles, rule) {
    const req = JSON.stringify({ op: "createVillage", roles, rule });
    requests.push(req);
    const r = JSON.parse(lasm(req)).ok;
    return [r.village, r.today];
  },
  processDay(village, actions) {
    const req = JSON.stringify({ op: "processDay", village, actions });
    requests.push(req);
    const r = JSON.parse(lasm(req)).ok;
    return [r.result, r.village, r.today];
  },
};
for (const seed of SEEDS) await playGame(recorder, seed);
const rule = `"rule":{"vote":{"tag":"public"}}`;
requests.push(
  ``,
  `not json`,
  `[1,2,3]`,
  `{"op":"nope"}`,
  `{"op":"createVillage"}`,
  `{"op":"createVillage","roles":[{"roleType":"dragon"}],${rule}}`,
  `{"op":"createVillage","roles":[],${rule}}`,
  `{"op":"createVillage","roles":[{"roleType":"wolf"}],"rule":{"vote":{"tag":"secret"}}}`,
  // non-ASCII: Japanese, an emoji (a surrogate pair in JS), escapes, numbers in opts
  `{"op":"createVillage","roles":[{"roleType":"wolf","opts":[["名前","人狼🐺"],["tab","a\\tb\\u00e9\\ud83d\\ude00"]]},{"roleType":"seer","opts":[1.5e3,-0.25,12345678901234,true,null]}],${rule}}`,
  `{"op":"processDay","village":{${rule},"creatures":[{"id":"c1","role":{"roleType":"wolf"}},{"id":"c1","role":{"roleType":"seer"}}],"days":[]},"actions":[]}`,
  `{"op":"processDay","village":{${rule},"creatures":[{"id":"c1","role":{"roleType":"wolf"}}],"days":[]},"actions":[{"actor":"zz","actionType":"vote","target":"c1"}]}`,
  `{"op":"processDay","village":{${rule},"creatures":[{"id":"🐺","role":{"roleType":"wolf"}},{"id":"村","role":{"roleType":"villager"}}],"days":[]},"actions":[{"actor":"🐺","actionType":"vote","target":"村"}]}`,
  `  {"op" : "createVillage" , "roles" : [ ] , ${rule} }  `,
  `{"op":"createVillage","roles":[{"roleType":"wolf"}],${rule}`,
);

let same = 0;
for (const req of requests) {
  const a = lasm(req), b = wire.run(req);
  if (a === b) same++;
  else {
    let j = 0;
    while (a[j] === b[j]) j++;
    console.log(
      `differs: ${req.slice(0, 120)}\n  lasm:   …${
        a.slice(j, j + 80)
      }\n  wasmgc: …${b.slice(j, j + 80)}`,
    );
  }
}
console.log(
  `${same}/${requests.length} responses byte-identical; panics: ${wire.panics.value}`,
);
if (same !== requests.length) Deno.exit(1);
