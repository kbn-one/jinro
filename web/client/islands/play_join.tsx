/** Join a room (`#room=…`): pick a name, get a play id and key, and go to your own page. */

import { clientEntry, type Handle, on, ref } from "@remix-run/component";

import type { RoomView } from "../play/types.ts";
import { api, fragment, links, remember } from "../play/api.ts";
import { PHASE_LABEL, rolesSummary } from "../play/labels.ts";
import {
  errorStyle,
  inputStyle,
  mutedStyle,
  panelStyle,
  primaryButtonStyle,
  rootStyle,
  rowStyle,
} from "../play/styles.ts";

export const PlayJoin = clientEntry(
  import.meta.url,
  function PlayJoin(handle: Handle) {
    let room = "";
    let view: RoomView | null = null;
    let error: string | null = null;
    let busy = false;
    let nameInput: HTMLInputElement | null = null;

    handle.queueTask(async () => {
      room = fragment().get("room") ?? "";
      if (!room) {
        error = "このページのリンクに部屋 ID がありません。";
      } else {
        try {
          view = await api.show(room);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }
      handle.update();
    });

    const join = async () => {
      const name = nameInput?.value.trim() ?? "";
      if (!name) return;
      busy = true;
      error = null;
      handle.update();
      try {
        const { playId, playKey } = await api.join(room, name);
        remember({ kind: "player", room, play: playId, key: playKey, name });
        location.href = links.me(room, playId, playKey);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        busy = false;
        handle.update();
      }
    };

    return () => (
      <div mix={rootStyle}>
        {view && (
          <section mix={panelStyle}>
            <h2>部屋 {view.roomId} に参加する</h2>
            <p>
              {PHASE_LABEL[view.phase]}（{view.players.length}/{view.roles
                .length} 人） ／ 役職: {rolesSummary(view.roles)}
            </p>
            {view.players.length > 0 && (
              <p mix={mutedStyle}>
                参加者: {view.players.map((p) => p.name).join("、")}
              </p>
            )}
            {view.phase === "lobby" && view.players.length < view.roles.length
              ? (
                <form
                  mix={on("submit", (e) => {
                    e.preventDefault();
                    join();
                  })}
                >
                  <div mix={rowStyle}>
                    <input
                      name="name"
                      placeholder="名前"
                      maxLength={40}
                      required
                      defaultValue=""
                      mix={[
                        inputStyle,
                        ref((n) => (nameInput = n as HTMLInputElement)),
                      ]}
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      mix={primaryButtonStyle}
                    >
                      参加する
                    </button>
                  </div>
                </form>
              )
              : <p mix={mutedStyle}>この部屋にはもう参加できません。</p>}
          </section>
        )}
        {error && <p mix={errorStyle}>{error}</p>}
        {!view && !error && <p mix={mutedStyle}>読み込み中…</p>}
      </div>
    );
  },
);
