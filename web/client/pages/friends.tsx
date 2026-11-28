import { css, type Handle, type RemixNode } from "@remix-run/component";

import { LandingPage, RULE_URL } from "../landing/chrome.tsx";
import {
  ctaBandStyle,
  eyebrowStyle,
  h2Style,
  heroBandStyle,
  landingFonts,
  palette,
  pillStyle,
  raisedStyle,
  sectionStyle,
  wrapStyle,
} from "../landing/styles.ts";
import {
  dayLabel,
  PHASE_LABEL,
  PRESETS,
  ROLE_HELP,
  ROLE_LABEL,
  ROLES,
  rolesSummary,
  TEAM_LABEL,
} from "../play/labels.ts";
import {
  badgeStyle,
  buttonStyle,
  codeBoxStyle,
  mutedStyle,
  panelStyle,
  primaryButtonStyle,
  roleCellStyle,
  roleGridStyle,
  rootStyle,
  rowStyle,
  tableStyle,
  tinyButtonStyle,
} from "../play/styles.ts";
import type { RoleType } from "../jinro.ts";
import { routes } from "../routes.ts";

export const title = "友達と遊ぶ — jinro";
export const description =
  "jinro がゲームマスター役。部屋を作って URL を配り、オーナーが「次へ」を押すだけで人狼が遊べます。";

export const hydrate = false;
export const bare = true;
export const stylesheets = [landingFonts];

// The screens below are the `/play` islands' own markup and styles, filled with a sample room.
// They are `inert`: pictures of the app, not a second copy of it.

const preset = PRESETS[0];
const counts = Object.fromEntries(
  ROLES.map((r) => [r, preset.counts[r] ?? 0]),
) as Record<RoleType, number>;
const roles = ROLES.flatMap((r) => Array.from({ length: counts[r] }, () => r));
const players = [
  "あおい",
  "けんた",
  "みさき",
  "りょう",
  "はる",
  "そら",
  "ゆい",
];
const joinUrl =
  `https://jinro.kuboon.workers.dev${routes.play.join.href()}#room=k3f9q2`;

