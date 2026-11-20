/**
 * The engine as the browser runs it (`client/jinro.ts` + `client/wasi.ts`), from Deno.
 * Needs `deno task wasm` first.
 */

import { assertEquals, assertThrows } from "@std/assert";

import { engineFrom } from "../client/jinro.ts";

const engine = engineFrom(
  await WebAssembly.compile(
    await Deno.readFile(
      new URL("../client/static/jinro/jinro.wasm", import.meta.url),
    ),
  ),
);

Deno.test("Day.dayNumber is 0-based and matches Today.dayNumber and log ids", () => {
  const roles = (["villager", "villager", "seer", "wolf"] as const).map((
    roleType,
  ) => ({ roleType, opts: [] }));
  let [village, today] = engine.createVillage(roles, {
    vote: { tag: "public" },
  });
  assertEquals(today.dayNumber, 0);

  for (let day = 0; day < 2; day++) {
    const seer = today.creatureStatuses.find((s) => s.roleType === "seer")!;
    [, village, today] = engine.processDay(village, [
      { actor: seer.id, actionType: "divine", target: "c1" },
    ]);
    const last = village.days[village.days.length - 1];
    assertEquals(last.dayNumber, day);
    assertEquals(last.logs[0].id, `${day}-0`);
    assertEquals(today.dayNumber, day + 1);
  }
  assertEquals(village.days.map((d) => d.dayNumber), [0, 1]);
});

Deno.test("engine errors surface as thrown Errors", () => {
  const [village] = engine.createVillage([{ roleType: "wolf", opts: [] }], {
    vote: { tag: "public" },
  });
  assertThrows(
    () =>
      engine.processDay(village, [
        { actor: "c9", actionType: "vote", target: "c1" },
      ]),
    Error,
    "unknown creature id: c9",
  );
});
