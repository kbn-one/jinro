/**
 * The room API end to end, through the router: create, join, go, act, until somebody wins — and
 * that a player sees only what is theirs to see. Rooms live in memory here (no Turso in tests).
 * Needs `deno task wasm` first.
 */

import { assert, assertEquals } from "@std/assert";

import router from "./router.tsx";
import type {
  CreateRoomResponse,
  JoinResponse,
  OwnerView,
  PlayerView,
  RoomView,
} from "../client/play/types.ts";

const call = async (
  method: string,
  path: string,
  key?: string,
  body?: unknown,
) => {
  const headers: Record<string, string> = {};
  if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await router.fetch(
    new Request(`http://x/api/rooms${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
};

async function roomOf(roles: string[]) {
  const created = await call("POST", "", undefined, { roles });
  assertEquals(created.status, 201);
  return created.body as CreateRoomResponse;
}

async function seat(roomId: string, names: string[]) {
  const out: (JoinResponse & { name: string })[] = [];
  for (const name of names) {
    const r = await call("POST", `/${roomId}/players`, undefined, { name });
    assertEquals(r.status, 201, JSON.stringify(r.body));
    out.push({ ...(r.body as JoinResponse), name });
  }
  return out;
}

Deno.test("a whole game over the API, each player seeing only their own", async () => {
  const { roomId, roomKey } = await roomOf([
    "wolf",
    "seer",
    "villager",
    "villager",
  ]);
  const players = await seat(roomId, ["A", "B", "C", "D"]);

  // The room is public; the lobby knows no roles.
  const lobby = (await call("GET", `/${roomId}`)).body as RoomView;
  assertEquals(lobby.phase, "lobby");
  assertEquals(lobby.players.map((p) => p.name), ["A", "B", "C", "D"]);

  // Only the owner may go.
  assertEquals((await call("POST", `/${roomId}/go`)).status, 401);
  assertEquals(
    (await call("POST", `/${roomId}/go`, players[0].playKey)).status,
    401,
  );
  const started = await call("POST", `/${roomId}/go`, roomKey);
  assertEquals(started.status, 200, JSON.stringify(started.body));
  assertEquals((started.body as OwnerView).phase, "playing");
  assertEquals((started.body as OwnerView).dayNumber, 0);

  const view = async (i: number) => {
    const r = await call(
      "GET",
      `/${roomId}/players/${players[i].playId}`,
      players[i].playKey,
    );
    assertEquals(r.status, 200, JSON.stringify(r.body));
    return r.body as PlayerView;
  };
  // A player needs their own key; another's will not do.
  assertEquals(
    (await call(
      "GET",
      `/${roomId}/players/${players[0].playId}`,
      players[1].playKey,
    )).status,
    401,
  );

  const views = await Promise.all(players.map((_, i) => view(i)));
  const roleOf = (i: number) => views[i].you.role!;
  assertEquals(views.map((_, i) => roleOf(i)).sort(), [
    "seer",
    "villager",
    "villager",
    "wolf",
  ]);
  for (const v of views) {
    // Nobody's role but your own is in your view.
    assert(v.room.players.every((p) => p.role === undefined));
  }
  const wolf = views.findIndex((v) => v.you.role === "wolf");
  const seer = views.findIndex((v) => v.you.role === "seer");

  // Night 0: only the seer has something to do.
  assertEquals(views[seer].you.choices.map((c) => c.actionType), ["divine"]);
  assertEquals(views[wolf].you.choices, []);
  // A choice it does not have is refused.
  const bad = await call(
    "PUT",
    `/${roomId}/players/${players[wolf].playId}/actions`,
    players[wolf].playKey,
    { actions: [{ actionType: "bite", target: players[seer].playId }] },
  );
  assertEquals(bad.status, 400);
  const divined = await call(
    "PUT",
    `/${roomId}/players/${players[seer].playId}/actions`,
    players[seer].playKey,
    { actions: [{ actionType: "divine", target: players[wolf].playId }] },
  );
  assertEquals(divined.status, 200, JSON.stringify(divined.body));
  assertEquals((divined.body as PlayerView).you.submitted.length, 1);
  const owner = (await call("GET", `/${roomId}/owner`, roomKey))
    .body as OwnerView;
  assertEquals(owner.submitted, [players[seer].playId]);

  await call("POST", `/${roomId}/go`, roomKey);
  const seerAfter = await view(seer);
  const divine = seerAfter.you.logs.find((l) => l.actionType === "divine");
  assertEquals(divine?.target?.name, players[wolf].name);
  assertEquals(divine?.result, "wolf");
  // The wolf does not see the seer's result.
  assert(!(await view(wolf)).you.logs.some((l) => l.actionType === "divine"));

  // Day 1: everyone votes the wolf out; the village wins.
  for (const [i, p] of players.entries()) {
    const target = i === wolf ? players[seer] : players[wolf];
    const r = await call(
      "PUT",
      `/${roomId}/players/${p.playId}/actions`,
      p.playKey,
      {
        actions: [{ actionType: "vote", target: target.playId }],
      },
    );
    assertEquals(r.status, 200, JSON.stringify(r.body));
  }
  const ended = (await call("POST", `/${roomId}/go`, roomKey))
    .body as OwnerView;
  assertEquals(ended.phase, "over");
  assertEquals(ended.winner, "villagers");
  // Once it is over, everyone's role is public.
  assertEquals(ended.players[wolf].role, "wolf");
  assertEquals(ended.players[wolf].alive, false);
  assertEquals(ended.players[wolf].causeOfDeath, "executed");
  assertEquals((await call("POST", `/${roomId}/go`, roomKey)).status, 409);
});

Deno.test("the lobby: a full room, a taken name, too early a go", async () => {
  const { roomId, roomKey } = await roomOf(["wolf", "villager"]);
  await seat(roomId, ["A"]);
  assertEquals(
    (await call("POST", `/${roomId}/players`, undefined, { name: "A" })).status,
    409,
  );
  const early = await call("POST", `/${roomId}/go`, roomKey);
  assertEquals(early.status, 409);
  assert(String(early.body.detail).includes("1 of 2"));
  await seat(roomId, ["B"]);
  assertEquals(
    (await call("POST", `/${roomId}/players`, undefined, { name: "C" })).status,
    409,
  );
});

Deno.test("bad requests are problems with a detail", async () => {
  for (const roles of [[], ["dragon"], "wolf"]) {
    const r = await call("POST", "", undefined, { roles });
    assertEquals(r.status, 400);
    assert(typeof r.body.detail === "string");
  }
  assertEquals((await call("GET", "/nope")).status, 404);
  assertEquals(
    (await call("POST", "/nope/players", undefined, { name: "A" })).status,
    404,
  );
});
