/**
 * Overlay — the start screen and HUD.
 *
 * This is a regular React/DOM component, not a Three.js object.
 * It sits outside the Canvas and layers over the WebGL output via CSS.
 *
 * The crosshair and HUD are always visible once the game starts.
 * The start panel is shown only when the pointer is not locked.
 */
export default function Overlay({ locked, onStart }) {
  return (
    <>
      {/* ── Start panel (shown when not locked) ──────────────────── */}
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
            <span style={styles.keyLabel}>ESC</span>
            <span style={styles.keyDesc}>Pause</span>
          </div>

          <div style={styles.cta}>Click anywhere to start</div>
        </div>
      )}

      {/* ── Crosshair (always shown while locked) ────────────────── */}
      {locked && <div style={styles.crosshairWrap}><div style={styles.crosshair} /></div>}

      {/* ── HUD hint bar ─────────────────────────────────────────── */}
      {locked && (
        <div style={styles.hud}>
          W A S D · Move &nbsp;|&nbsp; Mouse · Look &nbsp;|&nbsp; Shift · Sprint &nbsp;|&nbsp; ESC · Pause
        </div>
      )}
    </>
  )
}

// ── Inline styles (no extra CSS file needed for a few rules) ────────────

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
  crosshairWrap: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%,-50%)',
    width: '24px',
    height: '24px',
    pointerEvents: 'none',
    zIndex: 10,
  },
  crosshair: {
    position: 'relative',
    width: '100%',
    height: '100%',
    // drawn via ::before / ::after would need a className — use a Box approach instead
  },
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
