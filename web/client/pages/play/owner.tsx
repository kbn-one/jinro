import type { Handle } from "@remix-run/component";

import { PlayOwner } from "../../islands/play_owner.tsx";

export const title = "部屋の管理 — jinro";
export const description = "人狼の部屋のオーナー画面。";

/** The page is an island: it talks to the room API from the browser. */
export const hydrate = true;

export default function Page(_handle: Handle) {
  return () => (
    <>
      <h1>部屋の管理</h1>
      <PlayOwner />
    </>
  );
}
