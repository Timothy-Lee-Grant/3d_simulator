/**
 * Minimap.jsx — Phase 7.1
 *
 * A DOM-side Canvas 2D bird's-eye map of the world.
 * Reads player position and camera yaw from the Zustand store, then redraws
 * the map each frame using the Canvas 2D API.
 *
 * ── Two Approaches to a Minimap ──────────────────────────────────────────────
 *
 * APPROACH 1 — This file: Canvas 2D procedural
 *   The world's object positions are known ahead of time (constants in this file).
 *   We draw them as colored shapes on a 2D canvas. No GPU involvement.
 *   Extremely performant — no render targets, no GPU readback, no sync stalls.
 *   Common in production games where the minimap shows a simplified "map" view
 *   rather than a real top-down render of the 3D scene.
 *
 * APPROACH 2 — See MinimapRenderTarget.jsx: WebGL render target
 *   Renders the actual 3D scene from a top-down orthographic camera into an
 *   off-screen WebGLRenderTarget, then reads the pixels to a 2D canvas.
 *   More accurate (shows actual geometry, shadows, terrain color), but slower
 *   due to the GPU→CPU readback (a pipeline sync stall).
 *   Use when the minimap MUST show live 3D content (moving NPCs, dynamic terrain).
 *
 * ── Canvas 2D vs WebGL ────────────────────────────────────────────────────────
 *
 * The Canvas 2D API (`ctx.fillRect`, `ctx.arc`, `ctx.translate`, etc.) runs on
 * the CPU — it composites and rasterises into a pixel buffer that the browser
 * displays. It's separate from the WebGL canvas Three.js uses.
 *
 * You can have multiple <canvas> elements on the same page, each with its own
 * rendering context. The 3D canvas uses WebGL; the minimap canvas uses 2D.
 *
 * ── Map Coordinate System ─────────────────────────────────────────────────────
 *
 * The Three.js world is right-handed: X right, Y up, Z toward viewer.
 * The 2D canvas is screen-space: X right, Y DOWN.
 *
 * To map world XZ to canvas XY:
 *   canvasX = centerX + (worldX - playerX) * scale
 *   canvasY = centerY - (worldZ - playerZ) * scale   ← note: negate Z
 *
 * The negation of Z aligns world "north" (-Z direction) with canvas "up" (↑).
 * Without it, the map would appear flipped north-south.
 *
 * ── Player Direction Arrow ────────────────────────────────────────────────────
 *
 * `cameraYaw` is camera.rotation.y in Three.js (radians).
 * In Three.js, yaw=0 means facing -Z (our "north"). Yaw increases counter-
 * clockwise (turning left = positive rotation). On the 2D canvas, counter-
 * clockwise is the NEGATIVE canvas rotation direction.
 *
 * So the arrow angle in canvas space = -cameraYaw, with an additional -π/2
 * offset so the arrow points UP (north) when yaw=0.
 *
 *   arrowAngle = -cameraYaw - Math.PI / 2
 */

import { useRef, useEffect } from 'react'
import { useGameStore }  from '../store/useGameStore'
import { useWorldStore } from '../store/useWorldStore'

// ── World map data ────────────────────────────────────────────────────────────
// These approximate the scene layout for the minimap overlay.
// They're slightly simplified — exact positions from Buildings.jsx / InstancedForest.jsx

const MAP_BUILDINGS = [
  { x: -5, z: -10, w: 3, d: 3 }, { x:  6, z:  -9, w: 4, d: 4 },
  { x: -9, z: -16, w: 2, d: 2 }, { x: 10, z:  -5, w: 5, d: 3 },
  { x: -3, z: -22, w: 6, d: 4 }, { x: 16, z: -12, w: 3, d: 3 },
  { x:-15, z:  -8, w: 4, d: 5 }, { x:  3, z: -28, w: 7, d: 5 },
  { x:-11, z: -26, w: 3, d: 3 }, { x: 21, z: -20, w: 4, d: 4 },
  { x:-21, z: -22, w: 5, d: 3 }, { x:  9, z: -33, w: 3, d: 3 },
  { x:-18, z: -35, w: 6, d: 6 }, { x: 28, z: -10, w: 4, d: 4 },
  { x:-28, z: -12, w: 3, d: 3 }, { x: 14, z: -38, w: 5, d: 4 },
]

const MAP_TREES = [
  [4,-6],[-7,-13],[12,-18],[-5,-28],[20,-8],[-25,-18],[6,-35],[-14,-40],
  [30,-25],[-32,-20],[18,-45],[-22,-50],[8,-55],[-10,-60],
]

const MAP_NPCS = [
  { x:  0, z: -8  },
  { x: -5, z: -18 },
  { x:  8, z: -30 },
]

