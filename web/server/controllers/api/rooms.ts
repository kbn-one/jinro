/**
 * /api/rooms — playing a game over HTTP. The types are `client/play/types.ts`; the rules of what
 * may happen are `game/room.ts`.
 *
 * | | | key |
 * | --- | --- | --- |
 * | `POST /api/rooms` | create a room → `{ roomId, roomKey }` | — |
 * | `GET /api/rooms/:roomId` | the room, as anyone may see it | — |
 * | `POST /api/rooms/:roomId/players` | join → `{ playId, playKey }` | — |
 * | `GET /api/rooms/:roomId/owner` | the room, and who has acted today | room |
 * | `POST /api/rooms/:roomId/go` | start the game, or end the day | room |
 * | `GET /api/rooms/:roomId/players/:playId` | the room as this player sees it | play |
 * | `PUT /api/rooms/:roomId/players/:playId/actions` | this player's actions for today | play |
 *
 * Keys go in `Authorization: Bearer <key>`. Errors are RFC 9457 problems with a `detail`.
 */

import { createController } from "@remix-run/fetch-router";

import { routes } from "../../../client/routes.ts";
import { problem } from "../../lib/problem.ts";
import { getEngine } from "../../game/engine.ts";
import {
  bearer,
  hashKey,
  keyMatches,
  newId,
  newKey,
  shuffle,
} from "../../game/keys.ts";
import {
  GameError,
  go,
  join,
  newRoom,
  ownerView,
  playerView,
  type Room,
  roomView,
  submit,
} from "../../game/room.ts";
import { getRoomStore } from "../../game/store.ts";

/** No caching anywhere: these answers change with every move. */
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const failure = (e: unknown): Response => {
  if (e instanceof GameError) {
    return problem({ status: e.status, detail: e.message });
  }
  console.error(e);
  return problem({
    status: 500,
    detail: e instanceof Error ? e.message : String(e),
  });
};

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b;
  } catch {
    // fall through
  }
  throw new GameError(400, "the body must be a JSON object");
}

async function load(roomId: string): Promise<Room> {
  const room = await getRoomStore().get(roomId);
  if (!room) throw new GameError(404, `no room ${roomId}`);
  return room;
}

async function asOwner(request: Request, room: Room): Promise<void> {
  if (!await keyMatches(bearer(request), room.keyHash)) {
    throw new GameError(
      401,
      "this needs the room key (Authorization: Bearer <roomKey>)",
    );
  }
}

async function asPlayer(
  request: Request,
  room: Room,
  playId: string,
): Promise<void> {
  const p = room.players.find((p) => p.playId === playId);
  if (!p) throw new GameError(404, `no player ${playId}`);
  if (!await keyMatches(bearer(request), p.keyHash)) {
    throw new GameError(
      401,
      "this needs your play key (Authorization: Bearer <playKey>)",
    );
  }
}

export const roomsController = createController(routes.api.rooms, {
  actions: {
    async create({ request }) {
      try {
        const b = await body(request);
        const roomKey = newKey();
        const room = newRoom({
          roomId: newId(),
          keyHash: await hashKey(roomKey),
          roles: b.roles,
          rule: b.rule,
        });
        await getRoomStore().create(room);
        return json({ roomId: room.roomId, roomKey }, 201);
      } catch (e) {
        return failure(e);
      }
    },

    async show({ params }) {
      try {
        return json(roomView(await load(params.roomId!)));
      } catch (e) {
        return failure(e);
      }
    },

    async owner({ request, params }) {
      try {
        const room = await load(params.roomId!);
        await asOwner(request, room);
        return json(ownerView(room));
      } catch (e) {
        return failure(e);
      }
    },

    async go({ request, params }) {
      try {
        await asOwner(request, await load(params.roomId!));
        const engine = await getEngine();
        const room = await getRoomStore().change(
          params.roomId!,
          (r) => go(r, engine, shuffle),
        );
        return json(ownerView(room));
      } catch (e) {
        return failure(e);
      }
    },

    async join({ request, params }) {
      try {
        const b = await body(request);
        const playKey = newKey();
        const keyHash = await hashKey(playKey);
        const playId = newId(8);
        await getRoomStore().change(
          params.roomId!,
          (r) => join(r, { playId, keyHash, name: b.name }),
        );
        return json({ playId, playKey }, 201);
      } catch (e) {
        return failure(e);
      }
    },

    async me({ request, params }) {
      try {
        const room = await load(params.roomId!);
        await asPlayer(request, room, params.playId!);
        return json(playerView(room, params.playId!));
      } catch (e) {
        return failure(e);
      }
    },

    async act({ request, params }) {
      try {
        await asPlayer(request, await load(params.roomId!), params.playId!);
        const b = await body(request);
        const room = await getRoomStore().change(
          params.roomId!,
          (r) => submit(r, params.playId!, b.actions),
        );
        return json(playerView(room, params.playId!));
      } catch (e) {
        return failure(e);
      }
    },
  },
});