export default function Friends(_handle: Handle) {
  return () => (
    <LandingPage current="friends">
      <section mix={heroBandStyle(palette.yellow)}>
        <div mix={wrapStyle}>
          <p mix={eyebrowStyle}>友達と遊ぶ</p>
          <h1>
            ゲームマスターは、<br />jinro にまかせて。
          </h1>
          <p>
            役職を配る、夜の行動を集める、誰が死んだか伝える、勝ち負けを決める。面倒な進行はぜんぶ
            jinro がやります。みんなは推理と駆け引きだけ。
          </p>
        </div>
      </section>

      <section mix={[wrapStyle, noticeSectionStyle]}>
        <div role="note" mix={[noticeStyle, raisedStyle(palette.coral)]}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 48 48"
            fill="none"
            stroke={palette.ink}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 12h32v20H22l-8 7v-7H8zM18 22h.01M24 22h.01M30 22h.01" />
          </svg>
          <div>
            <h2>おしゃべりの場所は、別に用意してください</h2>
            <p>
              本システムはゲームマスター機能のみを提供し、チャット機能はありません。別途
              LINE グループなりビデオチャットなりをご用意ください。
            </p>
          </div>
        </div>
      </section>

      <section mix={[wrapStyle, sectionStyle, stepsStyle]}>
        <h2 mix={h2Style}>遊び方は 3 ステップ</h2>

        <Step
          n={1}
          color={palette.yellow}
          title="部屋を作る"
          body="プリセットを選ぶか、役職の数を ＋ − で決めます。役職の数がそのまま参加人数。投票を公開にするか非公開にするかも選べます。"
          path={routes.play.index.href()}
        >
          <section mix={panelStyle}>
            <h2>部屋を作る</h2>
            <p mix={mutedStyle}>
              役職の数がそのまま参加人数になります。全員が揃ったら、オーナーの「始める」で役職が配られます。
            </p>
            <div mix={rowStyle}>
              {PRESETS.map((p) => (
                <button
                  type="button"
                  aria-pressed={p === preset ? "true" : "false"}
                  mix={buttonStyle}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div mix={roleGridStyle}>
              {ROLES.map((r) => (
                <div mix={roleCellStyle}>
                  <span>{ROLE_LABEL[r]}</span>
                  <button type="button" mix={tinyButtonStyle}>−</button>
                  <strong>{counts[r]}</strong>
                  <button type="button" mix={tinyButtonStyle}>＋</button>
                </div>
              ))}
            </div>
            <div mix={rowStyle}>
              <span>投票:</span>
              <button type="button" aria-pressed="true" mix={buttonStyle}>
                公開
              </button>
              <button type="button" aria-pressed="false" mix={buttonStyle}>
                非公開
              </button>
            </div>
            <div mix={rowStyle}>
              <button type="button" mix={primaryButtonStyle}>
                {roles.length} 人の部屋を作る
              </button>
              <span mix={mutedStyle}>{rolesSummary(roles)}</span>
            </div>
          </section>
        </Step>

        <Step
          n={2}
          color={palette.lilac}
          title="参加用のリンクを配る"
          body="オーナー画面のリンクをコピーして、LINE グループなどに貼るだけ。みんなが名前を入れて参加すると、ここに並びます。"
          path={routes.play.owner.href()}
          flip
        >
          <section mix={panelStyle}>
            <h2>
              部屋 k3f9q2 <span mix={badgeStyle}>{PHASE_LABEL.lobby}</span>
            </h2>
            <p>役職: {rolesSummary(roles)}（投票は公開）</p>
            <p>参加用のリンク（みんなに送ってください）:</p>
            <input
              readOnly
              value={joinUrl}
              aria-label="参加用のリンク"
              mix={codeBoxStyle}
            />
            <div mix={rowStyle}>
              <button type="button" mix={buttonStyle}>リンクをコピー</button>
              <a href={routes.play.join.href()}>自分も参加する →</a>
            </div>
            <div mix={rowStyle}>
              <button type="button" disabled mix={primaryButtonStyle}>
                参加者を待っています（4/{roles.length}）
              </button>
            </div>
          </section>
          <section mix={panelStyle}>
            <h2>参加者</h2>
            <table mix={tableStyle}>
              <thead>
                <tr>
                  <th>名前</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {players.slice(0, 4).map((p) => (
                  <tr>
                    <td>{p}</td>
                    <td>参加済み</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </Step>

        <Step
          n={3}
          color={palette.mint}
          title="オーナーが「次へ」を押す"
          body="全員そろったら「ゲームを始める」。あとは議論が済んだところでオーナーが押すたびに、それまでに出た投票や夜の行動で 1 日が締まります。各自の画面には、自分の役職と、自分に見えてよい出来事だけが出ます。"
          path={routes.play.me.href()}
        >
          <section mix={panelStyle}>
            <h2>
              {players[0]} <span mix={badgeStyle}>{PHASE_LABEL.playing}</span>
            </h2>
            <p>
              あなたは <strong>{ROLE_LABEL.seer}</strong>（{TEAM_LABEL
                .villagers}陣営）。生きています。
            </p>
            <p mix={mutedStyle}>{ROLE_HELP.seer}</p>
            <p>今は {dayLabel(1)} です。</p>
          </section>
          <section mix={panelStyle}>
            <h2>今日の行動</h2>
            {[
              { label: "投票", picked: players[1] },
              { label: "占い", picked: players[2] },
            ].map((c) => (
              <div>
                <strong>{c.label}</strong>
                <div mix={rowStyle}>
                  {players.slice(1).map((t) => (
                    <button
                      type="button"
                      aria-pressed={t === c.picked ? "true" : "false"}
                      mix={buttonStyle}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p mix={mutedStyle}>
              選び直せます（同じ人をもう一度押すと取り消し）。オーナーが次へ進めた時点の選択で決まります。
            </p>
          </section>
        </Step>
      </section>

      <section mix={[wrapStyle, ctaSectionStyle]}>
        <div mix={ctaBandStyle}>
          <div>
            <h2>さっそく村を作ろう</h2>
            <p>
              アカウント登録はいりません。ルールがあやふやな人は、先にルールのページへ。
            </p>
          </div>
          <div>
            <a
              href={routes.play.index.href()}
              mix={pillStyle(palette.yellow, palette.ink)}
            >
              部屋を作る
            </a>
            <a
              href={RULE_URL}
              mix={pillStyle("transparent", palette.white, palette.white)}
            >
              ルールを読む
            </a>
          </div>
        </div>
      </section>
    </LandingPage>
  );
}

interface StepProps {
  n: number;
  color: string;
  title: string;
  body: string;
  /** The page the screen is from, shown in the frame's address bar. */
  path: string;
  /** Put the screen first (on a wide screen, on the left). */
  flip?: boolean;
  children: RemixNode;
}

/** One step: its number, what to do, and the screen it happens on. */
function Step(handle: Handle<StepProps>) {
  return () => {
    const p = handle.props;
    return (
      <div mix={stepStyle(p.flip ?? false)}>
        <div mix={stepTextStyle}>
          <span mix={stepNumberStyle(p.color)} aria-hidden="true">{p.n}</span>
          <h3>
            <span mix={visuallyHidden}>ステップ {p.n}:</span>
            {p.title}
          </h3>
          <p>{p.body}</p>
        </div>
        <figure mix={[frameStyle, raisedStyle()]}>
          <div mix={frameBarStyle} aria-hidden="true">
            <span style={{ background: palette.coral }} />
            <span style={{ background: palette.yellow }} />
            <span style={{ background: palette.mint }} />
            <code>{p.path}</code>
          </div>
          {/* A picture of the screen: nothing in it can be focused or pressed. */}
          <div inert mix={[screenStyle, rootStyle]}>{p.children}</div>
          <figcaption mix={visuallyHidden}>
            {p.title}の画面（見本）
          </figcaption>
        </figure>
      </div>
    );
  };
}

// --- styles -----------------------------------------------------------------

const noticeSectionStyle = css({ paddingTop: "3rem" });

const noticeStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1rem 1.25rem",
  alignItems: "flex-start",
  padding: "1.5rem 1.75rem",
  background: palette.white,
  border: `2px solid ${palette.ink}`,
  borderRadius: "1.25rem",
  "& > svg": { flex: "none" },
  "& > div": { flex: "1 1 18rem", minWidth: 0 },
  "& h2": { margin: "0 0 0.25rem", fontSize: "1.2rem", fontWeight: 800 },
  "& p": { margin: 0, color: "#2e2a47" },
});

const stepsStyle = css({ gap: "3.5rem" });

const stepStyle = (flip: boolean) =>
  css({
    display: "flex",
    flexWrap: "wrap",
    flexDirection: flip ? "row-reverse" : "row",
    gap: "2rem 3rem",
    alignItems: "center",
  });

const stepTextStyle = css({
  flex: "1 1 18rem",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  "& h3": { margin: 0, fontSize: "1.6rem", fontWeight: 800 },
  "& p": { margin: 0, color: palette.sub },
});

const stepNumberStyle = (background: string) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "3.25rem",
    height: "3.25rem",
    borderRadius: "50%",
    background,
    border: `2px solid ${palette.ink}`,
    fontSize: "1.4rem",
    fontWeight: 800,
  });

const frameStyle = css({
  flex: "1 1 30rem",
  minWidth: 0,
  margin: 0,
  border: `2px solid ${palette.ink}`,
  borderRadius: "1rem",
  overflow: "hidden",
  background: "var(--bg)",
});

const frameBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.6rem 0.9rem",
  background: palette.chrome,
  borderBottom: `2px solid ${palette.ink}`,
  "& > span": {
    width: "0.7rem",
    height: "0.7rem",
    borderRadius: "50%",
    border: `1.5px solid ${palette.ink}`,
  },
  "& > code": {
    marginLeft: "0.6rem",
    fontSize: "0.75rem",
    color: palette.quiet,
    background: "none",
    padding: 0,
  },
});

/** The app's own look inside the frame: its font, its tokens, its spacing. */
const screenStyle = css({
  padding: "1.25rem",
  fontFamily: "var(--font-sans)",
  lineHeight: 1.6,
  color: "var(--fg)",
  background: "var(--bg)",
  colorScheme: "light dark",
  "& a": { color: "var(--accent)" },
});

const ctaSectionStyle = css({ paddingBlock: "3rem 6rem" });

const visuallyHidden = css({
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
});
