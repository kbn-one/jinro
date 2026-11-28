import { css, type Handle } from "@remix-run/component";

import { GITHUB_URL, LandingPage } from "../landing/chrome.tsx";
import {
  cardStyle,
  ctaBandStyle,
  eyebrowStyle,
  h2Style,
  heroBandStyle,
  landingFonts,
  leadStyle,
  palette,
  pillStyle,
  raisedStyle,
  sectionStyle,
  wrapStyle,
} from "../landing/styles.ts";
import { routes } from "../routes.ts";

export const title = "開発者の方へ — jinro";
export const description =
  "jinro の人狼エンジンは純粋関数ふたつ。createVillage と processDay、そしてプレイヤーごとに絞り込んで届けるだけのログ。";

export const hydrate = false;
export const bare = true;
export const stylesheets = [landingFonts];

/** `web/client/jinro.ts`'s `Engine`, and the loop that drives it. */
const engineCode = `export interface Engine {
  createVillage(roles: Role[], rule: Rule):
    [Village, Today];
  processDay(village: Village, actions: Action[]):
    [DayResult, Village, Today];
}

// 遊ぶ側のループ
let [village, today] = engine.createVillage(roles, rule);
while (!today.winner) {
  const actions = await collect(today);
  let result;
  [result, village, today] = engine.processDay(village, actions);
  deliver(result.logs);
}`;

/** `Receivers` from `web/client/jinro.ts`, and the check `Engine.lean` makes for a viewer. */
const receiversCode = `type Receivers =
  | { tag: "all" }
  | { tag: "afterall" }
  | { tag: "only"; val: CreatureId[] };

// そのプレイヤーに見せてよいログだけ
const canSee = (log: Log, me: CreatureId, over: boolean) =>
  log.receivers.tag === "all" ||
  (log.receivers.tag === "afterall" && over) ||
  (log.receivers.tag === "only" && log.receivers.val.includes(me));`;

const receivers = [
  { tag: "all", body: "全員に。処刑や、朝見つかった死体など。" },
  {
    tag: "only",
    body: "列挙された人だけに。占いや護衛の結果など、行動した本人に届くもの。",
  },
  {
    tag: "afterall",
    body:
      "ゲームが終わってから全員に。本当の死因など、終わるまで伏せておく情報。",
  },
];

const insides = [
  {
    title: "Lean で書いて証明",
    body:
      "ルールは Lean 4 のプログラム。ゲームの性質を定理にして、ビルドのたびに検査しています。",
  },
  {
    title: "自作の WasmGC 出力",
    body:
      "Lean の C ランタイムを使わず WasmGC へ直接コンパイル。約 115 KB、brotli で約 32 KB。",
  },
  {
    title: "JSON を入れて JSON が出る",
    body:
      "wasm の入口は run ひとつ。JavaScript・Ruby・Python から同じプロトコルで呼べます。WasmGC が動くホストなら OK。",
  },
];

