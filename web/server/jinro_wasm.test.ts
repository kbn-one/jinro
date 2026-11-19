/**
 * The jco-transpiled jinro component (`deno task wasm`), called from Deno the way the browser
 * calls it in `client/jinro.ts`.
 */

import { assertEquals } from "@std/assert";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

// @ts-types="../client/jinro_wasm/jinro.d.ts"
import { instantiate } from "../client/jinro_wasm/jinro.js";
import type { ImportObject } from "../client/jinro_wasm/jinro.d.ts";

const wasmDir = new URL("../client/static/jinro/", import.meta.url);

async function engine() {
  const root = await instantiate(
    async (path: string) =>
      WebAssembly.compile(await Deno.readFile(new URL(path, wasmDir))),
    new WASIShim().getImportObject() as unknown as ImportObject,
  );
  return root.engine;
}

Deno.test("Day.dayNumber is 0-based and matches Today.dayNumber and log ids", async () => {
  const e = await engine();
  const roles = (["villager", "villager", "seer", "wolf"] as const).map((
    roleType,
  ) => ({ roleType, opts: [] }));
  let [village, today] = e.createVillage(roles, { vote: { tag: "public" } });
  assertEquals(today.dayNumber, 0);

  for (let n = 0; n < 2; n++) {
    const seer = today.creatureStatuses.find((s) => s.roleType === "seer")!;
    const day = n;
    [, village, today] = e.processDay(village, [
      { actor: seer.id, actionType: "divine", target: "c1" },
    ]);
    const last = village.days[village.days.length - 1];
    assertEquals(last.dayNumber, day);
    assertEquals(last.logs[0].id, `${day}-0`);
    assertEquals(today.dayNumber, day + 1);
  }
  assertEquals(village.days.map((d) => d.dayNumber), [0, 1]);
});
