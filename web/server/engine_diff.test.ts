/**
 * Differential test: the Rust engine (`rust/jinro-wasi`) and the Lean engine (`lean-engine`,
 * built by Lasm) must answer every request with the same JSON.
 *
 * Plays seeded random games — random role mixes, mostly legal actions plus some illegal ones
 * (dead actors, wrong roles, odd targets) — and compares every response. Needs
 * `deno task wasm` and `deno task wasm:lean` first.
 */

import { assertEquals } from "@std/assert";

import {
  type Action,
  engineFrom,
  type Role,
  type RoleType,
} from "../client/jinro.ts";

const load = async (name: string) =>
  engineFrom(
    await WebAssembly.compile(
      await Deno.readFile(
        new URL(`../client/static/jinro/${name}`, import.meta.url),
      ),
    ),
  );

const rust = await load("jinro.wasm");
const lean = await load("jinro-lean.wasm");

const ROLES: RoleType[] = [
  "villager",
  "seer",
  "medium",
  "bodyguard",
  "wolf",
  "madman",
  "hamster",
  "lover",
  "bitch",
];

/** mulberry32: small, seeded, good enough to vary games reproducibly. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Both engines' answer to the same call: equal values, or the same error message. */
function both<T>(f: (e: typeof rust) => T): T {
  const run = (e: typeof rust) => {
    try {
      return { ok: f(e) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  };
  const r = run(rust);
  const l = run(lean);
  assertEquals(l, r);
  if ("error" in r) throw new Error(r.error);
  return r.ok as T;
}

for (let seed = 1; seed <= 40; seed++) {
  Deno.test(`rust and lean agree on random game #${seed}`, () => {
    const rand = rng(seed);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const n = 3 + Math.floor(rand() * 8);
    const roles: Role[] = Array.from({ length: n }, (_, i) => ({
      // Always at least one wolf, so games tend to end.
      roleType: i === 0 ? "wolf" : pick(ROLES),
      opts: [],
    }));
    let [village, today] = both((e) =>
      e.createVillage(roles, { vote: { tag: "public" } })
    );
    const ids = village.creatures.map((c) => c.id);
    for (let day = 0; day < 12; day++) {
      const actions: Action[] = [];
      for (const s of today.creatureStatuses) {
        for (const a of s.availableActions) {
          if (a.targets.length && rand() < 0.85) {
            actions.push({
              actor: s.id,
              actionType: a.actionType,
              target: pick(a.targets),
            });
          }
        }
      }
      // Some actions the UI would never offer: dead actors, wrong roles, any target.
      if (rand() < 0.4) {
        actions.push({
          actor: pick(ids),
          actionType: pick(
            ["vote", "bite", "divine", "guard", "love", "fake-love"] as const,
          ),
          target: rand() < 0.9 ? pick(ids) : undefined,
        });
      }
      // Shuffle, since order matters (first guard wins, logs follow action order).
      actions.sort(() => rand() - 0.5);
      [, village, today] = both((e) => e.processDay(village, actions));
    }
  });
}

Deno.test("rust and lean report the same errors", () => {
  const [village] = rust.createVillage([{ roleType: "wolf", opts: [] }], {
    vote: { tag: "public" },
  });
  for (
    const actions of [
      [{ actor: "c9", actionType: "vote", target: "c1" }],
      [{ actor: "c1", actionType: "vote", target: "nobody" }],
    ] as Action[][]
  ) {
    let rustErr = "", leanErr = "";
    try {
      rust.processDay(village, actions);
    } catch (e) {
      rustErr = (e as Error).message;
    }
    try {
      lean.processDay(village, actions);
    } catch (e) {
      leanErr = (e as Error).message;
    }
    assertEquals(leanErr, rustErr);
  }
});
