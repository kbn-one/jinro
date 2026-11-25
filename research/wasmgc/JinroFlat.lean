import Jinro.Engine

/-!
# jinro over a wasm-shaped wire: lists of naturals

The subset idea applied to the real engine. `Jinro.Engine` is compiled unchanged; what changes is
the boundary. Instead of `Lean.Json` (strings, a parser, bignum-capable numbers — most of the
Lasm build), requests and responses are flat `List Nat`s, and the host (`jinro_gc.ts`) does the
JSON. Creature ids are indices here, as inside the engine; the host maps them to `c1`, `c2`, ...

Every type on the wire gets an encoder and a decoder, and `LawfulCodec` proves that decoding an
encoding gives the value back, whatever follows it. So the format is unambiguous, and the
host's reader only has to mirror `dec`.

```text
request  0 :: roles                       -> Today
request  1 :: village ++ actions          -> DayResult ++ Day ++ Today   (the day just played)
anything that does not decode             -> []
```
-/

namespace Jinro.Flat

abbrev Dec (α : Type) := List Nat → Option (α × List Nat)

class Codec (α : Type) where
  enc : α → List Nat
  dec : Dec α

open Codec

/-- Decoding an encoding gives the value back, and leaves the rest of the input alone. -/
class LawfulCodec (α : Type) [Codec α] : Prop where
  roundtrip : ∀ (x : α) (rest : List Nat), dec (enc x ++ rest) = some (x, rest)

attribute [simp] LawfulCodec.roundtrip

/-! ## Naturals, options, lists, arrays -/

instance : Codec Nat where
  enc n := [n]
  dec | n :: r => some (n, r) | [] => none

instance : LawfulCodec Nat := ⟨fun _ _ => rfl⟩

instance [Codec α] : Codec (Option α) where
  enc | none => [0] | some x => 1 :: enc x
  dec
    | 0 :: r => some (none, r)
    | 1 :: r => (dec r).map fun (x, r) => (some x, r)
    | _ => none

instance [Codec α] [LawfulCodec α] : LawfulCodec (Option α) where
  roundtrip x rest := by cases x <;> simp [enc, dec]

def decN [Codec α] : Nat → Dec (List α)
  | 0, r => some ([], r)
  | n + 1, r => do
    let (x, r) ← dec r
    let (xs, r) ← decN n r
    pure (x :: xs, r)

def encList [Codec α] (xs : List α) : List Nat := xs.length :: xs.flatMap enc

theorem decN_flatMap [Codec α] [LawfulCodec α] (xs : List α) (rest : List Nat) :
    decN xs.length (xs.flatMap enc ++ rest) = some (xs, rest) := by
  induction xs with
  | nil => rfl
  | cons x xs ih => simp [decN, List.append_assoc, ih]

instance [Codec α] : Codec (List α) where
  enc := encList
  dec | n :: r => decN n r | [] => none

instance [Codec α] [LawfulCodec α] : LawfulCodec (List α) where
  roundtrip xs rest := by simp [enc, dec, encList, decN_flatMap]

instance [Codec α] : Codec (Array α) where
  enc xs := enc xs.toList
  dec r := (dec r : Option (List α × List Nat)).map fun (xs, r) => (xs.toArray, r)

instance [Codec α] [LawfulCodec α] : LawfulCodec (Array α) where
  roundtrip xs rest := by
    show Option.map _ (dec (enc xs.toList ++ rest)) = _
    rw [LawfulCodec.roundtrip]; rfl

instance [Codec α] [Codec β] : Codec (α × β) where
  enc p := enc p.1 ++ enc p.2
  dec r := do
    let (a, r) ← dec r
    let (b, r) ← dec r
    pure ((a, b), r)

instance [Codec α] [Codec β] [LawfulCodec α] [LawfulCodec β] : LawfulCodec (α × β) where
  roundtrip p rest := by simp [enc, dec, List.append_assoc]

/-! ## Everything else: through a type that already has a codec -/

/-- Encode `α` as `β`, given a way back. -/
@[instance_reducible] def viaCodec [Codec β] (f : α → β) (g : β → α) : Codec α where
  enc x := enc (f x)
  dec r := (dec r).map fun (y, r) => (g y, r)

