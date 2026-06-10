/**
 * MinimapRenderTarget.jsx — Phase 7.1 (Reference Implementation)
 *
 * Demonstrates the WebGL render target approach to minimaps.
 * This component is NOT wired into App.jsx by default — it's here as
 * an educational reference and starting point for a full render-target minimap.
 *
 * ── What a Render Target Is ───────────────────────────────────────────────────
 *
 * Normally, Three.js renders the scene to the screen — the default "framebuffer"
 * provided by the browser. A WebGLRenderTarget is an off-screen framebuffer:
 * the GPU writes pixels to a texture in memory instead of the screen.
 *
 * You can then:
 *   a) Use that texture on a 3D mesh (e.g. a security camera display in-world)
 *   b) Read the pixels back to the CPU with readRenderTargetPixels() and
 *      display them in a DOM canvas element
 *   c) Use it as input to a post-processing pass
 *
 * ── The Render Target Pipeline ────────────────────────────────────────────────
 *
 *   1. Create: new THREE.WebGLRenderTarget(width, height)
 *      → Allocates a texture buffer on the GPU (width × height × 4 bytes for RGBA)
 *
 *   2. Set as target: gl.setRenderTarget(renderTarget)
 *      → All subsequent gl.render() calls write here, not the screen
 *
 *   3. Render: gl.render(scene, camera)
 *      → GPU executes the full scene render pipeline (vertex shaders, rasterisation,
 *        fragment shaders, depth testing) into the render target texture
 *
 *   4. Restore: gl.setRenderTarget(null)
 *      → Returns to rendering to the screen on the next main render pass
 *
 *   5. Read: gl.readRenderTargetPixels(target, x, y, w, h, buffer)
 *      → Copies render target pixel data from GPU → CPU as a Uint8Array
 *      → THIS IS EXPENSIVE — it forces a GPU pipeline flush (synchronisation stall)
 *        because the CPU must wait for the GPU to finish writing before reading.
 *
 * ── The Sync Stall Problem ────────────────────────────────────────────────────
 *
 * Modern GPUs process frames asynchronously — they queue several frames of work
 * ahead. When you call readRenderTargetPixels(), you ask the CPU to read data
 * the GPU may not have finished writing yet. The CPU blocks (stalls) waiting for
 * the GPU to catch up. This is called a "pipeline stall" or "GPU sync point."
 *
 * For a 60fps game, each frame has a 16.67ms budget. A readback can cost 2–5ms
 * depending on texture size. At 60fps this is fatal. At 10fps (1 read per 6 frames)
 * it's acceptable for a minimap.
 *
 * ── When to Use Render Targets (Without Readback) ─────────────────────────────
 *
 * Render targets are extremely fast when you DON'T read back to the CPU:
 *   - Security camera displays on a mesh in the 3D world
 *   - Portal rendering (render scene through a portal to a texture on the portal mesh)
 *   - Reflection probes (render scene from a point to an environment map)
 *   - Post-processing (all EffectComposer effects use render targets internally)
 *   - Shadow maps (depth render targets from the light's perspective)
 *
 * All of these stay entirely on the GPU. No readback. No stall.
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/useGameStore'

const RT_SIZE    = 256   // render target resolution (pixels)
const UPDATE_HZ  = 10    // minimap refresh rate (frames per second)
const VIEW_RANGE = 80    // world units visible in each direction

/**
 * Drop this inside <Canvas>. It renders the scene from above to a render target
 * and writes the pixels to a 2D canvas element identified by minimapCanvasId.
 *
 * @param {string} minimapCanvasId  The `id` of the DOM <canvas> to write to
 */
