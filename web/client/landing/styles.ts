/**
 * The look of the landing pages (`/`, `/friends`, `/ai`, `/dev`): bright, rounded, ink on paper.
 *
 * These pages do not use the site's tokens (`../tokens.ts`) for their own colours, on purpose. The
 * tokens swap between a light and a dark palette; the landing pages are one light palette, and they
 * say so with `color-scheme: light`. What they show of the real app — the `/play` screens on
 * `/friends` — keeps the site's tokens, because it is the app's own styling (`../play/styles.ts`).
 *
 * The palette is here once, as `palette`, and every mixin below reads it.
 */

import { css } from "@remix-run/component";

export const palette = {
  /** The page. */
  paper: "#fffaf0",
  /** Text, borders and the hard drop shadows. */
  ink: "#1f1a3d",
  /** Body copy on paper or on a colour (7:1 or better on all of them). */
  sub: "#3a3550",
  /** Quieter copy on paper. */
  quiet: "#4a4566",
  /** On the ink band. */
  onInk: "#e4e1f5",
  /** A browser frame's title bar. */
  chrome: "#f3efe4",
  /** 友達と遊ぶ */
  yellow: "#ffd23f",
  /** AI で遊ぶ */
  lilac: "#c9b8ff",
  /** 開発者の方 */
  mint: "#7be0c3",
  /** An aside's shadow. */
  coral: "#ff8a65",
  white: "#ffffff",
} as const;

/** The Google Fonts stylesheet the landing pages link (see `LandingPage`'s callers). */
export const landingFonts =
  "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&display=swap";

const fontFamily =
  "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', sans-serif";

/** The whole page: paper, ink, the rounded face. */
export const pageStyle = css({
  colorScheme: "light",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: palette.paper,
  color: palette.ink,
  fontFamily,
  lineHeight: 1.7,
  "& :focus-visible": {
    outline: `3px solid ${palette.ink}`,
    outlineOffset: "3px",
  },
});

/** The measure every band lines up to. */
export const wrapStyle = css({
  width: "100%",
  maxWidth: "72rem",
  marginInline: "auto",
  paddingInline: "1.5rem",
});

/** A section's heading. */
export const h2Style = css({
  margin: 0,
  fontSize: "clamp(1.6rem, 3.5vw, 2rem)",
  lineHeight: 1.3,
  fontWeight: 800,
});

/** Body copy a size up, in the quieter ink. */
export const leadStyle = css({
  margin: 0,
  fontSize: "1.05rem",
  color: palette.sub,
});

/** A coloured hero band under the header, for the three inner pages. */
export const heroBandStyle = (background: string) =>
  css({
    background,
    borderBottom: `2px solid ${palette.ink}`,
    "& > div": {
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
      paddingBlock: "4rem",
    },
    "& h1": {
      margin: 0,
      fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
      lineHeight: 1.25,
      fontWeight: 800,
    },
    "& p": {
      margin: 0,
      maxWidth: "38rem",
      fontSize: "1.05rem",
      color: "#2e2a47",
    },
  });

/** The small spaced label above a heading. */
export const eyebrowStyle = css({
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
});

/** A white card with an ink border; `raised` adds the hard drop shadow. */
export const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  padding: "1.75rem",
  background: palette.white,
  border: `2px solid ${palette.ink}`,
  borderRadius: "1.5rem",
  "& h3": { margin: 0, fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.4 },
  "& p": { margin: 0, fontSize: "0.95rem", color: palette.sub },
});

export const raisedStyle = (shadow: string = palette.ink) =>
  css({ boxShadow: `6px 6px 0 ${shadow}` });

/** A row of cards that wraps to a column on a phone. */
export const cardRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1.5rem",
  "& > *": { flex: "1 1 18rem", minWidth: 0 },
});

/** A pill-shaped link that looks like a button. */
export const pillStyle = (
  background: string,
  color: string,
  border = background,
) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    minHeight: "3.25rem",
    paddingInline: "1.6rem",
    borderRadius: "999px",
    border: `2px solid ${border}`,
    background,
    color,
    fontWeight: 800,
    fontSize: "1rem",
    textDecoration: "none",
    transition: "transform 120ms ease",
    "&:hover": { transform: "translateY(-2px)" },
    "&:active": { transform: "translateY(1px)" },
  });

/** The ink band that closes each page with what to do next. */
export const ctaBandStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1.25rem 2rem",
  padding: "2.25rem",
  background: palette.ink,
  color: palette.white,
  borderRadius: "1.75rem",
  "& > div:first-child": {
    flex: "1 1 20rem",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  "& h2": { margin: 0, fontSize: "1.65rem", fontWeight: 800 },
  "& p": { margin: 0, fontSize: "0.95rem", color: palette.onInk },
  "& > div:last-child": { display: "flex", flexWrap: "wrap", gap: "0.75rem" },
});

/** Vertical rhythm between a page's sections. */
export const sectionStyle = css({
  paddingBlock: "4rem 1.5rem",
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
});