theorem viaCodec_lawful [Codec β] [LawfulCodec β] (f : α → β) (g : β → α)
    (h : ∀ x, g (f x) = x) : @LawfulCodec α (viaCodec f g) :=
  @LawfulCodec.mk _ (viaCodec f g) fun x rest => by
    show Option.map _ (dec (enc (f x) ++ rest)) = _
    rw [LawfulCodec.roundtrip]; simp [h]

/-- An enum is its constructor index. -/
@[instance_reducible] def enumCodec (toN : α → Nat) (ofN : Nat → Option α) : Codec α where
  enc x := [toN x]
  dec | n :: r => (ofN n).map (·, r) | [] => none

theorem enumCodec_lawful (toN : α → Nat) (ofN : Nat → Option α) (h : ∀ x, ofN (toN x) = some x) :
    @LawfulCodec α (enumCodec toN ofN) :=
  @LawfulCodec.mk _ (enumCodec toN ofN) fun x rest => by
    show Option.map _ (ofN (toN x)) = _
    rw [h]; rfl

def Team.toN : Team → Nat
  | .villagers => 0 | .wolves => 1 | .lovers => 2 | .hamsters => 3
def Team.ofN : Nat → Option Team
  | 0 => some .villagers | 1 => some .wolves | 2 => some .lovers | 3 => some .hamsters | _ => none
instance : Codec Team := enumCodec Team.toN Team.ofN
instance : LawfulCodec Team := enumCodec_lawful _ _ (by intro x; cases x <;> rfl)

def RoleType.toN : RoleType → Nat
  | .villager => 0 | .seer => 1 | .bodyguard => 2 | .wolf => 3 | .madman => 4 | .lover => 5
  | .bitch => 6 | .medium => 7 | .hamster => 8
def RoleType.ofN : Nat → Option RoleType
  | 0 => some .villager | 1 => some .seer | 2 => some .bodyguard | 3 => some .wolf
  | 4 => some .madman | 5 => some .lover | 6 => some .bitch | 7 => some .medium
  | 8 => some .hamster | _ => none
instance : Codec RoleType := enumCodec RoleType.toN RoleType.ofN
instance : LawfulCodec RoleType := enumCodec_lawful _ _ (by intro x; cases x <;> rfl)

def ActionType.toN : ActionType → Nat
  | .vote => 0 | .bite => 1 | .unknown => 2 | .guard => 3 | .divine => 4 | .love => 5
  | .fakeLove => 6 | .loversSuicide => 7 | .medium => 8 | .hamsterCurse => 9
def ActionType.ofN : Nat → Option ActionType
  | 0 => some .vote | 1 => some .bite | 2 => some .unknown | 3 => some .guard
  | 4 => some .divine | 5 => some .love | 6 => some .fakeLove | 7 => some .loversSuicide
  | 8 => some .medium | 9 => some .hamsterCurse | _ => none
instance : Codec ActionType := enumCodec ActionType.toN ActionType.ofN
instance : LawfulCodec ActionType := enumCodec_lawful _ _ (by intro x; cases x <;> rfl)

def CauseOfDeath.toN : CauseOfDeath → Nat
  | .executed => 0 | .foundDead => 1
def CauseOfDeath.ofN : Nat → Option CauseOfDeath
  | 0 => some .executed | 1 => some .foundDead | _ => none
instance : Codec CauseOfDeath := enumCodec CauseOfDeath.toN CauseOfDeath.ofN
instance : LawfulCodec CauseOfDeath := enumCodec_lawful _ _ (by intro x; cases x <;> rfl)

def LogResult.toN : LogResult → Nat
  | .dead => 0 | .guarded => 1 | .partnered => 2 | .wolf => 3 | .nonWolf => 4 | .survived => 5
def LogResult.ofN : Nat → Option LogResult
  | 0 => some .dead | 1 => some .guarded | 2 => some .partnered | 3 => some .wolf
  | 4 => some .nonWolf | 5 => some .survived | _ => none
