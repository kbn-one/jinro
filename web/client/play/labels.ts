/** Japanese names for the engine's words, shared by the demo and the play pages. */

import type { ActionType, CauseOfDeath, RoleType, Team } from "../jinro.ts";
import type { Phase, VisibleLog } from "./types.ts";

export const ROLES: readonly RoleType[] = [
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

export const ROLE_LABEL: Record<RoleType, string> = {
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

/** What each role does, in one line, for the player page. */
export const ROLE_HELP: Record<RoleType, string> = {
  villager: "特別な力はありません。昼の投票で人狼を探します。",
  seer: "毎晩ひとりを占い、人狼かどうかを知ります（0 日目の夜から）。",
  medium: "その日に処刑された人が人狼だったかを知ります。",
  bodyguard: "1 日目から毎晩ひとりを護衛し、人狼の襲撃から守ります。",
  wolf:
    "1 日目から毎晩ひとりを襲撃します。生き残った人狼が他の人数以上になれば勝ち。",
  madman: "人狼の味方です。噛む力はありませんが、占いや霊媒では人狼と出ます。",
  hamster:
    "噛まれても死にませんが、占われると死にます。最後まで生き残れば単独勝利。",
  lover:
    "1 日目にひとりに求婚し、恋人になります。恋人ふたりだけが生き残れば勝ち。",
  bitch: "恋人の一種。本当の求婚か偽の求婚かを選べます。",
};

export const TEAM_LABEL: Record<Team, string> = {
  villagers: "村",
  wolves: "人狼",
  hamsters: "ハムスター",
  lovers: "恋人",
};

export const ACTION_LABEL: Record<ActionType, string> = {
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
  prevote: "投票 (前の回)",
};

export const RESULT_LABEL: Record<string, string> = {
  dead: "死亡",
  guarded: "護衛成功",
  partnered: "恋人成立",
  wolf: "人狼",
  "non-wolf": "人狼ではない",
  survived: "生存",
};

export const CAUSE_LABEL: Record<CauseOfDeath, string> = {
  executed: "処刑",
  "found-dead": "無残な死体",
};

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: "参加者を待っています",
  playing: "ゲーム中",
  over: "ゲーム終了",
};

export const PRESETS: {
  label: string;
  counts: Partial<Record<RoleType, number>>;
}[] = [
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

/** `0 日目の夜` is the first night; every later day ends with a night. */
export const dayLabel = (day: number): string =>
  day === 0 ? "0 日目（最初の夜）" : `${day} 日目`;

/** How someone died, from the action type of a death log without an actor. */
const DEATH: Partial<Record<ActionType, string>> = {
  vote: "処刑された",
  unknown: "無残な死体で見つかった",
  bite: "人狼に噛まれて死んだ",
  "lovers-suicide": "恋人の後を追って死んだ",
  "hamster-curse": "占われて死んだ（呪殺）",
};

/** A log entry as a sentence. */
export function describeLog(log: VisibleLog): string {
  const after = log.receivers === "afterall" ? "（ゲーム後に公開）" : "";
  if (!log.actor && log.target && log.result === "dead") {
    return `${log.target.name} は${DEATH[log.actionType] ?? "死んだ"}${after}`;
  }
  const actor = log.actor ? `${log.actor.name} が ` : "";
  const target = log.target ? `${log.target.name} を` : "";
  const result = log.result ? ` → ${RESULT_LABEL[log.result]}` : "";
  return `${actor}${target}${ACTION_LABEL[log.actionType]}${result}${after}`;
}

/** Role counts, as "人狼 ×2, 村人 ×3". */
export function rolesSummary(roles: readonly RoleType[]): string {
  return ROLES.filter((r) => roles.includes(r))
    .map((r) => `${ROLE_LABEL[r]} ×${roles.filter((x) => x === r).length}`)
    .join("、");
}
