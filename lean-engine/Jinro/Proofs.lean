import Jinro.Engine

/-!
# Properties of the engine

These are about `Jinro.Engine` itself — the definitions compiled into the wasm the web demo
runs — not about a translation of other code. Proofs are erased at compile time; they cost
nothing at run time.
-/

namespace Jinro

/-- Every action `liveActions` keeps has an actor that exists and is alive. -/
theorem mem_liveActions {v : Village} {s : Array Action} {a : Action}
    (h : a ∈ liveActions v s) : a.actor < v.roles.size ∧ isAlive v a.actor = true := by
  simp only [liveActions, isLiveAction, Array.mem_filter, Bool.and_eq_true,
    decide_eq_true_eq] at h
  exact h.2

/-- `processDay` records exactly the live actions as the new day. -/
theorem processDay_days (v : Village) (s : Array Action) :
    ∃ logs, (processDay v s).1.days = v.days.push ⟨liveActions v s, logs⟩ :=
  ⟨_, rfl⟩

/-- Dead creatures can neither act nor vote: every action of the day `processDay` adds has a
    living actor. -/
theorem dead_cannot_act (v : Village) (s : Array Action) (d : Day)
    (hd : (processDay v s).1.days.back? = some d) :
    ∀ a ∈ d.actions, a.actor < v.roles.size ∧ isAlive v a.actor = true := by
  obtain ⟨logs, h⟩ := processDay_days v s
  rw [h, Array.back?_push] at hd
  cases hd
  intro a ha
  exact mem_liveActions ha

/-- In-game death announcements never reveal a bite, a lovers' suicide or a hamster curse. -/
theorem publicDeathAction_hides (c : ActionType) :
    publicDeathAction c ≠ .bite ∧ publicDeathAction c ≠ .loversSuicide ∧
      publicDeathAction c ≠ .hamsterCurse := by
  cases c <;> decide

/-- Every role is on the team the rules say. -/
theorem teamOf_spec :
    teamOf .wolf = .wolves ∧ teamOf .madman = .wolves ∧ teamOf .lover = .lovers ∧
      teamOf .bitch = .lovers ∧ teamOf .villager = .villagers ∧ teamOf .hamster = .villagers :=
  by decide


/-! ## One day at a time -/

/-- `processDay` never changes who is who. -/
theorem processDay_roles (v : Village) (s : Array Action) :
    (processDay v s).1.roles = v.roles := rfl

/-- `processDay` appends exactly one day. -/
theorem processDay_days_size (v : Village) (s : Array Action) :
    (processDay v s).1.days.size = v.days.size + 1 := by
  obtain ⟨logs, h⟩ := processDay_days v s
  rw [h, Array.size_push]

/-- Adding a day never brings anyone back: whoever is alive afterwards was alive before. -/
theorem isAlive_of_push (v : Village) (d : Day) (c : Cid)
    (h : isAlive { v with days := v.days.push d } c = true) : isAlive v c = true := by
  simp only [isAlive, publicDeath, Array.findSome?_push, Option.isNone_iff_eq_none] at *
  cases hv : v.days.findSome? _ with
  | none => rfl
  | some x => rw [hv] at h; simp at h

/-- Nobody is revived by `processDay`. -/
theorem processDay_no_revive (v : Village) (s : Array Action) (c : Cid)
    (h : isAlive (processDay v s).1 c = true) : isAlive v c = true :=
  isAlive_of_push v _ c h

/-! ## Winning -/

/-- The base rules never name the hamsters; only the final override does. -/
theorem baseWinner_ne_hamsters (v : Village) : baseWinner v ≠ some .hamsters := by
  intro h
  unfold baseWinner at h
  repeat' (first | split at h | simp at h)

/-- The hamsters win only while a hamster is alive. -/
theorem hamsterAlive_of_winner (v : Village) (h : winner v = some .hamsters) :
    hamsterAlive v = true := by
  unfold winner at h
  cases hb : baseWinner v with
  | none => rw [hb] at h; simp at h
  | some t =>
    rw [hb] at h
    by_cases ha : hamsterAlive v = true
    · exact ha
    · simp [ha] at h
      exact absurd (h ▸ hb) (baseWinner_ne_hamsters v)

/-! ## Who sees what -/

/-- In-game (before anyone wins), a creature sees a log only if it is public or addressed to it. -/
theorem canSee_in_game {l : Log} {c : Cid} (h : canSee l c false = true) :
    l.receivers = .all ∨ ∃ rs, l.receivers = .only rs ∧ c ∈ rs := by
  unfold canSee at h
  split at h
  · exact .inl ‹_›
  · simp at h
  · exact .inr ⟨_, ‹_›, by simpa using h⟩

/-- Every log reference in a creature's view points at a real log that creature may see. -/
theorem mem_visibleLogs {v : Village} {c : Cid} {go : Bool} {r : LogRef}
    (h : r ∈ visibleLogs v c go) :
    ∃ day l, v.days[r.day]? = some day ∧ day.logs[r.index]? = some l ∧ canSee l c go = true := by
  simp only [visibleLogs, Array.mem_flatMap, Array.mem_filterMap] at h
  obtain ⟨⟨day, d⟩, hd, ⟨l, i⟩, hl, hsome⟩ := h
  rw [Array.mem_zipIdx_iff_getElem?] at hd hl
  split at hsome
  · cases hsome
    exact ⟨day, l, hd, hl, ‹_›⟩
  · cases hsome

/-- So, in-game, every log a creature is shown is public or addressed to it. -/
theorem visibleLogs_in_game {v : Village} {c : Cid} {r : LogRef} (h : r ∈ visibleLogs v c false) :
    ∃ day l, v.days[r.day]? = some day ∧ day.logs[r.index]? = some l ∧
      (l.receivers = .all ∨ ∃ rs, l.receivers = .only rs ∧ c ∈ rs) := by
  obtain ⟨day, l, hd, hl, hs⟩ := mem_visibleLogs h
  exact ⟨day, l, hd, hl, canSee_in_game hs⟩

end Jinro
