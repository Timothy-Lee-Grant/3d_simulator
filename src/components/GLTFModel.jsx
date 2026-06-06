/**
 * GLTFModel.jsx
 *
 * Generic GLTF / GLB model loader with Suspense, animation support, and a
 * graceful error-boundary fallback when the file is missing or fails to load.
 *
 * ── What GLTF is ─────────────────────────────────────────────────────────────
 *
 * GLTF (GL Transmission Format) is the industry standard for real-time 3D assets.
 * A .glb binary bundles together in one file:
 *   - Geometry (vertex buffers, UV maps, index buffers)
 *   - Materials (PBR parameters — metalness, roughness, albedo, normal maps)
 *   - Textures (embedded as Base64 or referenced as separate image files)
 *   - Animations (an array of THREE.AnimationClip objects)
 *   - Scene hierarchy (a node graph, equivalent to nested <group> elements)
 *
 * Every major 3D tool — Blender, Maya, Houdini, Substance Painter — exports GLTF.
 * It replaces all the procedural geometry and TextureGenerator code in this project
 * with artist-authored assets.
 *
 * ── Loading Pattern ───────────────────────────────────────────────────────────
 *
 * `useGLTF` from Drei hooks into React Suspense. When the .glb file is not yet
 * downloaded, `useGLTF` throws a Promise — React catches it and renders the
 * <Suspense fallback> instead. When the download completes, React re-renders
 * the component with the loaded data. This is the same pattern used by
 * Next.js image loading and React Query.
 *
 * ── Scene Graph Import ────────────────────────────────────────────────────────
 *
 * GLTF exports a scene graph — a tree of Object3D nodes. Three.js reconstructs
 * this as a nested group hierarchy. The root is returned as `scene`. You can:
 *   - Render it as-is with <primitive object={scene} />
 *   - Traverse it to find specific meshes by name
 *   - Clone it for multiple instances: scene.clone()
 *   - Modify materials after load (swap textures, change roughness, etc.)
 *
 * ── Animation Playback ────────────────────────────────────────────────────────
 *
 * `useAnimations(animations, ref)` wraps Three.js's AnimationMixer:
 *   - Creates one mixer per model instance
 *   - Returns `actions` — an object keyed by clip name
 *   - Each action can be play(), stop(), reset(), fadeIn(t), fadeOut(t)
 *
 * The mixer automatically advances all active clips each frame via R3F's internal
 * useFrame loop. You don't need to call mixer.update(delta) yourself.
 *
 * ── Multiple Instances ────────────────────────────────────────────────────────
 *
 * Calling scene.clone() gives each component its own transform tree, so two
 * <GLTFModel url="..." /> at different positions don't share each other's state.
 * However, materials and geometry are shared by default — this is correct and
 * memory-efficient. To override a material per-instance, clone the material too.
 *
 * ── Free Model Sources ────────────────────────────────────────────────────────
 *
 * Place .glb files in public/models/ and reference them as '/models/filename.glb'.
 *   - https://quaternius.com/              ← CC0 low-poly packs (excellent quality)
 *   - https://sketchfab.com/               ← filter by free license
 *   - https://github.com/KhronosGroup/glTF-Sample-Assets  ← official PBR test models
 */

import { useRef, useEffect, Component, Suspense } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

// ── Core loader ───────────────────────────────────────────────────────────────

/**
 * Loads and renders a single GLTF/GLB model.
 *
 * Must be wrapped in <Suspense> — it suspends while the file downloads.
 *
 * @param {string}   url         Path or URL to the .glb file
 * @param {string}   [activeAnim]  Name of the animation clip to play (optional)
 * @param {number}   [fadeTime]    Crossfade duration in seconds (default 0.3)
 * @param {object}   props         Forwarded to <primitive> (position, rotation, scale)
 */
