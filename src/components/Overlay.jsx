/**
 * Overlay — start screen and full HUD.
 *
 * A pure React/DOM component layered over the WebGL canvas via CSS.
 * Everything here is regular HTML + inline styles — no Three.js.
 *
 * ── HUD Layout (locked state) ─────────────────────────────────────────────
 *
 *   [top-center]    Compass — cardinal direction strip, scrolls with camera
 *   [top-left]      Health bar + Stamina bar + NPC met counter
 *   [center]        Crosshair (turns blue when looking at an NPC)
 *   [above center]  Interaction prompt — "[ E ] Inspect Name"
 *   [upper-center]  Interaction feedback — "You greeted Name"
 *   [bottom-center] Inventory quick bar — 5 slots, 1–5 to select
 *   [very bottom]   Control hints
 *
 * ── Dialogue panel (3.4) ──────────────────────────────────────────────────
 *
 *   When activeDialogue is not null, the DialoguePanel renders over the HUD.
 *   Pointer lock is released when dialogue opens (so the mouse is free to
 *   click response buttons). The start screen is suppressed while dialogue
 *   is active so it doesn't appear behind the panel.
 *
 *   On dialogue close (next === null), requestLock() is called inside the
 *   click handler (still within the user gesture) to re-acquire pointer lock.
 *
 * ── Compass bearing math ──────────────────────────────────────────────────
 *
 * camera.rotation.y is Three.js yaw (radians). Convention:
 *   yaw = 0  → facing -Z → we call this "North"
 *   yaw > 0  → turning left  → West direction
 *   yaw < 0  → turning right → East direction
 *
 * compassBearing = (−yaw × 180/π + 360) % 360
 *   0°=N  90°=E  180°=S  270°=W
 *
 * Each compass marker is positioned relative to the visible 90° window:
 *   diff = markerAngle − bearing   (normalized to −180…+180)
 *   x    = HALF_WIDTH + diff × (COMPASS_WIDTH / COMPASS_FOV)
 * Markers where |diff| > FOV/2 + padding are not rendered.
 *
 * ── Inventory slot system ─────────────────────────────────────────────────
 *
 * `equippedSlot` (0–4) lives in useGameStore. Player.jsx handles 1–5 keys
 * and calls equipSlot(). The Overlay just reads and displays — it never
 * writes to the store.
 */

import { useState, useEffect } from 'react'
import { useInteractionStore } from '../store/useInteractionStore'
import { useGameStore }        from '../store/useGameStore'
import { useWorldStore }       from '../store/useWorldStore'
import { DIALOGUE }            from '../data/dialogue'
import { requestLock }         from '../systems/pointerLock'

const FEEDBACK_DURATION = 2200   // ms before interaction message fades
const COMPASS_WIDTH     = 200    // px — visible window of the compass strip
const COMPASS_FOV       = 90     // degrees visible in the window
const SLOT_COUNT        = 5

// ── Compass ──────────────────────────────────────────────────────────────────

const COMPASS_MARKERS = [
  { label: 'N',  angle: 0   },
  { label: 'NE', angle: 45  },
  { label: 'E',  angle: 90  },
  { label: 'SE', angle: 135 },
  { label: 'S',  angle: 180 },
  { label: 'SW', angle: 225 },
  { label: 'W',  angle: 270 },
  { label: 'NW', angle: 315 },
]

