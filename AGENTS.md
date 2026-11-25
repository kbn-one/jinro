# Jinro - Werewolf Game Engine

## Project Overview

A monorepo for a werewolf (人狼) game engine. The rules are written in Lean, proved in Lean, and compiled to WasmGC by our own backend (`lean-engine/WasmGC/`, no Lean C runtime), with bindings for JavaScript, Ruby, etc.

## Architecture

```
jinro/
├── docs/CORE_SPEC.md   # rule specification
├── lean-engine/     # the engine, in Lean; compiled to a WasmGC module: run(JSON string) -> JSON string
│   ├── Jinro/Engine.lean    # the rules
│   ├── Jinro/Wire.lean      # the JSON protocol (`run` is the module's export)
│   ├── Jinro/Proofs.lean    # theorems about Engine (checked on every build)
│   ├── WasmGC/Emit.lean     # the backend: Lean IR -> WasmGC text (`lake exe emitwasm`)
│   ├── WasmGC/strings.wat   # its hand-written runtime for String, Int, ByteArray
│   └── SIZE.md              # where the bytes go
├── research/wasmgc/ # how the backend came about: demos, the List Nat boundary, notes (see its README)
├── mise.toml        # tools (Deno, elan, wasm-tools) and the Pages build task
├── web/             # Web app (Deno + Remix v3, from kuboon/deno-remix-tmpl)
│   ├── client/      # pages / islands; /wasm is the engine playground
│   └── server/      # router, API, Cloudflare Worker (kept for later use)
├── bindings/
│   ├── js/         # JavaScript/TypeScript bindings
│   ├── python/     # Python bindings
│   └── ruby/       # Ruby bindings
```

## Core Module (Lean/WASM)

### Role System

Implemented roles:
- `villager` : 村人 (1日目以降投票のみ)
- `seer` :  占師 (0日目夜から占う)
- `medium` : 霊媒師 (その日に投票で処刑された人物の人狼判定を知る)
- `bodyguard` : ボディーガード (護衛)
- `wolf` : 人狼 (襲撃)
- `madman`: 狂人 (人狼チームの人間)
- `hamster`: ハムスター人間 (噛まれても死なない、占われると死体になる)
- `lover` : 恋人 (自分以外の1人に求婚し、2人で恋人チームを形成する)
- `bitch` : 悪女 (恋人の亜種)

### 勝利条件
- 生存人狼がゼロになるとゲーム終了
  - ハムスターが生存してればハムスター陣営勝利
  - 恋人が揃って生存していたら恋人陣営勝利
  - それ以外なら村チーム勝利
- 生存人数の過半数が人狼になった時
  - 恋狼が生存している場合は恋狼以外の狼が全滅するか、恋狼が死ぬまで続行
  - 恋狼が生き残れば恋人陣営勝利
  - 恋人がおらず、ハムスターが生存していればハムスター勝利
  - 恋狼がいなければ人狼、狂人勝利

### Core Functions

```
type CreatureId = string
type LogId = string
enum Role
enum ActionType
enum Team
enum ActionResult {
  Wolf
  NonWolf
}
enum CauseOfDeath {
  Executed
  FoundDead
}

type Rule
type Creature {
  id: CreatureId
  role: Role
}
type Village {
  rule: Rule
  creatures: Array[Creature]
  days: Array[Day]
}
type Day {
  day_number: Int
  actions: Array[Action]
  logs: Array[Log]
}
type Action {
  actor: CreatureId
  action_type: ActionType
  target: Option[CreatureId]
}
type PossibleAction {
  action_type:
  targets: List[CreatureId]
}
type Log {
  id: LogId
  receivers: Array[CreatureId] | "all" | "afterall"
  action_type: ActionType
  actor: Option[CreatureId]
  target: Option[CreatureId]
  result: Option[ActionResult]
}

// 村作成。 CreatureId 発行 (days: [])、 0日目の Today 返却
fn create_village(roles: Array[Role], rule: Rule) -> (Village, Today)

// 翌日の情報を取得 (生存者一覧、実行可能なアクション、閲覧可能なログ)
type CreatureStatus {
  creature_id: CreatureId
  possible_actions: List[PossibleAction]
  cause_of_death: Option[CauseOfDeath]
  log_ids: Array[LogId]
}
type Today {
  day_number: Int
  winner: Option[Team] // ゲーム終了時に勝者が入る
  creature_statuses: Array[CreatureStatus]
}

// アクション実行
fn process_day(village: Village, actions: Array[Action]) -> (Village, Array[Log], Today)

```

