import { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Environment, Stats } from '@react-three/drei'
import useAudio from './hooks/useAudio'
import { useGameStore } from './store/useGameStore'
import { setLockFn } from './systems/pointerLock'

import Player          from './components/Player'
import World           from './components/World'
import Buildings       from './components/Buildings'
import Landmark        from './components/Landmark'
import StreetLamps     from './components/StreetLamps'
import Particles       from './components/Particles'
import PostProcessing  from './components/PostProcessing'
import Overlay         from './components/Overlay'
// ── Phase 4 additions ─────────────────────────────────────────────────────
import DayNightCycle   from './components/DayNightCycle'  // 4.3 — animated sky + lights
import Water           from './components/Water'           // 4.4 — animated lake surfaces
import Level           from './components/Level'           // 4.1 — JSON-driven NPCs + triggers
// ── Phase 5 additions ─────────────────────────────────────────────────────
import AudioBridge     from './components/AudioBridge'    // 5.1 — syncs spatial audio listener
// ── Phase 6 additions ─────────────────────────────────────────────────────
import InstancedForest from './components/InstancedForest' // 6.3 — 50 trees, 3 draw calls
import InstancedRocks  from './components/InstancedRocks'  // 6.3 — 30 rocks, 1 draw call
import GlowOrbs        from './components/GlowOrb'         // 6.4 — custom fresnel shader
import GrassField      from './components/GrassField'      // 6.4 — wind vertex shader + instancing
// ── Phase 7 additions ─────────────────────────────────────────────────────
import LODTrees        from './components/LODTrees'        // 7.3 — THREE.LOD with billboard sprites
import DebugPanel      from './components/DebugPanel'      // 7.4 — dev-only runtime controls
import { useDebugStore } from './store/useDebugStore'      // 7.4 — runtime-tunable values
import { loadGame, applyLoadedGame, saveGame } from './systems/saveLoad' // 7.2 — persistence

