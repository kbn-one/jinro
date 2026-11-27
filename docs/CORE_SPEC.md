# Jinro Core Specification

## vote
1日目 以降、全員が自分以外の生存者1人を選ぶ

## 死者
- 死者は投票も、役職のアクション (divine / guard / bite / love / fake_love) もできない
- 死者が提出したアクションは無視され、その日の記録 (`Day.actions`) にも残らない

## Role-Specific Rules

### seer
- divine
  - 0日目以降毎日。自分以外の生存者から1人を選ぶ
  - 結果は対象の役職名 (wolf / villager / hamster など)

### medium
- medium
  - 1日目以降、投票で処刑者が出た時に自動で通知
  - medium アクションを手動提出する必要はない
  - 結果は wolf or not_wolf

### bodyguard
- guard
  - Day N (N>=1): can guard (protect one target from bite)

### wolf
- Day N (N>=1): can bite (only at night, N>=1)
  - 群れで 1 晩に 1 人だけ襲う: 生存している wolf の bite のうち最多の対象 (同数なら誰も襲わない)
  - 結果のログは生存している wolf 全員に届く

### lover
- love
  - Day 1: must choose partner (love action)
- suicide
  - lover が死ねば loved が、loved が死ねば lover が、その日のうちに死ぬ (双方向)

### bitch
lover と同じだが、 fake_love アクションが追加
- fake_love
  - Day 1: must choose partner (love action)
  - 相手には love と同じ通知が行くが実際には lovers にならない

### hamster
- bite されても死なない (after all log のみ)
- divine target にされると死ぬ

## Victory Rules

### 人数の数え方 (陣営ではなく種族)
- 人狼: `wolf` のみ (madman は人間)
- 人間: 人狼でもハムスターでもない全員 (madman / lover / bitch / 恋された人間を含む)
- ハムスターはどちらにも数えない
- 恋狼 (相方と揃って生存している wolf) は群れを離れている
  - 他に生存している wolf がいる間は、どちらにも数えない
  - 生存している wolf が恋狼だけになったら、人狼として数える

### ゲーム終了
- 人狼が 0、または 人狼 >= 人間 になったら終了

### 勝者 (終了時点で上から順に判定)
1. 相互の恋人ペアが 2 人とも生存していれば恋人勝利 (恋狼・恋ハムのペアも同じ)
2. ハムスターが生存していればハムスター勝利
3. 人狼が 0 なら村勝利
4. それ以外は人狼勝利 (madman も人狼陣営として勝利)

### 陣営の表示
- 相方がいる者は、役職にかかわらず恋人陣営 (`team: lovers`)

---

## Day Number Convention
```
day 0 = setup (create_village直後、seer の divine は可能)
day 1 = vote + night actions
day N (N>=1) = vote + night actions
```

Each `process_day` call represents one full cycle (night + day voting).


