/**
 * PostProcessing.jsx
 *
 * Screen-space effects: Bloom, SMAA anti-aliasing, Vignette.
 *
 * Requires @react-three/postprocessing and postprocessing packages.
 * Install with: npm install @react-three/postprocessing postprocessing
 *
 * Until those packages are installed this component returns null so the
 * rest of the app loads without errors. The scene renders normally —
 * just without the post-processing pass.
 *
 * To re-enable: uncomment the block below after installing the packages.
 */

// ── Enabled implementation (requires npm install) ─────────────────────────
//
// import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing'
// import { BlendFunction } from 'postprocessing'
//
// export default function PostProcessing() {
//   return (
//     <EffectComposer multisampling={0}>
//       <SMAA />
//       <Bloom intensity={0.4} luminanceThreshold={0.85} luminanceSmoothing={0.8} mipmapBlur />
//       <Vignette eskil={false} offset={0.1} darkness={0.55} blendFunction={BlendFunction.NORMAL} />
//     </EffectComposer>
//   )
// }

// ── Stub (active until packages are installed) ────────────────────────────
export default function PostProcessing() {
  return null
}
