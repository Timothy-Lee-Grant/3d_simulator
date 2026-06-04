import { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import useAudio from './hooks/useAudio'

import Player   from './components/Player'
import World    from './components/World'
import Buildings from './components/Buildings'
import Trees    from './components/Trees'
import Rocks    from './components/Rocks'
import Landmark from './components/Landmark'
import Human    from './components/Human'
import Overlay  from './components/Overlay'

/**
 * LockBridge — a tiny helper that lives inside the Canvas so it can
 * access useThree(). It captures the WebGL canvas element and hands a
 * requestPointerLock() function up to App via the onReady callback.
 *
 * This is the idiomatic R3F pattern for reaching across the Canvas
 * boundary: put a null-rendering component inside, use useThree() to
 * grab what you need, then surface it via a callback.
 */
function LockBridge({ onReady }) {
  const { gl } = useThree()

  useEffect(() => {
    onReady(() => gl.domElement.requestPointerLock())
  }, [gl, onReady])

  return null
}

export default function App() {
  const [locked, setLocked] = useState(false)
  const lockFn = useRef(null)

  // Initialize audio system the moment the player first locks in
  useAudio(locked)

  // Called by LockBridge once the canvas is mounted
  const handleReady = useCallback((fn) => {
    lockFn.current = fn
  }, [])

  // Called by the Overlay's click handler
  const handleStart = () => lockFn.current?.()

  return (
    <>
      {/* ── 3D Canvas ───────────────────────────────────────────────── */}
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 500, position: [0, 1.7, 0] }}
        style={{ width: '100vw', height: '100vh', display: 'block', background: '#87CEEB' }}
      >
        {/* Exponential fog — matches sky color so geometry fades into the horizon */}
        <fogExp2 attach="fog" args={['#87CEEB', 0.018]} />

        {/* ── Lighting ──────────────────────────────────────────────── */}
        <ambientLight color="#ffeedd" intensity={0.45} />

        <directionalLight
          color="#fff5e0"
          intensity={1.1}
          position={[60, 90, 40]}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={250}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
        />

        {/* Sky/ground hemisphere fill — prevents shadows from going pitch black */}
        <hemisphereLight args={['#87CEEB', '#4a7c45', 0.35]} />

        {/* ── Player ────────────────────────────────────────────────── */}
        <Player
          onLock={()   => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />

        {/* ── Scene objects ─────────────────────────────────────────── */}
        <World />
        <Buildings />
        <Trees />
        <Rocks />
        <Landmark />

        {/* ── Characters ────────────────────────────────────────────── */}
        {/* Facing the player (rotated π around Y so their face is toward +Z) */}
        <Human position={[0,   0, -5]} rotation={[0, Math.PI, 0]} />
        <Human position={[2.5, 0, -7]} rotation={[0, Math.PI * 1.3, 0]} />
        <Human position={[-2,  0, -6]} rotation={[0, Math.PI * 0.8, 0]} />

        {/* ── Canvas/DOM bridge ─────────────────────────────────────── */}
        <LockBridge onReady={handleReady} />
      </Canvas>

      {/* ── DOM overlay (start screen + HUD) — lives outside Canvas ── */}
      <Overlay locked={locked} onStart={handleStart} />
    </>
  )
}
