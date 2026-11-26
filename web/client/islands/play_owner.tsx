/**
 * The room owner's page (`#room=…&key=…`): the link to hand out, who has joined and who has acted
 * today, and the one button that moves the game: start, then end each day. The owner sees no
 * roles until the game is over — they may well be a player too.
 */

import { clientEntry, type Handle, on } from "@remix-run/component";

import type { OwnerView } from "../play/types.ts";
import { absolute, api, fragment, links } from "../play/api.ts";
import {
  CAUSE_LABEL,
  dayLabel,
  PHASE_LABEL,
  ROLE_LABEL,
  rolesSummary,
  TEAM_LABEL,
} from "../play/labels.ts";
import { copy, poll } from "../play/poll.ts";
import {
  badgeStyle,
  buttonStyle,
  codeBoxStyle,
  errorStyle,
  mutedStyle,
  panelStyle,
  primaryButtonStyle,
  rootStyle,
  rowStyle,
  tableStyle,
} from "../play/styles.ts";

export const PlayOwner = clientEntry(
  import.meta.url,
  function PlayOwner(handle: Handle) {
    let room = "", key = "";
    let view: OwnerView | null = null;
    let error: string | null = null;
    let busy = false;
    let copied = false;

    poll(handle, async () => {
      if (!room) {
        const f = fragment();
        room = f.get("room") ?? "";
        key = f.get("key") ?? "";
      }
      if (!room || !key) {
        error = "このページのリンクに部屋 ID と鍵がありません。";
        handle.update();
        return;
      }
      try {
        const next = await api.owner(room, key);
        if (next.rev !== view?.rev) {
          view = next;
          error = null;
          handle.update();
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        handle.update();
      }
    });

    const go = async () => {
      busy = true;
      handle.update();
      try {
        view = await api.go(room, key);
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      busy = false;
      handle.update();
    };

    return () => {
      if (!view) {
        return (
          <div mix={rootStyle}>
            {error
              ? <p mix={errorStyle}>{error}</p>
              : <p mix={mutedStyle}>読み込み中…</p>}
          </div>
        );
      }
      const v = view;
      const joinUrl = absolute(links.join(v.roomId));
      const full = v.players.length === v.roles.length;
      const goLabel = v.phase === "lobby"
        ? full
          ? "ゲームを始める（役職を配る）"
          : `参加者を待っています（${v.players.length}/${v.roles.length}）`
        : `${dayLabel(v.dayNumber!)}を終えて次へ`;
      return (
        <div mix={rootStyle}>
          <section mix={panelStyle}>
            <h2>
              部屋 {v.roomId}{" "}
              <span mix={badgeStyle}>
                {v.phase === "over"
                  ? `${TEAM_LABEL[v.winner!]}陣営の勝ち`
                  : PHASE_LABEL[v.phase]}
              </span>
            </h2>
            <p>
              役職: {rolesSummary(v.roles)}（投票は{v.rule.vote.tag === "public"
                ? "公開"
                : "非公開"}）
              {v.dayNumber !== undefined && <>／ 今は {dayLabel(v.dayNumber)}
              </>}
            </p>
            {v.phase === "lobby" && (
              <>
                <p>参加用のリンク（みんなに送ってください）:</p>
                <input readOnly value={joinUrl} mix={codeBoxStyle} />
                <div mix={rowStyle}>
                  <button
                    type="button"
                    mix={[
                      buttonStyle,
                      on("click", async () => {
                        copied = await copy(joinUrl);
                        handle.update();
                      }),
                    ]}
                  >
                    {copied ? "コピーしました" : "リンクをコピー"}
                  </button>
                  <a href={links.join(v.roomId)}>自分も参加する →</a>
                </div>
              </>
            )}
            {v.phase !== "over" && (
              <div mix={rowStyle}>
                <button
                  type="button"
                  disabled={busy || (v.phase === "lobby" && !full)}
                  mix={[primaryButtonStyle, on("click", go)]}
                >
                  {goLabel}
                </button>
                {v.phase === "playing" && (
                  <span mix={mutedStyle}>
                    提出済み {v.submitted.length}{" "}
                    人。押した時点の行動で一日が終わります。
                  </span>
                )}
              </div>
            )}
            {error && <p mix={errorStyle}>{error}</p>}
          </section>

          <section mix={panelStyle}>
            <h2>参加者</h2>
            {v.players.length === 0
              ? <p mix={mutedStyle}>まだ誰もいません。</p>
              : (
                <table mix={tableStyle}>
                  <thead>
                    <tr>
                      <th>名前</th>
                      <th>状態</th>
                      {v.phase === "playing" && <th>今日の行動</th>}
                      {v.phase === "over" && <th>役職</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {v.players.map((p) => (
                      <tr data-dead={p.alive === false ? "true" : "false"}>
                        <td>{p.name}</td>
                        <td>
                          {p.alive === undefined
                            ? "参加済み"
                            : p.alive
                            ? "生存"
                            : `死亡（${CAUSE_LABEL[p.causeOfDeath!]}）`}
                        </td>
                        {v.phase === "playing" && (
                          <td>
                            {v.submitted.includes(p.playId) ? "提出済み" : "—"}
                          </td>
                        )}
                        {v.phase === "over" && (
                          <td>{p.role ? ROLE_LABEL[p.role] : ""}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </section>
        </div>
      );
    };
  },
);
