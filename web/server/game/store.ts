/**
 * Rooms in a key-value store (`@kuboon/kv`): one entry per room, changed only through
 * {@link RoomStore.change}, which runs a pure `Room → Room` step inside the store's atomic update
 * and retries when someone else wrote first.
 *
 * Turso (`@kuboon/kv/turso.ts`) when `TURSO_DATABASE_URL` is set — that is what a deployed Worker
 * uses, since its isolates share no memory — and process memory otherwise (local development and
 * tests; rooms are lost on restart).
 */

import type { KvRepo } from "@kuboon/kv";
import { MemoryKvRepo } from "@kuboon/kv/memory.ts";
import { TursoKvRepo } from "@kuboon/kv/turso.ts";
import { createClient } from "@libsql/client/web";

import { getConfig } from "../config.ts";
import { GameError, type Room } from "./room.ts";

/** Rooms are forgotten a week after their last change. */
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Optimistic updates that lose a race retry, after a growing, randomized pause. */
const RETRIES = 12;
const backoff = (attempt: number) =>
  new Promise((ok) =>
    setTimeout(ok, Math.random() * 10 * 2 ** Math.min(attempt, 5))
  );

export class RoomStore {
  constructor(readonly repo: KvRepo<Room>) {}

  get(roomId: string): Promise<Room | null> {
    return this.repo.entry(roomId).get();
  }

  /** Stores a new room; fails if the id is taken (which a random id never is in practice). */
  async create(room: Room): Promise<void> {
    const result = await this.repo.entry(roomId(room)).update((current) => {
      if (current) throw new GameError(409, "room id collision");
      return room;
    }, { expireIn: ROOM_TTL_MS });
    if (!result.ok) throw new GameError(409, "room id collision");
  }

  /**
   * Applies `step` to the stored room atomically and returns the new room. `step` may throw a
   * {@link GameError}, which is passed on and stores nothing.
   */
  async change(roomId: string, step: (room: Room) => Room): Promise<Room> {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      let missing = false;
      const result = await this.repo.entry(roomId).update((current) => {
        if (!current) {
          missing = true;
          return null;
        }
        return step(current);
      }, { expireIn: ROOM_TTL_MS });
      if (missing) throw new GameError(404, `no room ${roomId}`);
      if (result.ok && result.val) return result.val;
      await backoff(attempt);
    }
    throw new GameError(503, "the room is busy; try again");
  }
}

const roomId = (room: Room) => room.roomId;

let store: RoomStore | undefined;

/** The app's room store, from the environment. */
export function getRoomStore(): RoomStore {
  if (!store) {
    const { tursoDatabaseUrl, tursoAuthToken } = getConfig();
    store = new RoomStore(
      tursoDatabaseUrl
        ? new TursoKvRepo<Room>(
          createClient({
            url: tursoDatabaseUrl,
            authToken: tursoAuthToken || undefined,
          }),
          ["jinro", "rooms"],
        )
        : new MemoryKvRepo<Room>(["jinro", "rooms"]),
    );
  }
  return store;
}

/** For tests: use this store instead. */
export function setRoomStore(s: RoomStore): void {
  store = s;
}
