/-!
# The jinro rule engine, in Lean

Written as ordinary Lean (arrays, folds, `filter`, `findSome?`): this is the code that runs (Lasm
compiles it to wasm) and the code the theorems in `Jinro.Proofs` are about. It started as a port
of an earlier Rust implementation and matched it response for response on 40 random games; that
record lives on as `web/server/engine_games.fixture.json`.

Creatures are indices into `Village.roles`. The engine is stateless: a `Village` is the whole
history (roles + days), and everything else is derived from it.
-/

namespace Jinro

abbrev Cid := Nat

inductive Team where
  | villagers | wolves | lovers | hamsters
  deriving BEq, DecidableEq, Repr, Inhabited

inductive RoleType where
  | villager | seer | bodyguard | wolf | madman | lover | bitch | medium | hamster
  deriving BEq, DecidableEq, Repr, Inhabited

inductive ActionType where
  | vote | bite | unknown | guard | divine | love | fakeLove | loversSuicide | medium
  | hamsterCurse
  deriving BEq, DecidableEq, Repr, Inhabited

inductive CauseOfDeath where
  | executed | foundDead
  deriving BEq, DecidableEq, Repr, Inhabited

inductive LogResult where
  | dead | guarded | partnered | wolf | nonWolf | survived
  deriving BEq, DecidableEq, Repr, Inhabited

inductive Receivers where
  /-- Visible to everyone during the game. -/
  | all
  /-- Visible to everyone once the game is over. -/
  | afterall
  /-- Visible only to the listed creatures. -/
  | only (rs : Array Cid)
  deriving BEq, Repr, Inhabited

structure Action where
  actor : Cid
  actionType : ActionType
  target : Option Cid
  deriving BEq, Repr, Inhabited

structure Log where
  receivers : Receivers
  actionType : ActionType
  actor : Option Cid
  target : Option Cid
  result : Option LogResult
  deriving BEq, Repr, Inhabited

structure Day where
  actions : Array Action
  logs : Array Log
  deriving Repr, Inhabited

structure Village where
  roles : Array RoleType
  days : Array Day
  deriving Repr, Inhabited

structure AvailableAction where
  actionType : ActionType
  targets : Array Cid
  deriving Repr, Inhabited

/-- `village.days[day].logs[index]`. -/
structure LogRef where
  day : Nat
  index : Nat
  deriving Repr, Inhabited

structure CreatureStatus where
  role : RoleType
  team : Team
  availableActions : Array AvailableAction
  causeOfDeath : Option CauseOfDeath
  /-- Logs this creature is allowed to see right now. -/
  visibleLogs : Array LogRef
  deriving Repr, Inhabited

structure Today where
  dayNumber : Nat
  winner : Option Team
  creatureStatuses : Array CreatureStatus
  deriving Repr

structure Death where
  creature : Cid
  /-- True cause (vote, bite, loversSuicide, hamsterCurse). -/
  cause : ActionType
  deriving Repr, Inhabited

structure DayResult where
  voted : Option Cid
  deaths : Array Death
  logs : Array Log
  deriving Repr

/-! ## Roles -/

def teamOf : RoleType → Team
  | .wolf | .madman => .wolves
  | .lover | .bitch => .lovers
  -- The hamster counts with the villagers; it only overrides the final winner.
  | _ => .villagers

/-- Used by divine and medium: any wolves-team role, madman included. -/
def isWolfRole (v : Village) (id : Cid) : Bool :=
  match v.roles[id]? with
  | some r => teamOf r == .wolves
  | none => false

def isHamster (v : Village) (id : Cid) : Bool :=
  v.roles[id]? == some .hamster

def canDoAction (r : RoleType) (a : ActionType) (day : Nat) : Bool :=
  match a, r with
  | .vote, _ => day ≥ 1
  | .divine, .seer => true
  | .guard, .bodyguard => day ≥ 1
  | .bite, .wolf => day ≥ 1
  | .love, .lover | .love, .bitch => day == 1
  | .fakeLove, .bitch => day == 1
  | _, _ => false

/-! ## Life and death (derived from public logs) -/

def isDeadResult : Option LogResult → Bool
  | some .dead => true
  | _ => false

/-- A public (`all`) log saying `id` is dead. -/
def isPublicDeathOf (l : Log) (id : Cid) : Bool :=
  match l.receivers with
  | .all => isDeadResult l.result && l.target == some id
  | _ => false

/-- Public action type of the death of `id` (vote or unknown), if dead. -/
def publicDeath (v : Village) (id : Cid) : Option ActionType :=
  v.days.findSome? fun d => (d.logs.find? (isPublicDeathOf · id)).map (·.actionType)

def isAlive (v : Village) (id : Cid) : Bool :=
  (publicDeath v id).isNone

def causeOfDeath (v : Village) (id : Cid) : Option CauseOfDeath :=
  match publicDeath v id with
  | none => none
  | some .vote => some .executed
  | some _ => some .foundDead

def creatureIds (v : Village) : Array Cid :=
  Array.range v.roles.size

def aliveIds (v : Village) : Array Cid :=
  (creatureIds v).filter (isAlive v)

