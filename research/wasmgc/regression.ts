// Replays the 40 seeded games of web/server/engine_games.ts on the WasmGC build and compares every
// response's hash with the fixture the Lasm build is tested against. Then times both builds.
//
//   deno run -R --allow-env=BASE_URL regression.ts [out/jinro.wasm]
import {
  FIXTURE,
  loadEngine,
  playGame,
  SEEDS,
} from "../../web/server/engine_games.ts";
import { engineFromGC } from "./jinro_gc.ts";

const file = Deno.args[0] ??
  new URL("./out/jinro.wasm", import.meta.url).pathname;
const gc = engineFromGC(await WebAssembly.compile(await Deno.readFile(file)));
const fixture: Record<string, string[]> = JSON.parse(
  await Deno.readTextFile(FIXTURE),
);

let same = 0;
for (const seed of SEEDS) {
  const got = await playGame(gc, seed);
  const want = fixture[seed];
  const ok = got.length === want.length && got.every((h, i) => h === want[i]);
  if (ok) same++;
  else {
    const at = got.findIndex((h, i) => h !== want[i]);
    console.log(`seed ${seed}: differs at response ${at}`);
  }
}
console.log(`${same}/${SEEDS.length} games identical to the fixture`);

// Speed: all 40 games, hashing included (the same for both).
const time = async (label: string, engine: typeof gc) => {
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
await time("WasmGC", gc);
try {
  await time("Lasm  ", await loadEngine());
} catch (e) {
  console.log(`Lasm build not found (deno task wasm): ${e}`);
}
if (same !== SEEDS.length) Deno.exit(1);
