# PBR Materials

> What Physically Based Rendering actually is, why it transformed real-time graphics, how the metalness/roughness workflow maps to physics, what an environment map does, and how every addition in this phase fits together.

---

## The Problem with Lambert

Before PBR, most real-time games used Lambert + Phong shading. Lambert handles diffuse (light scattered equally in all directions); Phong adds a specular highlight (a bright dot pointing toward the light). Together they look decent but have a fundamental flaw: the parameters are arbitrary. "Shininess = 64" has no physical meaning. An artist tweaks numbers until something looks plausible, but the material doesn't behave correctly when the lighting changes — move the light and the material looks wrong from every angle.

PBR solves this by grounding every parameter in measurable physics. A material that looks correct under one lighting condition is guaranteed to look correct under any other.

---

## The Metalness/Roughness Workflow

All real-world materials divide into two categories at the physics level.

### Dielectrics (non-metals)

Dielectrics transmit or scatter light rather than conduct it. When a photon enters the surface, it bounces around the medium and eventually re-exits, somewhat randomized — this is diffuse reflection. Examples: wood, stone, concrete, skin, plastic, ceramic.

At the air/surface boundary, a small fraction of light bounces off without entering — this is **specular** reflection. For dielectrics, this specular is always colourless (white/grey) and always ~4% of incident light at normal incidence. The exact percentage increases toward glancing angles — a phenomenon called the **Fresnel effect**.

In the PBR material:
```
metalness = 0
roughness = 0.7–0.95   (most real non-metals are rough)
color = the actual surface colour (albedo)
```

### Metals (conductors)

Metals conduct electricity, which means free electrons that immediately absorb and re-emit light at the surface — no sub-surface scattering. All light interaction is at the surface boundary. Metals have:

- **Near-zero diffuse**: light that enters the metal is almost entirely absorbed. The small amount that escapes back is the diffuse contribution — essentially zero for polished metals.
- **Coloured specular**: the specular reflection takes on the metal's own colour. Gold reflects yellow-gold; copper reflects orange-red; aluminium reflects near-white.
- **High reflectivity**: metals reflect 60–95% of incident light (versus ~4% for dielectrics).

In the PBR material:
```
metalness = 1.0   (pure metal)
roughness = 0.1–0.4   (polished = 0.1, brushed = 0.3, raw = 0.5)
color = the specular tint (gold = #ffcc44, copper = #b87333, iron = #888888)
```

### Roughness

Roughness controls the **microfacet distribution** — how rough the surface is at the microscopic level. A perfectly smooth surface has all microfacets aligned with the macroscopic surface normal; a rough surface has them randomly oriented.

- **Smooth (roughness → 0):** All microfacets aligned. Specular reflects sharply in one direction. The bright dot is tiny and intense — a mirror.
- **Rough (roughness → 1):** Microfacets randomly oriented. Specular scatters in many directions. The bright region is large and diffuse — matte.

This is why roughness is the single most important property for making a material "feel" physical. Stone is 0.88. Polished metal is 0.15. Concrete is 0.92. Painted wood is 0.60.

---

## Environment Maps

This is the most important addition in this phase. Without it, PBR looks flat and unconvincing.

### What an environment map is

An environment map is a 360° HDR (High Dynamic Range) photograph of a real or synthetic environment — usually stored as an equirectangular image or a cube map. It captures the full lighting of a real scene: the sky, the sun, reflections off buildings, indirect light bouncing off the ground.

When an environment map is loaded:
1. The GPU stores it as a cube map texture (6 faces of a cube, together covering all directions)
2. The PBR fragment shader samples it at every surface point

### What it provides

**Diffuse indirect light:** The shader pre-computes a blurred version of the env map (called an **irradiance map**). At each surface point, it looks up the irradiance in the direction of the surface normal. This fills in all the indirect ambient lighting — the sky fill, the ground bounce — that a single directional light can't provide.

**Specular reflections:** The shader samples a sharper version of the env map (a **pre-filtered environment map**) at the reflection direction, scaled by roughness. Smooth surfaces reflect detailed sky; rough surfaces reflect a blurry averaged sky colour.

**Metalness payoff:** For metals (`metalness = 1`), the diffuse contribution is near-zero and the specular takes the albedo colour as a tint. Without an env map, there's nothing to reflect — the metal looks like a flat dark colour. With the env map, it reflects the sky, buildings, and light — this is when metal suddenly looks like metal.

### In Drei

```jsx
<Environment preset="sunset" background={false} />
```

- `preset="sunset"` loads an HDR panorama from the internet (Polyhaven CDN) and processes it into irradiance + prefiltered maps
- `background={false}` means the env map provides lighting but isn't shown as the visible sky (the `<Sky>` component handles that)

Available presets: `'sunset'`, `'dawn'`, `'night'`, `'forest'`, `'city'`, `'apartment'`, `'lobby'`, `'park'`, `'studio'`, `'warehouse'`

To use offline, download the HDR and reference it locally:
```jsx
<Environment files="/envmaps/sunset.hdr" background={false} />
```

---

## The Sky Shader

Previously the sky was just a CSS `background: '#87CEEB'` on the Canvas element — a flat colour behind the 3D scene. The `<Sky>` component from Drei replaces this with the **Preetham atmospheric scattering model** — a physically-based formula that computes sky colour from first principles.

### How atmospheric scattering works

The sun emits white light. As that light passes through the atmosphere, gas molecules scatter blue wavelengths more than red (Rayleigh scattering). When you look at the sky away from the sun, you see the scattered blue light — why the sky is blue. When you look toward the horizon, the light passes through more atmosphere, scattering even more blue away and leaving red/orange — why sunsets are orange.

