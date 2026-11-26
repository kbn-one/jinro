import type { Handle } from "@remix-run/component";

import { PlayMe } from "../../islands/play_me.tsx";

export const title = "あなたの席 — jinro";
export const description =
  "人狼のプレイヤー画面。自分の役職と行動だけが見えます。";

/** The page is an island: it talks to the room API from the browser. */
export const hydrate = true;

export default function Page(_handle: Handle) {
  return () => (
    <>
      <h1>あなたの席</h1>
      <PlayMe />
    </>
  );
}
