/**
 * shaders.js — Phase 6.4: Custom GLSL Shader Library
 *
 * All shader programs in this project, exported as tagged template literal strings.
 * GLSL (OpenGL Shading Language) runs directly on the GPU — a C-like language
 * that processes geometry and pixels in massively parallel pipelines.
 *
 * ── The GPU Pipeline ─────────────────────────────────────────────────────────
 *
 * For each mesh, the GPU runs two programs:
 *
 * 1. VERTEX SHADER — runs once per vertex (corner of a triangle)
 *    Input:  `position` (object-space xyz), `normal`, `uv`
 *    Output: `gl_Position` (clip-space position — where on screen this vertex lands)
 *    Can also output `varying` values that are interpolated across the triangle.
 *
 * 2. FRAGMENT SHADER — runs once per pixel covered by the triangle
 *    Input:  interpolated `varying` values from the vertex shader
 *    Output: `gl_FragColor` (RGBA color of this pixel)
 *
 * ── Uniforms vs Varyings vs Attributes ───────────────────────────────────────
 *
 * uniform  — same value for ALL vertices/fragments in one draw call. Set from JS.
 *            e.g. uTime (the clock), uColor (a chosen color)
 *
 * varying  — value set in vertex shader, interpolated linearly across the triangle
 *            by the GPU, then available in the fragment shader.
 *            e.g. vUv, vNormal, vWorldPos
 *
 * attribute — per-vertex data from the geometry buffer (position, normal, uv).
 *             Only available in vertex shaders. Built-in: position, normal, uv.
 *
 * ── The Fresnel Effect ────────────────────────────────────────────────────────
 *
 * Fresnel describes how reflectivity increases at grazing angles.
 * A flat window is mostly transparent — you see through it.
 * The same window at a glancing angle is highly reflective — you see your own face.
 *
 * In shaders, the Fresnel term is:
 *   float fresnel = pow(1.0 - dot(normal, viewDirection), power)
 *
 * dot(N, V) = 1 when the surface faces the camera directly → fresnel ≈ 0 (dark center)
 * dot(N, V) = 0 when the surface is edge-on to the camera → fresnel ≈ 1 (bright rim)
 *
 * This produces the characteristic "glowing rim" effect used for force fields,
 * holographic displays, selection highlights, and energy shields.
 *
 * ── The Hologram Effect ───────────────────────────────────────────────────────
 *
 * Combines three techniques:
 *
 * 1. Scanlines — horizontal bands created by fract(uv.y × density)
 *    fract(x) = x - floor(x) — the fractional part, always in [0, 1)
 *    Applied to scrolling UV creates moving horizontal lines.
 *
 * 2. Grid pattern — the distance from the nearest grid line in UV space
 *    Uses fwidth() — the screen-space derivative of a value — for anti-aliased lines.
 *
 * 3. Fresnel rim — same as above, adds edge glow
 *
 * ── Wind Grass Vertex Shader ─────────────────────────────────────────────────
 *
 * Vertex displacement moves geometry without adding polygons.
 * Each grass blade vertex's X position is displaced by:
 *   offset = sin(worldPos.x × freq + time × windSpeed) × amplitude × heightFactor
 *
 * `heightFactor` = the vertex's Y position in local space, normalized 0→1.
 * This ensures the blade's BASE stays fixed (factor=0) while the TIP sways (factor=1).
 * Without this, the whole blade would translate sideways — no bending, just sliding.
 */

// ── Fresnel / Rim Light Shader ────────────────────────────────────────────────

export const fresnelVertexShader = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;

    // Transform normal to view space (so we can compute angle to camera)
    vNormal = normalize(normalMatrix * normal);

    // View-space position of this vertex
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);

    // View direction: vector from vertex toward camera (camera is at origin in view space)
    vViewDir = normalize(-mvPos.xyz);

    gl_Position = projectionMatrix * mvPos;
  }
`

export const fresnelFragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uPower;     // Fresnel exponent — higher = sharper rim (typical: 2–5)
  uniform float uIntensity; // Overall brightness multiplier

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    // Fresnel: bright at edges (grazing angle), dark at center (face-on)
    // dot(N, V) → 1 when facing camera, 0 when edge-on
    float facing  = max(0.0, dot(vNormal, vViewDir));
    float fresnel = pow(1.0 - facing, uPower);

    // Subtle pulse: oscillates between 0.7 and 1.0
    float pulse = 0.70 + 0.30 * sin(uTime * 2.5);

    float alpha  = fresnel * pulse * uIntensity;
    vec3  color  = uColor * (fresnel * 1.4 + 0.15);

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`

// ── Hologram / Force Field Shader ─────────────────────────────────────────────

export const hologramVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv     = uv;
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir   = normalize(-mvPos.xyz);

    gl_Position = projectionMatrix * mvPos;
  }
