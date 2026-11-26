/** Styles shared by the play islands (the same look as the `/wasm` demo). */

import { css } from "@remix-run/component";

import { color, font, radius } from "../tokens.ts";

export const rootStyle = css({ display: "grid", gap: "1rem" });

export const panelStyle = css({
  padding: "1rem 1.25rem",
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  background: color.card,
  "& > h2": { marginTop: 0, fontSize: "1.1rem" },
});

export const rowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem",
  marginBlock: "0.75rem",
});

const baseButton = {
  font: "inherit",
  cursor: "pointer",
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.fg,
  "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
};

export const buttonStyle = css({
  ...baseButton,
  padding: "0.3rem 0.7rem",
  fontSize: "0.9rem",
  "&[aria-pressed=true]": {
    border: `1px solid ${color.accent}`,
    background: color.accent,
    color: color.onAccent,
  },
});

export const tinyButtonStyle = css({
  ...baseButton,
  width: "1.8rem",
  height: "1.8rem",
  padding: 0,
});

export const primaryButtonStyle = css({
  ...baseButton,
  padding: "0.5rem 1rem",
  fontWeight: 600,
  border: `1px solid ${color.accent}`,
  background: color.accent,
  color: color.onAccent,
});

export const inputStyle = css({
  font: "inherit",
  padding: "0.4rem 0.6rem",
  borderRadius: radius.sm,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.fg,
  minWidth: "12rem",
});

export const mutedStyle = css({ color: color.muted, fontSize: "0.9rem" });

export const errorStyle = css({
  margin: 0,
  padding: "0.6rem 1rem",
  borderRadius: radius.md,
  border: "1px solid #d33",
  color: "#d33",
});

export const badgeStyle = css({
  display: "inline-block",
  padding: "0.1rem 0.6rem",
  borderRadius: "999px",
  background: color.accent,
  color: color.onAccent,
  fontSize: "0.9rem",
});

export const tableStyle = css({
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.95rem",
  "& th, & td": {
    textAlign: "left",
    padding: "0.35rem 0.5rem",
    borderBottom: `1px solid ${color.border}`,
    verticalAlign: "top",
  },
  "& tr[data-dead=true]": { color: color.muted },
});

export const codeBoxStyle = css({
  width: "100%",
  boxSizing: "border-box",
  fontFamily: font.mono,
  fontSize: "0.8rem",
  padding: "0.5rem",
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.fg,
  wordBreak: "break-all",
});

export const roleGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
  gap: "0.5rem",
});

export const roleCellStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  "& > span": { flex: 1 },
});

export const listStyle = css({
  margin: 0,
  paddingLeft: "1.2rem",
  "& > li": { marginBlock: "0.2rem" },
});
