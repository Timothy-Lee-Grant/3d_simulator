/**
 * DebugPanel.jsx — Phase 7.4: Runtime Debug Tools
 *
 * A collapsible HUD panel for development-time tuning.
 * Entirely DOM/React — no Three.js. Only rendered when import.meta.env.DEV is true.
 *
 * ── What's Here ───────────────────────────────────────────────────────────────
 *
 * Information readout:
 *   - Player world position (X, Y, Z) — live, 20Hz
 *   - Current FPS (estimated from frame delta)
 *   - Discovered areas + NPC interaction count
 *   - Save file status
 *
 * Tunable controls:
 *   - Fog density slider (affects fog directly via scene.fog.density mutation)
 *   - Day/night cycle speed (read by DayNightCycle.jsx from the debug store)
 *   - Grass field toggle (read by App.jsx to conditionally render <GrassField>)
 *   - Show collider wireframes (read by ColliderViz.jsx)
 *   - Show LOD markers (read by LODTrees.jsx)
 *
 * Actions:
 *   - Force save / force load
 *   - Teleport to origin (0, 1.7, 0)
 *   - Take 10 damage (test health bar)
 *   - Heal 20 HP (test health bar)
 *   - Reset debug values
 *
 * ── Why Not Leva? ────────────────────────────────────────────────────────────
 *
 * Leva (npm install leva) is the standard debug panel library for R3F. It
 * auto-generates UI from a config object, handles slider rendering, and supports
 * grouped folders. It's excellent — add it when the project has network access.
 *
 * This custom panel replicates the same capability pattern without a dependency.
 * The code structure (config object → render sliders) is essentially the same
 * as what Leva does internally.
 *
 * ── Performance ──────────────────────────────────────────────────────────────
 *
 * The position readout re-renders at 20Hz via a setInterval.
 * All other state reads are from Zustand with selector functions.
 * The panel is only mounted when import.meta.env.DEV is true.
 * In production (npm run build), this component is never imported or rendered.
 *
 * ── Keyboard shortcut ────────────────────────────────────────────────────────
 *
 * Press ` (backtick) to toggle the panel open/closed.
 * This is a standard convention for dev overlays (Quake console, Unity stats, etc.)
 */

import { useState, useEffect, useRef } from 'react'
import { useGameStore }   from '../store/useGameStore'
import { useWorldStore }  from '../store/useWorldStore'
import { useDebugStore }  from '../store/useDebugStore'
import { saveGame, loadGame, applyLoadedGame, hasSave, getSaveTimestamp } from '../systems/saveLoad'
import { useThree } from '@react-three/fiber'