export default function Dev(_handle: Handle) {
  return () => (
    <LandingPage current="dev">
      <section mix={heroBandStyle(palette.mint)}>
        <div mix={wrapStyle}>
          <p mix={eyebrowStyle}>開発者の方へ</p>
          <h1>
            人狼は、<br />純粋関数ふたつで回る。
          </h1>
          <p>
            jinro
            のエンジンは状態を持ちません。村を渡せば次の日が返ってくる、それだけ。保存も通信も時計も、あなたのアプリの好きなように作れます。
          </p>
        </div>
      </section>

      <section mix={[wrapStyle, splitStyle(false)]}>
        <div mix={proseStyle}>
          <h2 mix={h2Style}>インターフェース</h2>
          <p mix={leadStyle}>
            <code>createVillage</code> で村を作り、<code>processDay</code>{" "}
            に 1
            日ぶんの行動を渡して進める。どちらも同じ入力には必ず同じ答えを返す純粋関数です。
          </p>
          <ul>
            <li>
              <strong>Village</strong>{" "}
              はそれまでの全履歴。エンジンは何も覚えていないので、保存すべきものはこれだけ。
            </li>
            <li>
              <strong>Today</strong>{" "}
              は次の日の様子。各プレイヤーの生死と、その日にできる行動と選べる相手。<code>
                winner
              </code>{" "}
              が入ったら終わり。
            </li>
            <li>
              <strong>DayResult</strong>{" "}
              はその日の結果。処刑された人、死んだ人、そして出来事のログ。
            </li>
          </ul>
        </div>
        <Code file="jinro.ts" code={engineCode} shadow={palette.mint} />
      </section>

      <section mix={[wrapStyle, splitStyle(true)]}>
        <div mix={proseStyle}>
          <h2 mix={h2Style}>ログは、絞って届けるだけ</h2>
          <p mix={leadStyle}>
            どのログを誰が見てよいかは、エンジンが決めています。<code>Log</code>
            {" "}
            はそれぞれ <code>receivers</code>{" "}
            を持っているので、プレイヤーごとに絞り込んで渡せば、それで秘密が守られます。
          </p>
          <dl mix={receiversStyle}>
            {receivers.map((r) => (
              <div>
                <dt>
                  <code>{r.tag}</code>
                </dt>
                <dd>{r.body}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Code file="deliver.ts" code={receiversCode} shadow={palette.yellow} />
      </section>

      <section mix={[wrapStyle, sectionStyle]}>
        <h2 mix={h2Style}>中身のこと</h2>
        <div mix={insidesStyle}>
          {insides.map((i) => (
            <div mix={cardStyle}>
              <h3>{i.title}</h3>
              <p>{i.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section mix={[wrapStyle, ctaSectionStyle]}>
        <div mix={ctaBandStyle}>
          <div>
            <h2>触ってみる</h2>
            <p>ブラウザの wasm デモで村を作って、1 日ずつ進められます。</p>
          </div>
          <div>
            <a
              href={routes.wasm.href()}
              mix={pillStyle(palette.mint, palette.ink)}
            >
              wasm デモ
            </a>
            <a
              href={GITHUB_URL}
              mix={pillStyle("transparent", palette.white, palette.white)}
            >
              GitHub
            </a>
          </div>
        </div>
      </section>
    </LandingPage>
  );
}

/** A code sample in a dark card. */
function Code(handle: Handle<{ file: string; code: string; shadow: string }>) {
  return () => (
    <figure mix={[codeStyle, raisedStyle(handle.props.shadow)]}>
      <figcaption>{handle.props.file}</figcaption>
      <pre><code>{handle.props.code}</code></pre>
    </figure>
  );
}

// --- styles -----------------------------------------------------------------

const splitStyle = (flip: boolean) =>
  css({
    display: "flex",
    flexWrap: "wrap",
    flexDirection: flip ? "row-reverse" : "row",
    gap: "2rem 3rem",
    alignItems: "flex-start",
    paddingBlock: "4rem 0",
  });

const proseStyle = css({
  flex: "1 1 20rem",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  "& ul": {
    margin: 0,
    paddingLeft: "1.2em",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    color: palette.sub,
  },
  "& strong": { color: palette.ink },
  "& code": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    background: palette.chrome,
    padding: "0.05em 0.35em",
    borderRadius: "0.35rem",
  },
});

const receiversStyle = css({
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  "& > div": {
    display: "flex",
    gap: "0.75rem",
    alignItems: "baseline",
    padding: "0.75rem 1rem",
    background: palette.white,
    border: `2px solid ${palette.ink}`,
    borderRadius: "0.9rem",
  },
  "& dt": { flex: "none", fontWeight: 700 },
  "& dd": { margin: 0, color: palette.sub, fontSize: "0.95rem" },
});

const codeStyle = css({
  flex: "1 1 30rem",
  minWidth: 0,
  margin: 0,
  background: palette.ink,
  border: `2px solid ${palette.ink}`,
  borderRadius: "1.25rem",
  overflow: "hidden",
  "& figcaption": {
    padding: "0.75rem 1.1rem",
    borderBottom: "1px solid #3b3561",
    fontFamily: "var(--font-mono)",
    fontSize: "0.8rem",
    color: "#c9c4e8",
  },
  "& pre": {
    margin: 0,
    padding: "1.25rem",
    overflowX: "auto",
    fontFamily: "var(--font-mono)",
    fontSize: "0.875rem",
    lineHeight: 1.75,
    color: "#f4f2ff",
  },
  "& pre code": { background: "none", padding: 0, color: "inherit" },
});

const insidesStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
  gap: "1.25rem",
});

const ctaSectionStyle = css({ paddingBlock: "3rem 6rem" });
