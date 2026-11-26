/**
 * A room, as stored, and everything that can happen to one — as pure functions from a room to the
 * next room (or a {@link GameError}), so that the store can run them inside an atomic update.
 *
 * The engine decides everything about the game; this file only seats players, deals roles,
 * collects actions and turns the engine's ids (`c1`, `c2`, …) into players and back. A player is
 * creature `c{n}` where `n` is their place in `players` (join order); roles are shuffled when the
 * game starts, so the join order says nothing about who is what.
 */

import type {
  Action,
  DayResult,
  Engine,
  Log,
  RoleType,
  Rule,
  Today,
  Village,
} from "../../client/jinro.ts";
import type {
  OwnerView,
  Phase,
  PlayerView,
  PublicPlayer,
  RoomView,
  SubmittedAction,
  Target,
  VisibleLog,
} from "../../client/play/types.ts";

export const ROLE_TYPES: readonly RoleType[] = [
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

export const MAX_PLAYERS = 30;
export const MAX_NAME_LENGTH = 40;

export interface StoredPlayer {
  playId: string;
  /** SHA-256 of the play key, hex. */
  keyHash: string;
  name: string;
}

export interface Game {
  village: Village;
  today: Today;
  results: DayResult[];
}

export interface Room {
  roomId: string;
  /** SHA-256 of the room key, hex. */
  keyHash: string;
  createdAt: string;
  rule: Rule;
  roles: RoleType[];
  /** In join order; player `i` is creature `c{i + 1}`. */
  players: StoredPlayer[];
  game: Game | null;
  /** Actions submitted for the current day, by playId. */
  pending: Record<string, SubmittedAction[]>;
  rev: number;
}

/** Something the caller asked for that the room does not allow; `status` is the HTTP status. */
export class GameError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const creatureOf = (i: number) => `c${i + 1}`;
const indexOfCreature = (id: string) => Number(id.slice(1)) - 1;

export function phaseOf(room: Room): Phase {
  if (!room.game) return "lobby";
  return room.game.today.winner ? "over" : "playing";
}

export function newRoom(
  init: { roomId: string; keyHash: string; roles: unknown; rule?: unknown },
): Room {
  const roles = init.roles;
  if (
    !Array.isArray(roles) || roles.length === 0 ||
    roles.length > MAX_PLAYERS ||
    !roles.every((r) => ROLE_TYPES.includes(r as RoleType))
  ) {
    throw new GameError(
      400,
      `roles must be 1 to ${MAX_PLAYERS} of: ${ROLE_TYPES.join(", ")}`,
    );
  }
  const rule = (init.rule ?? { vote: { tag: "public" } }) as Rule;
  if (rule?.vote?.tag !== "public" && rule?.vote?.tag !== "private") {
    throw new GameError(400, 'rule.vote.tag must be "public" or "private"');
  }
  return {
    roomId: init.roomId,
    keyHash: init.keyHash,
    createdAt: new Date().toISOString(),
    rule: { vote: { tag: rule.vote.tag } },
    roles: roles as RoleType[],
    players: [],
    game: null,
    pending: {},
    rev: 0,
  };
}

export function join(
  room: Room,
  player: { playId: string; keyHash: string; name: unknown },
): Room {
  if (room.game) throw new GameError(409, "the game has already started");
  if (room.players.length >= room.roles.length) {
    throw new GameError(409, "the room is full");
  }
  const name = typeof player.name === "string" ? player.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new GameError(
      400,
      `name must be 1 to ${MAX_NAME_LENGTH} characters`,
    );
  }
  if (room.players.some((p) => p.name === name)) {
    throw new GameError(409, `the name "${name}" is taken`);
  }
  return {
    ...room,
    players: [...room.players, { ...player, name }],
    rev: room.rev + 1,
  };
}

/**
 * The owner's `go`: deals the roles and starts day 0 the first time, resolves the day after that.
 * `shuffle` deals the roles (a random permutation in production, fixed in tests).
 */
export function go(
  room: Room,
  engine: Engine,
  shuffle: <T>(xs: T[]) => T[],
): Room {
  const phase = phaseOf(room);
  if (phase === "over") throw new GameError(409, "the game is over");
  if (!room.game) {
    if (room.players.length !== room.roles.length) {
      throw new GameError(
        409,
        `waiting for players: ${room.players.length} of ${room.roles.length} have joined`,
      );
    }
    const roles = shuffle([...room.roles]).map((roleType) => ({
      roleType,
      opts: [],
    }));
    const [village, today] = engine.createVillage(roles, room.rule);
    return {
      ...room,
      game: { village, today, results: [] },
      pending: {},
      rev: room.rev + 1,
    };
  }
  const actions: Action[] = [];
  room.players.forEach((p, i) => {
    for (const a of room.pending[p.playId] ?? []) {
      actions.push({
        actor: creatureOf(i),
        actionType: a.actionType,
        target: creatureOfPlay(room, a.target),
      });
    }
  });
  const [result, village, today] = engine.processDay(
    room.game.village,
    actions,
  );
  return {
    ...room,
    game: { village, today, results: [...room.game.results, result] },
    pending: {},
    rev: room.rev + 1,
  };
}

