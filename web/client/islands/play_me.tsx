/**
 * A player's own page (`#room=…&play=…&key=…`): your role, what you may do today, what you have
 * been allowed to see — nothing about anyone else that the server did not put in your view.
 *
 * It polls the same view an agent reads (`GET /api/rooms/:roomId/players/:playId`), so whatever
 * an agent submits with this player's key shows up here on the next tick, and the other way
 * round. The "agent" panel has the instructions to hand an agent, with this seat's key in them.
 */

import { clientEntry, type Handle, on } from "@remix-run/component";

import type { ActionType } from "../jinro.ts";
import type { PlayerView, SubmittedAction } from "../play/types.ts";
import { absolute, api, fragment, links } from "../play/api.ts";
import { agentInstructions } from "../play/instructions.ts";
import {
  ACTION_LABEL,
  CAUSE_LABEL,
  dayLabel,
  describeLog,
  PHASE_LABEL,
  ROLE_HELP,
  ROLE_LABEL,
  rolesSummary,
  TEAM_LABEL,
} from "../play/labels.ts";
import { copy, poll } from "../play/poll.ts";
import { routes } from "../routes.ts";
import {
  badgeStyle,
  buttonStyle,
  codeBoxStyle,
  errorStyle,
  listStyle,
  mutedStyle,
  panelStyle,
  rootStyle,
  rowStyle,
  tableStyle,
} from "../play/styles.ts";

export const PlayMe = clientEntry(
  import.meta.url,
  function PlayMe(handle: Handle) {
    let room = "", play = "", key = "";
    let view: PlayerView | null = null;
    let error: string | null = null;
    let busy = false;
    let copied = false;

    poll(handle, async () => {
      if (!room) {
        const f = fragment();
        room = f.get("room") ?? "";
        play = f.get("play") ?? "";
        key = f.get("key") ?? "";
      }
      if (!room || !play || !key) {
        error = "このページのリンクに部屋 ID・プレイヤー ID・鍵がありません。";
        handle.update();
        return;
      }
      try {
        const next = await api.me(room, play, key);
        if (busy) return;
        if (JSON.stringify(next) !== JSON.stringify(view)) {
          view = next;
          error = null;
          handle.update();
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        handle.update();
      }
    });

    /** Picks (or, picked again, withdraws) `target` for `actionType`, keeping the other actions. */
    const choose = async (actionType: ActionType, target: string) => {
      if (!view) return;
      const others = view.you.submitted.filter((a) =>
        a.actionType !== actionType
      );
      const same = view.you.submitted.some((a) =>
        a.actionType === actionType && a.target === target
      );
      const next: SubmittedAction[] = same
        ? others
        : [...others, { actionType, target }];
      busy = true;
      handle.update();
      try {
        view = await api.act(room, play, key, next);
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      busy = false;
      handle.update();
    };

    const instructions = (v: PlayerView) =>
      agentInstructions({
        apiBase: absolute(routes.api.rooms.create.href()).replace(/\/$/, ""),
        roomId: room,
        playId: play,
        playKey: key,
        name: v.you.name,
        pageUrl: absolute(links.me(room, play, key)).split("#")[0],
      });

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
      const { room: r, you } = view;
      const days = [...new Set(you.logs.map((l) => l.day))].sort((a, b) =>
        b - a
      );
      return (
        <div mix={rootStyle}>
          <section mix={panelStyle}>
            <h2>
              {you.name}{" "}
              <span mix={badgeStyle}>
                {r.phase === "over"
                  ? `${TEAM_LABEL[r.winner!]}陣営の勝ち`
                  : PHASE_LABEL[r.phase]}
              </span>
            </h2>
            {you.role
              ? (
                <>
                  <p>
                    あなたは{" "}
                    <strong>{ROLE_LABEL[you.role]}
                    </strong>（{TEAM_LABEL[you.team!]}陣営）
                    {you.alive
                      ? "。生きています。"
                      : `。死亡しました（${CAUSE_LABEL[you.causeOfDeath!]}）。`}
                  </p>
                  <p mix={mutedStyle}>{ROLE_HELP[you.role]}</p>
                </>
              )
              : (
                <p mix={mutedStyle}>
                  全員が揃ってオーナーが始めると、役職が配られます（{r.players
                    .length}/{r.roles.length} 人、役職:{" "}
                  {rolesSummary(r.roles)}）。
                </p>
              )}
            {r.dayNumber !== undefined && (
              <p>今は {dayLabel(r.dayNumber)} です。</p>
            )}
          </section>

          {r.phase === "playing" && (
            <section mix={panelStyle}>
              <h2>今日の行動</h2>
              {you.choices.length === 0
                ? (
                  <p mix={mutedStyle}>
                    今日できることはありません。オーナーが次へ進めるのを待ちましょう。
                  </p>
                )
                : you.choices.map((c) => {
                  const picked = you.submitted.find((a) =>
                    a.actionType === c.actionType
                  )?.target;
                  return (
                    <div>
                      <strong>{ACTION_LABEL[c.actionType]}</strong>
                      <div mix={rowStyle}>
                        {c.targets.map((t) => (
                          <button
                            type="button"
                            disabled={busy}
                            aria-pressed={picked === t.playId
                              ? "true"
                              : "false"}
                            mix={[
                              buttonStyle,
                              on("click", () => choose(c.actionType, t.playId)),
                            ]}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              {you.choices.length > 0 && (
                <p mix={mutedStyle}>
                  選び直せます（同じ人をもう一度押すと取り消し）。オーナーが次へ進めた時点の選択で決まります。
                </p>
              )}
            </section>
          )}

          <section mix={panelStyle}>
            <h2>参加者</h2>
            <table mix={tableStyle}>
              <tbody>
                {r.players.map((p) => (
                  <tr data-dead={p.alive === false ? "true" : "false"}>
                    <td>{p.name}{p.playId === you.playId && "（あなた）"}</td>
                    <td>
                      {p.alive === undefined
                        ? "参加済み"
                        : p.alive
                        ? "生存"
                        : `死亡（${CAUSE_LABEL[p.causeOfDeath!]}）`}
                    </td>
                    {r.phase === "over" && (
                      <td>{p.role ? ROLE_LABEL[p.role] : ""}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section mix={panelStyle}>
            <h2>あなたに見える出来事</h2>
            {days.length === 0
              ? <p mix={mutedStyle}>まだありません。</p>
              : days.map((d) => (
                <div>
                  <h3>{dayLabel(d)}</h3>
                  <ul mix={listStyle}>
                    {you.logs.filter((l) => l.day === d).map((l) => (
                      <li>{describeLog(l)}</li>
                    ))}
                  </ul>
                </div>
              ))}
          </section>

          <section mix={panelStyle}>
            <h2>エージェントに任せる</h2>
            <p mix={mutedStyle}>
              この説明を AI エージェントに渡すと、API
              経由であなたの席で遊べます。エージェントの行動はこのページにも表示されます。
              説明にはあなたの鍵が入っているので、信頼できる相手にだけ渡してください。
            </p>
            <div mix={rowStyle}>
              <button
                type="button"
                mix={[
                  buttonStyle,
                  on("click", async () => {
                    copied = await copy(instructions(view!));
                    handle.update();
                  }),
                ]}
              >
                {copied ? "コピーしました" : "エージェント用の説明をコピー"}
              </button>
            </div>
            <details>
              <summary>説明を見る</summary>
              <textarea
                readOnly
                rows={14}
                mix={codeBoxStyle}
                value={instructions(view)}
              />
            </details>
          </section>
          {error && <p mix={errorStyle}>{error}</p>}
        </div>
      );
    };
  },
);
