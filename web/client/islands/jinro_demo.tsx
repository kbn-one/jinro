/**
 * The jinro engine playground: build a village, pick everyone's actions, and step through days on
 * the real wasm component (`client/jinro.ts`).
 *
 * Everything runs in the browser. The server renders the empty shell; the engine is fetched and
 * instantiated on the client, in `queueTask`, which is client-only.
 */

import { clientEntry, css, type Handle, on, ref } from "@remix-run/component";

import {
  type Action,
  type ActionType,
  type DayResult,
  type Engine,
  errorMessage,
  loadEngine,
  type Log,
  type RoleType,
  type Team,
  type Today,
  type Village,
} from "../jinro.ts";
import { color, font, radius } from "../tokens.ts";

const ROLES: readonly RoleType[] = [
  "villager",
  "seer",
  "medium",
  "bodyguard",
  "wolf",
  "madman",
  "hamster",
  "lover",
  "bitch",
];

const ROLE_LABEL: Record<RoleType, string> = {
  villager: "村人",
  seer: "占師",
  medium: "霊媒師",
  bodyguard: "ボディーガード",
  wolf: "人狼",
  madman: "狂人",
  hamster: "ハムスター",
  lover: "恋人",
  bitch: "悪女",
};

const TEAM_LABEL: Record<Team, string> = {
  villagers: "村",
  wolves: "人狼",
  hamsters: "ハムスター",
  lovers: "恋人",
};

const ACTION_LABEL: Record<ActionType, string> = {
  vote: "投票",
  unknown: "不明",
  bite: "噛み",
  divine: "占い",
  medium: "霊媒",
  guard: "護衛",
  "hamster-curse": "呪殺",
  love: "求婚",
  "lovers-suicide": "後追い",
  "fake-love": "偽求婚",
};

const RESULT_LABEL: Record<string, string> = {
  dead: "死亡",
  guarded: "護衛成功",
  partnered: "恋人成立",
  wolf: "人狼",
  "non-wolf": "人狼ではない",
  survived: "生存",
};

const PRESETS: { label: string; counts: Partial<Record<RoleType, number>> }[] =
  [
    {
      label: "基本 7 人",
      counts: { villager: 3, seer: 1, medium: 1, bodyguard: 1, wolf: 1 },
    },
    {
      label: "狂人・ハムスター入り",
      counts: {
        villager: 3,
        seer: 1,
        bodyguard: 1,
        wolf: 2,
        madman: 1,
        hamster: 1,
      },
    },
    {
      label: "恋人入り",
      counts: { villager: 2, seer: 1, wolf: 1, lover: 1, bitch: 1 },
    },
    { label: "最小 3 人", counts: { villager: 1, seer: 1, wolf: 1 } },
  ];

type Viewer = "public" | "god" | string;

