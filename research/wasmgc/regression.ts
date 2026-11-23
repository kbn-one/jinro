// Replays the 40 seeded games of web/server/engine_games.ts on the WasmGC builds and compares every
// response's hash with the fixture the Lasm build is tested against. Then times every build.
//
//   deno run -R --allow-env=BASE_URL regression.ts
//
// out/jinro.wasm: the engine behind a List Nat boundary (JinroFlat, host does the JSON)
// out/wire.wasm:  the engine with its JSON protocol (JinroWire: Lean.Json, strings as JS strings)
import type { Engine } from "../../web/client/jinro.ts";
import {
  FIXTURE,
  loadEngine,
  playGame,
  SEEDS,
} from "../../web/server/engine_games.ts";
import { engineFromGC } from "./jinro_gc.ts";
import { compileWire, engineFromWire } from "./jinro_wire_gc.ts";

const out = (f: string) => new URL(`./out/${f}`, import.meta.url);
const fixture: Record<string, string[]> = JSON.parse(
  await Deno.readTextFile(FIXTURE),
);

const builds: [string, Engine][] = [
  [
    "WasmGC, List Nat",
    engineFromGC(
      await WebAssembly.compile(await Deno.readFile(out("jinro.wasm"))),
    ),
  ],
  [
    "WasmGC, JSON    ",
    engineFromWire(await compileWire(await Deno.readFile(out("wire.wasm")))),
  ],
];

let failed = false;
for (const [label, engine] of builds) {
  let same = 0;
  for (const seed of SEEDS) {
    const got = await playGame(engine, seed);
    const want = fixture[seed];
    if (got.length === want.length && got.every((h, i) => h === want[i])) {
      same++;
    } else {
      const at = got.findIndex((h, i) => h !== want[i]);
      console.log(`${label}: seed ${seed} differs at response ${at}`);
    }
  }
  console.log(
    `${label}: ${same}/${SEEDS.length} games identical to the fixture`,
  );
  if (same !== SEEDS.length) failed = true;
}

// Speed: all 40 games, hashing included (the same for every build).
const time = async (label: string, engine: Engine) => {
  for (const seed of SEEDS) await playGame(engine, seed);
  const t0 = performance.now();
  const runs = 3;
  for (let i = 0; i < runs; i++) {
    for (const seed of SEEDS) await playGame(engine, seed);
  }
  console.log(
    `${label}: ${((performance.now() - t0) / runs).toFixed(0)} ms for 40 games`,
  );
};
for (const [label, engine] of builds) await time(label, engine);
try {
  await time("Lasm            ", await loadEngine());
} catch (e) {
  console.log(`Lasm build not found (deno task wasm): ${e}`);
}
if (failed) Deno.exit(1);
