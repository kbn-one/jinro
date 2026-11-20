import Lean.Data.Json
import Jinro.Engine

/-!
# The JSON protocol

The same wire format as `rust/jinro-wasi/src/lib.rs` (so the web demo and the bindings can run
either engine): one request object in, one response object out.

```text
{"op":"createVillage","roles":[...],"rule":{...}}  -> {"ok":{"village":..,"today":..}}
{"op":"processDay","village":{...},"actions":[...]} -> {"ok":{"result":..,"village":..,"today":..}}
anything that fails                                 -> {"error":"..."}
```

camelCase fields, enums as kebab-case strings, variants as `{"tag":..,"val":..}`, absent options
omitted. Creature ids are strings on the wire (`c1`, `c2`, ...) and indices inside the engine;
an id that names no creature is an error here, so the engine only ever sees ids in range.
-/

namespace Jinro.Wire

open Lean (Json toJson)

abbrev M := Except String

/-! ## Enums -/

def teamStr : Team → String
  | .villagers => "villagers" | .wolves => "wolves" | .lovers => "lovers" | .hamsters => "hamsters"

def roleStr : RoleType → String
  | .villager => "villager" | .seer => "seer" | .bodyguard => "bodyguard" | .wolf => "wolf"
  | .madman => "madman" | .lover => "lover" | .bitch => "bitch" | .medium => "medium"
  | .hamster => "hamster"

def roleOf : String → M RoleType
  | "villager" => pure .villager | "seer" => pure .seer | "bodyguard" => pure .bodyguard
  | "wolf" => pure .wolf | "madman" => pure .madman | "lover" => pure .lover
  | "bitch" => pure .bitch | "medium" => pure .medium | "hamster" => pure .hamster
  | s => throw s!"bad request: unknown role type: {s}"

def actionStr : ActionType → String
  | .vote => "vote" | .unknown => "unknown" | .bite => "bite" | .divine => "divine"
  | .medium => "medium" | .guard => "guard" | .hamsterCurse => "hamster-curse" | .love => "love"
  | .loversSuicide => "lovers-suicide" | .fakeLove => "fake-love"

def actionOf : String → M ActionType
  | "vote" => pure .vote | "unknown" => pure .unknown | "bite" => pure .bite
  | "divine" => pure .divine | "medium" => pure .medium | "guard" => pure .guard
  | "hamster-curse" => pure .hamsterCurse | "love" => pure .love
  | "lovers-suicide" => pure .loversSuicide | "fake-love" => pure .fakeLove
  | s => throw s!"bad request: unknown action type: {s}"

def resultStr : LogResult → String
  | .dead => "dead" | .guarded => "guarded" | .partnered => "partnered" | .wolf => "wolf"
  | .nonWolf => "non-wolf" | .survived => "survived"

def resultOf : String → M LogResult
  | "dead" => pure .dead | "guarded" => pure .guarded | "partnered" => pure .partnered
  | "wolf" => pure .wolf | "non-wolf" => pure .nonWolf | "survived" => pure .survived
  | s => throw s!"bad request: unknown log result: {s}"

def codStr : CauseOfDeath → String
  | .executed => "executed" | .foundDead => "found-dead"

/-! ## Reading -/

def field (j : Json) (k : String) : M Json :=
  match j.getObjVal? k with
  | .ok v => pure v
  | .error _ => throw s!"bad request: missing field `{k}`"

def optField (j : Json) (k : String) : Option Json :=
  match j.getObjVal? k with
  | .ok .null => none
  | .ok v => some v
  | .error _ => none

def str (j : Json) : M String :=
  match j.getStr? with
  | .ok s => pure s
  | .error _ => throw s!"bad request: expected a string, got {j.compress}"

def arr (j : Json) : M (Array Json) :=
  match j.getArr? with
  | .ok a => pure a
  | .error _ => throw s!"bad request: expected an array, got {j.compress}"

def tag (j : Json) : M String := do str (← field j "tag")