export const JinroDemo = clientEntry(
  import.meta.url,
  function JinroDemo(handle: Handle) {
    let engine: Engine | null = null;
    let loadError: string | null = null;

    let counts: Record<RoleType, number> = fromPreset(PRESETS[0].counts);
    let village: Village | null = null;
    let today: Today | null = null;
    let results: DayResult[] = [];
    let error: string | null = null;
    let viewer: Viewer = "god";
    /** Chosen target per `${actor}|${actionType}`; cleared every day. */
    let choices = new Map<string, string>();
    let jsonInput: HTMLTextAreaElement | null = null;
    let lastCall: { fn: string; input: unknown; output: unknown } | null = null;

    handle.queueTask(async () => {
      try {
        engine = await loadEngine();
      } catch (e) {
        loadError = errorMessage(e);
      }
      handle.update();
    });

    const create = () => {
      if (!engine) return;
      const roles = ROLES.flatMap((r) =>
        Array.from({ length: counts[r] }, () => ({ roleType: r, opts: [] }))
      );
      const rule = { vote: { tag: "public" as const } };
      try {
        const [v, t] = engine.createVillage(roles, rule);
        village = v;
        today = t;
        results = [];
        error = null;
        choices = new Map();
        lastCall = {
          fn: "createVillage",
          input: { roles, rule },
          output: [v, t],
        };
      } catch (e) {
        error = errorMessage(e);
      }
      handle.update();
    };

    const chosenActions = (): Action[] => {
      const out: Action[] = [];
      for (const [key, target] of choices) {
        if (!target) continue;
        const [actor, actionType] = key.split("|");
        out.push({ actor, actionType: actionType as ActionType, target });
      }
      return out;
    };

    const step = (actions: Action[]) => {
      if (!engine || !village) return;
      try {
        const [r, v, t] = engine.processDay(village, actions);
        lastCall = { fn: "processDay", input: { actions }, output: [r, v, t] };
        village = v;
        today = t;
        results = [...results, r];
        error = null;
        choices = new Map();
      } catch (e) {
        error = errorMessage(e);
      }
      handle.update();
    };

    const stepFromJson = () => {
      if (!jsonInput) return;
      let actions: Action[];
      try {
        actions = JSON.parse(jsonInput.value);
      } catch (e) {
        error = `JSON が読めません: ${errorMessage(e)}`;
        handle.update();
        return;
      }
      step(actions);
    };

    const fillJson = () => {
      if (jsonInput) jsonInput.value = JSON.stringify(chosenActions(), null, 2);
    };

    const roleOf = (id: string | undefined): string => {
      if (!id || !village) return id ?? "—";
      const c = village.creatures.find((c) => c.id === id);
      return c ? `${id} (${ROLE_LABEL[c.role.roleType]})` : id;
    };

    const visible = (log: Log): boolean => {
      if (viewer === "god") return true;
      if (viewer === "public") return log.receivers.tag === "all";
      const s = today?.creatureStatuses.find((s) => s.id === viewer);
      return s ? s.logIds.includes(log.id) : false;
    };

    const describe = (log: Log): string => {
      const head = log.actor ? `${roleOf(log.actor)} → ` : "";
      const target = log.target ? roleOf(log.target) : "";
      const result = log.logResult
        ? `：${RESULT_LABEL[log.logResult.tag]}`
        : "";
      return `${head}${ACTION_LABEL[log.actionType]} ${target}${result}`;
    };

    const receiversLabel = (log: Log): string =>
      log.receivers.tag === "all"
        ? "全員"
        : log.receivers.tag === "afterall"
        ? "ゲーム後"
        : log.receivers.val.join(", ");

    return () => {
      const total = ROLES.reduce((n, r) => n + counts[r], 0);
      return (
        <div mix={rootStyle}>
          <section mix={panelStyle}>
            <h2>1. 村を作る (createVillage)</h2>
            <div mix={rowStyle}>
              {PRESETS.map((p) => (
                <button
                  type="button"
                  mix={[
                    smallButtonStyle,
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
                    mix={[
                      tinyButtonStyle,
                      on("click", () => {
                        counts = { ...counts, [r]: Math.max(0, counts[r] - 1) };
                        handle.update();
                      }),
                    ]}
                  >
                    −
                  </button>
                  <output mix={countStyle}>{counts[r]}</output>
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
                    +
                  </button>
                </div>
              ))}
            </div>
            <div mix={rowStyle}>
              <button
                type="button"
                disabled={!engine || total === 0}
                mix={[primaryButtonStyle, on("click", create)]}
              >
                {village ? "作り直す" : "村を作る"}（{total} 人）
              </button>
              <span mix={mutedStyle}>
                {loadError
                  ? `wasm の読み込みに失敗: ${loadError}`
                  : engine
                  ? "wasm 読み込み済み"
                  : "wasm を読み込み中…"}
              </span>
            </div>
          </section>

          {error && <p role="alert" mix={errorStyle}>エラー: {error}</p>}

          {village && today && (
            <>
              <section mix={panelStyle}>
                <h2>
                  2. {today.dayNumber} 日目の行動 (processDay)
                  {today.winner && (
                    <span mix={winnerStyle}>
                      勝者: {TEAM_LABEL[today.winner]}陣営
                    </span>
                  )}
                </h2>
                <table mix={tableStyle} key={`day-${village.days.length}`}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>役職</th>
                      <th>陣営</th>
                      <th>状態</th>
                      <th>できる行動</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today.creatureStatuses.map((s) => (
                      <tr data-dead={s.causeOfDeath ? "true" : "false"}>
                        <td>
                          <code>{s.id}</code>
                        </td>
                        <td>{ROLE_LABEL[s.roleType]}</td>
                        <td>{TEAM_LABEL[s.team]}</td>
                        <td>
                          {s.causeOfDeath === "executed"
                            ? "処刑"
                            : s.causeOfDeath === "found-dead"
                            ? "死体で発見"
                            : "生存"}
                        </td>
                        <td>
                          {s.availableActions.length === 0
                            ? <span mix={mutedStyle}>なし</span>
                            : s.availableActions.map((a) => (
                              <label mix={actionStyle}>
                                {ACTION_LABEL[a.actionType]}
                                <select
                                  mix={[
                                    selectStyle,
                                    on("change", (e) => {
                                      choices.set(
                                        `${s.id}|${a.actionType}`,
                                        (e.currentTarget as HTMLSelectElement)
                                          .value,
                                      );
                                    }),
                                  ]}
                                >
                                  <option value="">（しない）</option>
                                  {a.targets.map((t) => (
                                    <option value={t}>{roleOf(t)}</option>
                                  ))}
                                </select>
                              </label>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div mix={rowStyle}>
                  <button
                    type="button"
                    disabled={!!today.winner}
                    mix={[
                      primaryButtonStyle,
                      on("click", () => step(chosenActions())),
                    ]}
                  >
                    この行動で 1 日進める
                  </button>
                </div>
              </section>

              <section mix={panelStyle}>
                <h2>3. 任意のアクションを JSON で渡す</h2>
                <p mix={mutedStyle}>
                  <code>Action[]</code> をそのまま <code>processDay</code>{" "}
                  に渡します。死者や存在しない ID、役職に無い行動など、UI
                  では選べない入力も試せます。
                </p>
                <textarea
                  rows={6}
                  spellcheck={false}
                  mix={[
                    textareaStyle,
                    ref((node) => {
                      jsonInput = node as HTMLTextAreaElement;
                    }),
                  ]}
                  defaultValue="[]"
                />
                <div mix={rowStyle}>
                  <button
                    type="button"
                    mix={[smallButtonStyle, on("click", fillJson)]}
                  >
                    上の選択を JSON に
                  </button>
                  <button
                    type="button"
                    mix={[primaryButtonStyle, on("click", stepFromJson)]}
                  >
                    JSON で 1 日進める
                  </button>
                </div>
              </section>

              <section mix={panelStyle}>
                <h2>4. ログ</h2>
                <div mix={rowStyle}>
                  <span>見る人:</span>
                  <select
                    mix={[
                      selectStyle,
                      on("change", (e) => {
                        viewer = (e.currentTarget as HTMLSelectElement).value;
                        handle.update();
                      }),
                    ]}
                  >
                    <option value="god">すべて（神視点）</option>
                    <option value="public">全員に公開のログだけ</option>
                    {village.creatures.map((c) => (
                      <option value={c.id}>{roleOf(c.id)} に見えるログ</option>
                    ))}
                  </select>
                </div>
                {village.days.length === 0
                  ? <p mix={mutedStyle}>まだ 1 日も進めていません。</p>
                  : village.days.map((d, i) => {
                    const logs = d.logs.filter(visible);
                    const r = results[i];
                    return (
                      <div mix={dayStyle}>
                        <h3>{d.dayNumber} 日目</h3>
                        {r && (
                          <p mix={mutedStyle}>
                            処刑: {r.voted ? roleOf(r.voted) : "なし"} ／ 死者:
                            {" "}
                            {r.deads.length
                              ? r.deads.map(roleOf).join(", ")
                              : "なし"}
                          </p>
                        )}
                        {logs.length === 0
                          ? <p mix={mutedStyle}>見えるログはありません。</p>
                          : (
                            <ul mix={logListStyle}>
                              {logs.map((l) => (
                                <li>
                                  <code mix={logIdStyle}>{l.id}</code>{" "}
                                  {describe(l)}
                                  <span mix={receiversStyle}>
                                    [{receiversLabel(l)}]
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                    );
                  })}
              </section>
            </>
          )}

          {lastCall && (
            <section mix={panelStyle}>
              <h2>
                最後の呼び出し: <code>{lastCall.fn}</code>
              </h2>
              <details>
                <summary>入力</summary>
                <pre
                  mix={preStyle}
                >{JSON.stringify(lastCall.input, null, 2)}</pre>
              </details>
              <details>
                <summary>出力</summary>
                <pre
                  mix={preStyle}
                >{JSON.stringify(lastCall.output, null, 2)}</pre>
              </details>
            </section>
          )}
        </div>
      );
    };
  },
);

function fromPreset(
  p: Partial<Record<RoleType, number>>,
): Record<RoleType, number> {
  return Object.fromEntries(ROLES.map((r) => [r, p[r] ?? 0])) as Record<
    RoleType,
    number
  >;
}

const rootStyle = css({ display: "grid", gap: "1rem" });

const panelStyle = css({
  padding: "1rem 1.25rem",
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  background: color.card,
  "& > h2": { marginTop: 0, fontSize: "1.1rem" },
});

const rowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem",
  marginBlock: "0.75rem",
});

const roleGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
  gap: "0.5rem",
});

const roleCellStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  "& > span": { flex: 1 },
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

const smallButtonStyle = css({
  ...baseButton,
  padding: "0.3rem 0.7rem",
  fontSize: "0.9rem",
});

const tinyButtonStyle = css({
  ...baseButton,
  width: "1.8rem",
  height: "1.8rem",
  padding: 0,
});

const primaryButtonStyle = css({
  ...baseButton,
  padding: "0.5rem 1rem",
  fontWeight: 600,
  border: `1px solid ${color.accent}`,
  background: color.accent,
  color: color.onAccent,
});

const countStyle = css({
  minWidth: "2ch",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
});

const mutedStyle = css({ color: color.muted, fontSize: "0.9rem" });

const errorStyle = css({
  margin: 0,
  padding: "0.6rem 1rem",
  borderRadius: radius.md,
  border: "1px solid #d33",
  color: "#d33",
});

const winnerStyle = css({
  marginLeft: "0.75rem",
  padding: "0.1rem 0.6rem",
  borderRadius: "999px",
  background: color.accent,
  color: color.onAccent,
  fontSize: "0.9rem",
});

const tableStyle = css({
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
  "& th, & td:not(:last-child)": { whiteSpace: "nowrap" },
});

const actionStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  marginRight: "0.75rem",
});

const selectStyle = css({
  font: "inherit",
  padding: "0.2rem 0.3rem",
  borderRadius: radius.sm,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.fg,
});

const textareaStyle = css({
  width: "100%",
  boxSizing: "border-box",
  fontFamily: font.mono,
  fontSize: "0.85rem",
  padding: "0.5rem",
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.fg,
});

const dayStyle = css({ "& > h3": { marginBottom: "0.25rem" } });

const logListStyle = css({
  paddingLeft: "1.1rem",
  "& li": { marginBlock: "0.25rem" },
});

const logIdStyle = css({ color: color.muted, fontSize: "0.8rem" });

const receiversStyle = css({
  marginLeft: "0.5rem",
  color: color.muted,
  fontSize: "0.8rem",
});

const preStyle = css({
  maxHeight: "24rem",
  overflow: "auto",
  fontSize: "0.8rem",
  fontFamily: font.mono,
});