const MINIMAP_SIZE  = 160   // canvas pixel size
const MAP_CENTER    = MINIMAP_SIZE / 2
const MAP_SCALE     = 2.4   // world units → canvas pixels at zoom 1
const FOLLOW_RANGE  = 50    // world units visible in each direction

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawArrow(ctx, x, y, angle, size, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -size)               // tip
  ctx.lineTo( size * 0.5,  size * 0.6)
  ctx.lineTo( 0,           size * 0.2)
  ctx.lineTo(-size * 0.5,  size * 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ── Minimap component ─────────────────────────────────────────────────────────

export default function Minimap({ visible }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  // Read live state from stores (these are stable refs, not re-render triggers)
  const getPos = () => useGameStore.getState().position
  const getYaw = () => useGameStore.getState().cameraYaw
  const getAreas = () => useWorldStore.getState().discoveredAreas

  useEffect(() => {
    if (!visible) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function draw() {
      animRef.current = requestAnimationFrame(draw)

      const pos  = getPos()
      const yaw  = getYaw()
      const px   = pos.x
      const pz   = pos.z

      // Clear
      ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE)

      // Background + border
      ctx.fillStyle   = 'rgba(8,14,24,0.90)'
      ctx.strokeStyle = 'rgba(100,160,255,0.30)'
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      ctx.arc(MAP_CENTER, MAP_CENTER, MAP_CENTER - 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Clip to circle
      ctx.save()
      ctx.beginPath()
      ctx.arc(MAP_CENTER, MAP_CENTER, MAP_CENTER - 2, 0, Math.PI * 2)
      ctx.clip()

      // ── World-to-canvas transform ────────────────────────────────────
      // toCanvas(wx, wz) converts a world XZ coordinate to canvas XY.
      // Note the negation of wz — world -Z is canvas up (north).
      const toCanvas = (wx, wz) => [
        MAP_CENTER + (wx - px) * MAP_SCALE,
        MAP_CENTER - (wz - pz) * MAP_SCALE,   // ← negate Z
      ]

      // ── Grid (orientation reference) ──────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth   = 0.5
      for (let gw = -FOLLOW_RANGE; gw <= FOLLOW_RANGE; gw += 20) {
        const [x1] = toCanvas(px + gw, pz - FOLLOW_RANGE)
        const [x2] = toCanvas(px + gw, pz + FOLLOW_RANGE)
        const [, y1] = toCanvas(px, pz - FOLLOW_RANGE)
        const [, y2] = toCanvas(px, pz + FOLLOW_RANGE)
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke()
      }

      // ── Buildings ─────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(140,160,190,0.85)'
      MAP_BUILDINGS.forEach(({ x, z, w, d }) => {
        const [cx, cy] = toCanvas(x, z)
        const pw = w * MAP_SCALE
        const pd = d * MAP_SCALE
        ctx.fillRect(cx - pw / 2, cy - pd / 2, pw, pd)
      })

      // ── Trees ─────────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(60,120,60,0.85)'
      MAP_TREES.forEach(([tx, tz]) => {
        const [cx, cy] = toCanvas(tx, tz)
        ctx.beginPath()
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
        ctx.fill()
      })

      // ── NPCs ──────────────────────────────────────────────────────────
      ctx.fillStyle   = 'rgba(200,200,255,0.90)'
      ctx.strokeStyle = 'rgba(100,160,255,0.6)'
      ctx.lineWidth   = 0.8
      MAP_NPCS.forEach(({ x, z }) => {
        const [cx, cy] = toCanvas(x, z)
        ctx.beginPath()
        ctx.arc(cx, cy, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })

      // ── Origin marker (spawn point) ───────────────────────────────────
      const [ox, oy] = toCanvas(0, 0)
      ctx.strokeStyle = 'rgba(255,200,80,0.35)'
      ctx.lineWidth   = 0.8
      ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.stroke()

      ctx.restore()  // un-clip

      // ── Player arrow (drawn outside clip so it's always centered) ─────
      // arrowAngle: -yaw rotates arrow with camera; -π/2 makes yaw=0 point up
      const arrowAngle = -yaw - Math.PI / 2
      drawArrow(ctx, MAP_CENTER, MAP_CENTER, arrowAngle, 7, '#ffffff')

      // ── Center dot ────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath(); ctx.arc(MAP_CENTER, MAP_CENTER, 2, 0, Math.PI * 2); ctx.fill()

      // ── Cardinal labels ───────────────────────────────────────────────
      ctx.fillStyle  = 'rgba(255,255,255,0.30)'
      ctx.font       = '9px monospace'
      ctx.textAlign  = 'center'
      ctx.fillText('N', MAP_CENTER, 10)
      ctx.fillText('S', MAP_CENTER, MINIMAP_SIZE - 4)
      ctx.fillText('W', 6, MAP_CENTER + 3)
      ctx.fillText('E', MINIMAP_SIZE - 5, MAP_CENTER + 3)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [visible])

  if (!visible) return null

  return (
    <div style={mm.container}>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        style={mm.canvas}
      />
      <div style={mm.label}>MAP</div>
      <div style={mm.coords}>
        <MinimapCoords />
      </div>
    </div>
  )
}

// Separate tiny component that re-renders for the coordinate display
function MinimapCoords() {
  const pos = useGameStore(state => state.position)
  return (
    <span>
      {Math.round(pos.x)}, {Math.round(pos.z)}
    </span>
  )
}

const mm = {
  container: {
    position:      'fixed',
    top:           18,
    right:         18,
    width:         MINIMAP_SIZE,
    pointerEvents: 'none',
    zIndex:        10,
    userSelect:    'none',
  },
  canvas: {
    borderRadius:  '50%',
    display:       'block',
    boxShadow:     '0 0 0 1.5px rgba(100,160,255,0.25), 0 2px 12px rgba(0,0,0,0.6)',
  },
  label: {
    position:      'absolute',
    top:           -14,
    left:          '50%',
    transform:     'translateX(-50%)',
    fontSize:      9,
    letterSpacing: '0.12em',
    color:         'rgba(255,255,255,0.25)',
    fontFamily:    'monospace',
  },
  coords: {
    textAlign:     'center',
    marginTop:     4,
    fontSize:      9,
    color:         'rgba(255,255,255,0.30)',
    fontFamily:    'monospace',
    letterSpacing: '0.04em',
  },
}
