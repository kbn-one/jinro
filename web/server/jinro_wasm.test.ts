/**
 * The engine as the browser runs it (`client/jinro.ts`), from Deno. Needs `deno task wasm` first.
 */

import { assertEquals, assertThrows } from "@std/assert";

import { compileEngine, engineFrom, runFrom } from "../client/jinro.ts";
import { PROTOCOL_FIXTURE } from "./engine_protocol.ts";

const bytes = await Deno.readFile(
  new URL("../client/static/jinro/jinro.wasm", import.meta.url),
);
const engine = engineFrom(await compileEngine(bytes));

Deno.test("without the JS String Builtins, the JS stand-ins give the same answers", async () => {
  // Compiled without `{ builtins: ["js-string"] }`: the module takes jinro.ts's stand-ins.
  const module = await WebAssembly.compile(bytes);
  const plain = engineFrom(module);
  const roles = (["wolf", "seer", "villager"] as const).map((roleType) => ({
    roleType,
    opts: [["名前", "人狼🐺"]] as [string, string][],
  }));
  const rule = { vote: { tag: "public" as const } };
  assertEquals(
    plain.createVillage(roles, rule),
    engine.createVillage(roles, rule),
  );
  const fixture: { request: string; response: string }[] = JSON.parse(
    await Deno.readTextFile(PROTOCOL_FIXTURE),
  );
  const run = runFrom(module);
  for (const { request, response } of fixture) {
    assertEquals(run(request), response);
  }
});

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