/-- The creatures' string ids, in order; index = engine id. -/
structure Ids where
  ids : Array String

def Ids.idx (ids : Ids) (id : String) : M Cid :=
  match ids.ids.findIdx? (· == id) with
  | some i => pure i
  | none => throw s!"unknown creature id: {id}"

def Ids.optIdx (ids : Ids) : Option Json → M (Option Cid)
  | none => pure none
  | some j => do pure (some (← ids.idx (← str j)))

def Ids.id (ids : Ids) (i : Cid) : String := ids.ids[i]?.getD s!"#{i}"

def actionIn (ids : Ids) (j : Json) : M Action := do
  pure ⟨← ids.idx (← str (← field j "actor")), ← actionOf (← str (← field j "actionType")),
    ← ids.optIdx (optField j "target")⟩

def receiversIn (ids : Ids) (j : Json) : M Receivers := do
  match ← tag j with
  | "all" => pure .all
  | "afterall" => pure .afterall
  | "only" => do
    let rs ← arr (← field j "val")
    pure (.only (← rs.mapM fun r => do ids.idx (← str r)))
  | t => throw s!"bad request: unknown receivers: {t}"

def logIn (ids : Ids) (j : Json) : M Log := do
  pure ⟨← receiversIn ids (← field j "receivers"), ← actionOf (← str (← field j "actionType")),
    ← ids.optIdx (optField j "actor"), ← ids.optIdx (optField j "target"),
    ← (optField j "logResult").mapM fun r => do resultOf (← tag r)⟩

/-- A creature as given: its id, its role type, and its `opts` (echoed back as they came). -/
structure Creature where
  id : String
  roleType : RoleType
  opts : Json