The Preetham model approximates this with a formula that takes sun elevation, atmosphere turbidity, and view direction as inputs and outputs a sky colour. It runs entirely in the fragment shader — millions of sky colour calculations per frame, on the GPU.

```jsx
<Sky
  sunPosition={SUN_POSITION}  // must match directional light position
  turbidity={7}               // 0=crystal clear, 20=very hazy. 7=typical day
  rayleigh={0.6}              // controls how blue the sky is. 0.5–2 = realistic
  mieCoefficient={0.006}      // aerosol/dust scattering (horizon haze)
  mieDirectionalG={0.82}      // 0=uniform scatter, 1=forward scatter (glow around sun)
/>
```

**Critical:** `sunPosition` must match the `directionalLight.position`. If the visible sun in the sky is north-east but shadows fall from the south-west, the scene looks physically wrong. We use a shared `SUN_POSITION` constant in App.jsx for both.

---

## Roughness Maps

A roughness map applies per-pixel roughness variation — the same concept as a normal map, but for the roughness parameter instead of the surface normal direction.

Three.js reads the **green channel** of the roughness map. This follows the glTF 2.0 PBR specification, which packs roughness into G and metalness into B in the same texture (called an ORM map). We use grayscale images (R=G=B), so the green channel carries the correct value.

```
finalRoughness = material.roughness × roughnessMap.greenChannel
```

When using a roughness map, set `material.roughness = 1.0`. Then the map drives the value directly: a pixel with green=0.72 produces roughness=0.72.

### What the roughness maps in this project do

**Brick:** Brick faces are 0.70–0.78 (fired clay — slightly smooth from the kiln). Mortar joints are 0.96 (granular, fully matte). The contrast between these values makes the surface look physically correct — mortar doesn't reflect any highlights; brick faces catch a subtle sheen.

**Concrete:** 0.87–0.95 variation driven by multi-octave noise. The slight variation makes it look like real aggregate concrete rather than smooth painted metal.

**Stone:** Stone faces 0.78–0.88, joint gaps 0.96. Similar logic to brick.

---

## Emissive Materials: Self-Illuminated Surfaces

`emissive` adds a base colour that is **always present regardless of lighting**. It's added to the final fragment colour after all lighting calculations:

```
finalColour = lightingResult + emissive × emissiveIntensity
```

Even with zero ambient and zero direct light, an emissive surface appears bright. This is the correct model for:

- Lit windows
- LED indicator lights
- Fire and lava
- Glowing screens
- The bulb inside a lamp housing

### Building windows

```jsx
<meshStandardMaterial
  color="#04040e"          // near-black base — the window glass
  emissive="#ffbe44"       // warm amber interior light
  emissiveIntensity={1.8}  // how bright the glow is
/>
```

The windows are `planeGeometry` meshes placed slightly proud of the building face (`z = d/2 + 0.025`). The 0.025 offset prevents **z-fighting** — a visual artefact where two coplanar surfaces flicker as the depth buffer can't determine which is in front.

### The bulb in a lamp post

The lamp head uses a high emissiveIntensity sphere to represent the bulb visually. This is **not** the actual light source — it's just a visual indicator. The actual illumination comes from a `<pointLight>` positioned at the same location.

Using an emissive mesh + a point light together is the standard game technique: the emissive mesh gives you a visible glowing object; the point light actually illuminates surrounding geometry. Without the emissive mesh, you'd see light spilling on the ground but no visible light source — uncanny.

---

## Point Lights

Point lights emit light in all directions from a single point, like a bare bulb or a flame.

```jsx
<pointLight
  position={[0.86, 2.90, 0]}
  color="#ffd57a"     // warm yellow-orange light
  intensity={12}      // luminous intensity — tune by visual feel
  distance={14}       // units beyond which light contribution is zero
  decay={2}           // physically correct inverse-square falloff
/>
```

**`decay = 2`** implements the inverse-square law: intensity falls off as `1 / distance²`. This matches real-world photometry. `decay = 1` is linear (unrealistic but sometimes used for artistic control); `decay = 0` is constant (no falloff — like an infinitely powerful sun).

**`distance`** is a hard cutoff. Beyond this distance the light contributes nothing. This exists for performance: Three.js can skip lighting calculations for objects outside the distance sphere. Keep it as small as visually acceptable.

**Point light shadows are disabled** (`castShadow={false}`) on the lamps. Point light shadows require rendering the scene 6 times (once per cube face) versus 1 time for directional shadows. With 8 lamps, enabling shadows would be 8 × 6 = 48 additional render passes per frame — prohibitively expensive. The visual cost of disabling them is low in an outdoor scene with strong directional shadows.

---

## How the Ambient Intensity Changed

With the Environment map active, the scene gets a significant indirect lighting contribution from the HDR panorama. If we left the ambient at its previous value (`0.45`), the scene would be overexposed — everything flat and too bright.

The `ambientLight` was reduced to `0.20`. The Environment map fills the role of realistic ambient light: sky fill, ground bounce, soft shadows. The hemisphere light was also reduced to `0.25` (from `0.35`) for the same reason. The net result is similar brightness, but the indirect lighting now has directionality and colour variation that matches the sky, rather than being uniform.

---

## Files Changed

| File | What changed |
|---|---|
| `src/systems/TextureGenerator.js` | Added `makeRoughness()`, three roughness functions, roughness output from `getTexture()` |
| `src/components/Buildings.jsx` | Roughness map wired into materials; buildings wrapped in `<group>`; `BuildingWindows` component with emissive planes |
| `src/components/StreetLamps.jsx` | New — metallic lamp posts with `metalness=0.85`, emissive bulb spheres, `pointLight` illumination |
| `src/App.jsx` | Added `<Sky>`, `<Environment>`, `<StreetLamps>`; reduced ambient/hemisphere intensity; updated fog colour |