function creatureOfPlay(room: Room, playId: string): string {
  const i = room.players.findIndex((p) => p.playId === playId);
  if (i < 0) throw new GameError(400, `no player ${playId}`);
  return creatureOf(i);
}

/** Replaces `playId`'s actions for today, after checking each against what they may do. */
export function submit(room: Room, playId: string, actions: unknown): Room {
  const i = room.players.findIndex((p) => p.playId === playId);
  if (i < 0) throw new GameError(404, `no player ${playId}`);
  if (phaseOf(room) !== "playing") {
    throw new GameError(409, "there is nothing to do: the game is not running");
  }
  if (!Array.isArray(actions)) {
    throw new GameError(400, "actions must be an array");
  }
  const status = room.game!.today.creatureStatuses[i];
  const seen = new Set<string>();
  const clean: SubmittedAction[] = actions.map((a) => {
    const actionType = a?.actionType, target = a?.target;
    const choice = status.availableActions.find((c) =>
      c.actionType === actionType
    );
    if (!choice) {
      throw new GameError(
        400,
        `you cannot ${actionType} today; you can: ${
          status.availableActions.map((c) => c.actionType).join(", ") ||
          "nothing"
        }`,
      );
    }
    if (seen.has(actionType)) {
      throw new GameError(400, `${actionType} is given twice`);
    }
    seen.add(actionType);
    const t = room.players.findIndex((p) => p.playId === target);
    if (t < 0 || !choice.targets.includes(creatureOf(t))) {
      throw new GameError(
        400,
        `${String(target)} is not a target of ${actionType}`,
      );
    }
    return { actionType, target };
  });
  const pending = { ...room.pending };
  if (clean.length) pending[playId] = clean;
  else delete pending[playId];
  return { ...room, pending, rev: room.rev + 1 };
}

// ---- views ---------------------------------------------------------------------------------

export function roomView(room: Room): RoomView {
  const game = room.game;
  const over = phaseOf(room) === "over";
  const players: PublicPlayer[] = room.players.map((p, i) => {
    const out: PublicPlayer = { playId: p.playId, name: p.name };
    const s = game?.today.creatureStatuses[i];
    if (s) {
      out.alive = !s.causeOfDeath;
      if (s.causeOfDeath) out.causeOfDeath = s.causeOfDeath;
      if (over) out.role = s.roleType;
    }
    return out;
  });
  const view: RoomView = {
    roomId: room.roomId,
    phase: phaseOf(room),
    rule: room.rule,
    roles: room.roles,
    players,
    rev: room.rev,
  };
  if (game) view.dayNumber = game.today.dayNumber;
  if (game?.today.winner) view.winner = game.today.winner;
  return view;
}

export function ownerView(room: Room): OwnerView {
  return { ...roomView(room), submitted: Object.keys(room.pending) };
}

export function playerView(room: Room, playId: string): PlayerView {
  const i = room.players.findIndex((p) => p.playId === playId);
  if (i < 0) throw new GameError(404, `no player ${playId}`);
  const p = room.players[i];
  const target = (creature: string | undefined): Target | undefined => {
    if (!creature) return undefined;
    const q = room.players[indexOfCreature(creature)];
    return q ? { playId: q.playId, name: q.name } : undefined;
  };
  const you: PlayerView["you"] = {
    playId,
    name: p.name,
    choices: [],
    submitted: room.pending[playId] ?? [],
    logs: [],
  };
  const game = room.game;
  if (game) {
    const s = game.today.creatureStatuses[i];
    you.role = s.roleType;
    you.team = s.team;
    you.alive = !s.causeOfDeath;
    if (s.causeOfDeath) you.causeOfDeath = s.causeOfDeath;
    if (!game.today.winner) {
      you.choices = s.availableActions.map((c) => ({
        actionType: c.actionType,
        targets: c.targets.map((t) => target(t)!),
      }));
    }
    const byId = new Map<string, [number, Log]>();
    game.village.days.forEach((d) =>
      d.logs.forEach((l) => byId.set(l.id, [d.dayNumber, l]))
    );
    // The engine logs every death twice: publicly (`all`, an execution or "found dead") and with
    // the true cause once the game is over (`afterall`). When the two say the same, keep one.
    const said = new Set(
      game.village.days.flatMap((d) =>
        d.logs.filter((l) => l.receivers.tag === "all").map((l) =>
          `${d.dayNumber}|${l.actionType}|${l.target}`
        )
      ),
    );
    you.logs = s.logIds.flatMap((id) => {
      const hit = byId.get(id);
      if (!hit) return [];
      const [day, l] = hit;
      if (
        l.receivers.tag === "afterall" &&
        said.has(`${day}|${l.actionType}|${l.target}`)
      ) return [];
      const log: VisibleLog = {
        id,
        day,
        actionType: l.actionType,
        receivers: l.receivers.tag,
      };
      const actor = target(l.actor), tgt = target(l.target);
      if (actor) log.actor = actor;
      if (tgt) log.target = tgt;
      if (l.logResult) log.result = l.logResult.tag;
      return [log];
    });
  }
  return { room: roomView(room), you };
}
