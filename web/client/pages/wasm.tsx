import type { Handle } from "@remix-run/component";

import { JinroDemo } from "../islands/jinro_demo.tsx";

export const title = "wasm デモ — jinro";
export const description =
  "jinro の人狼エンジン (Rust → wasm コンポーネント) をブラウザで動かして試すページ。";

/** The playground is an island. */
export const hydrate = true;

export default function Wasm(_handle: Handle) {
  return () => (
    <>
      <h1>wasm デモ</h1>
      <p>
        <code>rust/jinro-wasi</code>{" "}
        を WASI のコマンドとして wasm にビルドし、標準入力に JSON
        を渡して標準出力の JSON を受け取る形で、ブラウザだけで動かしています。
        村を作り、各キャラクターの行動を選んで 1 日ずつ進めると、
        <code>createVillage</code> / <code>processDay</code>{" "}
        の入出力とログを確認できます。
      </p>
      <JinroDemo />
    </>
  );
}
