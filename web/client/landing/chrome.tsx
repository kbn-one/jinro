/**
 * The frame every landing page sits in: its own header and footer instead of the site shell's.
 *
 * The landing pages are `bare` (see `PageModule`), because the shell's 44rem column cannot hold
 * full-width colour bands. What the shell's nav reached is still reachable: the header links the
 * three paths, and the footer links the rest of the site, which is also what the static crawl
 * follows from `/`.
 */

import { css, type Handle, type RemixNode } from "@remix-run/component";

import { routes } from "../routes.ts";
import { pageStyle, palette, wrapStyle } from "./styles.ts";

export const RULE_URL = "https://jinro-rule.kbn.one/";
export const GITHUB_URL = "https://github.com/kbn-one/jinro";

export type LandingSection = "home" | "friends" | "ai" | "dev";

export interface LandingPageProps {
  current: LandingSection;
  children: RemixNode;
}

/**
 * Renders a landing page: header, the page, footer.
 *
 * @param handle Which page this is (for `aria-current`) and its body
 * @returns The page
 */
export function LandingPage(handle: Handle<LandingPageProps>) {
  return () => {
    const { current, children } = handle.props;
    const links: {
      id: LandingSection | "rule";
      label: string;
      href: string;
    }[] = [
      { id: "friends", label: "友達と遊ぶ", href: routes.friends.href() },
      { id: "ai", label: "AI で遊ぶ", href: routes.ai.href() },
      { id: "dev", label: "開発者の方", href: routes.dev.href() },
      { id: "rule", label: "ルール", href: RULE_URL },
    ];
    return (
      <div mix={pageStyle}>
        <header mix={headerStyle}>
          <nav aria-label="メイン" mix={[wrapStyle, navStyle]}>
            <a href={routes.home.href()} mix={brandStyle}>
              <Mascot size={34} />
              <span>jinro</span>
            </a>
            <div mix={navLinksStyle}>
              {links.map((l) => (
                <a
                  href={l.href}
                  aria-current={l.id === current ? "page" : undefined}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </nav>
        </header>
        <main mix={mainStyle}>{children}</main>
        <footer mix={footerStyle}>
          <div mix={[wrapStyle, footerInnerStyle]}>
            <strong>jinro</strong>
            <div>
              <a href={RULE_URL}>ルール</a>
              <a href={routes.play.index.href()}>部屋を作る</a>
              <a href={routes.wasm.href()}>wasm デモ</a>
              <a href={routes.blog.index.href()}>ブログ</a>
              <a href={routes.my.href()}>マイページ</a>
              <a href={GITHUB_URL}>GitHub</a>
            </div>
          </div>
        </footer>
      </div>
    );
  };
}

/** The yellow wolf face: the brand mark, and decoration wherever it appears. */
export function Mascot(handle: Handle<{ size: number; fill?: string }>) {
  return () => (
    <svg
      width={handle.props.size}
      height={handle.props.size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <circle
        cx="20"
        cy="20"
        r="18"
        fill={handle.props.fill ?? palette.yellow}
        stroke={palette.ink}
        strokeWidth="2.5"
      />
      <path
        d="M11 17l4-7 3 6M29 17l-4-7-3 6"
        fill="none"
        stroke={palette.ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="15" cy="21" r="2" fill={palette.ink} />
      <circle cx="25" cy="21" r="2" fill={palette.ink} />
      <path
        d="M16 27q4 3 8 0"
        fill="none"
        stroke={palette.ink}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A right arrow, for the end of a call to action. */
export function Arrow(_handle: Handle) {
  return () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// --- styles -----------------------------------------------------------------

const headerStyle = css({
  background: palette.paper,
  borderBottom: `2px solid ${palette.ink}`,
});

const navStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem 1.5rem",
  paddingBlock: "0.75rem",
});

const brandStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  minHeight: "2.75rem",
  color: palette.ink,
  textDecoration: "none",
  fontWeight: 800,
  fontSize: "1.5rem",
  letterSpacing: "0.02em",
});

const navLinksStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "0.25rem",
  "& a": {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "2.75rem",
    paddingInline: "0.9rem",
    borderRadius: "999px",
    color: palette.ink,
    fontWeight: 700,
    fontSize: "0.95rem",
    textDecoration: "none",
  },
  "& a:hover": { background: palette.chrome },
  "& a[aria-current=page]": { background: palette.ink, color: palette.white },
});

const mainStyle = css({ flex: 1 });

const footerStyle = css({
  borderTop: `2px solid ${palette.ink}`,
  fontSize: "0.875rem",
});

const footerInnerStyle = css({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.5rem 1.25rem",
  paddingBlock: "1.5rem",
  "& > div": { display: "flex", flexWrap: "wrap", gap: "0 1.25rem" },
  "& a": {
    color: palette.ink,
    paddingBlock: "0.6rem",
    display: "inline-block",
  },
});