function Compass({ yaw }) {
  const bearing = ((-yaw * 180 / Math.PI) % 360 + 360) % 360

  const half        = COMPASS_WIDTH / 2
  const pxPerDegree = COMPASS_WIDTH / COMPASS_FOV
  const cullPad     = 16

  return (
    <div style={cs.wrap}>
      <div style={cs.strip}>
        {COMPASS_MARKERS.map(({ label, angle }) => {
          let diff = angle - bearing
          if (diff >  180) diff -= 360
          if (diff < -180) diff += 360

          const x = half + diff * pxPerDegree
          if (x < -cullPad || x > COMPASS_WIDTH + cullPad) return null

          const isCardinal = label.length === 1
          const isNorth    = label === 'N'

          return (
            <div key={label} style={{ ...cs.markerWrap, left: x }}>
              <div style={{
                ...cs.tick,
                height:     isCardinal ? 7 : 4,
                width:      isCardinal ? 2 : 1,
                background: isNorth ? '#f87171' : 'rgba(255,255,255,0.45)',
              }} />
              <span style={{
                ...cs.markerLabel,
                fontSize:   isCardinal ? '10px' : '8px',
                color:      isNorth    ? '#f87171'
                          : isCardinal ? 'rgba(255,255,255,0.9)'
                                       : 'rgba(255,255,255,0.4)',
                fontWeight: isCardinal ? 'bold' : 'normal',
              }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
      <div style={cs.centerMark} />
    </div>
  )
}

const cs = {
  wrap: {
    position:   'fixed',
    top:        '18px',
    left:       '50%',
    transform:  'translateX(-50%)',
    width:      COMPASS_WIDTH,
    height:     34,
    background: 'rgba(0,0,0,0.48)',
    border:     '1px solid rgba(255,255,255,0.1)',
    borderRadius: 5,
    overflow:   'hidden',
    pointerEvents: 'none',
    zIndex:     10,
  },
  strip: {
    position: 'relative',
    width:    '100%',
    height:   '100%',
  },
  markerWrap: {
    position:       'absolute',
    top:            5,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            2,
    transform:      'translateX(-50%)',
    fontFamily:     'monospace',
  },
  tick:        { borderRadius: 1 },
  markerLabel: { lineHeight: 1, userSelect: 'none' },
  centerMark: {
    position:    'absolute',
    bottom:      4,
    left:        '50%',
    transform:   'translateX(-50%)',
    width:       0,
    height:      0,
    borderLeft:  '4px solid transparent',
    borderRight: '4px solid transparent',
    borderBottom:'5px solid rgba(255,255,255,0.7)',
  },
}

// ── Stat bars (health + stamina) ─────────────────────────────────────────────

function StatBars({ health, maxHealth, stamina, maxStamina, isExhausted, metCount }) {
  const hpPct = Math.max(0, (health  / maxHealth)  * 100)
  const stPct = Math.max(0, (stamina / maxStamina) * 100)

  const hpColor = hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#fb923c' : '#f87171'
  const stColor = isExhausted ? '#7f1d1d' : '#3b82f6'

  return (
    <div style={sb.container}>
      {/* Health */}
      <div style={sb.row}>
        <span style={{ ...sb.icon, color: hpColor }}>♥</span>
        <div style={sb.track}>
          <div style={{ ...sb.fill, width: `${hpPct}%`, background: hpColor }} />
          <div style={sb.glassSheen} />
        </div>
        <span style={sb.value}>{Math.ceil(health)}</span>
      </div>

      {/* Stamina */}
      <div style={sb.row}>
        <span style={{ ...sb.icon, color: isExhausted ? '#ef4444' : '#60a5fa' }}>⚡</span>
        <div style={sb.track}>
          <div style={{ ...sb.fill, width: `${stPct}%`, background: stColor }} />
          <div style={sb.glassSheen} />
          {isExhausted && <span style={sb.exhaustedBadge}>EXHAUSTED</span>}
        </div>
        <span style={sb.value}>{Math.ceil(stamina)}</span>
      </div>

      {/* Met NPC counter */}
      {metCount > 0 && (
        <div style={sb.metRow}>
          {'★'.repeat(metCount)}{'☆'.repeat(3 - metCount)}
          <span style={sb.metLabel}> Met {metCount}/3</span>
        </div>
      )}
    </div>
  )
}

const sb = {
  container: {
    position:      'fixed',
    top:           64,
    left:          18,
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
    pointerEvents: 'none',
    zIndex:        10,
    fontFamily:    'monospace',
    userSelect:    'none',
  },
  row:    { display: 'flex', alignItems: 'center', gap: 7 },
  icon: {
    fontSize:  13,
    width:     14,
    textAlign: 'center',
    flexShrink: 0,
    textShadow: '0 0 8px currentColor',
  },
  track: {
    position:     'relative',
    width:        170,
    height:       10,
    background:   'rgba(0,0,0,0.6)',
    borderRadius: 4,
    border:       '1px solid rgba(255,255,255,0.1)',
    overflow:     'hidden',
  },
  fill: {
    height:     '100%',
    borderRadius: 4,
    transition: 'width 0.12s linear, background 0.3s ease',
  },
  glassSheen: {
    position:   'absolute',
    inset:      0,
    background: 'linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, transparent 60%)',
    pointerEvents: 'none',
  },
  exhaustedBadge: {
    position:    'absolute',
    inset:       0,
    display:     'flex',
    alignItems:  'center',
    justifyContent: 'center',
    fontSize:    7,
    letterSpacing: '0.1em',
    color:       '#fca5a5',
    fontFamily:  'monospace',
    fontWeight:  'bold',
  },
  value: {
    fontSize:  11,
    color:     'rgba(255,255,255,0.5)',
    minWidth:  28,
    textAlign: 'right',
  },
  metRow: {
    marginTop: 2,
    fontSize:  11,
    color:     'rgba(255,200,50,0.7)',
    letterSpacing: '0.04em',
  },
  metLabel: { color: 'rgba(136,204,255,0.65)' },
}

// ── Inventory quick bar ───────────────────────────────────────────────────────

function InventoryBar({ inventory, equippedSlot }) {
  return (
    <div style={inv.bar}>
      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const item     = inventory[i]
        const isActive = i === equippedSlot

        return (
          <div key={i} style={{
            ...inv.slot,
            borderColor: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)',
            background:  isActive ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.52)',
            boxShadow:   isActive
              ? '0 0 0 1px rgba(255,255,255,0.2), 0 0 12px rgba(255,255,255,0.15)'
              : 'none',
          }}>
            <span style={{
              ...inv.keyHint,
              color: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
            }}>
              {i + 1}
            </span>
            {item && (
              <div style={inv.itemContent}>
                <div style={{ ...inv.iconSwatch, background: item.color || '#666' }} />
                <span style={{
                  ...inv.itemName,
                  color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                }}>
                  {item.name.split(' ')[0]}
                </span>
              </div>
            )}
            {isActive && <div style={inv.activeDot} />}
          </div>
        )
      })}
    </div>
  )
}