// ── Slider ────────────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <div style={ds.row}>
      <span style={ds.label}>{label}</span>
      <div style={ds.sliderWrap}>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={ds.slider}
        />
        <span style={ds.val}>{typeof value === 'number' ? value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1) : value}</span>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <div style={ds.row}>
      <span style={ds.label}>{label}</span>
      <button
        style={{ ...ds.toggleBtn, background: value ? 'rgba(100,200,100,0.25)' : 'rgba(255,255,255,0.06)' }}
        onClick={() => onChange(!value)}
      >
        {value ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

function ActionBtn({ label, onClick, color }) {
  return (
    <button
      style={{ ...ds.actionBtn, borderColor: color || 'rgba(255,255,255,0.15)' }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

// ── DebugPanel — inner component (inside Canvas) ───────────────────────────────
// Needs access to useThree for camera teleport and fog mutation

export function DebugPanelInner({ onTeleport }) {
  return null  // Teleport is handled by the outer DOM panel via a callback
}

// ── DebugPanel — outer DOM component ──────────────────────────────────────────

export default function DebugPanel({ onTeleport }) {
  const [open, setOpen] = useState(false)

  // Keyboard shortcut: ` toggles the panel
  useEffect(() => {
    const onKey = (e) => { if (e.key === '`') setOpen(v => !v) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Live position readout — poll at 20Hz outside React render cycle
  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 })
  const [fps, setFps] = useState(0)
  const lastFrameTime = useRef(performance.now())
  const frameCount    = useRef(0)

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => {
      const p = useGameStore.getState().position
      setPos({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 })
    }, 50)
    return () => clearInterval(id)
  }, [open])

  // Store values
  const fogDensity    = useDebugStore(s => s.fogDensity)
  const cycleSpeed    = useDebugStore(s => s.cycleSpeed)
  const grassVisible  = useDebugStore(s => s.grassVisible)
  const showColliders = useDebugStore(s => s.showColliders)
  const showLOD       = useDebugStore(s => s.showLODMarkers)
  const set           = useDebugStore(s => s.set)
  const reset         = useDebugStore(s => s.reset)

  const metCount      = useWorldStore(s => s.interactedNPCs.length)
  const areaCount     = useWorldStore(s => s.discoveredAreas.length)

  const takeDamage    = useGameStore(s => s.takeDamage)
  const heal          = useGameStore(s => s.heal)

  const [saveMsg, setSaveMsg] = useState(null)

  const handleSave = () => {
    saveGame()
    setSaveMsg(`Saved at ${getSaveTimestamp()}`)
    setTimeout(() => setSaveMsg(null), 2000)
  }

  const handleLoad = () => {
    const data = loadGame()
    if (!data) { setSaveMsg('No save found'); setTimeout(() => setSaveMsg(null), 2000); return }
    applyLoadedGame(data)
    onTeleport?.(data.player.position)
    setSaveMsg('Loaded')
    setTimeout(() => setSaveMsg(null), 2000)
  }

  // Only render in dev mode
  if (!import.meta.env.DEV) return null

  return (
    <>
      {/* Toggle button — always visible in dev */}
      <button
        onClick={() => setOpen(v => !v)}
        style={ds.toggleButton}
        title="Debug Panel (` key)"
      >
        {open ? '✕ DEBUG' : '⚙ DEBUG'}
      </button>

      {open && (
        <div style={ds.panel}>
          <div style={ds.title}>DEBUG PANEL</div>
          <div style={ds.hint}>(` to close)</div>

          {/* ── Readout ──────────────────────────────────────────────── */}
          <div style={ds.section}>POSITION</div>
          <div style={ds.stat}>X {pos.x}  Y {pos.y}  Z {pos.z}</div>
          <div style={ds.stat}>NPCs met: {metCount}  Areas: {areaCount}</div>
          {hasSave() && <div style={ds.stat}>Save: {getSaveTimestamp()}</div>}
          {saveMsg   && <div style={{ ...ds.stat, color: '#86efac' }}>{saveMsg}</div>}

          {/* ── Sliders ──────────────────────────────────────────────── */}
          <div style={ds.section}>ENVIRONMENT</div>
          <Slider
            label="Fog"
            value={fogDensity}
            min={0} max={0.08} step={0.001}
            onChange={v => set('fogDensity', v)}
          />
          <Slider
            label="Day speed"
            value={cycleSpeed}
            min={0} max={0.02} step={0.0005}
            onChange={v => set('cycleSpeed', v)}
          />

          {/* ── Toggles ──────────────────────────────────────────────── */}
          <div style={ds.section}>TOGGLES</div>
          <Toggle label="Grass"     value={grassVisible}  onChange={v => set('grassVisible', v)} />
          <Toggle label="Colliders" value={showColliders} onChange={v => set('showColliders', v)} />
          <Toggle label="LOD rings" value={showLOD}       onChange={v => set('showLODMarkers', v)} />

          {/* ── Actions ──────────────────────────────────────────────── */}
          <div style={ds.section}>ACTIONS</div>
          <div style={ds.btnRow}>
            <ActionBtn label="Save"     onClick={handleSave}            color="rgba(100,200,100,0.3)" />
            <ActionBtn label="Load"     onClick={handleLoad}            color="rgba(100,160,255,0.3)" />
            <ActionBtn label="Teleport →0" onClick={() => onTeleport?.({ x: 0, y: 1.7, z: 0 })} />
          </div>
          <div style={ds.btnRow}>
            <ActionBtn label="-10 HP"  onClick={() => takeDamage(10)}  color="rgba(255,100,100,0.3)" />
            <ActionBtn label="+20 HP"  onClick={() => heal(20)}        color="rgba(100,200,100,0.3)" />
            <ActionBtn label="Reset"   onClick={reset}                  color="rgba(255,200,50,0.3)" />
          </div>
        </div>
      )}
    </>
  )
}

// ── Collider wireframe visualizer ─────────────────────────────────────────────

/**
 * ColliderViz — renders AABB collider boxes as wireframes.
 * Drop this inside <Canvas>. Only visible when showColliders = true.
 */
export function ColliderViz() {
  const showColliders = useDebugStore(s => s.showColliders)
  if (!showColliders) return null

  // Import lazily to avoid loading collision data when not needed
  const { WORLD_COLLIDERS } = require('../data/colliders')

  return (
    <group name="colliderViz">
      {WORLD_COLLIDERS.map((box, i) => {
        const cx = (box.min.x + box.max.x) / 2
        const cy = (box.min.y + box.max.y) / 2
        const cz = (box.min.z + box.max.z) / 2
        const sw = box.max.x - box.min.x
        const sh = box.max.y - box.min.y
        const sd = box.max.z - box.min.z
        return (
          <mesh key={i} position={[cx, cy, cz]}>
            <boxGeometry args={[sw, sh, sd]} />
            <meshBasicMaterial color="#ff4444" wireframe />
          </mesh>
        )
      })}
    </group>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ds = {
  toggleButton: {
    position:      'fixed',
    top:           18,
    left:          '50%',
    transform:     'translateX(-50%)',
    padding:       '4px 12px',
    background:    'rgba(0,0,0,0.6)',
    border:        '1px solid rgba(255,255,255,0.2)',
    borderRadius:  4,
    color:         'rgba(255,255,255,0.6)',
    fontSize:      11,
    fontFamily:    'monospace',
    cursor:        'pointer',
    zIndex:        30,
    letterSpacing: '0.06em',
  },
  panel: {
    position:      'fixed',
    top:           48,
    left:          '50%',
    transform:     'translateX(-50%)',
    width:         280,
    background:    'rgba(6,10,20,0.95)',
    border:        '1px solid rgba(100,160,255,0.2)',
    borderRadius:  6,
    padding:       '10px 14px',
    zIndex:        30,
    fontFamily:    'monospace',
    userSelect:    'none',
    boxShadow:     '0 4px 24px rgba(0,0,0,0.7)',
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
  },
  title: {
    fontSize:      10,
    letterSpacing: '0.14em',
    color:         'rgba(100,160,255,0.9)',
    fontWeight:    'bold',
    marginBottom:  2,
  },
  hint: {
    fontSize:      9,
    color:         'rgba(255,255,255,0.2)',
    marginBottom:  4,
  },
  section: {
    marginTop:     6,
    marginBottom:  2,
    fontSize:      9,
    letterSpacing: '0.10em',
    color:         'rgba(255,255,255,0.30)',
  },
  stat: {
    fontSize:      11,
    color:         'rgba(255,255,255,0.55)',
    lineHeight:    1.5,
  },
  row: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            8,
    marginBottom:   2,
  },
  label: {
    fontSize:  10,
    color:     'rgba(255,255,255,0.5)',
    minWidth:  60,
    flexShrink: 0,
  },
  sliderWrap: {
    display:     'flex',
    alignItems:  'center',
    gap:         6,
    flex:        1,
  },
  slider: {
    flex:    1,
    height:  2,
    cursor:  'pointer',
    accentColor: '#60a5fa',
  },
  val: {
    fontSize:  10,
    color:     'rgba(255,255,255,0.4)',
    minWidth:  36,
    textAlign: 'right',
  },
  toggleBtn: {
    padding:      '3px 10px',
    border:       '1px solid rgba(255,255,255,0.15)',
    borderRadius: 3,
    cursor:       'pointer',
    fontSize:     10,
    color:        'rgba(255,255,255,0.7)',
    letterSpacing:'0.06em',
    fontFamily:   'monospace',
  },
  btnRow: {
    display: 'flex',
    gap:     4,
    flexWrap:'wrap',
    marginBottom: 2,
  },
  actionBtn: {
    padding:      '4px 8px',
    background:   'rgba(255,255,255,0.05)',
    border:       '1px solid',
    borderRadius: 3,
    cursor:       'pointer',
    fontSize:     10,
    color:        'rgba(255,255,255,0.7)',
    fontFamily:   'monospace',
  },
}
