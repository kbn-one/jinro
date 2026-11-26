import type { Handle } from "@remix-run/component";

import { PlayJoin } from "../../islands/play_join.tsx";

export const title = "部屋に参加 — jinro";
export const description = "人狼の部屋に参加する。";

/** The page is an island: it talks to the room API from the browser. */
export const hydrate = true;

export default function Page(_handle: Handle) {
  return () => (
    <>
      <h1>部屋に参加</h1>
      <PlayJoin />
    </>
  );
}
