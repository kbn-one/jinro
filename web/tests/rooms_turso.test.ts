/**
 * The room store on Turso, as a deployed Worker uses it (`web/server/game/store.ts`), against an
 * in-memory libSQL database: rooms round-trip, a failing step stores nothing, and concurrent joins
 * all land — the store's update is optimistic, so the losers retry instead of overwriting.
 *
 * Lives under `web/tests` because the native libSQL client needs `-A`.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { createClient } from "@libsql/client/node";
import { TursoKvRepo } from "@kuboon/kv/turso.ts";

import { RoomStore } from "../server/game/store.ts";
import { GameError, join, newRoom, type Room } from "../server/game/room.ts";

const storeOn = () => {
  const client = createClient({ url: ":memory:" });
  return { client, store: new RoomStore(new TursoKvRepo<Room>(client, ["t"])) };
};

Deno.test("rooms round-trip through Turso, and a failing step stores nothing", async () => {
  const { client, store } = storeOn();
  const roles = ["wolf", "seer", "villager"];
  await store.create(newRoom({ roomId: "r1", keyHash: "h", roles }));
  assertEquals((await store.get("r1"))?.roles, roles);

  await store.change(
    "r1",
    (r) => join(r, { playId: "p1", keyHash: "k", name: "A" }),
  );
  const err = await assertRejects(
    () =>
      store.change(
        "r1",
        (r) => join(r, { playId: "p2", keyHash: "k", name: "A" }),
      ),
    GameError,
  );
  assertEquals(err.status, 409);
  assertEquals((await store.get("r1"))?.players.map((p) => p.name), ["A"]);
  await assertRejects(() => store.change("nope", (r) => r), GameError);
  client.close();
});

Deno.test("concurrent joins all land", async () => {
  const { client, store } = storeOn();
  const roles = Array.from({ length: 8 }, () => "villager");
  await store.create(newRoom({ roomId: "r2", keyHash: "h", roles }));
  await Promise.all(
    Array.from(
      { length: 8 },
      (_, i) =>
        store.change(
          "r2",
          (r) => join(r, { playId: `p${i}`, keyHash: "k", name: `P${i}` }),
        ),
    ),
  );
  const room = await store.get("r2");
  assertEquals(room?.players.length, 8);
  assertEquals(room?.rev, 8);
  client.close();
});
