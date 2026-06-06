/**
 * GlowOrb.jsx — Phase 6.4: Custom GLSL Shader Demonstration
 *
 * A floating sphere with a custom Fresnel rim-light shader.
 * Placed near the obelisk as a mysterious artifact in the scene.
 *
 * ── What This Demonstrates ────────────────────────────────────────────────────
 *
 * 1. shaderMaterial — a Three.js material driven entirely by custom GLSL code.
 *    No Lambert, no Standard — your own vertex and fragment programs.
 *
 * 2. Uniforms — per-frame values sent from JS to the shader.
 *    `uTime` advances each frame via useFrame, making the orb pulse.
 *    Without uniform updates, the shader would run but show a static result.
 *
 * 3. Fresnel effect — the shader makes the orb bright at its rim and dark
 *    at its center, as if it were a glowing energy field.
 *
 * 4. Transparent shader material — `transparent: true` + alpha from the
 *    fragment shader lets the scene show through the dark center of the orb.
 *
 * ── ShaderMaterial vs RawShaderMaterial ──────────────────────────────────────
 *
 * ShaderMaterial (used here) automatically injects Three.js uniforms:
 *   projectionMatrix, modelViewMatrix, normalMatrix, modelMatrix, viewMatrix
 *   These are available in your shader without declaring them.
 *
 * RawShaderMaterial gives you a blank slate — you declare everything yourself.
 * Use RawShaderMaterial when you need full control or are porting external shaders.
 *
 * ── Depth Write ──────────────────────────────────────────────────────────────
 *
 * `depthWrite={false}` prevents the transparent parts of the orb from blocking
 * objects behind it. Without this, the dark alpha=0 center would write to the
 * depth buffer and hide geometry behind it — a common transparency artifact.
 *
 * ── Inner Glow Layer ─────────────────────────────────────────────────────────
 *
 * The orb has two meshes:
 *   - Outer: the Fresnel rim (emissive halo effect)
 *   - Inner: a smaller solid emissive sphere for the "core"
 *
 * This layering — common in games — gives depth that a single mesh can't achieve.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { fresnelVertexShader, fresnelFragmentShader } from '../shaders/shaders'

// Orb positions — placed around the scene as found artifacts
export const ORB_PLACEMENTS = [
  { position: [-1, 1.8, -48], color: '#44aaff', power: 3.0, scale: 0.6 },  // near obelisk
  { position: [20, 2.0, -18], color: '#ff6644', power: 2.5, scale: 0.4 },  // near buildings
  { position: [-16, 1.6, -30], color: '#44ff88', power: 3.5, scale: 0.5 }, // in the woods
]

// ── Single orb ────────────────────────────────────────────────────────────────

function Orb({ position, color, power = 3.0, scale = 0.5 }) {
  const outerRef  = useRef()

  // Build the shader material once — uniforms are mutated in useFrame
  const shaderMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   fresnelVertexShader,
    fragmentShader: fresnelFragmentShader,
    uniforms: {
      uTime:      { value: 0 },
      uColor:     { value: new THREE.Color(color) },
      uPower:     { value: power },
      uIntensity: { value: 1.0 },
    },
    transparent:  true,
    depthWrite:   false,
    side:         THREE.FrontSide,
    blending:     THREE.AdditiveBlending,   // bright parts add to scene instead of covering it
  }), [color, power])

  // Update uTime every frame so the pulse animation runs
  useFrame(({ clock }) => {
    shaderMat.uniforms.uTime.value = clock.getElapsedTime()

    // Gentle vertical hover: orb floats up and down on a slow sine wave
    if (outerRef.current) {
      outerRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 0.7) * 0.12
    }
  })

  return (
    <group>
      {/* ── Outer rim (custom Fresnel shader) ──────────────────────────── */}
      <mesh ref={outerRef} position={position} scale={scale}>
        <sphereGeometry args={[1, 32, 24]} />
        <primitive object={shaderMat} attach="material" />
      </mesh>

      {/* ── Inner core: small solid emissive sphere ────────────────────── */}
      {/* Uses standard material — no custom shader needed for the core */}
      <mesh position={position} scale={scale * 0.35}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={4.0}
          roughness={0}
          metalness={0}
        />
      </mesh>

      {/* ── Point light: orb illuminates nearby surfaces ───────────────── */}
      <pointLight
        position={position}
        color={color}
        intensity={1.2}
        distance={8}
        decay={2}
      />
    </group>
  )
}

// ── GlowOrbs (all orb placements) ─────────────────────────────────────────────

export default function GlowOrbs() {
  return (
    <group name="glowOrbs">
      {ORB_PLACEMENTS.map((props, i) => (
        <Orb key={i} {...props} />
      ))}
    </group>
  )
}
