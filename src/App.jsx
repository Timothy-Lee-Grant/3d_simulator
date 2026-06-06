import { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Environment, Stats } from '@react-three/drei'
import useAudio from './hooks/useAudio'
import { useGameStore } from './store/useGameStore'
import { setLockFn } from './systems/pointerLock'

import Player         from './components/Player'
import World          from './components/World'
import Buildings      from './components/Buildings'
import Trees          from './components/Trees'
import Rocks          from './components/Rocks'
import Landmark       from './components/Landmark'
import StreetLamps    from './components/StreetLamps'
import Particles      from './components/Particles'
import PostProcessing from './components/PostProcessing'
import Overlay        from './components/Overlay'
// ── Phase 4 additions ─────────────────────────────────────────────────────
import DayNightCycle  from './components/DayNightCycle'  // 4.3 — animated sky + lights
import Water          from './components/Water'           // 4.4 — animated lake surfaces
import Level          from './components/Level'           // 4.1 — JSON-driven NPCs + triggers

/**
 * App — root component. Canvas setup, pointer-lock wiring, scene assembly.
 *
 * ── Phase 4 changes ───────────────────────────────────────────────────────
 *
 * THREE THINGS replaced or added:
 *
 * 1. DayNightCycle replaces static <Sky> + hardcoded lights.
 *    The static `SUN_POSITION` constant and the three separate light tags
 *    (ambientLight, directionalLight, hemisphereLight) are gone. DayNightCycle
 *    owns all of them and animates them together via ref-mutation in useFrame.
 *    The fog colour is also animated — DayNightCycle mutates scene.fog.color
 *    in its useFrame loop.
 *
 * 2. Level replaces hardcoded <NPC> tags.
 *    The three hardcoded NPC placements are removed from App.jsx. Level.jsx
 *    reads level_01.json and renders them from data. It also runs trigger
 *    volume checks every frame, firing discoverArea() events as the player
 *    explores. Adding a new NPC now requires only a JSON edit.
 *
 * 3. <Water> is new — two animated lake planes placed in terrain depressions.
 *    Pure UV-scrolling; no geometry changes per frame.
 *
 * ── LockBridge ────────────────────────────────────────────────────────────
 *
 * A null-rendering component that lives inside Canvas and surfaces
 * requestPointerLock() to the App level via a callback. Necessary because
 * pointer lock must be called on the WebGL canvas DOM element — only
 * accessible from inside the Canvas context via useThree().gl.domElement.
 *
 * ── CameraSync ────────────────────────────────────────────────────────────
 *
 * Throttled (20Hz) bridge from camera.rotation.y → Zustand store. The DOM
 * overlay's compass reads cameraYaw from the store. Throttling limits
 * compass-driven re-renders to 20/sec, which is imperceptible to humans.
 */

function LockBridge({ onReady }) {
  const { gl } = useThree()
  useEffect(() => {
    const fn = () => gl.domElement.requestPointerLock()
    onReady(fn)
    setLockFn(fn)
  }, [gl, onReady])
  return null
}

function CameraSync() {
  const { camera }   = useThree()
  const setCameraYaw = useGameStore(state => state.setCameraYaw)
  const accumRef     = useRef(0)

  useFrame((_, delta) => {
    accumRef.current += delta
    if (accumRef.current >= 0.05) {
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

  useEffect(() => {
    const { pickUpItem } = useGameStore.getState()
    pickUpItem({ id: 'item_key',  name: 'Ancient Key',  type: 'key',        color: '#f59e0b', description: 'A heavy iron key of unknown origin. It opens something — but what?' })
    pickUpItem({ id: 'item_map',  name: 'Old Map',      type: 'tool',       color: '#84cc16', description: 'A tattered map of a nameless settlement. The landmarks have faded.' })
    pickUpItem({ id: 'item_herb', name: 'Healing Herb', type: 'consumable', color: '#22c55e', description: 'Smells of pine. Press F to use — restores 30 HP.', healAmount: 30 })
  }, [])

  const handleReady = useCallback((fn) => { lockFn.current = fn }, [])
  const handleStart = () => lockFn.current?.()

  return (
    <>
      {/* ── 3D Canvas ───────────────────────────────────────────────── */}
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 500, position: [0, 1.7, 0] }}
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      >
        {/*
          Fallback background colour — visible for one frame before Sky renders,
          and on very old GPUs that fail to load the sky shader.
        */}
        <color attach="background" args={['#8ab4cc']} />

        {/*
          Environment map — provides image-based lighting (IBL) for PBR
          materials. Reflection probes and specular highlights on metallic
          surfaces come from here. background={false} keeps it invisible;
          only its lighting contribution is used.
        */}
        <Environment preset="sunset" background={false} />

        {/*
          Fog — density set here; colour is animated by DayNightCycle via
          scene.fog.color in its useFrame loop. The fog object must exist
          before DayNightCycle mounts so scene.fog is non-null when the
          first useFrame fires.
        */}
        <fogExp2 attach="fog" args={['#c0ccd8', 0.015]} />

        {/* ── Phase 4.3: Day/Night Cycle ────────────────────────────── */}
        {/*
          Owns: Sky shader, directionalLight (sun), ambientLight, hemisphereLight.
          All are animated via refs — zero re-renders from this component.
          Replaces the static SUN_POSITION + three separate light tags.
        */}
        <DayNightCycle />

        {/* ── Player ────────────────────────────────────────────────── */}
        <Player
          onLock={()   => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />

        {/* ── Static scene geometry ──────────────────────────────────── */}
        {/*
          World now renders procedural terrain (Phase 4.2).
          Trees and Rocks snap themselves to terrain height via getTerrainHeight().
        */}
        <World />
        <Buildings />
        <Trees />
        <Rocks />
        <Landmark />
        <StreetLamps />

        {/* ── Phase 4.4: Water ──────────────────────────────────────── */}
        {/*
          Two lake planes placed in terrain depressions. UV offsets scroll
          in useFrame — no geometry updates, pure material animation.
        */}
        <Water />

        {/* ── Phase 4.1: Level system ───────────────────────────────── */}
        {/*
          Reads level_01.json and renders:
            - NPCs (replacing the three hardcoded <NPC> tags that were here)
            - Trigger volumes (proximity zones that fire discoverArea events)
          To add a new NPC: edit public/levels/level_01.json, no code change.
        */}
        <Level />

        {/* ── Particles ─────────────────────────────────────────────── */}
        <Particles />

        {/* ── Post-processing ───────────────────────────────────────── */}
        <PostProcessing />

        {/* ── Canvas bridges ────────────────────────────────────────── */}
        <LockBridge onReady={handleReady} />
        <CameraSync />
        <Stats />
      </Canvas>

      {/* ── DOM overlay (start screen + HUD) ─────────────────────────── */}
      <Overlay locked={locked} onStart={handleStart} />
    </>
  )
}