/**
 * App — root component. Canvas setup, pointer-lock wiring, scene assembly.
 *
 * ── Phase 4 changes ───────────────────────────────────────────────────────
 *
 * 1. DayNightCycle replaces static <Sky> + hardcoded lights.
 * 2. Level replaces hardcoded <NPC> tags.
 * 3. <Water> — two animated lake planes.
 *
 * ── Phase 6 changes ───────────────────────────────────────────────────────
 *
 * 1. Trees → InstancedForest (6.3): 50 trees in 3 draw calls (was 24).
 *    Per-instance color tinting + per-frame wind sway via matrix updates.
 *
 * 2. Rocks → InstancedRocks (6.3): 30 rocks in 1 draw call (was 5).
 *
 * 3. GlowOrbs (6.4): custom Fresnel GLSL shader. Each emits a point light.
 *
 * 4. GrassField (6.4): 2,000 grass blade instances with wind vertex shader.
 *    Zero CPU work per frame after initial matrix setup.
 *
 * ── LockBridge ────────────────────────────────────────────────────────────
 *
 * Surfaces requestPointerLock() from inside Canvas to the App level.
 *
 * ── Phase 7 changes ───────────────────────────────────────────────────────
 *
 * 1. LODTrees (7.3): THREE.LOD cluster — 4 detail levels + billboard sprites.
 *
 * 2. Save / Load (7.2): loadGame() on mount; auto-save every 30s while locked.
 *    Starter items only given on first play (no save file found).
 *
 * 3. FogSync (7.4): inner Canvas component — applies debug fog density to
 *    scene.fog.density each frame and processes camera teleports from DebugPanel.
 *
 * 4. DebugPanel (7.4): dev-only DOM panel (` key). Rendered outside Canvas.
 *    grassVisible toggle from useDebugStore gates GrassField rendering.
 *
 * ── CameraSync ────────────────────────────────────────────────────────────
 *
 * Throttled (20Hz) bridge: camera.rotation.y → Zustand store → DOM compass.
 * Also saves camera position every 2 s for save/load persistence.
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
  const savePosition = useGameStore(state => state.savePosition)
  const accumRef     = useRef(0)
  const posAccRef    = useRef(0)

  useFrame((_, delta) => {
    accumRef.current += delta
    if (accumRef.current >= 0.05) {
      setCameraYaw(camera.rotation.y)
      accumRef.current = 0
    }
    posAccRef.current += delta
    if (posAccRef.current >= 2) {
      savePosition({ x: camera.position.x, y: camera.position.y, z: camera.position.z })
      posAccRef.current = 0
    }
  })

  return null
}

// ── FogSync ───────────────────────────────────────────────────────────────────
//
// Runs inside Canvas so it has access to scene and camera.
// 1. Applies debug store fogDensity to scene.fog.density every frame.
// 2. Processes camera teleports queued by DebugPanel via teleportRef.

function FogSync({ teleportRef }) {
  const { scene, camera } = useThree()

  useFrame(() => {
    if (scene.fog) {
      scene.fog.density = useDebugStore.getState().fogDensity
    }
    if (teleportRef.current) {
      const { x, y, z } = teleportRef.current
      camera.position.set(x, y, z)
      teleportRef.current = null
    }
  })

  return null
}

export default function App() {
  const [locked, setLocked] = useState(false)
  const lockFn     = useRef(null)
  const teleportRef = useRef(null)

  useAudio(locked)

  // ── Grassfield visibility toggle from debug store ────────────────────────
  const grassVisible = useDebugStore(s => s.grassVisible)

  // ── On mount: load save or give starter items ────────────────────────────
  useEffect(() => {
    const saved = loadGame()
    if (saved) {
      const { spawnPosition } = applyLoadedGame(saved)
      if (spawnPosition) teleportRef.current = spawnPosition
    } else {
      const { pickUpItem } = useGameStore.getState()
      pickUpItem({ id: 'item_key',  name: 'Ancient Key',  type: 'key',        color: '#f59e0b', description: 'A heavy iron key of unknown origin. It opens something — but what?' })
      pickUpItem({ id: 'item_map',  name: 'Old Map',      type: 'tool',       color: '#84cc16', description: 'A tattered map of a nameless settlement. The landmarks have faded.' })
      pickUpItem({ id: 'item_herb', name: 'Healing Herb', type: 'consumable', color: '#22c55e', description: 'Smells of pine. Press F to use — restores 30 HP.', healAmount: 30 })
    }
  }, [])

  // ── Auto-save every 30 s while pointer is locked ─────────────────────────
  useEffect(() => {
    if (!locked) return
    const id = setInterval(() => saveGame(), 30_000)
    return () => clearInterval(id)
  }, [locked])

  const handleReady    = useCallback((fn) => { lockFn.current = fn }, [])
  const handleStart    = () => lockFn.current?.()
  const handleTeleport = useCallback((pos) => { teleportRef.current = pos }, [])

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

        {/* ── Scene geometry ────────────────────────────────────────── */}
        <World />
        <Buildings />
        <Landmark />
        <StreetLamps />

        {/* ── Phase 6.3: Instanced rendering ────────────────────────── */}
        {/*
          InstancedForest: 50 trees in 3 draw calls (was ~24).
          Wind sway via per-frame matrix updates on canopy instances.
          Replaces Trees.jsx.
        */}
        <InstancedForest />

        {/* ── Phase 7.3: LOD Trees ──────────────────────────────────── */}
        {/*
          LODTrees: 8 trees using THREE.LOD — 4 detail levels including
          billboard sprites at >70 units. Demonstrates the LOD pattern
          alongside the instanced forest (different technique trade-offs).
        */}
        <LODTrees />

        {/*
          InstancedRocks: 30 rocks in 1 draw call (was 5).
          Static instance matrices — rocks don't move.
          Replaces Rocks.jsx.
        */}
        <InstancedRocks />

        {/* ── Phase 4.4: Water ──────────────────────────────────────── */}
        <Water />

        {/* ── Phase 4.1: Level system (NPCs + triggers) ────────────── */}
        <Level />

        {/* ── Phase 6.4: Custom GLSL shaders ────────────────────────── */}
        {/*
          GlowOrbs: three floating artifact orbs with custom Fresnel shader.
          Each orb adds a colored point light to the scene.
        */}
        <GlowOrbs />

        {/*
          GrassField: 2,000 instanced grass blades.
          Wind displacement runs entirely in the vertex shader — zero CPU
          work per frame after initial setup.
          Toggled by grassVisible in useDebugStore (DebugPanel slider).
        */}
        {grassVisible && <GrassField />}

        {/* ── Particles ─────────────────────────────────────────────── */}
        <Particles />

        {/* ── Post-processing ───────────────────────────────────────── */}
        <PostProcessing />

        {/* ── Canvas bridges ────────────────────────────────────────── */}
        <LockBridge onReady={handleReady} />
        <CameraSync />
        {/* AudioBridge: updates Web Audio listener position/orientation each frame */}
        <AudioBridge />
        {/* FogSync: applies debug fog density + processes camera teleports */}
        <FogSync teleportRef={teleportRef} />
        <Stats />
      </Canvas>

      {/* ── DOM overlay (start screen + HUD) ─────────────────────────── */}
      <Overlay locked={locked} onStart={handleStart} />

      {/* ── Phase 7.4: Debug panel — dev only, outside Canvas ────────── */}
      {import.meta.env.DEV && <DebugPanel onTeleport={handleTeleport} />}
    </>
  )
}
