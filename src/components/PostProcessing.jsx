/**
 * PostProcessing.jsx
 *
 * Screen-space effects applied after the 3D scene is rendered.
 * Each effect is a full-screen texture pass — they stack in order.
 *
 * EffectComposer renders the scene to an off-screen framebuffer, then
 * runs each effect in sequence, piping the output of one into the next,
 * and finally blitting the result to the screen. This is the standard
 * post-processing pipeline used in every modern game engine.
 *
 * Effects included:
 *   Bloom     — makes bright areas glow and bleed into surroundings
 *   SMAA      — anti-aliasing (replaces Canvas's default MSAA when postprocessing is active)
 *   Vignette  — darkens the screen edges, like a camera lens falloff
 */

import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

/**
 * PostProcessing
 *
 * Drop this inside <Canvas>. It has no visible geometry — it intercepts
 * the render pipeline via the EffectComposer.
 *
 * Tuning notes:
 *   Bloom.intensity       — 0.3-0.6 is subtle; >1.0 looks like a lens flare ad
 *   Bloom.luminanceThreshold — only pixels brighter than this bloom; 0.85 keeps
 *                             most surfaces clean, only sun-bright areas glow
 *   Vignette.darkness     — 0.4 is barely perceptible; 0.8 is dramatic/cinematic
 *   Vignette.offset       — higher = vignette starts further from center
 */
export default function PostProcessing() {
  return (
    <EffectComposer
      // multisampling={0} disables MSAA on the composer's render target — SMAA below
      // handles anti-aliasing instead. MSAA + postprocessing = double AA cost for no gain.
      multisampling={0}
    >
      {/*
        SMAA — Subpixel Morphological Anti-Aliasing
        When EffectComposer is active, the Canvas's built-in MSAA no longer applies
        because the scene renders to an off-screen texture. SMAA is the standard
        replacement — it's a screen-space AA pass that's fast and high quality.
      */}
      <SMAA />

      {/*
        Bloom — glow and light bleed
        luminanceThreshold: only pixels above this brightness bloom (0 = everything,
          1 = nothing; 0.85 targets only the sun-lit sky and lamp halos)
        luminanceSmoothing: how soft the cutoff edge is (0 = hard step, 1 = very gradual)
        intensity: overall bloom strength
        mipmapBlur: true uses a higher-quality mipmap-based blur (slightly more expensive)
      */}
      <Bloom
        intensity={0.4}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.8}
        mipmapBlur
      />

      {/*
        Vignette — darkened screen edges
        Subtle darkening toward the edges makes the scene feel more like
        you're looking through a physical lens. eskil={false} uses a smooth
        radial gradient; eskil={true} uses Eskil Steenberg's formula (more oval).
        offset: how far from center the vignette starts (0.1 = starts near edge)
        darkness: how dark the corners get (0.55 = moderate)
      */}
      <Vignette
        eskil={false}
        offset={0.1}
        darkness={0.55}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}
