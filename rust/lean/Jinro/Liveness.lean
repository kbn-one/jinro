import Aeneas
import Jinro.Core
open Aeneas Aeneas.Std Result

/-!
# Refinement types over the generated model

Rust (and therefore the Aeneas translation) only knows plain creature ids
(`Usize`) and plain `Action`s. In Lean we can carve out the meaningful ones
as *subtypes*: a value paired with a proof about it.

These are dependent pairs, not plain products: the proof's type mentions the
value (and the village), so "alive" is a property relative to a `Village`.
A role, by contrast, never changes, so it could also be a type index; we use
subtypes for both to keep one style.
-/

namespace jinro_core

/-- A creature id that refers to a creature alive in `v`. -/
abbrev AliveCid (v : Village) :=
  { c : Std.Usize // c.val < v.roles.length ∧ is_alive v c = ok true }

/-- A creature id whose role in `v` is `r` (e.g. `RoleCid v .Villager`). -/
abbrev RoleCid (v : Village) (r : RoleType) :=
  { c : Std.Usize // ∃ h : c.val < v.roles.length, v.roles.val[c.val] = r }

/-- An action whose actor exists and is alive in `v`. -/
abbrev LiveAction (v : Village) := { a : Action // is_live_action v a = ok true }

/-- One unrolling of the `live_actions` loop. -/
theorem live_actions_loop_unfold (v : Village) (actions out : alloc.vec.Vec Action) (i : Std.Usize) :
    live_actions_loop v actions out i =
      (do
        let r ← live_actions_loop.body v actions out i
        match r with
        | ControlFlow.cont x => live_actions_loop v actions x.1 x.2
        | ControlFlow.done x => ok x) := by
  conv => lhs; unfold live_actions_loop; unfold loop
  simp only
  congr 1
  funext r
  cases r with
  | cont x => obtain ⟨o, j⟩ := x; rfl
  | done x => rfl

/-- Loop invariant of `live_actions`: everything collected so far is live. -/
theorem live_actions_loop_sound (v : Village) (actions : alloc.vec.Vec Action) :
    ∀ (n : Nat) (out : alloc.vec.Vec Action) (i : Std.Usize) (out' : alloc.vec.Vec Action),
      actions.length - i.val = n →
      (∀ a ∈ out.val, is_live_action v a = ok true) →
      live_actions_loop v actions out i = ok out' →
      ∀ a ∈ out'.val, is_live_action v a = ok true := by
  intro n
  induction n using Nat.strong_induction_on with
  | _ n ih =>
  intro out i out' hn hinv h
  rw [live_actions_loop_unfold] at h
  simp only [live_actions_loop.body] at h
  split at h
  · rename_i hlt
    cases hidx : alloc.vec.Vec.index (core.slice.index.SliceIndexUsizeSlice Action) actions i <;>
      simp [hidx] at h
    rename_i a
    cases hb : is_live_action v a <;> simp [hb] at h
    rename_i b
    cases ho : (if b = true then out.push a else ok out) <;> simp [ho] at h
    rename_i o
    have hinv' : ∀ x ∈ o.val, is_live_action v x = ok true := by
      cases b with
      | false =>
        simp at ho
        subst ho
        exact hinv
      | true =>
        simp [alloc.vec.Vec.push] at ho
        split at ho
        · simp at ho
          subst ho
          intro x hx
          simp at hx
          rcases hx with hx | hx
          · exact hinv x hx
          · subst hx; exact hb
        · simp at ho
    cases hj : i + 1#usize <;> simp [hj] at h
    rename_i j
    have hadd := UScalar.add_equiv i 1#usize
    rw [hj] at hadd
    simp at hadd
    have hlt' : i.val < actions.length := by
      simpa [alloc.vec.Vec.len] using hlt
    exact ih (actions.length - j.val) (by omega) o j out' rfl hinv' h
  · simp at h
    subst h
    exact hinv

/-- Every action that `process_day` acts on has a living actor: dead creatures
    can neither act nor vote. -/
theorem live_actions_sound (v : Village) (actions out : alloc.vec.Vec Action)
    (h : live_actions v actions = ok out) :
    ∀ a ∈ out.val, is_live_action v a = ok true :=
  live_actions_loop_sound v actions _ _ _ out rfl (by simp) h

/-- The result of `live_actions`, typed: a list of `LiveAction v`. -/
def live_actions_typed (v : Village) (actions : alloc.vec.Vec Action) (out : alloc.vec.Vec Action)
    (h : live_actions v actions = ok out) : List (LiveAction v) :=
  out.val.attach.map fun ⟨a, ha⟩ => ⟨a, live_actions_sound v actions out h a ha⟩

end jinro_core
