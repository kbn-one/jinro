import Jinro.Engine

/-!
# Properties of the engine

These are about `Jinro.Engine` itself — the definitions compiled into the wasm the web demo
runs — not about a translation of other code. Proofs are erased at compile time; they cost
nothing at run time.
-/

namespace Jinro

/-- What `liveActions` lets through: an action of a living creature, or a vote of the system. -/
def Admissible (v : Village) (a : Action) : Prop :=
  match a.actor with
  | some c => c < v.roles.size ∧ isAlive v c = true
  | none => isVote a = true

/-- Every action `liveActions` keeps has an actor that exists and is alive, or is a system vote. -/
theorem mem_liveActions {v : Village} {s : Array Action} {a : Action}
    (h : a ∈ liveActions v s) : Admissible v a := by
  simp only [liveActions, isLiveAction, Array.mem_filter] at h
  unfold Admissible
  split <;> simp_all

/-- `processDay` records exactly the live actions as the new day. -/
theorem processDay_days (v : Village) (s : Array Action) :
    ∃ logs, (processDay v s).1.days = v.days.push ⟨liveActions v s, logs⟩ :=
  ⟨_, rfl⟩

/-- Dead creatures can neither act nor vote: every action of the day `processDay` adds has a
    living actor. -/
theorem dead_cannot_act (v : Village) (s : Array Action) (d : Day)
    (hd : (processDay v s).1.days.back? = some d) :
    ∀ a ∈ d.actions, Admissible v a := by
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

/-! ## The vote -/

/-- A vote of an earlier round is never counted. -/
theorem prevote_not_counted (a : Action) (h : a.actionType = .prevote) : isVote a = false := by
  simp [isVote, h]

/-- Nobody is executed on a tie, and a tie is reported only when nobody is executed. -/
theorem tiedVote_of_voted (as : Array Action) (n : Nat) (c : Cid)
    (h : computeVoteDeath as n = some c) : tiedVote as n = #[] := by
  unfold computeVoteDeath plurality at h
  unfold tiedVote
  dsimp only at h ⊢
  split at h
  · rename_i h1
    have : (topTargets as n isVote).size = 1 := by simpa using h1
    simp [this]
  · simp at h

/-! ## The bite -/

theorem addDeath_size_le (st : DayState) (c : Cid) (a : ActionType) :
    (st.addDeath c a).deaths.size ≤ st.deaths.size + 1 := by
  unfold DayState.addDeath
  split <;> simp

/-- The pack kills at most one creature a night, however many wolves bite. -/
theorem resolveBite_deaths (v : Village) (g : Option Cid) (as : Array Action) (st : DayState) :
    (resolveBite v g as st).deaths.size ≤ st.deaths.size + 1 := by
  unfold resolveBite
  split
  · omega
  · dsimp only
    split
    · simp [DayState.addLog]
    · split
      · simp [DayState.addLog]
      · exact addDeath_size_le _ _ _

/-! ## Winning -/

/-- Nobody wins before the game is over. -/
theorem gameOver_of_winner (v : Village) (t : Team) (h : winner v = some t) :
    gameOver v = true := by
  cases hg : gameOver v <;> simp_all [winner]

/-- Once the game is over, somebody wins. -/
theorem winner_isSome_of_gameOver (v : Village) (h : gameOver v = true) :
    (winner v).isSome = true := by
  unfold winner
  simp only [h]
  repeat' split
  all_goals simp_all

/-- The lovers win exactly when the game ends with a couple alive. -/
theorem winner_lovers_iff (v : Village) :
    winner v = some .lovers ↔ gameOver v = true ∧ coupleAlive v = true := by
  cases hg : gameOver v <;> cases hc : coupleAlive v <;> simp [winner, hg, hc] <;>
    repeat' split
  all_goals simp_all

/-- The hamsters win only while a hamster is alive, and never over a living couple. -/
theorem hamsterAlive_of_winner (v : Village) (h : winner v = some .hamsters) :
    hamsterAlive v = true ∧ coupleAlive v = false := by
  cases hg : gameOver v <;> cases hc : coupleAlive v <;> cases hh : hamsterAlive v <;>
    simp_all [winner] <;> (repeat' split at h) <;> simp_all

/-- The head count sees no wolf only when no wolf at all is alive: a loved wolf is still counted
    once the rest of the pack is gone. -/
theorem no_wolves_of_headCount (v : Village) (h : (headCount v).1 = 0) :
    (aliveIds v).filter (isWolf v) = #[] := by
  unfold headCount at h
  dsimp only at h
  split at h
  · exact Array.eq_empty_of_size_eq_zero h
  · rename_i hp
    exact absurd (Array.isEmpty_iff_size_eq_zero.mpr h) hp

/-- The village wins only with no wolf left alive. -/
theorem no_wolves_of_winner_villagers (v : Village) (h : winner v = some .villagers) :
    (aliveIds v).filter (isWolf v) = #[] := by
  apply no_wolves_of_headCount
  cases hg : gameOver v <;> cases hc : coupleAlive v <;> cases hh : hamsterAlive v <;>
    simp_all [winner]

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