export function MinimapRenderTarget({ minimapCanvasId = 'minimap-rt' }) {
  const { gl, scene } = useThree()

  // ── Render target — allocate GPU texture buffer once ──────────────────────
  const renderTarget = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, {
      minFilter:  THREE.LinearFilter,
      magFilter:  THREE.LinearFilter,
      format:     THREE.RGBAFormat,
      type:       THREE.UnsignedByteType,
    })
    return rt
  }, [])

  // Cleanup: free GPU memory when component unmounts
  useEffect(() => () => renderTarget.dispose(), [renderTarget])

  // ── Top-down orthographic camera ──────────────────────────────────────────
  // OrthographicCamera(left, right, top, bottom, near, far)
  // Range set to VIEW_RANGE world units in each direction from origin.
  // We update .position each frame to track the player.
  const minimapCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(
      -VIEW_RANGE, VIEW_RANGE,  // left, right
       VIEW_RANGE,-VIEW_RANGE,  // top, bottom (negative because Y is up in Three.js)
      1, 500                    // near, far
    )
    cam.position.set(0, 200, 0)  // high above origin
    cam.lookAt(0, 0, 0)
    cam.up.set(0, 0, -1)         // top of minimap = world -Z (north)
    return cam
  }, [])

  // Pixel buffer for readback — allocated once
  const pixelBuffer = useMemo(() => new Uint8Array(RT_SIZE * RT_SIZE * 4), [])

  // Throttle counter — only readback every Nth frame
  const frameCount = useRef(0)
  const SKIP_FRAMES = Math.round(60 / UPDATE_HZ)  // e.g. 6 at 10Hz, 60fps

  useFrame(() => {
    frameCount.current++
    if (frameCount.current % SKIP_FRAMES !== 0) return

    // ── 1. Track player position ──────────────────────────────────────────
    const pos = useGameStore.getState().position
    minimapCamera.position.set(pos.x, 200, pos.z)
    minimapCamera.lookAt(pos.x, 0, pos.z)

    // Update camera frustum for correct projection
    minimapCamera.left   = pos.x - VIEW_RANGE
    minimapCamera.right  = pos.x + VIEW_RANGE
    minimapCamera.top    = -(pos.z - VIEW_RANGE)
    minimapCamera.bottom = -(pos.z + VIEW_RANGE)
    minimapCamera.updateProjectionMatrix()

    // ── 2. Render scene to the off-screen render target ───────────────────
    gl.setRenderTarget(renderTarget)
    gl.render(scene, minimapCamera)
    gl.setRenderTarget(null)   // restore — next main render goes to screen

    // ── 3. Read pixels from GPU → CPU ─────────────────────────────────────
    // ⚠️  This is the expensive step — forces a GPU pipeline sync.
    // Keep UPDATE_HZ low (10Hz) to limit how often this stall occurs.
    gl.readRenderTargetPixels(
      renderTarget,
      0, 0,          // start x, y
      RT_SIZE, RT_SIZE,
      pixelBuffer    // output: Uint8Array, row-major, bottom-up (OpenGL convention)
    )

    // ── 4. Copy pixels to the DOM canvas ──────────────────────────────────
    // OpenGL pixel data is Y-flipped (row 0 = bottom of image).
    // Canvas ImageData expects row 0 = top, so we must flip vertically.
    const domCanvas = document.getElementById(minimapCanvasId)
    if (!domCanvas) return

    const ctx  = domCanvas.getContext('2d')
    const imgData = ctx.createImageData(RT_SIZE, RT_SIZE)

    for (let row = 0; row < RT_SIZE; row++) {
      const srcRow = RT_SIZE - 1 - row    // flip Y
      for (let col = 0; col < RT_SIZE; col++) {
        const srcIdx = (srcRow * RT_SIZE + col) * 4
        const dstIdx = (row    * RT_SIZE + col) * 4
        imgData.data[dstIdx + 0] = pixelBuffer[srcIdx + 0]
        imgData.data[dstIdx + 1] = pixelBuffer[srcIdx + 1]
        imgData.data[dstIdx + 2] = pixelBuffer[srcIdx + 2]
        imgData.data[dstIdx + 3] = pixelBuffer[srcIdx + 3]
      }
    }

    ctx.putImageData(imgData, 0, 0)

    // Optionally draw a player dot at the center:
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(RT_SIZE / 2, RT_SIZE / 2, 4, 0, Math.PI * 2)
    ctx.fill()
  })

  return null   // this component renders nothing in the 3D scene
}

/**
 * To use this component:
 *
 * 1. Add inside <Canvas>:
 *    <MinimapRenderTarget minimapCanvasId="minimap-rt" />
 *
 * 2. Add in the DOM (outside <Canvas>):
 *    <canvas
 *      id="minimap-rt"
 *      width={256}
 *      height={256}
 *      style={{ position: 'fixed', top: 18, right: 18, borderRadius: '50%' }}
 *    />
 *
 * Monitor the Stats panel — the readback will show as a frame-time spike
 * on update frames. Use that to calibrate your UPDATE_HZ value.
 */

export default MinimapRenderTarget