export function GLTFModel({ url, activeAnim, fadeTime = 0.3, ...props }) {
  const group = useRef()
  const { scene, animations } = useGLTF(url)

  // useAnimations wraps AnimationMixer and returns { actions, mixer }
  // The mixer is automatically updated every frame by R3F
  const { actions } = useAnimations(animations, group)

  // Switch animations with crossfade whenever activeAnim changes
  useEffect(() => {
    if (!activeAnim) return
    const action = actions[activeAnim]
    if (!action) return

    action.reset().fadeIn(fadeTime).play()

    // Cleanup: fade out when unmounting or switching to a new animation
    return () => { action.fadeOut(fadeTime) }
  }, [activeAnim, actions, fadeTime])

  // Clone the scene so each instance has independent transform state.
  // Geometry and materials are still shared — only transforms are separate.
  return <primitive ref={group} object={scene.clone()} {...props} />
}

// ── Error boundary ────────────────────────────────────────────────────────────

/**
 * Class-based error boundary that catches thrown Promises (Suspense) AND
 * runtime errors from failed fetches or invalid GLTF data.
 *
 * Must be a class component — functional components cannot catch render errors.
 */
class GLTFErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}

// ── Safe loader with fallback ─────────────────────────────────────────────────

/**
 * Wraps GLTFModel with Suspense + an error boundary.
 * If the .glb is missing, the network fails, or the file is invalid,
 * `fallback` is rendered instead of crashing the scene.
 *
 * Usage:
 *   <GLTFWithFallback
 *     url="/models/tree.glb"
 *     fallback={<ProceduralTree position={[0,0,0]} />}
 *     position={[5, 0, -10]}
 *   />
 *
 * @param {string}    url       Path to the .glb file
 * @param {ReactNode} fallback  What to render when load fails (required)
 * @param {object}    props     Forwarded to GLTFModel
 */
export function GLTFWithFallback({ url, fallback, ...props }) {
  return (
    <GLTFErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GLTFModel url={url} {...props} />
      </Suspense>
    </GLTFErrorBoundary>
  )
}

// ── Preload helper ────────────────────────────────────────────────────────────

/**
 * Preloads a GLTF file so it's ready before the component mounts.
 * Call at module level (outside components) to start the download early.
 *
 * Without preload, the file begins downloading only when the component
 * first renders — which can cause a visible pop-in.
 *
 * Usage:
 *   // At module top level:
 *   preloadModel('/models/character.glb')
 *   preloadModel('/models/tree.glb')
 */
export function preloadModel(url) {
  useGLTF.preload(url)
}

// ── Animated character helper ─────────────────────────────────────────────────

/**
 * Higher-level component for characters with an animation state machine.
 * Handles crossfades between named animation clips.
 *
 * @param {string}   url          Path to animated .glb
 * @param {string}   state        Current animation state name ('idle', 'walk', 'run', 'jump')
 * @param {object}   stateMap     Maps state name → clip name: { idle: 'Idle', walk: 'Walk' }
 * @param {number}   [fadeTime]   Crossfade duration (default 0.25s)
 * @param {object}   props        Forwarded to <primitive>
 *
 * Usage:
 *   <AnimatedGLTF
 *     url="/models/character.glb"
 *     state={isWalking ? 'walk' : 'idle'}
 *     stateMap={{ idle: 'CharacterArmature|Idle', walk: 'CharacterArmature|Walk' }}
 *   />
 */
export function AnimatedGLTF({ url, state, stateMap = {}, fadeTime = 0.25, ...props }) {
  const group = useRef()
  const { scene, animations } = useGLTF(url)
  const { actions } = useAnimations(animations, group)
  const prevState = useRef(null)

  useEffect(() => {
    const clipName = stateMap[state] ?? state
    if (!clipName || !actions[clipName]) return
    if (prevState.current) {
      const prev = stateMap[prevState.current] ?? prevState.current
      actions[prev]?.fadeOut(fadeTime)
    }
    actions[clipName].reset().fadeIn(fadeTime).play()
    prevState.current = state
  }, [state, stateMap, actions, fadeTime])

  return <primitive ref={group} object={scene.clone()} {...props} />
}

// Preload the Khronos duck sample to demonstrate live GLTF loading
// (loads from CDN — requires internet connection)
// preloadModel('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb')

export default GLTFModel
