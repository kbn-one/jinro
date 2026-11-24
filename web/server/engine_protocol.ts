/**
 * Requests off the happy path — malformed JSON, unknown names, duplicate ids, non-ASCII text,
 * escapes, numbers — and the exact response text the engine gives each.
 *
 * `engine_protocol.fixture.json` was recorded from the Lasm build (Lean's C runtime) when the
 * WasmGC build replaced it, and the WasmGC build matched it byte for byte (as it did on every
 * request of the 40 regression games). `engine_protocol.test.ts` keeps it that way. Regenerate
 * only for an intended change of the protocol:
 *
 *   deno run -R -W --allow-env=BASE_URL web/server/engine_protocol.ts
 */

import { loadRaw } from "./engine_games.ts";

export const PROTOCOL_FIXTURE = new URL(
  "./engine_protocol.fixture.json",
  import.meta.url,
);

const rule = `"rule":{"vote":{"tag":"public"}}`;

export const REQUESTS: string[] = [
  ``,
  `not json`,
  `[1,2,3]`,
  `{"op":"nope"}`,
  `{"op":"createVillage"}`,
  `{"op":"createVillage","roles":[{"roleType":"dragon"}],${rule}}`,
  `{"op":"createVillage","roles":[],${rule}}`,
  `{"op":"createVillage","roles":[{"roleType":"wolf"}],"rule":{"vote":{"tag":"secret"}}}`,
  `{"op":"createVillage","roles":[{"roleType":"wolf"}],${rule}`,
  `  {"op" : "createVillage" , "roles" : [ ] , ${rule} }  `,
  // Japanese, an emoji (a surrogate pair in JS), escapes, and numbers in opts
  `{"op":"createVillage","roles":[{"roleType":"wolf","opts":[["名前","人狼🐺"],["tab","a\\tb\\u00e9\\ud83d\\ude00\\"\\\\/"]]},{"roleType":"seer","opts":[1.5e3,-0.25,12345678901234,0,true,null,{}]}],${rule}}`,
  `{"op":"processDay","village":{${rule},"creatures":[{"id":"c1","role":{"roleType":"wolf"}},{"id":"c1","role":{"roleType":"seer"}}],"days":[]},"actions":[]}`,
  `{"op":"processDay","village":{${rule},"creatures":[{"id":"c1","role":{"roleType":"wolf"}}],"days":[]},"actions":[{"actor":"zz","actionType":"vote","target":"c1"}]}`,
  `{"op":"processDay","village":{${rule},"creatures":[{"id":"🐺","role":{"roleType":"wolf"}},{"id":"村","role":{"roleType":"villager"}},{"id":"村2","role":{"roleType":"seer"}}],"days":[]},"actions":[{"actor":"🐺","actionType":"vote","target":"村"},{"actor":"村2","actionType":"divine","target":"🐺"}]}`,
];

if (import.meta.main) {
  const run = await loadRaw();
  const fixture = REQUESTS.map((request) => ({
    request,
    response: run(request),
  }));
  await Deno.writeTextFile(
    PROTOCOL_FIXTURE,
    JSON.stringify(fixture, null, 2) + "\n",
  );
  console.log(`wrote ${PROTOCOL_FIXTURE.pathname}`);
}
