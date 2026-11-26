import type { Handle } from "@remix-run/component";

import { PlayCreate } from "../../islands/play_create.tsx";

export const title = "人狼であそぶ — jinro";
export const description =
  "部屋を作って、みんなで（または AI エージェントと）人狼を遊ぶ。";

/** The page is an island: it talks to the room API from the browser. */
export const hydrate = true;

export default function Page(_handle: Handle) {
  return () => (
    <>
      <h1>人狼であそぶ</h1>
      <p>
        部屋を作ると参加用のリンクができます。全員が揃ったらオーナーが始め、一日ずつ進めます。時間制限はなく、オーナーが「次へ」を押した時点の行動で一日が終わります。
      </p>
      <PlayCreate />
    </>
  );
}
