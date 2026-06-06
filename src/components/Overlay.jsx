/**
 * Overlay — the start screen and HUD.
 *
 * This is a regular React/DOM component, not a Three.js object.
 * It sits outside the Canvas and layers over the WebGL output via CSS.
 *
 * ── What's new in 3.1 ─────────────────────────────────────────────────────
 *
 * Two new HUD elements driven by the interaction store:
 *
 *   INTERACTION PROMPT — appears when the player looks at an NPC within range.
 *     Shows "[ E ]  Inspect <name>" just above the crosshair.
 *     Fades in/out with a CSS transition so it doesn't pop harshly.
 *
 *   INTERACTION FEEDBACK — a brief message that appears when the player presses E.
 *     Shows "You greeted <name>" for 2 seconds, then disappears.
 *     Implemented with a useEffect that clears after a timeout.
 *
 * Both elements read from useInteractionStore — the same store that the raycaster
 * and Player component write to. No prop threading required.
 */

import { useState, useEffect } from 'react'
import { useInteractionStore } from '../store/useInteractionStore'

// How long the interaction feedback message stays on screen (ms)
const FEEDBACK_DURATION = 2000

export default function Overlay({ locked, onStart }) {
  // ── Read interaction state ────────────────────────────────────────────────
  const lookingAt        = useInteractionStore(state => state.lookingAt)
  const lastInteraction  = useInteractionStore(state => state.lastInteraction)

  // ── Feedback message (shown briefly after pressing E) ────────────────────
  const [feedbackMsg, setFeedbackMsg] = useState(null)

  useEffect(() => {
    if (!lastInteraction) return

    setFeedbackMsg(`You greeted ${lastInteraction.name}`)

    const timer = setTimeout(() => setFeedbackMsg(null), FEEDBACK_DURATION)
    return () => clearTimeout(timer)
  }, [lastInteraction])

  return (
    <>
      {/* ── Start panel (shown when not locked) ──────────────────────── */}
      {!locked && (
        <div onClick={onStart} style={styles.overlay}>
          <h1 style={styles.title}>3D Explorer</h1>
          <p style={styles.sub}>A first-person world — React Three Fiber</p>

          <div style={styles.keyGrid}>
            <span style={styles.keyLabel}>W A S D</span>
            <span style={styles.keyDesc}>Move</span>
            <span style={styles.keyLabel}>Mouse</span>
            <span style={styles.keyDesc}>Look around</span>
            <span style={styles.keyLabel}>Shift</span>
            <span style={styles.keyDesc}>Sprint</span>
            <span style={styles.keyLabel}>E</span>
            <span style={styles.keyDesc}>Interact</span>
            <span style={styles.keyLabel}>ESC</span>
            <span style={styles.keyDesc}>Pause</span>
          </div>

          <div style={styles.cta}>Click anywhere to start</div>
          <p style={styles.escNote}>
            Press <strong>ESC</strong> at any time to release the mouse and return to your browser
          </p>
        </div>
      )}

      {/* ── Crosshair (always shown while locked) ────────────────────── */}
      {locked && (
        <div style={styles.crosshairWrap}>
          <div style={{
            ...styles.crosshairH,
            background: lookingAt ? 'rgba(136, 204, 255, 0.9)' : 'rgba(255,255,255,0.85)',
          }} />
          <div style={{
            ...styles.crosshairV,
            background: lookingAt ? 'rgba(136, 204, 255, 0.9)' : 'rgba(255,255,255,0.85)',
          }} />
        </div>
      )}

      {/* ── Interaction prompt ────────────────────────────────────────── */}
      {/* Shown when the player is looking at an interactable within range.
          CSS opacity transition makes it fade in/out smoothly. */}
      {locked && (
        <div style={{
          ...styles.interactPrompt,
          opacity: lookingAt ? 1 : 0,
          transform: lookingAt
            ? 'translate(-50%, 0)'
            : 'translate(-50%, 6px)',
        }}>
          <span style={styles.keyBadge}>E</span>
          &nbsp;&nbsp;Inspect{lookingAt ? ` ${lookingAt.name}` : ''}
        </div>
      )}

      {/* ── Interaction feedback ──────────────────────────────────────── */}
      {locked && feedbackMsg && (
        <div style={styles.feedback}>
          {feedbackMsg}
        </div>
      )}

      {/* ── HUD hint bar ──────────────────────────────────────────────── */}
      {locked && (
        <div style={styles.hud}>
          W A S D · Move &nbsp;|&nbsp; Mouse · Look &nbsp;|&nbsp; Shift · Sprint &nbsp;|&nbsp; E · Interact &nbsp;|&nbsp; ESC · Pause
        </div>
      )}
    </>
  )
}

// ── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.78)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    cursor: 'pointer',
    zIndex: 20,
    fontFamily: 'monospace',
    userSelect: 'none',
  },
  title: {
    fontSize: '38px',
    color: '#fff',
    letterSpacing: '0.05em',
  },
  sub: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.55)',
  },
  keyGrid: {
    marginTop: '10px',
    display: 'grid',
    gridTemplateColumns: 'auto auto',
    gap: '6px 28px',
  },
  keyLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: '13px',
    textAlign: 'right',
  },
  keyDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '13px',
  },
  cta: {
    marginTop: '20px',
    padding: '10px 28px',
    border: '2px solid rgba(255,255,255,0.4)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '15px',
    letterSpacing: '0.05em',
  },
  escNote: {
    marginTop: '10px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    maxWidth: '300px',
    lineHeight: '1.5',
  },

  // ── Crosshair ─────────────────────────────────────────────────────────────
  crosshairWrap: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%,-50%)',
    width: '20px',
    height: '20px',
    pointerEvents: 'none',
    zIndex: 10,
  },
  // Horizontal bar of the crosshair
  crosshairH: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: '2px',
    transform: 'translateY(-50%)',
    transition: 'background 0.15s ease',
  },
  // Vertical bar of the crosshair
  crosshairV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: '2px',
    transform: 'translateX(-50%)',
    transition: 'background 0.15s ease',
  },

  // ── Interaction prompt ────────────────────────────────────────────────────
  interactPrompt: {
    position: 'fixed',
    top: 'calc(50% - 36px)',   // just above the crosshair
    left: '50%',
    transform: 'translate(-50%, 0)',
    color: '#fff',
    fontSize: '14px',
    fontFamily: 'monospace',
    letterSpacing: '0.04em',
    textShadow: '0 1px 6px rgba(0,0,0,0.95)',
    pointerEvents: 'none',
    zIndex: 10,
    whiteSpace: 'nowrap',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  keyBadge: {
    display: 'inline-block',
    padding: '1px 7px',
    border: '1.5px solid rgba(255,255,255,0.7)',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#fff',
    background: 'rgba(0,0,0,0.5)',
    lineHeight: '1.6',
  },

  // ── Interaction feedback ──────────────────────────────────────────────────
  feedback: {
    position: 'fixed',
    top: '38%',
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'rgba(136, 204, 255, 0.95)',
    fontSize: '15px',
    fontFamily: 'monospace',
    letterSpacing: '0.05em',
    textShadow: '0 1px 8px rgba(0,0,0,1)',
    pointerEvents: 'none',
    zIndex: 10,
    whiteSpace: 'nowrap',
    animation: 'fadeInUp 0.25s ease',
  },

  // ── HUD hint bar ──────────────────────────────────────────────────────────
  hud: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '13px',
    letterSpacing: '0.04em',
    textShadow: '0 1px 4px rgba(0,0,0,0.9)',
    pointerEvents: 'none',
    zIndex: 10,
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
}