const inv = {
  bar: {
    position:       'fixed',
    bottom:         54,
    left:           '50%',
    transform:      'translateX(-50%)',
    display:        'flex',
    gap:            5,
    pointerEvents:  'none',
    zIndex:         10,
    userSelect:     'none',
  },
  slot: {
    position:      'relative',
    width:         54,
    height:        54,
    border:        '1.5px solid',
    borderRadius:  6,
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    justifyContent:'center',
    transition:    'border-color 0.1s ease, background 0.1s ease, box-shadow 0.1s ease',
    fontFamily:    'monospace',
  },
  keyHint: {
    position:   'absolute',
    top:        4,
    right:      5,
    fontSize:   9,
    lineHeight: 1,
    transition: 'color 0.1s ease',
  },
  itemContent: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           3,
  },
  iconSwatch: {
    width:        28,
    height:       28,
    borderRadius: 4,
    boxShadow:    'inset 0 1px 2px rgba(255,255,255,0.2)',
  },
  itemName: {
    fontSize:      8,
    letterSpacing: '0.02em',
    lineHeight:    1,
    maxWidth:      50,
    textAlign:     'center',
    overflow:      'hidden',
    textOverflow:  'ellipsis',
    whiteSpace:    'nowrap',
    transition:    'color 0.1s ease',
  },
  activeDot: {
    position:     'absolute',
    bottom:       4,
    left:         '50%',
    transform:    'translateX(-50%)',
    width:        4,
    height:       4,
    borderRadius: '50%',
    background:   'rgba(255,255,255,0.7)',
  },
}

// ── Dialogue panel (3.4) ──────────────────────────────────────────────────────

/**
 * DialoguePanel — renders when activeDialogue is not null.
 *
 * Shows the NPC's current line of dialogue and a list of clickable responses.
 * Clicking a response calls advanceDialogue(next):
 *   - next is a string → navigate to that node
 *   - next is null → close dialogue; requestLock() re-acquires pointer lock
 *
 * Keyboard: number keys 1–4 are wired in Player.jsx to the same actions.
 */
