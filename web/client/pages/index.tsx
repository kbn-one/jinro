import { css, type Handle } from "@remix-run/component";

import { Arrow, LandingPage, Mascot, RULE_URL } from "../landing/chrome.tsx";
import {
  cardRowStyle,
  landingFonts,
  palette,
  pillStyle,
  raisedStyle,
  wrapStyle,
} from "../landing/styles.ts";
import { routes } from "../routes.ts";

export const title = "jinro — 人狼、はじめよう";
export const description =
  "ゲームマスター役を引き受ける人狼エンジン jinro。友達と遊ぶ、AI で遊ぶ、開発者として組み込む。";

/** No islands: the landing pages ship no JavaScript. */
export const hydrate = false;
/** Full-width bands; the header and footer are `LandingPage`'s. */
export const bare = true;
export const stylesheets = [landingFonts];

/** The three ways in. */
const choices = [
  {
    href: routes.friends.href(),
    color: palette.yellow,
    eyebrow: "いますぐ遊べる",
    title: "友達と遊ぶ",
    body:
      "部屋を作って URL を配るだけ。チャットはいつもの LINE やビデオ通話で。",
    more: "遊び方を見る",
    icon:
      "M17 24a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM33 25a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM5 40c1-8 6-12 12-12s11 4 12 12M28 40c.5-6 3-9 6-9 4 0 8 3 9 9",
  },
  {
    href: routes.ai.href(),
    color: palette.lilac,
    eyebrow: "構想中",
    title: "AI で遊ぶ",
    body: "自分の AI を村に送り込んだり、ほかの人の AI と対戦させたり。",
    more: "構想を見る",
    icon:
      "M16 14h16a7 7 0 0 1 7 7v10a7 7 0 0 1-7 7H16a7 7 0 0 1-7-7V21a7 7 0 0 1 7-7ZM24 6v8M18 25h.01M30 25h.01M19 31h10M4 24v6M44 24v6",
  },
  {
    href: routes.dev.href(),
    color: palette.mint,
    eyebrow: "エンジンを使う",
    title: "開発者の方",
    body: "純粋関数ふたつで人狼が回る。自分のアプリやボットに組み込めます。",
    more: "しくみを見る",
    icon: "M17 14L7 24l10 10M31 14l10 10-10 10M27 9l-6 30",
  },
];

export default function Home(_handle: Handle) {
  return () => (
    <LandingPage current="home">
      <section mix={[wrapStyle, heroStyle]}>
        <div aria-hidden="true" mix={mascotsStyle}>
          <Mascot size={64} fill={palette.mint} />
          <Mascot size={88} />
          <Mascot size={64} fill={palette.lilac} />
        </div>
        <h1>人狼、はじめよう。</h1>
        <p>
          jinro
          はゲームマスター役をまるごと引き受ける人狼エンジンです。役職を配り、夜の行動をさばき、勝ち負けを判定します。どう遊びますか？
        </p>
      </section>

      <section aria-label="遊び方を選ぶ" mix={[wrapStyle, choicesStyle]}>
        <div mix={cardRowStyle}>
          {choices.map((c) => (
            <a href={c.href} mix={[choiceStyle(c.color), raisedStyle()]}>
              <svg
                width="56"
                height="56"
                viewBox="0 0 48 48"
                fill="none"
                stroke={palette.ink}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={c.icon} />
              </svg>
              <span mix={eyebrow}>{c.eyebrow}</span>
              <span mix={choiceTitle}>{c.title}</span>
              <span mix={choiceBody}>{c.body}</span>
              <span mix={choiceMore}>
                {c.more}
                <Arrow />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section mix={[wrapStyle, ruleSectionStyle]}>
        <div mix={ruleBoxStyle}>
          <div>
            <h2>ルールと役職</h2>
            <p>
              村人・占師・霊媒師・ボディーガード・人狼・狂人・ハムスター・恋人・悪女。詳しいルールは別ページにまとめています。
            </p>
          </div>
          <a href={RULE_URL} mix={pillStyle(palette.ink, palette.white)}>
            ルールを読む
          </a>
        </div>
      </section>
    </LandingPage>
  );
}

const heroStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: "1.25rem",
  paddingBlock: "4.5rem 2.5rem",
  "& h1": {
    margin: 0,
    fontSize: "clamp(2.4rem, 6vw, 4rem)",
    lineHeight: 1.25,
    fontWeight: 800,
  },
  "& p": {
    margin: 0,
    maxWidth: "34rem",
    fontSize: "1.125rem",
    color: palette.quiet,
  },
});

const mascotsStyle = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "0.9rem",
});

const choicesStyle = css({ paddingBlock: "1rem 5.5rem" });

const choiceStyle = (background: string) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "0.9rem",
    padding: "2rem 1.75rem",
    background,
    color: palette.ink,
    border: `2px solid ${palette.ink}`,
    borderRadius: "1.5rem",
    textDecoration: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    "&:hover": {
      transform: "translate(-2px, -2px)",
      boxShadow: `8px 8px 0 ${palette.ink}`,
    },
  });

const eyebrow = css({
  fontSize: "0.8rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
});

const choiceTitle = css({
  fontSize: "1.75rem",
  fontWeight: 800,
  lineHeight: 1.3,
});

const choiceBody = css({ fontSize: "0.95rem", color: palette.sub });

const choiceMore = css({
  marginTop: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  fontWeight: 800,
});

const ruleSectionStyle = css({ paddingBottom: "5.5rem" });

const ruleBoxStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem 2rem",
  padding: "1.75rem 2rem",
  background: palette.white,
  border: `2px solid ${palette.ink}`,
  borderRadius: "1.5rem",
  "& > div": { flex: "1 1 20rem", minWidth: 0 },
  "& h2": { margin: "0 0 0.25rem", fontSize: "1.4rem", fontWeight: 800 },
  "& p": { margin: 0, fontSize: "0.95rem", color: palette.quiet },
});
