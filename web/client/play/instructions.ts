/**
 * The text a player copies from their page to hand to an AI agent, so that the agent can play in
 * their seat through the API. Everything the agent needs is in it: the endpoints with this
 * player's ids filled in, what the JSON means, how a day goes, and the rules in brief. What the
 * agent does shows up on the player's page, since both read the same room.
 */

import { ACTION_LABEL, ROLE_HELP, ROLE_LABEL, ROLES } from "./labels.ts";

export interface InstructionsInput {
  /** The API's origin and path prefix, e.g. `https://example.com/api/rooms`. */
  apiBase: string;
  roomId: string;
  playId: string;
  playKey: string;
  name: string;
  /** The player's own page, where a human can watch. */
  pageUrl: string;
}

export function agentInstructions(i: InstructionsInput): string {
  const me = `${i.apiBase}/${i.roomId}/players/${i.playId}`;
  const auth = `Authorization: Bearer ${i.playKey}`;
  const roles = ROLES.map((r) => `- ${r}（${ROLE_LABEL[r]}）: ${ROLE_HELP[r]}`)
    .join("\n");
  const actions =
    (["vote", "divine", "guard", "bite", "love", "fake-love"] as const)
      .map((a) => `\`${a}\`（${ACTION_LABEL[a]}）`).join("、");
  return `# 人狼ゲームのプレイヤーとして参加してください

あなたは人狼ゲーム（jinro）の部屋 \`${i.roomId}\` で、プレイヤー「${i.name}」として遊びます。
操作はすべて HTTP API で行います。あなたの行動は ${i.pageUrl} にも表示されます。

## 認証

すべてのリクエストに次のヘッダを付けてください。この鍵はあなたの席そのものなので、誰にも見せないでください。

\`\`\`
${auth}
\`\`\`

## 状況を見る

\`\`\`sh
curl -s '${me}' -H '${auth}'
\`\`\`

返る JSON:

- \`room.phase\`: \`lobby\`（開始待ち）/ \`playing\`（ゲーム中）/ \`over\`（終了）
- \`room.dayNumber\`: 今が何日目か。0 は最初の夜です。
- \`room.players\`: 全員の \`playId\`、\`name\`、\`alive\`、\`causeOfDeath\`。終了後は \`role\` も入ります。
- \`room.winner\`: 勝った陣営（終了後のみ）
- \`you.role\` / \`you.team\` / \`you.alive\`: あなたの役職、陣営、生死
- \`you.choices\`: 今日あなたができる行動。\`{ actionType, targets: [{ playId, name }] }\` の配列で、空ならできることはありません。
- \`you.submitted\`: 今日あなたが提出済みの行動
- \`you.logs\`: あなたが見てよい出来事（投票、占い結果、死亡など）。\`day\`、\`actionType\`、\`actor\`、\`target\`、\`result\` を持ちます。

## 行動する

\`\`\`sh
curl -s -X PUT '${me}/actions' -H '${auth}' -H 'content-type: application/json' \\
  -d '{"actions":[{"actionType":"vote","target":"<playId>"}]}'
\`\`\`

- \`actions\` は今日の行動の**全部**です。送るたびに前の提出を置き換えます。\`[]\` で取り消し。
- \`actionType\` と \`target\` は、必ず \`you.choices\` にある組み合わせから選んでください。それ以外は 400 で断られます。
- 行動の種類: ${actions}

## 一日の流れ

時間制限はありません。部屋のオーナーが「次へ」を押すと、その時点で提出されている行動で一日が終わり、結果が出て次の日になります。

1. 数秒〜十数秒おきに状況を見て、\`room.dayNumber\` が変わったら新しい \`you.logs\` を読みます。
2. \`you.choices\` があれば考えて行動を提出します。
3. \`room.phase\` が \`over\` になったら終わりです。\`room.winner\` と全員の役職を見て、感想を伝えてください。

0 日目の夜に行動できるのは占師だけです。1 日目からは生きている全員が投票でき、最多票の人が処刑されます（同数なら処刑なし）。死んだ人は行動できません。

## 役職

${roles}

## 勝利条件

- 人狼が全滅したら村の勝ち（恋人ふたりだけが残っていれば恋人の勝ち）。
- 生き残った人狼が他の人数以上になったら人狼と狂人の勝ち。
- どちらで終わっても、ハムスターが生きていればハムスターの勝ち。

## 心得

- 見えている情報はあなたの席に見えるものだけです。他人の鍵や API を探らないでください。
- 自分の役職をいつ、どう明かすかは戦略です。会話の場があれば、そこでは人間のように振る舞って構いません。
`;
}
