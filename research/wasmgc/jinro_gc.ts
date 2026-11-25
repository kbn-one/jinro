/**
 * The jinro engine on the WasmGC build (`JinroFlat`), behind the same `Engine` interface as the
 * Lasm build in `web/client/jinro.ts`.
 *
 * The wasm side speaks `List Nat` (see `JinroFlat.lean`); this file does what
 * `lean-engine/Jinro/Wire.lean` does on the Lasm build — JSON, string ids, error messages — and
 * turns values into numbers and back. The reader below mirrors the Lean `dec`, whose round trip
 * with `enc` is proved there.
 */
import type {
  Action,
  ActionType,
  AvailableAction,
  CauseOfDeath,
  Creature,
  CreatureStatus,
  DayResult,
  Engine,
  Log,
  LogResult,
  Receivers,
  Role,
  RoleType,
  Rule,
  Team,
  Today,
  Village,
} from "../../web/client/jinro.ts";

// Constructor indices, in the order of `JinroFlat.lean`'s `toN`.
const TEAMS: Team[] = ["villagers", "wolves", "lovers", "hamsters"];
const ROLES: RoleType[] = [
  "villager",
  "seer",
  "bodyguard",
  "wolf",
  "madman",
  "lover",
  "bitch",
  "medium",
  "hamster",
];
const ACTIONS: ActionType[] = [
  "vote",
  "bite",
  "unknown",
  "guard",
  "divine",
  "love",
  "fake-love",
  "lovers-suicide",
  "medium",
  "hamster-curse",
];
const CAUSES: CauseOfDeath[] = ["executed", "found-dead"];
const RESULTS: LogResult["tag"][] = [
  "dead",
  "guarded",
  "partnered",
  "wolf",
  "non-wolf",
  "survived",
];

/** `Emit.lean --list-io`: the request and the answer cross as `i32`s. */
interface Exports {
  input(n: number): void;
  set(i: number, v: number): void;
  run(): number;
  get(i: number): number;
}

const indexIn = <T>(xs: readonly T[], x: T, what: string) => {
  const i = xs.indexOf(x);
  if (i < 0) throw new Error(`bad request: unknown ${what}: ${x}`);
  return i;
};

/** Raw values of a village in, as the engine sees them. */
interface FlatDay {
  actions: FlatAction[];
  logs: FlatLog[];
}
type FlatAction = [actor: number, type: number, target: number | null];
type FlatLog = {
  receivers: number[] | "all" | "afterall";
  type: number;
  actor: number | null;
  target: number | null;
  result: number | null;
};

/** Writes values as the Lean `enc` does. */
class Writer {
  out: number[] = [];
  nat(n: number) {
    this.out.push(n);
  }
  opt(x: number | null) {
    if (x === null) this.nat(0);
    else this.out.push(1, x);
  }
  list<T>(xs: readonly T[], f: (x: T) => void) {
    this.nat(xs.length);
    xs.forEach(f);
  }
  action([a, t, x]: FlatAction) {
    this.nat(a);
    this.nat(t);
    this.opt(x);
  }
  log(l: FlatLog) {
    if (l.receivers === "all") this.nat(0);
    else if (l.receivers === "afterall") this.out.push(1, 0);
    else {
      this.out.push(1, 1);
      this.list(l.receivers, (r) => this.nat(r));
    }
    this.nat(l.type);
    this.opt(l.actor);
    this.opt(l.target);
    this.opt(l.result);
  }
  day(d: FlatDay) {
    this.list(d.actions, (a) => this.action(a));
    this.list(d.logs, (l) => this.log(l));
  }
}

/** Reads values as the Lean `dec` does. */
class Reader {
  i = 0;
  constructor(readonly xs: number[]) {}
  nat(): number {
    if (this.i >= this.xs.length) throw new Error("engine: short response");
    return this.xs[this.i++];
  }
  opt<T>(f: () => T): T | undefined {
    return this.nat() === 0 ? undefined : f();
  }
  list<T>(f: () => T): T[] {
    return Array.from({ length: this.nat() }, f);
  }
  action(): FlatAction {
    return [this.nat(), this.nat(), this.opt(() => this.nat()) ?? null];
  }
  log(): FlatLog {
    const receivers = this.nat() === 0
      ? "all"
      : this.nat() === 0
      ? "afterall"
      : this.list(() => this.nat());
    return {
      receivers,
      type: this.nat(),
      actor: this.opt(() => this.nat()) ?? null,
      target: this.opt(() => this.nat()) ?? null,
      result: this.opt(() => this.nat()) ?? null,
    };
  }
  day(): FlatDay {
    return {
      actions: this.list(() => this.action()),
      logs: this.list(() => this.log()),
    };
  }
}

/** Sets `k` only when `v` is present, like Wire's `obj`. */
function put<T extends object>(o: T, k: string, v: unknown): T {
  if (v !== undefined) (o as Record<string, unknown>)[k] = v;
  return o;
}

