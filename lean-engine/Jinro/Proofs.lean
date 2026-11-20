import Jinro.Engine

/-!
# Properties of the engine

These are about `Jinro.Engine` itself — the definitions Lasm compiles into the wasm the web demo
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

end Jinro
