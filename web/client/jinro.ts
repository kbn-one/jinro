/**
 * The jinro engine in the browser (and in Deno tests): `lean-engine`, the rules and the JSON
 * protocol written in Lean, compiled by our WasmGC backend (`lean-engine/WasmGC/Emit.lean`) into
 * a module whose one export, `run`, answers a JSON request string with a JSON response string.
 *
 * `deno task wasm` builds it to `static/jinro/jinro.wasm` (generated, git-ignored). It needs
 * WasmGC (every current browser engine) and nothing else: strings cross as JS strings through
 * the JS String Builtins, and where those are missing, through the stand-ins below. There is no
 * Lean C runtime and no WASI. The engine is stateless (the village is the whole history), so one
 * instance serves every call.
 *
 * The types below are the wire format, as written in `lean-engine/Jinro/Wire.lean`.
 */

import { base } from "./base.ts";

// ---- wire types (lean-engine/Jinro/Wire.lean) ----------------------------------------------

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

/**
 * Compiles `jinro.wasm` with the JS String Builtins (`wasm:js-string`) switched on. An engine
 * without them ignores the option, and the module then takes `jsStringStandIns` instead.
 */
export function compileEngine(
  bytes: BufferSource,
): Promise<WebAssembly.Module> {
  // The options argument (JS String Builtins) is not in TypeScript's DOM types yet.
  const compile = WebAssembly.compile as (
    bytes: BufferSource,
    options: { builtins: string[] },
  ) => Promise<WebAssembly.Module>;
  return compile(bytes, { builtins: ["js-string"] });
}

interface Exports {
  run(request: string): string;
  u16_at(array: unknown, i: number): number;
}

/** What the module imports from `wasm:js-string`, in JS, for hosts that lack the builtins. */
function jsStringStandIns(exports: () => Exports) {
  return {
    length: (s: string) => s.length,
    charCodeAt: (s: string, i: number) => s.charCodeAt(i),
    fromCharCodeArray(array: unknown, start: number, end: number) {
      const at = exports().u16_at;
      let out = "";
      for (let i = start; i < end; i += 4096) {
        const codes: number[] = [];
        for (let k = i; k < Math.min(end, i + 4096); k++) {
          codes.push(at(array, k));
        }
        out += String.fromCharCode(...codes);
      }
      return out;
    },
  };
}

/** Instantiates a compiled `jinro.wasm`: request text in, response text out. */
export function runFrom(
  module: WebAssembly.Module,
): (request: string) => string {
  const state: { exports?: Exports } = {};
  const instance = new WebAssembly.Instance(module, {
    "wasm:js-string": jsStringStandIns(() => state.exports!),
  });
  const exports = state.exports = instance.exports as unknown as Exports;
  return (request) => exports.run(request);
}

/** Wraps a compiled `jinro.wasm` as an {@link Engine}. */
export function engineFrom(module: WebAssembly.Module): Engine {
  const run = runFrom(module);
  const call = <T>(request: object): T => {
    const response: Response<T> = JSON.parse(run(JSON.stringify(request)));
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

let engine: Promise<Engine> | null = null;

/** Fetches and compiles `jinro.wasm` once, and hands out the engine. */
export function loadEngine(): Promise<Engine> {
  engine ??= (async () => {
    // Not `compileStreaming`: that insists on `application/wasm`, which not every static host
    // (nor the dev file server) sends for `.wasm`.
    const res = await fetch(`${base}/static/jinro/jinro.wasm`);
    if (!res.ok) throw new Error(`${res.status} ${res.url}`);
    return engineFrom(await compileEngine(await res.arrayBuffer()));
  })();
  return engine;
}

/** The message of a thrown engine error. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