def aliveIdsExcept (v : Village) (except : Cid) : Array Cid :=
  (creatureIds v).filter fun c => c != except && isAlive v c

def aliveNonWolfIds (v : Village) : Array Cid :=
  (creatureIds v).filter fun c => isAlive v c && !isWolfRole v c

/-! ## Lovers -/

/-- A love log forms a partnership only if it is shared with both sides.
    (Fake love is shown to the target only, so it never forms one.) -/
def partnershipOfLog (l : Log) : Option (Cid × Cid) :=
  match l.actionType, l.result, l.actor, l.target, l.receivers with
  | .love, some .partnered, some a, some t, .only rs =>
    if rs.contains a && rs.contains t then some (a, t) else none
  | _, _, _, _, _ => none

def partnerInLogs (logs : Array Log) (id : Cid) : Option Cid :=
  logs.findSome? fun l =>
    match partnershipOfLog l with
    | some (a, t) => if a == id then some t else if t == id then some a else none
    | none => none

/-- Partner of `id`: today's logs first, then past days in order. -/
def partnerOf (v : Village) (dayLogs : Array Log) (id : Cid) : Option Cid :=
  match partnerInLogs dayLogs id with
  | some p => some p
  | none => v.days.findSome? (partnerInLogs ·.logs id)

/-! ## Available actions -/

def availableActions (v : Village) (id : Cid) (day : Nat) : Array AvailableAction :=
  match v.roles[id]? with
  | none => #[]
  | some r =>
    if !isAlive v id then #[] else
    let pushIf (out : Array AvailableAction) (a : ActionType) (targets : Array Cid) :=
      if canDoAction r a day then out.push ⟨a, targets⟩ else out
    let out := pushIf #[] .vote (aliveIdsExcept v id)
    match r with
    | .seer => pushIf out .divine (aliveIdsExcept v id)
    | .bodyguard => pushIf out .guard (aliveIds v)
    | .wolf => pushIf out .bite (aliveNonWolfIds v)
    | .lover => pushIf out .love (aliveIdsExcept v id)
    | .bitch => pushIf (pushIf out .love (aliveIdsExcept v id)) .fakeLove (aliveIdsExcept v id)
    | _ => out

/-! ## Day resolution -/

/-- Accumulated effects while resolving one day. -/
structure DayState where
  logs : Array Log := #[]
  deaths : Array Death := #[]

def DayState.isDying (st : DayState) (id : Cid) : Bool :=
  st.deaths.any (·.creature == id)

def DayState.addDeath (st : DayState) (id : Cid) (cause : ActionType) : DayState :=
  if st.isDying id then st else { st with deaths := st.deaths.push ⟨id, cause⟩ }

def DayState.addLog (st : DayState) (l : Log) : DayState :=
  { st with logs := st.logs.push l }

def privateLog (actor : Cid) (a : ActionType) (target : Option Cid) (result : LogResult) : Log :=
  ⟨.only #[actor], a, some actor, target, some result⟩

