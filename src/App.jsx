import { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Sky, Environment } from '@react-three/drei'
import useAudio from './hooks/useAudio'

import Player         from './components/Player'
import World          from './components/World'
import Buildings      from './components/Buildings'
import Trees          from './components/Trees'
import Rocks          from './components/Rocks'
import Landmark       from './components/Landmark'
import Human          from './components/Human'
import StreetLamps    from './components/StreetLamps'
import Particles      from './components/Particles'
import PostProcessing from './components/PostProcessing'
import Overlay        from './components/Overlay'

// Sun direction shared between the sky shader and the directional light.
// They must match — if the visible sun in the sky is north-east at high noon,
// the shadow-casting light should come from the same direction.
const SUN_POSITION = [60, 90, 40]

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
        style={{ width: '100vw', height: '100vh', display: 'block' }}
      >
        {/* Fallback background colour shown for the first frame before Sky loads */}
        <color attach="background" args={['#a8c8e8']} />

        {/* ── Sky shader ────────────────────────────────────────────── */}
        {/* Preetham atmospheric scattering model — procedural sky gradient.
            sunPosition must match the directional light position below.
            turbidity: 0=clear, 20=very hazy. rayleigh: controls blue sky intensity. */}
        <Sky
          sunPosition={SUN_POSITION}
          turbidity={7}
          rayleigh={0.6}
          mieCoefficient={0.006}
          mieDirectionalG={0.82}
        />

        {/* ── Environment map ───────────────────────────────────────── */}
        {/* Loads an HDR panorama and applies it as the scene's indirect lighting
            source. All PBR materials (MeshStandardMaterial) sample this map for:
              - Ambient diffuse fill (indirect light from the sky)
              - Specular reflections (shiny surfaces reflect the sky/buildings)
              - Metalness (metals reflect the env map tinted by their albedo colour)
            background={false} — Sky renders the visible sky, not the env map.
            NOTE: presets are fetched from the internet on first load. */}
        <Environment preset="sunset" background={false} />

        {/* ── Fog ───────────────────────────────────────────────────── */}
        {/* Horizon colour tuned to match the Sky shader's horizon at this time of day */}
        <fogExp2 attach="fog" args={['#c8d0d8', 0.015]} />

        {/* ── Lighting ──────────────────────────────────────────────── */}
        {/* Ambient is kept low — Environment map provides most of the fill light */}
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

        {/* Hemisphere kept for ground-bounce fill in shadow areas */}
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

        {/* ── Characters ────────────────────────────────────────────── */}
        {/* Each human gets a different phaseOffset so their idle cycles
            are staggered — they won't all inhale and sway in unison */}
        <Human position={[0,   0, -5]} rotation={[0, Math.PI,       0]} phaseOffset={0.0} />
        <Human position={[2.5, 0, -7]} rotation={[0, Math.PI * 1.3, 0]} phaseOffset={2.1} />
        <Human position={[-2,  0, -6]} rotation={[0, Math.PI * 0.8, 0]} phaseOffset={4.7} />

        {/* ── Particles ─────────────────────────────────────────────── */}
        {/* Ambient dust motes (BufferGeometry points, CPU-animated) and
            warm sparkle halos at each street lamp (Drei Sparkles).
            See Particles.jsx for the GPU buffer / draw-call explanation. */}
        <Particles />

        {/* ── Post-processing ───────────────────────────────────────── */}
        {/* Must come last inside Canvas so it captures the fully-lit scene.
            EffectComposer intercepts the render pipeline and applies screen-space
            effects: SMAA (anti-aliasing), Bloom (glow), Vignette (edge darkening).
            See PostProcessing.jsx for per-effect tuning notes. */}
        <PostProcessing />

        {/* ── Canvas/DOM bridge ─────────────────────────────────────── */}
        <LockBridge onReady={handleReady} />
      </Canvas>

      {/* ── DOM overlay (start screen + HUD) — lives outside Canvas ── */}
      <Overlay locked={locked} onStart={handleStart} />
    </>
  )
}
