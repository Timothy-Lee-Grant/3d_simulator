import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'

/**
 * DayNightCycle — animated sky, sun, and scene lighting.
 *
 * ── Phase 4.3 ────────────────────────────────────────────────────────────
 *
 * This component replaces the static Sky + lights in App.jsx with an
 * animated system that moves the sun around a full day/night arc over
 * CYCLE_DURATION real seconds. Every visual attribute of the sky, sun,
 * fog, and ambient fill tracks the same single time value.
 *
 * ── The Key Engineering Pattern: ref-mutation in useFrame ────────────────
 *
 * PROBLEM: How do you update 60 times per second without causing 60
 * React re-renders per second?
 *
 * WRONG APPROACH (causes re-renders):
 *   const [sunPos, setSunPos] = useState([60, 90, 40])
 *   useFrame(() => setSunPos([...]))   // re-render every frame 🔴
 *
 * RIGHT APPROACH (zero re-renders):
 *   const lightRef = useRef()
 *   useFrame(() => {
 *     lightRef.current.position.set(...)   // mutate Three.js object directly 🟢
 *     lightRef.current.intensity = ...     // no React involved
 *   })
 *
 * Three.js objects (DirectionalLight, AmbientLight, HemisphereLight,
 * FogExp2, SkyImpl) are vanilla JavaScript objects — they have no
 * connection to React's reconciler. Mutating their properties in
 * useFrame bypasses React entirely: the GPU gets updated values every
 * frame, and React never re-renders.
 *
 * R3F itself uses exactly this pattern for its built-in animations.
 * The `ref` prop on JSX elements (like `<directionalLight ref={lightRef}>`)
 * gives you direct access to the underlying Three.js object instance.
 *
 * ── Sky: accessing the shader material's uniforms ─────────────────────────
 *
 * Drei's `<Sky>` renders a THREE.Sky mesh (a large sphere with a custom
 * atmospheric scattering shader). The sun position is a shader uniform:
 *   skyRef.current.material.uniforms.sunPosition.value → THREE.Vector3
 *
 * We update this uniform directly in useFrame, just like any other ref.
 * The Sky's JSX props (turbidity, rayleigh, etc.) set the static
 * atmospheric parameters at mount and never need to change.
 *
 * ── Time and Sun Math ─────────────────────────────────────────────────────
 *
 * Time is a float from 0 to 1, representing one full day:
 *   0.00 = midnight
 *   0.25 = dawn (east horizon)
 *   0.50 = noon (directly overhead)
 *   0.75 = dusk (west horizon)
 *   1.00 = midnight again
 *
 * The sun traces a circle in the XY plane (Z = 50 as a fixed offset to
 * match the atmospheric scattering geometry). The angle formula:
 *
 *   angle = time × 2π − π/2
 *
 * The −π/2 offset makes t=0.25 (dawn) correspond to the sun rising on
 * the east horizon (+X direction in this scene), matching the Sky's
 * atmospheric gradient.
 *
 * ── Light Parameter Curves ────────────────────────────────────────────────
 *
 * Sun intensity uses a power curve: Math.pow(sunElevation, 0.4) × 1.4
 *   sunElevation = sunY / 100  (0 at horizon, 1 at zenith)
 *   The 0.4 exponent brightens quickly after sunrise and stays bright
 *   through most of the day — more natural than linear.
 *
 * Sun color transitions from warm orange (dawn/dusk) to pale white (noon)
 * using HSL: hue stays at 0.08 (orange), saturation drops as elevation
 * increases (low sun = vivid orange, high sun = nearly white).
 *
 * Ambient light shifts from warm cream (day) to cold blue (night):
 *   Day:   hsl(0.08, 0.3, 0.7+elev)   — warm fill from sky
 *   Night: hsl(0.62, 0.3, 0.20)        — cool blue moonlight
 *
 * Fog color is interpolated between the daytime sky colour and a deep
 * blue-black night colour based on the sun's elevation.
 *
 * ── The fogRef Pattern ────────────────────────────────────────────────────
 *
 * `scene.fog` is the FogExp2 object set by `<fogExp2>` in App.jsx. We
 * can't ref a JSX intrinsic like `<fogExp2>`, so we access it via the
 * scene object that useFrame provides: `useFrame(({ scene }) => ...)`.
 * scene.fog is always available because App.jsx mounts it before Canvas.
 */

// How many real seconds = one full in-game day
const CYCLE_DURATION = 90   // 90 seconds per full day

// Starting time (0.38 ≈ late morning)
const START_TIME = 0.38

