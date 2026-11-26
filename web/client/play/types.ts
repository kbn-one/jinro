/**
 * What the room API (`/api/rooms/*`, `server/game/`) answers with, shared by the server that
 * builds these views and the pages and agents that read them.
 *
 * A room is created by its owner (who gets `roomKey`), joined by players (each gets a `playKey`),
 * and moved forward only by the owner's `go`: the first `go` deals the roles and starts day 0,
 * every later one resolves the day with whatever actions the players have submitted. There is no
 * clock on the server.
 *
 * Keys are bearer tokens (`Authorization: Bearer <key>`). The server stores only their hashes.
 */

import type {
  ActionType,
  CauseOfDeath,
  LogResult,
  RoleType,
  Rule,
  Team,
} from "../jinro.ts";

/** `lobby` until the owner's first `go`, `playing` until the engine names a winner, then `over`. */
export type Phase = "lobby" | "playing" | "over";

/** `POST /api/rooms` */
export interface CreateRoomRequest {
  /** The roles to deal, one per player; the room starts when this many have joined. */
  roles: RoleType[];
  rule?: Rule;
}
export interface CreateRoomResponse {
  roomId: string;
  /** The owner's key: needed for `go`. Shown once; the server keeps only its hash. */
  roomKey: string;
}

/** `POST /api/rooms/:roomId/players` */
export interface JoinRequest {
  name: string;
}
export interface JoinResponse {
  playId: string;
  /** This player's key. Shown once; the server keeps only its hash. */
  playKey: string;
}

/** Someone at the table, as everyone may see them. */
export interface PublicPlayer {
  playId: string;
  name: string;
  /** Only while the game runs or after it (`undefined` in the lobby). */
  alive?: boolean;
  causeOfDeath?: CauseOfDeath;
  /** Everyone's role, once the game is over. */
  role?: RoleType;
}

/** `GET /api/rooms/:roomId` — what anyone may know about a room. */
export interface RoomView {
  roomId: string;
  phase: Phase;
  rule: Rule;
  /** The roles in the game (who has which is secret). */
  roles: RoleType[];
  players: PublicPlayer[];
  /** The day to play next (0 is the first night); absent in the lobby. */
  dayNumber?: number;
  winner?: Team;
  /** Increases with every change, for cheap polling. */
  rev: number;
}

/** `GET /api/rooms/:roomId/owner` (room key) — the room, and who has acted today. */
export interface OwnerView extends RoomView {
  /** playIds that have submitted actions for the current day. */
  submitted: string[];
}

/** A player, as a target in their own view. */
export interface Target {
  playId: string;
  name: string;
}

/** An action this player may take today, with whom they may take it on. */
export interface Choice {
  actionType: ActionType;
  targets: Target[];
}

/** An action as submitted: by the player, for today. */
export interface SubmittedAction {
  actionType: ActionType;
  /** A playId (one of the choice's targets). */
  target: string;
}

/** `PUT /api/rooms/:roomId/players/:playId/actions` (play key) */
export interface SubmitRequest {
  /** Replaces this player's earlier submission for today; `[]` withdraws it. */
  actions: SubmittedAction[];
}

/** A log entry this player is allowed to see, with names instead of engine ids. */
export interface VisibleLog {
  id: string;
  /** The day it happened on (0-based). */
  day: number;
  actionType: ActionType;
  actor?: Target;
  target?: Target;
  result?: LogResult["tag"];
  /** `all`: everyone saw it; `afterall`: revealed when the game ended; `only`: a few did. */
  receivers: "all" | "afterall" | "only";
}

/** `GET /api/rooms/:roomId/players/:playId` (play key) — the room as this player sees it. */
export interface PlayerView {
  room: RoomView;
  you: {
    playId: string;
    name: string;
    /** From the first `go` on. */
    role?: RoleType;
    team?: Team;
    alive?: boolean;
    causeOfDeath?: CauseOfDeath;
    /** What you may do today (empty when dead, in the lobby, or when the game is over). */
    choices: Choice[];
    /** What you have submitted for today. */
    submitted: SubmittedAction[];
    /** The logs you may see, oldest first. */
    logs: VisibleLog[];
  };
}
