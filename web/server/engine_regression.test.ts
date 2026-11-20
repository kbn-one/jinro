/**
 * The engine's answers must not drift: 40 seeded random games (see `engine_games.ts`) must hash
 * to the recorded fixture. Needs `deno task wasm` first.
 */

import { assertEquals } from "@std/assert";

import { FIXTURE, loadEngine, playGame, SEEDS } from "./engine_games.ts";

const engine = await loadEngine();
const fixture: Record<string, string[]> = JSON.parse(
  await Deno.readTextFile(FIXTURE),
);

for (const seed of SEEDS) {
  Deno.test(`random game #${seed} answers as recorded`, async () => {
    assertEquals(await playGame(engine, seed), fixture[seed]);
  });
}
