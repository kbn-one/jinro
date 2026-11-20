/**
 * The jinro engine in the browser (and in Deno tests): a WASI command that answers one JSON
 * request on stdin with one JSON response on stdout. There are two implementations of the same
 * protocol — `rust/jinro-wasi` and `lean-engine` (Lean, built by Lasm) — and either can be run.
 *
 * `deno task wasm` / `deno task wasm:lean` build them into `static/jinro/` (generated,
 * git-ignored). This module fetches and compiles each once, then runs it per call with `wasi.ts` —
 * no transpiler, no shim package. The engine is stateless (the village is the whole history), so a fresh instance per
 * call loses nothing.
 *
 * The types below are the wire format, as written in `rust/jinro-wasi/src/lib.rs`.
 */

import { base } from "./base.ts";
import { runWasi } from "./wasi.ts";

// ---- wire types (rust/jinro-wasi/src/lib.rs) -----------------------------------------------

export type CreatureId = string;
export type LogId = string;
export type Team = "villagers" | "wolves" | "hamsters" | "lovers";
export type ActionType =
  | "vote"
  | "unknown"
  | "bite"
  | "divine"
  | "medium"
  | "guard"
  | "hamster-curse"
  | "love"
  | "lovers-suicide"
  | "fake-love";
export type CauseOfDeath = "executed" | "found-dead";
export type RoleType =
  | "villager"
  | "seer"
  | "bodyguard"
  | "wolf"
  | "madman"
  | "lover"
  | "bitch"
  | "medium"
  | "hamster";
export type Receivers =
  | { tag: "all" }
  | { tag: "afterall" }
  | { tag: "only"; val: CreatureId[] };
export type LogResult = {
  tag: "dead" | "guarded" | "partnered" | "wolf" | "non-wolf" | "survived";
};
export interface Rule {
  vote: { tag: "public" | "private" };
}
export interface Role {
  roleType: RoleType;
  opts: [string, string][];
}
export interface Creature {
  id: CreatureId;
  role: Role;
}
export interface Action {
  actor: CreatureId;
  actionType: ActionType;
  target?: CreatureId;
}
export interface Log {
  id: LogId;
  receivers: Receivers;
  actionType: ActionType;
  actor?: CreatureId;
  target?: CreatureId;
  logResult?: LogResult;
}
/** One processed cycle; `dayNumber` is 0-based and equals its index in `village.days`. */
export interface Day {
  dayNumber: number;
  actions: Action[];
  logs: Log[];
}
export interface Village {
  rule: Rule;
  creatures: Creature[];
  days: Day[];
}
export interface AvailableAction {
  actionType: ActionType;
  targets: CreatureId[];
}
export interface CreatureStatus {
  id: CreatureId;
  roleType: RoleType;
  team: Team;
  availableActions: AvailableAction[];
  causeOfDeath?: CauseOfDeath;
  logIds: LogId[];
}
/** The day to play next: 0 right after `createVillage`, then `village.days.length`. */
export interface Today {
  dayNumber: number;
  winner?: Team;
  creatureStatuses: CreatureStatus[];
}
export interface DayResult {
  voted?: CreatureId;
  deads: CreatureId[];
  logs: Log[];
}

// ---- the engine ----------------------------------------------------------------------------

/** The engine's two operations. Both throw an `Error` with the engine's message on bad input. */
export interface Engine {
  createVillage(roles: Role[], rule: Rule): [Village, Today];
  processDay(village: Village, actions: Action[]): [DayResult, Village, Today];
}

type Response<T> = { ok: T } | { error: string };

/** Wraps a compiled `jinro.wasm` as an {@link Engine}. */
export function engineFrom(module: WebAssembly.Module): Engine {
  const call = <T>(request: object): T => {
    const run = runWasi(
      module,
      new TextEncoder().encode(JSON.stringify(request)),
    );
    const text = new TextDecoder().decode(run.stdout);
    let response: Response<T>;
    try {
      response = JSON.parse(text);
    } catch {
      const stderr = new TextDecoder().decode(run.stderr);
      throw new Error(
        `engine exited ${run.exitCode} without a response: ${stderr || text}`,
      );
    }
    if ("error" in response) throw new Error(response.error);
    return response.ok;
  };
  return {
    createVillage(roles, rule) {
      const r = call<{ village: Village; today: Today }>({
        op: "createVillage",
        roles,
        rule,
      });
      return [r.village, r.today];
    },
    processDay(village, actions) {
      const r = call<{ result: DayResult; village: Village; today: Today }>({
        op: "processDay",
        village,
        actions,
      });
      return [r.result, r.village, r.today];
    },
  };
}

/** Which implementation to run: the Rust crate or the Lean port (built by Lasm). */
export type EngineKind = "rust" | "lean";

/** The wasm file each kind is built to (`deno task wasm` / `deno task wasm:lean`). */
export const ENGINE_FILES: Record<EngineKind, string> = {
  rust: "jinro.wasm",
  lean: "jinro-lean.wasm",
};

const engines = new Map<EngineKind, Promise<Engine>>();

/** Fetches and compiles an engine's wasm once, and hands out the engine. */
export function loadEngine(kind: EngineKind = "rust"): Promise<Engine> {
  let engine = engines.get(kind);
  if (!engine) {
    engine = (async () => {
      // Not `compileStreaming`: that insists on `application/wasm`, which not every static host
      // (nor the dev file server) sends for `.wasm`.
      const res = await fetch(`${base}/static/jinro/${ENGINE_FILES[kind]}`);
      if (!res.ok) throw new Error(`${res.status} ${res.url}`);
      return engineFrom(await WebAssembly.compile(await res.arrayBuffer()));
    })();
    engines.set(kind, engine);
  }
  return engine;
}

/** The message of a thrown engine error. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
