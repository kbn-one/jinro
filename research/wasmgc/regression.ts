// Replays the 40 seeded games of web/server/engine_games.ts on the List Nat build (JinroFlat:
// out/jinro.wasm) and compares every response's hash with the fixture the engine is tested
// against. Then times it against the engine itself (the JSON build, `deno task wasm`).
//
//   deno run -R --allow-env=BASE_URL regression.ts
import type { Engine } from "../../web/client/jinro.ts";
import {
  FIXTURE,
  loadEngine,
  playGame,
  SEEDS,
} from "../../web/server/engine_games.ts";
import { engineFromGC } from "./jinro_gc.ts";

const flat = engineFromGC(
  await WebAssembly.compile(
    await Deno.readFile(new URL("./out/jinro.wasm", import.meta.url)),
  ),
);
const fixture: Record<string, string[]> = JSON.parse(
  await Deno.readTextFile(FIXTURE),
);

let same = 0;
for (const seed of SEEDS) {
  const got = await playGame(flat, seed);
  const want = fixture[seed];
  if (got.length === want.length && got.every((h, i) => h === want[i])) {
    same++;
  } else {
    const at = got.findIndex((h, i) => h !== want[i]);
    console.log(`seed ${seed} differs at response ${at}`);
  }
}
console.log(
  `List Nat build: ${same}/${SEEDS.length} games identical to the fixture`,
);

// Speed: all 40 games, hashing included (the same for both).
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
await time("List Nat build     ", flat);
await time("engine (JSON build)", await loadEngine());
if (same !== SEEDS.length) Deno.exit(1);
