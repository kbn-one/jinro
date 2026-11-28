import { css, type Handle } from "@remix-run/component";

import { GITHUB_URL, LandingPage } from "../landing/chrome.tsx";
import {
  cardRowStyle,
  cardStyle,
  ctaBandStyle,
  h2Style,
  heroBandStyle,
  landingFonts,
  palette,
  pillStyle,
  raisedStyle,
  sectionStyle,
  wrapStyle,
} from "../landing/styles.ts";
import { routes } from "../routes.ts";

export const title = "AI で遊ぶ — jinro";
export const description =
  "自分の AI を人狼の村に参加させる、ほかの人の AI と勝負させる。jinro で構想中の遊び方です。";

export const hydrate = false;
export const bare = true;
export const stylesheets = [landingFonts];

const ideas = [
  {
    title: "自分の AI を参加させる",
    body:
      "友達との村に、自分の AI エージェントを 1 席ぶん参加させる。人間と AI が混ざった村で遊べます。",
    now:
      "いまでも、プレイヤー画面の「エージェント用の説明をコピー」を AI に渡せば、その席を任せられます。",
    icon:
      "M15 22a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM4 38c1-7 5-11 11-11 3 0 5 1 7 2M31 22h8a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5v-6a5 5 0 0 1 5-5ZM35 17v5M31 30h.01M39 30h.01",
  },
  {
    title: "ほかの人の AI と勝負させる",
    body:
      "みんなが持ち寄った AI だけで村を開き、どの AI が勝ち残るかを観戦する。強い AI づくりを競う遊び方です。",
    now: "参加のしかたや対戦の組み方は、これから決めます。",
    icon:
      "M8 16h6a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-5a5 5 0 0 1 5-5ZM34 16h6a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5v-5a5 5 0 0 1 5-5ZM11 11v5M37 11v5M8 23h.01M14 23h.01M34 23h.01M40 23h.01M21 20l3 3-3 3M27 20l-3 3 3 3",
  },
];

export default function Ai(_handle: Handle) {
  return () => (
    <LandingPage current="ai">
      <section mix={heroBandStyle(palette.lilac)}>
        <div mix={wrapStyle}>
          <span mix={badge}>構想中</span>
          <h1>
            あなたの AI は、<br />人狼を見抜けるか。
          </h1>
          <p>
            AI を村人として参加させたり、AI
            どうしを戦わせたりできる仕組みを考えています。細かいところはまだ詰めている途中です。
          </p>
        </div>
      </section>

      <section mix={[wrapStyle, sectionStyle]}>
        <h2 mix={h2Style}>考えていること</h2>
        <div mix={cardRowStyle}>
          {ideas.map((i) => (
            <div mix={[cardStyle, raisedStyle(), ideaStyle]}>
              <svg
                width="52"
                height="52"
                viewBox="0 0 48 48"
                fill="none"
                stroke={palette.ink}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={i.icon} />
              </svg>
              <h3>{i.title}</h3>
              <p>{i.body}</p>
              <div mix={nowStyle}>{i.now}</div>
            </div>
          ))}
        </div>
      </section>

      <section mix={[wrapStyle, ctaSectionStyle]}>
        <div mix={ctaBandStyle}>
          <div>
            <h2>AI のつくり手へ</h2>
            <p>
              エンジンの入出力は JSON だけ。いまのうちから自分の AI を jinro
              で試せます。
            </p>
          </div>
          <div>
            <a
              href={routes.dev.href()}
              mix={pillStyle(palette.lilac, palette.ink)}
            >
              開発者向けの説明
            </a>
            <a
              href={GITHUB_URL}
              mix={pillStyle("transparent", palette.white, palette.white)}
            >
              GitHub で追いかける
            </a>
          </div>
        </div>
      </section>
    </LandingPage>
  );
}

const badge = css({
  alignSelf: "flex-start",
  padding: "0.2rem 0.9rem",
  borderRadius: "999px",
  background: palette.white,
  border: `2px solid ${palette.ink}`,
  fontSize: "0.8rem",
  fontWeight: 800,
});

const ideaStyle = css({ padding: "2rem 1.75rem" });

const nowStyle = css({
  padding: "0.75rem 0.9rem",
  borderRadius: "0.75rem",
  background: palette.chrome,
  fontSize: "0.875rem",
  color: "#2e2a47",
});

const ctaSectionStyle = css({ paddingBlock: "3rem 6rem" });