def loveLog (actor target : Cid) (real : Bool) : Log :=
  ⟨.only (if real then #[actor, target] else #[target]), .love, some actor, some target,
    some .partnered⟩

def firstGuardTarget (actions : Array Action) : Option Cid :=
  (actions.find? (·.actionType == .guard)).bind (·.target)

/-- Effect of one action, according to the actor's role. -/
def resolveAction (v : Village) (guarded : Option Cid) (st : DayState) (a : Action) : DayState :=
  match v.roles[a.actor]? with
  | none => st
  | some role =>
    match a.actionType, role, a.target with
    | .bite, .wolf, some t =>
      if guarded == some t then
        st.addLog (privateLog a.actor .bite (some t) .guarded)
      else if isHamster v t then
        -- A hamster survives a bite; nobody learns of it during the game, not even the wolf.
        st.addLog ⟨.afterall, .bite, some a.actor, some t, some .survived⟩
      else
        (st.addLog (privateLog a.actor .bite (some t) .dead)).addDeath t .bite
    | .divine, .seer, some t =>
      let st := st.addLog (privateLog a.actor .divine (some t) (if isWolfRole v t then .wolf else .nonWolf))
      if isHamster v t then st.addDeath t .hamsterCurse else st
    | .guard, .bodyguard, _ => st.addLog (privateLog a.actor .guard a.target .guarded)
    | .love, .lover, some t | .love, .bitch, some t => st.addLog (loveLog a.actor t true)
    | .fakeLove, .bitch, some t => st.addLog (loveLog a.actor t false)
    | _, _, _ => st

/-- Executed creature: the unique target with the most votes (a tie executes nobody). -/
def computeVoteDeath (actions : Array Action) (n : Nat) : Option Cid :=
  let counts := actions.foldl (init := Array.replicate n 0) fun cs a =>
    match a.actionType, a.target with
    | .vote, some t => if t < n then cs.modify t (· + 1) else cs
    | _, _ => cs
  let (_, best, tie) := (Array.range n).foldl (init := ((0 : Nat), (none : Option Cid), false))
    fun (mx, best, tie) c =>
      let k := counts[c]!
      if k > mx then (k, some c, false)
      else if k == mx && mx > 0 then (mx, best, true)
      else (mx, best, tie)
  if tie then none else best

/-- The medium learns whether the executed creature was a wolf. -/
def notifyExecution (v : Village) (st : DayState) (executed : Cid) : DayState :=
  let res := if isWolfRole v executed then LogResult.wolf else .nonWolf
  (creatureIds v).foldl (init := st) fun st c =>
    if isAlive v c && !st.isDying c && v.roles[c]? == some .medium then
      st.addLog (privateLog c .medium (some executed) res)
    else st

/-- Lovers follow their partner in death. -/
def notifyDeath (v : Village) (st : DayState) (dead : Cid) : DayState :=
  (creatureIds v).foldl (init := st) fun st c =>
    let isLover := v.roles[c]? == some .lover || v.roles[c]? == some .bitch
    if isAlive v c && !st.isDying c && isLover && partnerOf v st.logs c == some dead then
      st.addDeath c .loversSuicide
    else st

/-- Process the death chain. Deaths can be added while we go, but each is a distinct creature,
    so `roles.size + 1` steps are always enough. -/
def resolveDeathChain (v : Village) (st : DayState) : DayState :=
  go (v.roles.size + 1) 0 st
where
  go : Nat → Nat → DayState → DayState
    | 0, _, st => st
    | fuel + 1, i, st =>
      match st.deaths[i]? with
      | some d => go fuel (i + 1) (notifyDeath v st d.creature)
      | none => st

/-- In-game, only executions are revealed; other causes look the same. -/
def publicDeathAction : ActionType → ActionType
  | .bite | .loversSuicide | .hamsterCurse => .unknown
  | a => a

def publishDeaths (st : DayState) : DayState :=
  st.deaths.foldl (init := st) fun st d =>
    (st.addLog ⟨.all, publicDeathAction d.cause, none, some d.creature, some .dead⟩).addLog
      ⟨.afterall, d.cause, none, some d.creature, some .dead⟩

/-- An action counts only if its actor exists and is alive at the start of the day. -/
def isLiveAction (v : Village) (a : Action) : Bool :=
  a.actor < v.roles.size && isAlive v a.actor

/-- Dead creatures can neither act nor vote: their actions are dropped first. -/
def liveActions (v : Village) (submitted : Array Action) : Array Action :=
  submitted.filter (isLiveAction v)

/-- Resolve one full cycle (night actions + vote) and append it to the village. -/
def processDay (v : Village) (submitted : Array Action) : Village × DayResult :=
  let actions := liveActions v submitted
  let guarded := firstGuardTarget actions
  let st := actions.foldl (resolveAction v guarded) {}
  let voted := computeVoteDeath actions v.roles.size
  let st := match voted with
    | some t => notifyExecution v (st.addDeath t .vote) t
    | none => st
  let st := publishDeaths (resolveDeathChain v st)
  ({ v with days := v.days.push ⟨actions, st.logs⟩ }, ⟨voted, st.deaths, st.logs⟩)

/-! ## Victory -/

def baseWinner (v : Village) : Option Team :=
  let alive := aliveIds v
  let loversWin :=
    match alive.toList with
    | [a, b] => partnerOf v #[] a == some b && partnerOf v #[] b == some a
    | _ => false
  if loversWin then some .lovers else
  let (wolves, others) := alive.foldl (init := (0, 0)) fun (w, o) c =>
    match v.roles[c]?.map teamOf with
    | some .wolves => (w + 1, o)
    | some .lovers => (w, o)
    | _ => (w, o + 1)
  if wolves == 0 then some .villagers
  else if wolves ≥ others then some .wolves
  else none

def hamsterAlive (v : Village) : Bool :=
  (creatureIds v).any fun c => v.roles[c]? == some .hamster && isAlive v c

def winner (v : Village) : Option Team :=
  (baseWinner v).map fun t => if hamsterAlive v then .hamsters else t

/-! ## Views -/

def canSee (l : Log) (viewer : Cid) (gameOver : Bool) : Bool :=
  match l.receivers with
  | .all => true
  | .afterall => gameOver
  | .only rs => rs.contains viewer

/-- The logs `viewer` may see, as references into `v.days`, in order. -/
def visibleLogs (v : Village) (viewer : Cid) (gameOver : Bool) : Array LogRef :=
  v.days.zipIdx.flatMap fun (day, d) =>
    day.logs.zipIdx.filterMap fun (l, i) =>
      if canSee l viewer gameOver then some ⟨d, i⟩ else none

def buildToday (v : Village) : Today :=
  let day := v.days.size
  let w := winner v
  { dayNumber := day
    winner := w
    creatureStatuses := (creatureIds v).map fun c =>
      let r := v.roles[c]!
      { role := r
        team := teamOf r
        availableActions := availableActions v c day
        causeOfDeath := causeOfDeath v c
        visibleLogs := visibleLogs v c w.isSome } }

def createVillage (roles : Array RoleType) : Village :=
  ⟨roles, #[]⟩

end Jinro
