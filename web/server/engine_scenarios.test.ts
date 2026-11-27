/**
 * Rule scenarios: small hand-written games that pin down what the rules say (docs/CORE_SPEC.md),
 * one rule per test. Needs `deno task wasm` first.
 */

import { assertEquals } from "@std/assert";

import {
  type Action,
  type ActionType,
  compileEngine,
  engineFrom,
  type RoleType,
  type Today,
  type Village,
} from "../client/jinro.ts";

const engine = engineFrom(
  await compileEngine(
    await Deno.readFile(
      new URL("../client/static/jinro/jinro.wasm", import.meta.url),
    ),
  ),
);

/** A village of `roles`; creature `i` is `ids[i]`. */
function start(...roles: RoleType[]) {
  const [village, today] = engine.createVillage(
    roles.map((roleType) => ({ roleType, opts: [] })),
    { vote: { tag: "public" } },
  );
  return { village, today, ids: village.creatures.map((c) => c.id) };
}

/** `[actor, actionType, target]` by index into `ids`. */
type Move = [number, ActionType, number];

function play(village: Village, ids: string[], ...moves: Move[]) {
  const actions: Action[] = moves.map(([a, actionType, t]) => ({
    actor: ids[a],
    actionType,
    target: ids[t],
  }));
  const [result, next, today] = engine.processDay(village, actions);
  return { result, village: next, today };
}

const dead = (today: Today, ids: string[]) =>
  today.creatureStatuses.filter((s) => s.causeOfDeath).map((s) =>
    ids.indexOf(s.id)
  );

Deno.test("the pack bites one creature a night: the target most wolves chose", () => {
  const { village, ids } = start(
    "wolf",
    "wolf",
    "wolf",
    "villager",
    "villager",
    "villager",
    "villager",
  );
  const { result, today } = play(
    village,
    ids,
    [0, "bite", 3],
    [1, "bite", 4],
    [2, "bite", 4],
  );
  assertEquals(result.deads, [ids[4]]);
  assertEquals(dead(today, ids), [4]);
  // One bite log, shared by the whole pack.
  const bites = result.logs.filter((l) =>
    l.actionType === "bite" && l.receivers.tag === "only"
  );
  assertEquals(bites.length, 1);
  assertEquals(bites[0].receivers, {
    tag: "only",
    val: [ids[0], ids[1], ids[2]],
  });
  assertEquals(bites[0].target, ids[4]);
});

Deno.test("wolves that cannot agree bite nobody", () => {
  const { village, ids } = start(
    "wolf",
    "wolf",
    "villager",
    "villager",
    "villager",
  );
  const { result } = play(village, ids, [0, "bite", 2], [1, "bite", 3]);
  assertEquals(result.deads, []);
});

Deno.test("a bite by someone who is not a wolf does not count", () => {
  const { village, ids } = start(
    "wolf",
    "madman",
    "villager",
    "villager",
    "villager",
  );
  const { result } = play(village, ids, [0, "bite", 2], [1, "bite", 3]);
  assertEquals(result.deads, [ids[2]]);
});

Deno.test("the guard stops the pack's bite", () => {
  const { village, ids } = start(
    "wolf",
    "wolf",
    "bodyguard",
    "villager",
    "villager",
    "villager",
  );
  const { result } = play(
    village,
    ids,
    [0, "bite", 3],
    [1, "bite", 3],
    [2, "guard", 3],
  );
  assertEquals(result.deads, []);
});

Deno.test("when the one who was loved dies, the lover follows", () => {
  const { village, ids } = start(
    "lover",
    "villager",
    "wolf",
    "villager",
    "villager",
    "villager",
  );
  const loved = play(village, ids, [0, "love", 1]);
  const { result } = play(loved.village, ids, [2, "bite", 1]);
  assertEquals(result.deads, [ids[1], ids[0]]);
});

Deno.test("when the lover dies, the one who was loved follows", () => {
  const { village, ids } = start(
    "lover",
    "villager",
    "wolf",
    "villager",
    "villager",
    "villager",
  );
  const loved = play(village, ids, [0, "love", 1]);
  const { result } = play(loved.village, ids, [2, "bite", 0]);
  assertEquals(result.deads, [ids[0], ids[1]]);
});

Deno.test("a loved wolf follows its lover, which can end the game", () => {
  const { village, ids } = start(
    "lover",
    "wolf",
    "villager",
    "villager",
    "villager",
  );
  const loved = play(village, ids, [0, "love", 1]);
  const { result, today } = play(
    loved.village,
    ids,
    [2, "vote", 0],
    [3, "vote", 0],
    [4, "vote", 0],
  );
  assertEquals(result.voted, ids[0]);
  assertEquals(result.deads, [ids[0], ids[1]]);
  assertEquals(today.winner, "villagers");
});

Deno.test("fake love binds nobody", () => {
  const { village, ids } = start(
    "bitch",
    "villager",
    "villager",
    "wolf",
    "villager",
    "villager",
    "villager",
  );
  const loved = play(village, ids, [0, "love", 1], [0, "fake-love", 2]);
  const { result } = play(loved.village, ids, [3, "bite", 2]);
  assertEquals(result.deads, [ids[2]]);
});

Deno.test("head count: the madman is a human", () => {
  // One wolf against two humans: the game goes on.
  const { village, today, ids } = start("wolf", "madman", "villager");
  assertEquals(today.winner, undefined);
  // With the wolf gone the village wins, madman alive or not.
  const next = play(village, ids, [1, "vote", 0], [2, "vote", 0]);
  assertEquals(next.today.winner, "villagers");
});

Deno.test("head count: lovers are humans", () => {
  assertEquals(start("wolf", "lover", "villager").today.winner, undefined);
  assertEquals(start("wolf", "bitch", "villager").today.winner, undefined);
  assertEquals(
    start("wolf", "wolf", "lover", "villager").today.winner,
    "wolves",
  );
});

Deno.test("head count: the hamster is on neither side", () => {
  // One wolf, one human: over, and the living hamster takes the win.
  assertEquals(start("wolf", "villager", "hamster").today.winner, "hamsters");
  assertEquals(
    start("wolf", "villager", "villager", "hamster").today.winner,
    undefined,
  );
});
