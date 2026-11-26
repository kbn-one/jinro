/**
 * Create a room: choose the roles (one per player), get a room id and key, and go to the owner's
 * page. Also lists the rooms this browser has created or joined.
 */

import { clientEntry, type Handle, on } from "@remix-run/component";

import type { RoleType } from "../jinro.ts";
import {
  api,
  links,
  remember,
  type Saved,
  saved,
  savedHref,
} from "../play/api.ts";
import { PRESETS, ROLE_LABEL, ROLES, rolesSummary } from "../play/labels.ts";
import {
  buttonStyle,
  errorStyle,
  listStyle,
  mutedStyle,
  panelStyle,
  primaryButtonStyle,
  roleCellStyle,
  roleGridStyle,
  rootStyle,
  rowStyle,
  tinyButtonStyle,
} from "../play/styles.ts";

const fromPreset = (p: Partial<Record<RoleType, number>>) =>
  Object.fromEntries(ROLES.map((r) => [r, p[r] ?? 0])) as Record<
    RoleType,
    number
  >;

export const PlayCreate = clientEntry(
  import.meta.url,
  function PlayCreate(handle: Handle) {
    let counts = fromPreset(PRESETS[0].counts);
    let vote: "public" | "private" = "public";
    let busy = false;
    let error: string | null = null;
    let mine: Saved[] = [];

    handle.queueTask(() => {
      mine = saved();
      handle.update();
    });

    const create = async () => {
      const roles = ROLES.flatMap((r) =>
        Array.from({ length: counts[r] }, () => r)
      );
      busy = true;
      error = null;
      handle.update();
      try {
        const { roomId, roomKey } = await api.create({
          roles,
          rule: { vote: { tag: vote } },
        });
        remember({ kind: "owner", room: roomId, key: roomKey });
        location.href = links.owner(roomId, roomKey);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        busy = false;
        handle.update();
      }
    };

    return () => {
      const roles = ROLES.flatMap((r) =>
        Array.from({ length: counts[r] }, () => r)
      );
      return (
        <div mix={rootStyle}>
          <section mix={panelStyle}>
            <h2>部屋を作る</h2>
            <p mix={mutedStyle}>
              役職の数がそのまま参加人数になります。全員が揃ったら、オーナーの「始める」で役職が配られます。
            </p>
            <div mix={rowStyle}>
              {PRESETS.map((p) => (
                <button
                  type="button"
                  mix={[
                    buttonStyle,
                    on("click", () => {
                      counts = fromPreset(p.counts);
                      handle.update();
                    }),
                  ]}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div mix={roleGridStyle}>
              {ROLES.map((r) => (
                <div mix={roleCellStyle}>
                  <span>{ROLE_LABEL[r]}</span>
                  <button
                    type="button"
                    aria-label={`${ROLE_LABEL[r]}を減らす`}
                    disabled={counts[r] === 0}
                    mix={[
                      tinyButtonStyle,
                      on("click", () => {
                        counts = { ...counts, [r]: counts[r] - 1 };
                        handle.update();
                      }),
                    ]}
                  >
                    −
                  </button>
                  <strong>{counts[r]}</strong>
                  <button
                    type="button"
                    aria-label={`${ROLE_LABEL[r]}を増やす`}
                    mix={[
                      tinyButtonStyle,
                      on("click", () => {
                        counts = { ...counts, [r]: counts[r] + 1 };
                        handle.update();
                      }),
                    ]}
                  >
                    ＋
                  </button>
                </div>
              ))}
            </div>
            <div mix={rowStyle}>
              <span>投票:</span>
              {(["public", "private"] as const).map((v) => (
                <button
                  type="button"
                  aria-pressed={vote === v ? "true" : "false"}
                  mix={[
                    buttonStyle,
                    on("click", () => {
                      vote = v;
                      handle.update();
                    }),
                  ]}
                >
                  {v === "public" ? "公開" : "非公開"}
                </button>
              ))}
            </div>
            <div mix={rowStyle}>
              <button
                type="button"
                disabled={busy || roles.length === 0}
                mix={[primaryButtonStyle, on("click", create)]}
              >
                {roles.length} 人の部屋を作る
              </button>
              <span mix={mutedStyle}>{rolesSummary(roles)}</span>
            </div>
            {error && <p mix={errorStyle}>{error}</p>}
          </section>

          {mine.length > 0 && (
            <section mix={panelStyle}>
              <h2>このブラウザの部屋</h2>
              <ul mix={listStyle}>
                {mine.map((s) => (
                  <li>
                    <a href={savedHref(s)}>
                      {s.kind === "owner"
                        ? "オーナー"
                        : `プレイヤー「${s.name}」`}
                      ：部屋 {s.room}
                    </a>{" "}
                    <span mix={mutedStyle}>
                      {new Date(s.at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      );
    };
  },
);
