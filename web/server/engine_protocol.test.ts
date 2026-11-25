/**
 * Off-the-happy-path requests answer with exactly the recorded text (`engine_protocol.ts`): error
 * messages, key order, escapes, non-ASCII, numbers. Needs `deno task wasm` first.
 */

import { assertEquals } from "@std/assert";

import { loadRaw } from "./engine_games.ts";
import { PROTOCOL_FIXTURE, REQUESTS } from "./engine_protocol.ts";

const run = await loadRaw();
const fixture: { request: string; response: string }[] = JSON.parse(
  await Deno.readTextFile(PROTOCOL_FIXTURE),
);

Deno.test("the fixture covers exactly the listed requests", () => {
  assertEquals(fixture.map((f) => f.request), REQUESTS);
});

for (const [i, { request, response }] of fixture.entries()) {
  Deno.test(`request #${i} answers as recorded: ${request.slice(0, 50)}`, () => {
    assertEquals(run(request), response);
  });
}