export default function DayNightCycle() {
  const skyRef     = useRef()
  const sunRef     = useRef()
  const ambientRef = useRef()
  const hemiRef    = useRef()
  const timeRef    = useRef(START_TIME)

  useFrame(({ scene }, delta) => {
    // ── Advance time ──────────────────────────────────────────────────────
    timeRef.current = (timeRef.current + delta / CYCLE_DURATION) % 1
    const t = timeRef.current

    // ── Sun position ─────────────────────────────────────────────────────
    // Sun traces a circle: east (+X) at t=0.25 (dawn), zenith at t=0.5 (noon)
    const angle = t * Math.PI * 2 - Math.PI * 0.5
    const sunX  = Math.cos(angle) * 100
    const sunY  = Math.sin(angle) * 100
    const sunZ  = 50

    // sunElevation: 0 at horizon, 1 at zenith, <0 below horizon (night)
    const sunElevation = sunY / 100
    const isDay        = sunY > -8   // small threshold softens the night onset

    // ── Update Sky shader ─────────────────────────────────────────────────
    if (skyRef.current?.material?.uniforms?.sunPosition) {
      skyRef.current.material.uniforms.sunPosition.value.set(sunX, sunY, sunZ)
    }

    // ── Update directional light (the sun) ───────────────────────────────
    if (sunRef.current) {
      sunRef.current.position.set(sunX, sunY, sunZ)

      // Intensity — power curve so sun brightens quickly after dawn
      sunRef.current.intensity = isDay
        ? Math.pow(Math.max(0, sunElevation), 0.4) * 1.5
        : 0

      // Color — orange/red at horizon, pale warm white at noon
      const sat = isDay ? Math.max(0, (1 - sunElevation) * 0.85) : 0
      const lit = isDay ? Math.max(0.05, sunElevation * 0.55 + 0.45) : 0.02
      sunRef.current.color.setHSL(0.08, sat, lit)
    }

    // ── Update ambient light ─────────────────────────────────────────────
    if (ambientRef.current) {
      if (isDay) {
        ambientRef.current.intensity = 0.12 + Math.max(0, sunElevation) * 0.22
        // Warm cream during day; slightly cooler and deeper at dusk/dawn
        const warmth = 0.55 + Math.max(0, sunElevation) * 0.45
        ambientRef.current.color.setHSL(0.08, 0.25, warmth)
      } else {
        ambientRef.current.intensity = 0.04
        ambientRef.current.color.setHSL(0.62, 0.28, 0.20)  // cool blue moonlight
      }
    }

    // ── Update hemisphere light ───────────────────────────────────────────
    if (hemiRef.current) {
      if (isDay) {
        const skyBrightness    = 0.40 + Math.max(0, sunElevation) * 0.40
        const groundBrightness = 0.15 + Math.max(0, sunElevation) * 0.20
        hemiRef.current.color.setHSL(0.60, 0.40, skyBrightness)
        hemiRef.current.groundColor.setHSL(0.25, 0.38, groundBrightness)
        hemiRef.current.intensity = 0.10 + Math.max(0, sunElevation) * 0.22
      } else {
        hemiRef.current.color.setHSL(0.62, 0.18, 0.10)        // deep blue sky
        hemiRef.current.groundColor.setHSL(0.25, 0.08, 0.04)  // near-black ground
        hemiRef.current.intensity = 0.04
      }
    }

    // ── Update fog color ─────────────────────────────────────────────────
    // Access fog directly from the scene object — the only way to ref
    // a Three.js scene-level property that isn't a mesh.
    if (scene.fog) {
      if (isDay) {
        const elev = Math.max(0, sunElevation)
        // Horizon glow at dawn/dusk (orange tinge), clear blue at noon
        const fr = 0.55 + elev * 0.18 + (1 - elev) * 0.12
        const fg = 0.62 + elev * 0.15
        const fb = 0.72 + elev * 0.14
        scene.fog.color.setRGB(fr, fg, fb)
      } else {
        // Deep indigo night fog
        scene.fog.color.setRGB(0.02, 0.02, 0.06)
      }
    }
  })

  return (
    <>
      {/*
        Sky — turbidity/rayleigh/mie set atmospheric haze. These are static
        parameters; sunPosition is updated every frame via skyRef in useFrame.
      */}
      <Sky
        ref={skyRef}
        sunPosition={[100, 20, 50]}
        turbidity={8}
        rayleigh={0.7}
        mieCoefficient={0.006}
        mieDirectionalG={0.82}
      />

      {/*
        Directional light — acts as the sun. Shadow map is static (2048px, PCF).
        Position, intensity, and color are animated via sunRef in useFrame.
      */}
      <directionalLight
        ref={sunRef}
        color="#fff5e0"
        intensity={1.3}
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

      {/* Ambient fill — softens shadows. Colour animated via ambientRef. */}
      <ambientLight ref={ambientRef} color="#ffeedd" intensity={0.20} />

      {/* Hemisphere (sky/ground) fill — animated via hemiRef. */}
      <hemisphereLight ref={hemiRef} color="#b0c8e0" groundColor="#4a7c45" intensity={0.25} />
    </>
  )
}