`

export const hologramFragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec3  uColor;    // Base hologram tint (default: cyan-blue)

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // ── Fresnel rim ─────────────────────────────────────────────────────
    float facing  = max(0.0, dot(vNormal, vViewDir));
    float fresnel = pow(1.0 - facing, 2.5);

    // ── Scanlines: horizontal bands scrolling upward ────────────────────
    // fract(x) returns the fractional part → sawtooth wave → step makes bands
    float scanY    = fract(vUv.y * 38.0 - uTime * 0.4);
    float scanline = step(0.55, scanY) * 0.35;   // dimmer top half of each band

    // ── Vertical scanlines (subtle) ─────────────────────────────────────
    float scanX = step(0.90, fract(vUv.x * 12.0)) * 0.12;

    // ── Horizontal grid lines ────────────────────────────────────────────
    // fwidth() = rate of change of the value across the pixel — used for
    // anti-aliased line rendering without jagged edges.
    float gridY = abs(fract(vUv.y * 8.0 - 0.5) - 0.5);
    float lineY = 1.0 - smoothstep(0.0, fwidth(vUv.y * 8.0) * 1.5, gridY);

    // ── Data flicker: random glitch every few seconds ───────────────────
    // sin with an irrational-ish frequency creates pseudo-random texture
    float flicker  = 0.88 + 0.12 * sin(uTime * 13.7) * sin(uTime * 7.3);
    float glitch   = step(0.97, fract(sin(uTime * 3.1) * 4000.0));  // rare bright flash
    float glitchX  = step(0.80, fract(vUv.y * 0.8 + uTime * 0.1));  // horizontal glitch stripe

    // ── Combine ──────────────────────────────────────────────────────────
    float intensity = (
      fresnel  * 0.55 +
      scanline * 1.00 +
      scanX    * 0.80 +
      lineY    * 0.70 +
      glitch   * glitchX * 1.5
    ) * flicker;

    vec3 color = uColor * intensity;

    // Alpha: mostly transparent in center, more visible at rim + grid lines
    float alpha = clamp(intensity * 0.90, 0.0, 0.95);

    gl_FragColor = vec4(color, alpha);
  }
`

// ── Wind Grass Vertex Shader ──────────────────────────────────────────────────

export const grassVertexShader = /* glsl */`
  uniform float uTime;
  uniform float uWindStrength;  // amplitude of sway (world units)
  uniform float uWindFrequency; // spatial frequency of the wind wave

  varying vec2  vUv;
  varying float vHeight;        // 0 at base, 1 at tip — for fragment shader tinting

  void main() {
    vUv = uv;

    // UV.y goes from 0 (base of blade) to 1 (tip)
    // We use this as the bend factor so the base stays rooted
    vHeight = uv.y;

    vec3 pos = position;

    // ── Wind displacement ──────────────────────────────────────────────
    // modelMatrix converts local position to world position.
    // We use the WORLD x,z to compute wind phase — all blades at the
    // same world position sway together, simulating a continuous wind field.
    vec4 worldPos = modelMatrix * vec4(position, 1.0);

    float windPhase = worldPos.x * uWindFrequency + worldPos.z * uWindFrequency * 0.7;

    // Two sine waves at different speeds/directions = more natural looking
    float sway =
      sin(windPhase + uTime * 1.8) * 0.60 +
      sin(windPhase * 1.6 + uTime * 2.7) * 0.40;

    // Scale by height (uv.y) — base is anchored, tip sways fully
    float bendFactor = uv.y * uv.y;  // quadratic: gentle near base, full at tip

    pos.x += sway * uWindStrength * bendFactor;

    // Minor Z sway for 3D feel
    pos.z += sin(windPhase * 0.8 + uTime * 1.2) * uWindStrength * 0.3 * bendFactor;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

export const grassFragmentShader = /* glsl */`
  uniform vec3  uBaseColor;  // Dark green at blade base
  uniform vec3  uTipColor;   // Lighter yellow-green at blade tip

  varying vec2  vUv;
  varying float vHeight;

  void main() {
    // Blend from base to tip color based on height
    vec3 color = mix(uBaseColor, uTipColor, vHeight);

    // Slight transparency at blade tips — softer look
    float alpha = 1.0 - vHeight * 0.25;

    // Discard pixels at the very edges of the blade quad (makes silhouette cleaner)
    float edgeMask = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    if (edgeMask < 0.01) discard;

    gl_FragColor = vec4(color, alpha * edgeMask);
  }
`

// ── Lava / Animated Heat Shader ───────────────────────────────────────────────
// Demonstrates texture coordinate distortion + palette lookup

export const lavaVertexShader = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv    = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const lavaFragmentShader = /* glsl */`
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormal;

  // Simple value noise — same algorithm as TextureGenerator.js but in GLSL
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);  // smoothstep

    return mix(
      mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
      u.y
    );
  }

  // FBM: 4 octaves
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  // Lava palette: black → dark red → orange → yellow-white
  vec3 lavaPalette(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.05, 0.0,  0.0);   // black/near-black
    vec3 c1 = vec3(0.55, 0.05, 0.0);   // deep red
    vec3 c2 = vec3(0.90, 0.30, 0.0);   // orange
    vec3 c3 = vec3(1.00, 0.95, 0.5);   // yellow-white (hot core)

    if (t < 0.33) return mix(c0, c1, t / 0.33);
    if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);
    return mix(c2, c3, (t - 0.66) / 0.34);
  }

  void main() {
    vec2 uv = vUv;

    // Distort UVs over time — makes the surface "flow"
    float distX = fbm(uv * 3.0 + vec2(uTime * 0.15, 0.0));
    float distY = fbm(uv * 3.0 + vec2(0.0, uTime * 0.12));
    vec2  distUV = uv + vec2(distX, distY) * 0.2;

    // Sample noise at distorted UVs — creates molten texture
    float heat  = fbm(distUV * 4.0 + vec2(uTime * 0.08));
    float heat2 = fbm(distUV * 8.0 - vec2(uTime * 0.05));
    float final = heat * 0.7 + heat2 * 0.3;

    // Add rim glow
    float rim = pow(1.0 - abs(vNormal.y), 3.0) * 0.3;

    vec3 color  = lavaPalette(final + rim);

    // Emissive boost: hot areas glow more intensely
    color += lavaPalette(max(0.0, final - 0.5)) * 0.8;

    gl_FragColor = vec4(color, 1.0);
  }
`
