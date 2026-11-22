/**
 * Seeded random games for regression-testing the engine.
 *
 * `playGame` drives an engine through one game — random role mix, mostly legal actions plus some
 * the UI would never offer (dead actors, wrong roles, any target) — and returns a SHA-256 of every
 * response (canonical JSON, keys sorted). `engine_regression.test.ts` compares those against
 * `engine_games.fixture.json`.
 *
 * The fixture was recorded when the Lean engine replaced the Rust one, after 40 games had matched
 * between the two byte for byte. Regenerate it only for an intended change of the rules:
 *
 *   deno run -R -W --allow-env=BASE_URL web/server/engine_games.ts
 */

import {
  type Action,
  type Engine,
  engineFrom,
  type Role,
  type RoleType,
} from "../client/jinro.ts";

export const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
export const FIXTURE = new URL("./engine_games.fixture.json", import.meta.url);

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

/** JSON with object keys sorted, so the hash does not depend on key order. */
function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") {
    return `{${
      Object.keys(x).sort().map((k) =>
        `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`
      ).join(",")
    }}`;
  }
  return JSON.stringify(x);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(
    new Uint8Array(digest),
    (b) => b.toString(16).padStart(2, "0"),
  )
    .join("");
}

/** Plays game `seed` (a create and 12 days) and hashes each response. */
export async function playGame(
  engine: Engine,
  seed: number,
): Promise<string[]> {
  const rand = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const n = 3 + Math.floor(rand() * 8);
  const roles: Role[] = Array.from({ length: n }, (_, i) => ({
    // Always at least one wolf, so games tend to end.
    roleType: i === 0 ? "wolf" : pick(ROLES),
    opts: [],
  }));
  const hashes: string[] = [];
  let [village, today] = engine.createVillage(roles, {
    vote: { tag: "public" },
  });
  hashes.push(await sha256(canonical([village, today])));
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
    if (rand() < 0.4) {
      actions.push({
        actor: pick(ids),
        actionType: pick(
          ["vote", "bite", "divine", "guard", "love", "fake-love"] as const,
        ),
        target: rand() < 0.9 ? pick(ids) : undefined,
      });
    }
    // Shuffle, since order matters (first guard wins, logs follow action order). Fisher–Yates,
    // not `sort(() => rand() - 0.5)`: with an inconsistent comparator the order is
    // implementation-defined, and V8 really does sort differently once the JIT optimizes it.
    for (let i = actions.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [actions[i], actions[j]] = [actions[j], actions[i]];
    }
    let result;
    [result, village, today] = engine.processDay(village, actions);
    hashes.push(await sha256(canonical([result, village, today])));
  }
  return hashes;
}

export async function loadEngine(file = "jinro.wasm"): Promise<Engine> {
  return engineFrom(
    await WebAssembly.compile(
      await Deno.readFile(
        new URL(`../client/static/jinro/${file}`, import.meta.url),
      ),
    ),
  );
}

if (import.meta.main) {
  const engine = await loadEngine(Deno.args[0]);
  const fixture: Record<string, string[]> = {};
  for (const seed of SEEDS) fixture[seed] = await playGame(engine, seed);
  await Deno.writeTextFile(FIXTURE, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`wrote ${FIXTURE.pathname}`);
}