export function engineFromGC(module: WebAssembly.Module): Engine {
  const x = new WebAssembly.Instance(module).exports as unknown as Exports;

  const call = (req: number[]): Reader => {
    x.input(req.length);
    req.forEach((v, i) => x.set(i, v));
    const out = Array.from({ length: x.run() }, (_, i) => x.get(i));
    if (!out.length) throw new Error("bad request");
    return new Reader(out);
  };

  const checkRule = (rule: Rule) => {
    const t = rule?.vote?.tag;
    if (t !== "public" && t !== "private") {
      throw new Error(`bad request: unknown vote rule: ${t}`);
    }
    return rule;
  };

  return {
    createVillage(roles: Role[], rule: Rule): [Village, Today] {
      checkRule(rule);
      const types = roles.map((r) => indexIn(ROLES, r.roleType, "role type"));
      const w = new Writer();
      w.nat(0);
      w.list(types, (t) => w.nat(t));
      const ids = roles.map((_, i) => `c${i + 1}`);
      const creatures: Creature[] = roles.map((r, i) => ({
        id: ids[i],
        role: { roleType: r.roleType, opts: r.opts ?? [] },
      }));
      const today = readToday(call(w.out), ids);
      return [{ rule, creatures, days: [] }, today];
    },

    processDay(
      village: Village,
      actions: Action[],
    ): [DayResult, Village, Today] {
      checkRule(village.rule);
      const ids = village.creatures.map((c) => c.id);
      ids.forEach((id, i) => {
        if (ids.indexOf(id) < i) {
          throw new Error(`duplicate creature id: ${id}`);
        }
      });
      const idx = (id: string) => {
        const i = ids.indexOf(id);
        if (i < 0) throw new Error(`unknown creature id: ${id}`);
        return i;
      };
      const optIdx = (id?: string) =>
        id === undefined || id === null ? null : idx(id);
      const actionIn = (a: Action): FlatAction => [
        idx(a.actor),
        indexIn(ACTIONS, a.actionType, "action type"),
        optIdx(a.target),
      ];
      const logIn = (l: Log): FlatLog => ({
        receivers: receiversIn(l.receivers, idx),
        type: indexIn(ACTIONS, l.actionType, "action type"),
        actor: optIdx(l.actor),
        target: optIdx(l.target),
        result: l.logResult
          ? indexIn(RESULTS, l.logResult.tag, "log result")
          : null,
      });
      const roles = village.creatures.map((c) =>
        indexIn(ROLES, c.role.roleType, "role type")
      );
      const days = village.days.map((d) => ({
        actions: d.actions.map(actionIn),
        logs: d.logs.map(logIn),
      }));
      const w = new Writer();
      w.nat(1);
      w.list(roles, (r) => w.nat(r));
      w.list(days, (d) => w.day(d));
      w.list(actions.map(actionIn), (a) => w.action(a));

      const r = call(w.out);
      const voted = r.opt(() => r.nat());
      const deaths = r.list(() => [r.nat(), r.nat()]);
      const resultLogs = r.list(() => r.log());
      const newDay = r.day();
      const today = readToday(r, ids);
      const day = days.length;
      const result: DayResult = put(
        {
          deads: deaths.map(([c]) => ids[c]),
          logs: resultLogs.map((l, i) => logOut(l, day, i, ids)),
        } as DayResult,
        "voted",
        voted === undefined ? undefined : ids[voted],
      );
      const outVillage: Village = {
        rule: village.rule,
        creatures: village.creatures.map((c) => ({
          id: c.id,
          role: { roleType: c.role.roleType, opts: c.role.opts ?? [] },
        })),
        days: [...days, newDay].map((d, n) => ({
          dayNumber: n,
          actions: d.actions.map((a) => actionOut(a, ids)),
          logs: d.logs.map((l, i) => logOut(l, n, i, ids)),
        })),
      };
      return [result, outVillage, today];
    },
  };
}

function receiversIn(
  r: Receivers,
  idx: (id: string) => number,
): FlatLog["receivers"] {
  switch (r?.tag) {
    case "all":
      return "all";
    case "afterall":
      return "afterall";
    case "only":
      return r.val.map(idx);
    default:
      throw new Error(
        `bad request: unknown receivers: ${(r as { tag: string })?.tag}`,
      );
  }
}

const idOut = (ids: string[], i: number) => ids[i] ?? `#${i}`;

function actionOut([a, t, x]: FlatAction, ids: string[]): Action {
  return put(
    { actor: idOut(ids, a), actionType: ACTIONS[t] } as Action,
    "target",
    x === null ? undefined : idOut(ids, x),
  );
}

function logOut(l: FlatLog, day: number, index: number, ids: string[]): Log {
  const receivers: Receivers =
    l.receivers === "all" || l.receivers === "afterall"
      ? { tag: l.receivers }
      : { tag: "only", val: l.receivers.map((r) => idOut(ids, r)) };
  const out = {
    id: `${day}-${index}`,
    receivers,
    actionType: ACTIONS[l.type],
  } as Log;
  put(out, "actor", l.actor === null ? undefined : idOut(ids, l.actor));
  put(out, "target", l.target === null ? undefined : idOut(ids, l.target));
  put(
    out,
    "logResult",
    l.result === null ? undefined : { tag: RESULTS[l.result] },
  );
  return out;
}

function readToday(r: Reader, ids: string[]): Today {
  const dayNumber = r.nat();
  const winner = r.opt(() => TEAMS[r.nat()]);
  const creatureStatuses = r.list((): CreatureStatus => {
    const roleType = ROLES[r.nat()];
    const team = TEAMS[r.nat()];
    const availableActions = r.list((): AvailableAction => ({
      actionType: ACTIONS[r.nat()],
      targets: r.list(() => idOut(ids, r.nat())),
    }));
    const cod = r.opt(() => CAUSES[r.nat()]);
    const logIds = r.list(() => `${r.nat()}-${r.nat()}`);
    return put(
      { id: "", roleType, team, availableActions, logIds },
      "causeOfDeath",
      cod,
    );
  });
  creatureStatuses.forEach((s, i) => (s.id = idOut(ids, i)));
  return put({ dayNumber, creatureStatuses } as Today, "winner", winner);
}
