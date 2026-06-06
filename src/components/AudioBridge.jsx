import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { updateListener } from '../systems/AudioManager'

/**
 * AudioBridge — syncs the Web Audio API spatial listener to the camera.
 *
 * ── Phase 5.1 — Spatial Audio ────────────────────────────────────────────
 *
 * This is a null-rendering component (returns null) that lives inside the
 * R3F Canvas. Its only job is to call `updateListener()` every frame with
 * the camera's current position and orientation.
 *
 * ── Why this needs to be inside Canvas ───────────────────────────────────
 *
 * `useFrame` and `useThree` only work inside the Canvas context. The camera
 * is a Three.js object that lives inside the scene — it's not accessible
 * from outside Canvas without manual ref-drilling. AudioBridge is the same
 * pattern as CameraSync in App.jsx: a purpose-built null component that
 * bridges the Canvas world to something outside it.
 *
 * ── Why every frame matters ───────────────────────────────────────────────
 *
 * The Web Audio API's spatial engine computes stereo panning by comparing
 * the listener's current position + orientation against each PannerNode's
 * position. If you update the listener at 5Hz but the player turns at 60Hz,
 * the sound direction lags noticeably. Audio listener updates are cheap
 * (just writing 9 floats) so we do it every frame.
 *
 * Unlike CameraSync (which throttles to 20Hz to limit React re-renders),
 * AudioBridge updates at full frame rate because it has NO React state
 * updates — everything is a direct write to the Web Audio API's AudioParams.
 *
 * ── The three vectors ─────────────────────────────────────────────────────
 *
 * The listener needs three values to fully describe where the ears are:
 *
 *   POSITION   (x, y, z)     — where in the world the listener is
 *   FORWARD    (fx, fy, fz)  — the direction the head is facing
 *   UP         (ux, uy, uz)  — which way is "up" relative to the head
 *
 * Together, position + forward + up define a complete 3D coordinate frame.
 * From this, the audio engine can compute:
 *   - The vector from listener to sound source
 *   - The elevation angle (is the sound above or below?)
 *   - The azimuth angle (is the sound to the left or right?)
 *   - The distance (how far away is the source?)
 *
 * `camera.getWorldDirection(forward)` returns a unit vector pointing in
 * the direction the camera is currently looking. `camera.up` is the up
 * vector, which is always (0, 1, 0) in a standard FPS camera.
 */

export default function AudioBridge() {
  const { camera } = useThree()
  // Reuse a single Vector3 to avoid allocating a new object every frame
  const forward = useRef(new Vector3())

  useFrame(() => {
    camera.getWorldDirection(forward.current)
    const f = forward.current
    const p = camera.position
    const u = camera.up

    updateListener(
      p.x, p.y, p.z,      // listener position
      f.x, f.y, f.z,      // forward (look direction)
      u.x, u.y, u.z       // up vector
    )
  })

  return null
}
