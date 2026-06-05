/**
 * Particles.jsx
 *
 * Two particle systems demonstrating the two main approaches in R3F:
 *
 *   1. DustMotes — custom BufferGeometry-based points system.
 *      Teaches the core GPU data structure: every particle is a vertex in a
 *      Float32Array, drawn in a SINGLE draw call via THREE.Points. Animating
 *      them means writing new values into that array each frame and flagging
 *      needsUpdate = true so the GPU re-uploads the buffer.
 *
 *   2. LampSparkles — Drei's <Sparkles> abstraction.
 *      Higher-level, no manual buffer management. Good for effects attached
 *      to scene objects (fire, magic, lamp halos) where you want a quick,
 *      polished result without shader authoring.
 *
 * ── Why BufferGeometry for particles? ────────────────────────────────────────
 *
 * The naive approach would be to render each particle as its own <mesh>.
 * For 500 particles that's 500 draw calls — the GPU spends more time on
 * CPU-to-GPU handshake overhead than on actual rendering.
 *
 * THREE.Points solves this: the whole system is ONE object, ONE draw call.
 * The geometry's position attribute is a packed Float32Array where every
 * 3 values (x, y, z) define one particle. The GPU renders all of them in
 * a single pass. This is why particles can number in the tens of thousands
 * without destroying frame rate.
 *
 * ── Performance notes ────────────────────────────────────────────────────────
 *
 * DustMotes iterates the position array every frame (CPU-side animation).
 * For 500 particles at 60fps this is negligible, but for >5000 you'd want
 * a GPU-side approach: encode particle velocity into a texture and move
 * particles in a vertex shader instead, avoiding the CPU round-trip entirely.
 */

import { useRef, useMemo } from 'react'
import { useFrame }        from '@react-three/fiber'
import { Sparkles }        from '@react-three/drei'
import * as THREE          from 'three'

// ── Lamp positions (mirrored from StreetLamps.jsx) ───────────────────────────
// The sparkle effect is positioned at the bulb: offset +0.86 on X, 2.98 on Y

const LAMP_POSITIONS = [
  [  2,  -8 ],
  [ -3, -11 ],
  [  8, -15 ],
  [ -8, -19 ],
  [  4, -24 ],
  [-12, -28 ],
  [ 11, -18 ],
  [ -1, -33 ],
]

// ── DustMotes ────────────────────────────────────────────────────────────────

/**
 * DustMotes
 *
 * 500 softly drifting dust particles covering the main play area.
 *
 * The positions are initialized once in useMemo and stored in a Float32Array.
 * Each frame, useFrame walks the array and nudges each particle slightly
 * upward plus a tiny X/Z drift to simulate air currents. When a particle
 * rises above the ceiling (y > 8) it wraps back to the floor (y = 0),
 * giving an infinite looping effect.
 *
 * The offsets array gives each particle a different drift direction and
 * wrapping phase so they never all move in sync.
 */
function DustMotes({ count = 500 }) {
  const pointsRef = useRef()

  // ── Initial positions — spread over a 60×8×60 volume centred on origin ──
  // useMemo ensures this only runs once on mount, not every render.
  const { positions, offsets } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const offsets   = new Float32Array(count * 3)  // per-particle drift direction

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      positions[i3 + 0] = (Math.random() - 0.5) * 60   // x: -30 to 30
      positions[i3 + 1] = Math.random() * 8             // y: 0 to 8
      positions[i3 + 2] = (Math.random() - 0.5) * 60   // z: -30 to 30

      // Drift offsets: small random horizontal wander per particle
      offsets[i3 + 0] = (Math.random() - 0.5) * 0.004   // x drift
      offsets[i3 + 1] = 0.001 + Math.random() * 0.002   // y rise speed
      offsets[i3 + 2] = (Math.random() - 0.5) * 0.004   // z drift
    }

    return { positions, offsets }
  }, [count])

  // ── Per-frame animation ──────────────────────────────────────────────────
  // We write directly into the buffer and set needsUpdate to re-upload it.
  // Avoid creating new arrays here — that would trigger GC every frame.
  useFrame(() => {
    if (!pointsRef.current) return
    const pos = pointsRef.current.geometry.attributes.position.array

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      pos[i3 + 0] += offsets[i3 + 0]   // drift X
      pos[i3 + 1] += offsets[i3 + 1]   // rise Y
      pos[i3 + 2] += offsets[i3 + 2]   // drift Z

      // Wrap Y — when particle exits the top, teleport it back to the floor
      // at a random X/Z so it doesn't appear to loop in place.
      if (pos[i3 + 1] > 8) {
        pos[i3 + 0] = (Math.random() - 0.5) * 60
        pos[i3 + 1] = 0
        pos[i3 + 2] = (Math.random() - 0.5) * 60
      }
    }

    // Tell Three.js the buffer has changed — re-upload to GPU next frame
    pointsRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      {/*
        bufferGeometry with a single position attribute.
        args=[positions, 3] means: "this Float32Array holds values that
        group into items of 3 (x, y, z)".
      */}
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>

      {/*
        pointsMaterial renders each vertex as a screen-space square.
        sizeAttenuation={true} makes distant particles smaller (perspective),
        which is essential for spatial believability.
        size is in world units when sizeAttenuation is on.
      */}
      <pointsMaterial
        size={0.035}
        color="#f0e8d0"
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}   // prevents z-fighting with nearby surfaces
      />
    </points>
  )
}

// ── LampSparkles ─────────────────────────────────────────────────────────────

/**
 * LampSparkles
 *
 * Warm golden sparkle halo at each street lamp head.
 * Uses Drei's <Sparkles> — a higher-level abstraction built on the same
 * Points + BufferGeometry pattern as DustMotes, but with built-in:
 *   - Size animation (sparkles pulse in and out)
 *   - Random lifetime per sparkle
 *   - Speed and scale controls
 *
 * The sparkles are positioned at the bulb world coordinate of each lamp.
 * Because StreetLamp renders its contents relative to its group position,
 * the bulb is at [lampX + 0.86, 2.98, lampZ] in world space.
 *
 * count is kept low (18) — these are accent sparkles, not a fireworks show.
 */
function LampSparkles() {
  return (
    <>
      {LAMP_POSITIONS.map(([x, z], i) => (
        <Sparkles
          key={i}
          position={[x + 0.86, 2.98, z]}
          count={18}
          scale={1.2}         // radius of the sparkle cloud
          size={2.5}          // base particle size (Sparkles uses its own units)
          speed={0.25}        // how fast sparkles animate
          color="#ffcc55"     // warm lamp yellow
          opacity={0.7}
        />
      ))}
    </>
  )
}

// ── Particles (root export) ───────────────────────────────────────────────────

/**
 * Drop this inside <Canvas>.
 * It renders no geometry of its own — only the two particle systems above.
 */
export default function Particles() {
  return (
    <group name="particles">
      <DustMotes count={500} />
      <LampSparkles />
    </group>
  )
}
