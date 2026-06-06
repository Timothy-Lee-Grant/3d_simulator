import { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Sky, Environment, Stats } from '@react-three/drei'
import useAudio from './hooks/useAudio'
import { useGameStore } from './store/useGameStore'
import { setLockFn } from './systems/pointerLock'

import Player         from './components/Player'
import World          from './components/World'
import Buildings      from './components/Buildings'
import Trees          from './components/Trees'
import Rocks          from './components/Rocks'
import Landmark       from './components/Landmark'
import NPC            from './components/NPC'
import StreetLamps    from './components/StreetLamps'
import Particles      from './components/Particles'
import PostProcessing from './components/PostProcessing'
import Overlay        from './components/Overlay'

// Sun direction shared between the sky shader and the directional light.
const SUN_POSITION = [60, 90, 40]

/**
 * LockBridge — null-rendering component inside Canvas that surfaces
 * requestPointerLock() to the App via a callback.
 */
function LockBridge({ onReady }) {
  const { gl } = useThree()
  useEffect(() => {
    const fn = () => gl.domElement.requestPointerLock()
    onReady(fn)
    // Register with the module so Overlay's dialogue close can re-lock without prop drilling
    setLockFn(fn)
  }, [gl, onReady])
  return null
}

/**
 * CameraSync — reads camera.rotation.y every frame and syncs it to
 * useGameStore at ~20Hz so the Overlay's compass stays up to date.
 *
 * ── Why throttled? ────────────────────────────────────────────────────────
 * setCameraYaw triggers a re-render of any Overlay component subscribed to
 * cameraYaw. At 60Hz this would be one re-render per frame — acceptable, but
 * wasteful for a compass that only needs to update 15-20 times per second.
 * The 50ms accumulator limits re-renders to 20/sec (fine for smooth compass
 * animation since the transition is handled by CSS).
 *
 * ── Why inside Canvas? ────────────────────────────────────────────────────
 * useFrame and useThree() only work inside the R3F Canvas context. CameraSync
 * has no visible output — it's a null component that bridges Canvas state to
 * the Zustand store, which the DOM Overlay can then read.
 */
function CameraSync() {
  const { camera }     = useThree()
  const setCameraYaw   = useGameStore(state => state.setCameraYaw)
  const accumRef       = useRef(0)

  useFrame((_, delta) => {
    accumRef.current += delta
    if (accumRef.current >= 0.05) {          // sync at 20Hz
      setCameraYaw(camera.rotation.y)
      accumRef.current = 0
    }
  })

  return null
}

export default function App() {
  const [locked, setLocked] = useState(false)
  const lockFn = useRef(null)

  useAudio(locked)

  // ── Seed inventory with starter items ────────────────────────────────────
  // Items are added once on mount via getState() (no subscription needed).
  // These give the HUD quick bar something to show on first load.
  // Phase 3.5 will replace this with items placed in the scene world.
  useEffect(() => {
    const { pickUpItem } = useGameStore.getState()
    pickUpItem({ id: 'item_key',  name: 'Ancient Key',  color: '#f59e0b', description: 'A heavy iron key of unknown origin.' })
    pickUpItem({ id: 'item_map',  name: 'Old Map',      color: '#84cc16', description: 'A tattered map of a nameless settlement.' })
    pickUpItem({ id: 'item_herb', name: 'Healing Herb', color: '#22c55e', description: 'Smells of pine. Restores health when used.' })
  }, [])

  const handleReady = useCallback((fn) => {
    lockFn.current = fn
  }, [])

  const handleStart = () => lockFn.current?.()

  return (
    <>
      {/* ── 3D Canvas ───────────────────────────────────────────────── */}
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 500, position: [0, 1.7, 0] }}
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      >
        <color attach="background" args={['#a8c8e8']} />

        {/* ── Sky ───────────────────────────────────────────────────── */}
        <Sky
          sunPosition={SUN_POSITION}
          turbidity={7}
          rayleigh={0.6}
          mieCoefficient={0.006}
          mieDirectionalG={0.82}
        />

        {/* ── Environment map (indirect lighting + reflections) ─────── */}
        <Environment preset="sunset" background={false} />

        {/* ── Fog ───────────────────────────────────────────────────── */}
        <fogExp2 attach="fog" args={['#c8d0d8', 0.015]} />

        {/* ── Lighting ──────────────────────────────────────────────── */}
        <ambientLight color="#ffeedd" intensity={0.20} />
        <directionalLight
          color="#fff5e0"
          intensity={1.3}
          position={SUN_POSITION}
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
        <hemisphereLight args={['#b0c8e0', '#4a7c45', 0.25]} />

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
        <StreetLamps />

        {/* ── NPCs ──────────────────────────────────────────────────── */}
        <NPC npcId="npc_01" name="The Stranger"   position={[0,   0, -5]} rotation={[0, Math.PI,       0]} phaseOffset={0.0} />
        <NPC npcId="npc_02" name="The Wanderer"   position={[2.5, 0, -7]} rotation={[0, Math.PI * 1.3, 0]} phaseOffset={2.1} />
        <NPC npcId="npc_03" name="The Gatekeeper" position={[-2,  0, -6]} rotation={[0, Math.PI * 0.8, 0]} phaseOffset={4.7} />

        {/* ── Particles ─────────────────────────────────────────────── */}
        <Particles />

        {/* ── Post-processing ───────────────────────────────────────── */}
        <PostProcessing />

        {/* ── Canvas bridges ────────────────────────────────────────── */}
        <LockBridge onReady={handleReady} />
        {/* CameraSync writes camera.rotation.y → store at 20Hz for the compass */}
        <CameraSync />
        {/* Stats overlay: FPS, frame time, memory — visible during development */}
        <Stats />
      </Canvas>

      {/* ── DOM overlay (start screen + HUD) ─────────────────────────── */}
      <Overlay locked={locked} onStart={handleStart} />
    </>
  )
}