function DialoguePanel({ activeDialogue }) {
  const advanceDialogue = useInteractionStore(state => state.advanceDialogue)

  const { npcId, nodeKey } = activeDialogue
  const node = DIALOGUE[npcId]?.[nodeKey]

  // Guard against a missing node (shouldn't happen with correct data)
  if (!node) return null

  const handleResponse = (next) => {
    if (next === null) {
      // Still inside the click handler = user gesture → pointer lock allowed
      requestLock()
    }
    advanceDialogue(next)
  }

  return (
    <div style={dlg.overlay}>
      <div style={dlg.panel}>
        {/* NPC name */}
        <div style={dlg.speaker}>{node.speaker}</div>

        {/* Divider */}
        <div style={dlg.divider} />

        {/* NPC text */}
        <p style={dlg.text}>{node.text}</p>

        {/* Response options */}
        <div style={dlg.responses}>
          {node.responses.map((r, i) => (
            <button
              key={i}
              style={dlg.responseBtn}
              onClick={() => handleResponse(r.next)}
              onMouseEnter={e => Object.assign(e.currentTarget.style, dlg.responseBtnHover)}
              onMouseLeave={e => Object.assign(e.currentTarget.style, dlg.responseBtn)}
            >
              <span style={dlg.responseNum}>[{i + 1}]</span>
              <span style={dlg.responseLabel}>{r.label}</span>
            </button>
          ))}
        </div>

        {/* Keyboard hint */}
        <div style={dlg.keyHint}>number keys to select</div>
      </div>
    </div>
  )
}

const dlg = {
  // Full-screen backdrop — dims the scene but lets the HUD show beneath
  overlay: {
    position:   'fixed',
    inset:      0,
    display:    'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 80,
    background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 55%)',
    pointerEvents: 'none',  // let click events pass to panel children
    zIndex:     15,
  },
  panel: {
    width:         560,
    maxWidth:      '90vw',
    background:    'rgba(6,10,20,0.94)',
    border:        '1px solid rgba(100,160,255,0.22)',
    borderRadius:  8,
    padding:       '20px 24px 16px',
    pointerEvents: 'auto',  // panel itself is interactive
    boxShadow:     '0 0 0 1px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.8)',
    fontFamily:    'monospace',
    userSelect:    'none',
  },
  speaker: {
    fontSize:      13,
    fontWeight:    'bold',
    letterSpacing: '0.08em',
    color:         '#88ccff',
    textTransform: 'uppercase',
    marginBottom:  8,
  },
  divider: {
    height:        1,
    background:    'rgba(100,160,255,0.18)',
    marginBottom:  14,
  },
  text: {
    fontSize:      15,
    color:         'rgba(255,255,255,0.88)',
    lineHeight:    1.65,
    margin:        '0 0 18px',
    fontStyle:     'normal',
  },
  responses: {
    display:       'flex',
    flexDirection: 'column',
    gap:           6,
  },
  responseBtn: {
    display:       'flex',
    alignItems:    'baseline',
    gap:           10,
    background:    'rgba(255,255,255,0.04)',
    border:        '1px solid rgba(255,255,255,0.10)',
    borderRadius:  5,
    padding:       '8px 14px',
    cursor:        'pointer',
    textAlign:     'left',
    transition:    'background 0.12s ease, border-color 0.12s ease',
    color:         'rgba(255,255,255,0.75)',
    fontFamily:    'monospace',
    fontSize:      14,
    width:         '100%',
  },
  responseBtnHover: {
    background:    'rgba(100,160,255,0.12)',
    border:        '1px solid rgba(100,160,255,0.35)',
    borderRadius:  5,
    padding:       '8px 14px',
    cursor:        'pointer',
    textAlign:     'left',
    color:         'rgba(255,255,255,0.95)',
    fontFamily:    'monospace',
    fontSize:      14,
    width:         '100%',
    display:       'flex',
    alignItems:    'baseline',
    gap:           10,
    transition:    'background 0.12s ease, border-color 0.12s ease',
  },
  responseNum: {
    fontSize:      11,
    color:         'rgba(100,160,255,0.7)',
    flexShrink:    0,
  },
  responseLabel: {
    flexGrow: 1,
  },
  keyHint: {
    marginTop:     10,
    fontSize:      10,
    color:         'rgba(255,255,255,0.22)',
    textAlign:     'right',
    letterSpacing: '0.04em',
  },
}

// ── Main Overlay export ───────────────────────────────────────────────────────