### Example Flow
```psudo
rule = { vote: "public" }
roles = [
  { role_type: Villager, metadata: {} },
  { role_type: Wolf, metadata: {} },
  { role_type: Seer, metadata: {} }
]
village, today = create_village(roles, rule)
while(today.winner is null){
  actions = []
  today.creature_statuses.each {|status|
    status.possible_actions.each {|possible_action|
      target = await ask(possible_action)
      actions.add (
        actor: status.creature_id,
        action_type: possible_action.action_type,
        target
      )
    }
  }
  village, logs, today = process_day(village, actions)
  display(logs)
}
```

## Bindings

### JavaScript (TypeScript)
- publish to jsr
- Package name: `@kuboon/jinro`
- Export TypeScript types matching core types

### Ruby
- Gem Package name: `jinro`
- Use https://github.com/wasmerio/wasmer-ruby

## Web (`web/`)

- Derived from https://github.com/kuboon/deno-remix-tmpl; the template's
  server side and sample features are kept as-is for now.
- `deno task wasm` builds `lean-engine/` (needs elan and wasm-tools: `mise
  install` sets up both — elan through mise, Lean through elan) into
  `web/client/static/jinro/jinro.wasm` (generated, git-ignored); run it before
  `deno task test`, `deno task dev` or `deno task build`. Size breakdown:
  `lean-engine/SIZE.md` (~115 KB raw, ~32 KB brotli; proofs add nothing).
- `web/client/jinro.ts` instantiates it once and calls `run(request)`: a JSON
  string in, a JSON string out. Strings cross through the JS String Builtins,
  or JS stand-ins where those are missing, so only WasmGC is required. The wire
  format is `lean-engine/Jinro/Wire.lean`; the TypeScript types mirror it.
- `web/server/engine_regression.test.ts` replays 40 seeded random games
  (`engine_games.ts`) and compares each response's hash with
  `engine_games.fixture.json`. A rules change that alters answers must
  regenerate it on purpose (see `engine_games.ts`).
- `web/server/engine_protocol.test.ts` checks the exact response text for
  malformed, non-ASCII and other off-path requests against
  `engine_protocol.fixture.json` (recorded from the former Lasm build).
- `/wasm` (`web/client/pages/wasm.tsx`, `islands/jinro_demo.tsx`) lets you
  create a village and step through days on the real wasm component.

## Development Flow

1. Change the rules in `lean-engine/Jinro/Engine.lean` (`cd lean-engine && lake build` checks it and the proofs quickly with a local Lean 4.35.0)
2. State and prove properties in `lean-engine/Jinro/Proofs.lean`
3. Build WASM: `deno task wasm` (`lake build`, `lake exe emitwasm`, `wasm-tools`)
4. Test: `deno task test` (regression fixture, protocol tests), and the `/wasm` page
5. Implement bindings for each language (same JSON protocol; the host needs WasmGC)
6. Write tests for bindings
7. CI/CD for automated build, publish

## References

- Existing TypeScript implementation: https://github.com/kuboon/jinro.ts
- Lasm (Lean 4 -> WebAssembly through Lean's C runtime; the engine's build until 2026-11-24): https://github.com/Millillion/lasm
- WebAssembly JS String Builtins: https://github.com/WebAssembly/js-string-builtins
