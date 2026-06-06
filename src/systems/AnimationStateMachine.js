/**
 * AnimationStateMachine.js
 *
 * A minimal class-based state machine for managing procedural animation states.
 * Used by Human.jsx to blend smoothly between IDLE, WALK, and RUN.
 *
 * ── Why an Animation State Machine? ──────────────────────────────────────────
 *
 * The naive approach to switching animations is to immediately replace one set
 * of sine-wave parameters with another. This produces a jarring snap — the arm
 * that was mid-swing instantly locks into the new position.
 *
 * The correct approach is BLENDING: run both animations simultaneously and
 * linearly interpolate between them, ramping the blend weight from 0 to 1 over
 * ~0.2–0.4 seconds. During the transition, the character smoothly flows from
 * idle posture into walking stride, just as a real person would.
 *
 * This is exactly what Unity's Animator and Unreal's AnimBlueprint do — the
 * fancy editor UI is a visual wrapper for exactly this state + weight + blend
 * concept.
 *
 * ── Structure ────────────────────────────────────────────────────────────────
 *
 * The machine has:
 *   current    — the state we're transitioning TO
 *   previous   — the state we're transitioning FROM
 *   weight     — 0.0 = fully 'previous', 1.0 = fully 'current'
 *
 * Each frame, weight is advanced toward 1.0 at `blendSpeed` units/second.
 * When weight reaches 1.0, the transition is complete and previous = current.
 *
 * getWeight(state) returns the effective influence of a given state:
 *   - If it's `current`:  blendWeight
 *   - If it's `previous`: 1 - blendWeight
 *   - Otherwise:          0
 *
 * The animation code in Human.jsx lerps every parameter by these weights.
 * This means any number of body parts (arms, legs, torso, head) can be
 * driven by the same blend factor without extra logic.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   const fsm = useRef(new AnimationStateMachine(ANIM.IDLE))
 *
 *   useFrame((_, delta) => {
 *     fsm.current.update(delta)
 *
 *     const idleW = fsm.current.getWeight(ANIM.IDLE)
 *     const walkW = fsm.current.getWeight(ANIM.WALK)
 *
 *     // Blend arm rotation between idle sway and walk swing
 *     armRef.current.rotation.x = idleW * idleSway + walkW * walkSwing
 *   })
 *
 *   // Trigger state change (from movement input or AI):
 *   fsm.current.setState(ANIM.WALK)
 */

// ── State names ───────────────────────────────────────────────────────────────

export const ANIM = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  RUN:  'run',
})

// ── AnimationStateMachine ─────────────────────────────────────────────────────

export class AnimationStateMachine {
  /**
   * @param {string} initialState  One of the ANIM constants (default ANIM.IDLE)
   * @param {number} blendSpeed    How fast transitions complete (units/second).
   *                               4.0 = ~250ms transition. 8.0 = ~125ms.
   */
  constructor(initialState = ANIM.IDLE, blendSpeed = 4.0) {
    this.current    = initialState
    this.previous   = initialState
    this.weight     = 1.0        // starts fully in initial state
    this.blendSpeed = blendSpeed
  }

  /**
   * Trigger a transition to a new state.
   * If already in that state, does nothing (no snap or redundant transition).
   * @param {string} newState
   */
  setState(newState) {
    if (newState === this.current) return

    // Start crossfade: weight resets to 0 (fully previous), rises to 1 (fully current)
    this.previous = this.current
    this.current  = newState
    this.weight   = 0.0
  }

  /**
   * Advance the blend weight. Call once per frame before reading getWeight.
   * @param {number} delta  Frame delta time in seconds
   */
  update(delta) {
    if (this.weight < 1.0) {
      this.weight = Math.min(1.0, this.weight + delta * this.blendSpeed)
    }
  }

  /**
   * Returns the blend weight of a given animation state for this frame.
   *   - `current` state returns `weight` (0→1 during transition)
   *   - `previous` state returns `1 - weight` (1→0 during transition)
   *   - Any other state returns 0
   *
   * @param {string} state  One of the ANIM constants
   * @returns {number}  Weight in [0, 1]
   */
  getWeight(state) {
    if (state === this.current)  return this.weight
    if (state === this.previous) return 1.0 - this.weight
    return 0.0
  }

  /** True while a transition is in progress */
  get isTransitioning() {
    return this.weight < 1.0
  }

  /** The state that is currently dominant (or just finished taking over) */
  get dominantState() {
    return this.weight >= 0.5 ? this.current : this.previous
  }
}

export default AnimationStateMachine