export default function Overlay({ locked, onStart }) {
  // ── Store subscriptions ───────────────────────────────────────────────────
  const lookingAt        = useInteractionStore(state => state.lookingAt)
  const lastInteraction  = useInteractionStore(state => state.lastInteraction)
  const activeDialogue   = useInteractionStore(state => state.activeDialogue)

  const health      = useGameStore(state => state.health)
  const maxHealth   = useGameStore(state => state.maxHealth)
  const stamina     = useGameStore(state => state.stamina)
  const maxStamina  = useGameStore(state => state.maxStamina)
  const isExhausted = useGameStore(state => state.isExhausted)
  const cameraYaw   = useGameStore(state => state.cameraYaw)
  const inventory   = useGameStore(state => state.inventory)
  const equippedSlot = useGameStore(state => state.equippedSlot)

  const metCount = useWorldStore(state => state.interactedNPCs.length)

  // ── Interaction feedback ──────────────────────────────────────────────────
  const [feedbackMsg, setFeedbackMsg] = useState(null)
  useEffect(() => {
    if (!lastInteraction) return
    setFeedbackMsg(`You greeted ${lastInteraction.name}`)
    const t = setTimeout(() => setFeedbackMsg(null), FEEDBACK_DURATION)
    return () => clearTimeout(t)
  }, [lastInteraction])

  return (
    <>
      {/* ── Start screen ─────────────────────────────────────────────────
          Hidden while dialogue is active so the panel isn't obscured. */}
      {!locked && !activeDialogue && (
        <div onClick={onStart} style={sc.overlay}>
          <h1 style={sc.title}>3D Explorer</h1>
          <p style={sc.sub}>A first-person world — React Three Fiber</p>

          <div style={sc.keyGrid}>
            <span style={sc.keyLabel}>W A S D</span>  <span style={sc.keyDesc}>Move</span>
            <span style={sc.keyLabel}>Space</span>     <span style={sc.keyDesc}>Jump</span>
            <span style={sc.keyLabel}>Mouse</span>     <span style={sc.keyDesc}>Look around</span>
            <span style={sc.keyLabel}>Shift</span>     <span style={sc.keyDesc}>Sprint (drains stamina)</span>
            <span style={sc.keyLabel}>E</span>         <span style={sc.keyDesc}>Talk to NPCs</span>
            <span style={sc.keyLabel}>1 – 5</span>     <span style={sc.keyDesc}>Select inventory slot</span>
            <span style={sc.keyLabel}>ESC</span>       <span style={sc.keyDesc}>Pause / release mouse</span>
          </div>

          <div style={sc.cta}>Click anywhere to start</div>
          <p style={sc.escNote}>
            Press <strong>ESC</strong> at any time to release the mouse
          </p>
        </div>
      )}

      {/* ── HUD (only shown while pointer-locked) ────────────────────── */}

      {locked && <Compass yaw={cameraYaw} />}

      {locked && (
        <StatBars
          health={health}
          maxHealth={maxHealth}
          stamina={stamina}
          maxStamina={maxStamina}
          isExhausted={isExhausted}
          metCount={metCount}
        />
      )}

      {/* Crosshair — hidden while dialogue is open */}
      {locked && !activeDialogue && (
        <div style={hud.crosshairWrap}>
          <div style={{ ...hud.chH, background: lookingAt ? '#88ccff' : 'rgba(255,255,255,0.85)' }} />
          <div style={{ ...hud.chV, background: lookingAt ? '#88ccff' : 'rgba(255,255,255,0.85)' }} />
        </div>
      )}

      {/* Interaction prompt — hidden while dialogue is open */}
      {locked && !activeDialogue && (
        <div style={{
          ...hud.prompt,
          opacity:   lookingAt ? 1 : 0,
          transform: `translate(-50%, ${lookingAt ? 0 : 6}px)`,
        }}>
          <span style={hud.keyBadge}>E</span>
          &nbsp;&nbsp;Talk{lookingAt ? ` to ${lookingAt.name}` : ''}
        </div>
      )}

      {/* Interaction feedback */}
      {locked && feedbackMsg && !activeDialogue && (
        <div style={hud.feedback}>{feedbackMsg}</div>
      )}

      {locked && (
        <InventoryBar inventory={inventory} equippedSlot={equippedSlot} />
      )}

      {locked && (
        <div style={hud.hints}>
          WASD · Move &nbsp;|&nbsp; Space · Jump &nbsp;|&nbsp; Shift · Sprint &nbsp;|&nbsp; E · Talk &nbsp;|&nbsp; 1–5 · Slot &nbsp;|&nbsp; ESC · Pause
        </div>
      )}

      {/* ── Dialogue panel (3.4) — renders regardless of lock state ─── */}
      {activeDialogue && <DialoguePanel activeDialogue={activeDialogue} />}
    </>
  )
}