def creatureIn (j : Json) : M Creature := do
  let role ← field j "role"
  pure ⟨← str (← field j "id"), ← roleOf (← str (← field role "roleType")),
    (optField role "opts").getD (.arr #[])⟩

def ruleIn (j : Json) : M Json := do
  match ← tag (← field j "vote") with
  | "public" | "private" => pure j
  | t => throw s!"bad request: unknown vote rule: {t}"

/-- A village as given, and the engine's view of it. -/
structure VillageIn where
  rule : Json
  creatures : Array Creature
  village : Village

def villageIn (j : Json) : M VillageIn := do
  let rule ← ruleIn (← field j "rule")
  let creatures ← (← arr (← field j "creatures")).mapM creatureIn
  let names := creatures.map (·.id)
  for h : i in [0:names.size] do
    if (names.extract 0 i).contains names[i] then
      throw s!"duplicate creature id: {names[i]}"
  let ids : Ids := ⟨names⟩
  let days ← (← arr (← field j "days")).mapM fun d => do
    pure (⟨← (← arr (← field d "actions")).mapM (actionIn ids),
      ← (← arr (← field d "logs")).mapM (logIn ids)⟩ : Day)
  pure ⟨rule, creatures, ⟨creatures.map (·.roleType), days⟩⟩

/-! ## Writing -/

/-- An object, leaving out the fields whose value is `none`. -/
def obj (fields : List (String × Option Json)) : Json :=
  Json.mkObj (fields.filterMap fun (k, v) => v.map (k, ·))

def tagged (t : String) : Json := Json.mkObj [("tag", t)]

def idOut (ids : Ids) (i : Cid) : Json := ids.id i

def actionOut (ids : Ids) (a : Action) : Json :=
  obj [("actor", idOut ids a.actor), ("actionType", (actionStr a.actionType : Json)),
    ("target", a.target.map (idOut ids))]

def logId (day index : Nat) : String := s!"{day}-{index}"

def logOut (ids : Ids) (day index : Nat) (l : Log) : Json :=
  let receivers : Json := match l.receivers with
    | .all => tagged "all"
    | .afterall => tagged "afterall"
    | .only rs => Json.mkObj [("tag", "only"), ("val", Json.arr (rs.map (idOut ids)))]
  obj [("id", (logId day index : Json)), ("receivers", receivers),
    ("actionType", (actionStr l.actionType : Json)), ("actor", l.actor.map (idOut ids)),
    ("target", l.target.map (idOut ids)), ("logResult", l.result.map (tagged ∘ resultStr))]

def creatureOut (c : Creature) : Json :=
  Json.mkObj [("id", c.id), ("role", Json.mkObj [("roleType", roleStr c.roleType), ("opts", c.opts)])]

def villageOut (src : VillageIn) (v : Village) : Json :=
  let ids : Ids := ⟨src.creatures.map (·.id)⟩
  let days := (Array.range v.days.size).map fun (d : Nat) =>
    let day := v.days[d]!
    Json.mkObj [("dayNumber", toJson d),
      ("actions", Json.arr (day.actions.map (actionOut ids))),
      ("logs", Json.arr ((Array.range day.logs.size).map fun i => logOut ids d i day.logs[i]!))]
  Json.mkObj [("rule", src.rule), ("creatures", Json.arr (src.creatures.map creatureOut)),
    ("days", Json.arr days)]

def todayOut (ids : Ids) (t : Today) : Json :=
  let statuses := (Array.range t.creatureStatuses.size).map fun (i : Nat) =>
    let s := t.creatureStatuses[i]!
    obj [("id", idOut ids i), ("roleType", (roleStr s.role : Json)),
      ("team", (teamStr s.team : Json)),
      ("availableActions", Json.arr (s.availableActions.map fun a =>
        Json.mkObj [("actionType", actionStr a.actionType),
          ("targets", Json.arr (a.targets.map (idOut ids)))])),
      ("causeOfDeath", s.causeOfDeath.map fun c => (codStr c : Json)),
      ("logIds", Json.arr (s.visibleLogs.map fun r => (logId r.day r.index : Json)))]
  obj [("dayNumber", toJson t.dayNumber), ("winner", t.winner.map fun w => (teamStr w : Json)),
    ("creatureStatuses", Json.arr statuses)]

/-! ## Operations -/

def createVillage (req : Json) : M Json := do
  let rule ← ruleIn (← field req "rule")
  let roles ← arr (← field req "roles")
  let creatures ← (Array.range roles.size).mapM fun i => do
    let r := roles[i]!
    pure (⟨s!"c{i + 1}", ← roleOf (← str (← field r "roleType")),
      (optField r "opts").getD (.arr #[])⟩ : Creature)
  let src : VillageIn := ⟨rule, creatures, Jinro.createVillage (creatures.map (·.roleType))⟩
  let ids : Ids := ⟨creatures.map (·.id)⟩
  pure (Json.mkObj [("village", villageOut src src.village),
    ("today", todayOut ids (buildToday src.village))])

def processDay (req : Json) : M Json := do
  let src ← villageIn (← field req "village")
  let ids : Ids := ⟨src.creatures.map (·.id)⟩
  let actions ← (← arr (← field req "actions")).mapM (actionIn ids)
  let (nv, r) := Jinro.processDay src.village actions
  let day := nv.days.size - 1
  let result := obj [("voted", r.voted.map (idOut ids)),
    ("deads", some (Json.arr (r.deaths.map fun d => idOut ids d.creature))),
    ("logs", some (Json.arr ((Array.range r.logs.size).map fun i =>
      logOut ids day i r.logs[i]!)))]
  pure (Json.mkObj [("result", result), ("village", villageOut src nv),
    ("today", todayOut ids (buildToday nv))])

/-- Answers one request: `{"ok":..}` or `{"error":".."}`. -/
def handle (input : String) : Json :=
  let outcome : M Json := do
    let req ← match Json.parse input with
      | .ok j => pure j
      | .error e => throw s!"bad request: {e}"
    match ← str (← field req "op") with
    | "createVillage" => createVillage req
    | "processDay" => processDay req
    | op => throw s!"bad request: unknown op: {op}"
  match outcome with
  | .ok j => Json.mkObj [("ok", j)]
  | .error e => Json.mkObj [("error", e)]

end Jinro.Wire