instance : Codec LogResult := enumCodec LogResult.toN LogResult.ofN
instance : LawfulCodec LogResult := enumCodec_lawful _ _ (by intro x; cases x <;> rfl)

/-- `all` is `none`, `afterall` is `some none`, `only rs` is `some (some rs)`. -/
instance : Codec Receivers := viaCodec
  (fun | .all => none | .afterall => some none | .only rs => some (some rs))
  (fun | none => .all | some none => .afterall | some (some rs) => .only rs)
instance : LawfulCodec Receivers := viaCodec_lawful _ _ (by intro x; cases x <;> rfl)

/-! Records are their fields in order, as nested pairs. -/

instance : Codec Action := viaCodec (fun a => (a.actor, a.actionType, a.target))
  fun (a, t, x) => ⟨a, t, x⟩
instance : LawfulCodec Action := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec Log := viaCodec (fun l => (l.receivers, l.actionType, l.actor, l.target, l.result))
  fun (rs, t, a, x, r) => ⟨rs, t, a, x, r⟩
instance : LawfulCodec Log := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec Day := viaCodec (fun d => (d.actions, d.logs)) fun (a, l) => ⟨a, l⟩
instance : LawfulCodec Day := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec Village := viaCodec (fun v => (v.roles, v.days)) fun (r, d) => ⟨r, d⟩
instance : LawfulCodec Village := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec AvailableAction := viaCodec (fun a => (a.actionType, a.targets))
  fun (t, x) => ⟨t, x⟩
instance : LawfulCodec AvailableAction := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec LogRef := viaCodec (fun l => (l.day, l.index)) fun (d, i) => ⟨d, i⟩
instance : LawfulCodec LogRef := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec CreatureStatus := viaCodec
  (fun s => (s.role, s.team, s.availableActions, s.causeOfDeath, s.visibleLogs))
  fun (r, t, a, c, v) => ⟨r, t, a, c, v⟩
instance : LawfulCodec CreatureStatus := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec Today := viaCodec (fun t => (t.dayNumber, t.winner, t.creatureStatuses))
  fun (n, w, c) => ⟨n, w, c⟩
instance : LawfulCodec Today := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec Death := viaCodec (fun d => (d.creature, d.cause)) fun (c, a) => ⟨c, a⟩
instance : LawfulCodec Death := viaCodec_lawful _ _ (fun _ => rfl)

instance : Codec DayResult := viaCodec (fun d => (d.voted, d.deaths, d.logs))
  fun (v, d, l) => ⟨v, d, l⟩
instance : LawfulCodec DayResult := viaCodec_lawful _ _ (fun _ => rfl)

/-! ## The two operations -/

/-- One request in, one response out (`[]` if the request does not decode). -/
def handle : List Nat → List Nat
  | 0 :: r =>
    match (dec r : Option (Array RoleType × List Nat)) with
    | some (roles, []) => enc (buildToday (createVillage roles))
    | _ => []
  | 1 :: r =>
    match (dec r : Option (Village × List Nat)) with
    | some (v, r) =>
      match (dec r : Option (Array Action × List Nat)) with
      | some (actions, []) =>
        let (nv, res) := processDay v actions
        enc res ++ enc nv.days.back! ++ enc (buildToday nv)
      | _ => []
    | none => []
  | _ => []

/-- What `handle` answers to a well-formed `processDay` request, stated on values: the codec
    adds nothing and drops nothing. -/
theorem handle_processDay (v : Village) (actions : Array Action) :
    handle (1 :: (enc v ++ enc actions)) =
      let (nv, res) := processDay v actions
      enc res ++ enc nv.days.back! ++ enc (buildToday nv) := by
  have h := LawfulCodec.roundtrip actions []
  simp only [List.append_nil] at h
  simp [handle, h]

theorem handle_createVillage (roles : Array RoleType) :
    handle (0 :: enc roles) = enc (buildToday (createVillage roles)) := by
  have h := LawfulCodec.roundtrip roles []
  simp only [List.append_nil] at h
  simp [handle, h]

end Jinro.Flat