// ── Start screen styles ───────────────────────────────────────────────────────

const sc = {
  overlay: {
    position:      'fixed',
    inset:         0,
    background:    'rgba(0,0,0,0.80)',
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    justifyContent:'center',
    gap:           12,
    cursor:        'pointer',
    zIndex:        20,
    fontFamily:    'monospace',
    userSelect:    'none',
  },
  title: {
    fontSize:      38,
    color:         '#fff',
    letterSpacing: '0.05em',
    margin:        0,
  },
  sub: {
    fontSize: 14,
    color:    'rgba(255,255,255,0.5)',
    margin:   0,
  },
  keyGrid: {
    marginTop:           10,
    display:             'grid',
    gridTemplateColumns: 'auto auto',
    gap:                 '7px 28px',
    alignItems:          'baseline',
  },
  keyLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'right' },
  keyDesc:  { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  cta: {
    marginTop:     20,
    padding:       '10px 28px',
    border:        '2px solid rgba(255,255,255,0.35)',
    borderRadius:  6,
    color:         '#fff',
    fontSize:      15,
    letterSpacing: '0.05em',
  },
  escNote: {
    marginTop:  10,
    fontSize:   12,
    color:      'rgba(255,255,255,0.3)',
    textAlign:  'center',
    maxWidth:   320,
    lineHeight: 1.5,
    margin:     0,
  },
}

// ── HUD shared styles ─────────────────────────────────────────────────────────

const hud = {
  crosshairWrap: {
    position:      'fixed',
    top:           '50%',
    left:          '50%',
    transform:     'translate(-50%,-50%)',
    width:         20,
    height:        20,
    pointerEvents: 'none',
    zIndex:        10,
  },
  chH: {
    position:   'absolute',
    top:        '50%',
    left:       0,
    right:      0,
    height:     2,
    transform:  'translateY(-50%)',
    transition: 'background 0.12s ease',
  },
  chV: {
    position:   'absolute',
    left:       '50%',
    top:        0,
    bottom:     0,
    width:      2,
    transform:  'translateX(-50%)',
    transition: 'background 0.12s ease',
  },
  prompt: {
    position:      'fixed',
    top:           'calc(50% - 38px)',
    left:          '50%',
    transform:     'translateX(-50%)',
    color:         '#fff',
    fontSize:      14,
    fontFamily:    'monospace',
    letterSpacing: '0.04em',
    textShadow:    '0 1px 6px rgba(0,0,0,0.95)',
    pointerEvents: 'none',
    zIndex:        10,
    whiteSpace:    'nowrap',
    display:       'flex',
    alignItems:    'center',
    gap:           6,
    transition:    'opacity 0.2s ease, transform 0.2s ease',
  },
  keyBadge: {
    display:      'inline-block',
    padding:      '2px 7px',
    border:       '1.5px solid rgba(255,255,255,0.65)',
    borderRadius: 4,
    fontSize:     12,
    background:   'rgba(0,0,0,0.5)',
    lineHeight:   1.6,
  },
  feedback: {
    position:      'fixed',
    top:           '37%',
    left:          '50%',
    transform:     'translateX(-50%)',
    color:         '#93c5fd',
    fontSize:      15,
    fontFamily:    'monospace',
    letterSpacing: '0.05em',
    textShadow:    '0 1px 8px rgba(0,0,0,1)',
    pointerEvents: 'none',
    zIndex:        10,
    whiteSpace:    'nowrap',
  },
  hints: {
    position:      'fixed',
    bottom:        18,
    left:          '50%',
    transform:     'translateX(-50%)',
    color:         'rgba(255,255,255,0.55)',
    fontSize:      12,
    letterSpacing: '0.04em',
    textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
    pointerEvents: 'none',
    zIndex:        10,
    fontFamily:    'monospace',
    whiteSpace:    'nowrap',
  },
}
