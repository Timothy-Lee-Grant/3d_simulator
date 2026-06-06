# Phase 5 — Audio: A Complete Engineering Lecture

> **Who this is for:** Junior engineers who have read the Phase 4 document and understand React, Three.js, and useFrame. This document teaches the Web Audio API from fundamentals through spatial audio, synthesis, and the architecture patterns that connect audio to gameplay. Read every concept alongside the source files — `AudioManager.js`, `AudioBridge.jsx`, `Player.jsx`, and `NPC.jsx` are the living examples.

---

## Table of Contents

1. [Why Audio Is Different From Everything Else](#1-why-audio-is-different-from-everything-else)
2. [The Web Audio API: A Signal Graph](#2-the-web-audio-api-a-signal-graph)
3. [Sound Synthesis: Making Sounds Without Files](#3-sound-synthesis-making-sounds-without-files)
4. [Spatial Audio: Sound in 3D Space](#4-spatial-audio-sound-in-3d-space)
5. [The AudioBridge Pattern](#5-the-audiobridge-pattern)
6. [The Footstep System — Landing and Surface Detection](#6-the-footstep-system--landing-and-surface-detection)
7. [NPC Ambient Sound: Positional Audio in Practice](#7-npc-ambient-sound-positional-audio-in-practice)
8. [Ambient Music: LFO Modulation and Detuning](#8-ambient-music-lfo-modulation-and-detuning)
9. [The Browser Security Model: User Gesture Requirement](#9-the-browser-security-model-user-gesture-requirement)
10. [Architecture: The Singleton AudioContext](#10-architecture-the-singleton-audiocontext)
11. [Exercises](#11-exercises)

---

## 1. Why Audio Is Different From Everything Else

Every other system in this project — terrain, lighting, materials, particles — is visual. The GPU renders it. The output is pixels on screen. Audio is different in almost every way.

**Different API.** The Web Audio API has nothing to do with WebGL, Three.js, or React. It is a completely separate browser API with its own object model, its own threading model, and its own execution context.

**Different timing model.** The GPU renders a frame every ~16ms. You can miss a visual frame and the next one corrects it — humans rarely notice occasional frame drops. Audio cannot miss a moment. The human ear detects timing glitches of 1–2 milliseconds. Web Audio solves this by running on a separate high-priority audio thread, ahead of the main JavaScript thread. You schedule sounds to play at precise `AudioContext.currentTime` values, not "as soon as possible."

**Different resource model.** Visual assets (textures, geometry) live in GPU memory. Audio assets live in RAM as `AudioBuffer` objects, or are generated in real-time by oscillators and noise generators. In this project, every sound is synthesized — no audio files.

**Different interaction requirement.** Browsers block audio until a user interaction occurs. This policy cannot be worked around. The game's pointer-lock click is the user gesture that unlocks audio. `useAudio.js` watches for the locked state to trigger this.

Understanding these differences explains why `AudioManager.js` exists as an entirely separate module — audio and rendering are genuinely separate systems that need to be synchronized.

---

## 2. The Web Audio API: A Signal Graph

The mental model for the Web Audio API is a **directed graph of audio nodes**. Sound flows from source nodes through processing nodes to the destination (speakers):

```
Source → Filter → Gain → Destination
```

Every node does exactly one thing. The API's power comes from connecting them in different configurations.

### Core Node Types

**Source nodes** — produce sound:

| Node | What it does |
|---|---|
| `OscillatorNode` | Generates a continuous waveform: sine, square, triangle, sawtooth |
| `AudioBufferSourceNode` | Plays a pre-filled array of audio samples (our synthesized noise) |

**Processing nodes** — transform sound:

| Node | What it does |
|---|---|
| `GainNode` | Multiplies the signal by a value — the volume control of audio graphs |
| `BiquadFilterNode` | Shapes frequency content: lowpass, highpass, bandpass |
| `PannerNode` | Applies 3D spatial positioning — distance attenuation + stereo pan |

**Destination** — the output:

| Node | What it does |
|---|---|
| `AudioContext.destination` | Your speakers. Everything eventually connects here. |

### Building a Graph

```javascript
const ctx = new AudioContext()

const osc    = ctx.createOscillator()
const filter = ctx.createBiquadFilter()
const gain   = ctx.createGain()

osc.type = 'sine'
osc.frequency.value = 440   // A4 — concert pitch A
filter.type = 'lowpass'
filter.frequency.value = 800
gain.gain.value = 0.5

osc.connect(filter)
filter.connect(gain)
gain.connect(ctx.destination)

osc.start()
```

This creates a 440Hz sine wave, filters out frequencies above 800Hz, halves the volume, and sends it to speakers.

### AudioParam: Scheduling at Audio Precision

Every number in the Web Audio API is an `AudioParam` — not a plain JavaScript number. AudioParams support scheduled automation:

```javascript
// Scheduled automation — precise audio-thread timing:
gain.gain.setValueAtTime(0,    now)                            // silent
gain.gain.linearRampToValueAtTime(1.0, now + 0.01)            // 10ms attack
gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)      // 300ms decay
```

`ctx.currentTime` is the high-precision audio clock — it advances 44,100 times per second on the audio thread, independent of JavaScript's setTimeout or requestAnimationFrame. Scheduling to `ctx.currentTime + 0.01` means "in exactly 10ms of audio time" regardless of main-thread jitter. This is why synthesized sounds feel tight and precise.

---

## 3. Sound Synthesis: Making Sounds Without Files

This project synthesizes every sound from mathematics — oscillators, noise, filters. This teaches how sound works and is often better than compressed audio files for interactive sounds.

### White and Brown Noise

**White noise** — every sample is independently random. Flat frequency spectrum. Sounds like hiss.

```javascript
for (let i = 0; i < frameCount; i++) {
  data[i] = Math.random() * 2 - 1
}
```

**Brown noise** — each sample is the previous sample plus a small random step (a random walk). More energy at low frequencies, less at high. Sounds like wind, rumble, ocean.

```javascript
let lastOut = 0.0
for (let i = 0; i < frameCount; i++) {
  const white = Math.random() * 2 - 1
  data[i] = (lastOut + 0.02 * white) / 1.02
  lastOut = data[i]
}
```

Integration smooths out high frequencies — the signal can only change as fast as the `0.02` step size allows.

### Filters Shape Noise Into Surface Sounds

Raw noise sounds like hiss. Filtering it at specific frequency bands makes it sound like physical surfaces:

```javascript
// Grass footstep: low-frequency, earthy
bandpass.frequency.value = 280   // Hz
bandpass.Q.value = 0.7           // broad band = noisy, thuddy

// Stone footstep: high-frequency, sharp
bandpass.frequency.value = 1000  // Hz
bandpass.Q.value = 1.4           // narrower band = more tonal, clicking
```

**What is Q?** The Q factor (quality factor) controls a filter's bandwidth. High Q = narrow band (a tuning fork ringing). Low Q = wide band (a generic thud). Q directly determines whether a sound feels "tonal" or "noisy."

**Why does frequency determine surface character?** Dense surfaces (stone, concrete) transmit high-frequency vibrations efficiently — stone footsteps have sharp, clicking highs. Soft surfaces (grass, carpet) absorb high frequencies, leaving only the low-frequency thud of foot impact. This maps directly to the `'grass'`, `'wood'`, and `'stone'` variants in `AudioManager.js`.

### Gain Envelopes: How Impact Sounds Shape Over Time

Every physical impact sound has the same shape: instant attack, fast exponential decay:

```javascript
gain.gain.setValueAtTime(0, now)                             // silent
gain.gain.linearRampToValueAtTime(volume, now + 0.004)       // 4ms — instant attack
gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.10)   // 100ms decay
```

**Why exponential decay and not linear?** Human hearing is logarithmic. A sound that decays exponentially sounds like it's disappearing naturally. A linearly decaying sound feels mechanical, like a fader being manually pulled down. `exponentialRampToValueAtTime` matches how we actually hear things fade.

**Why 0.0001 and not 0?** Exponential curves approach zero asymptotically — they never actually reach it. Providing 0 to `exponentialRampToValueAtTime` throws an error. `0.0001` is one ten-thousandth of full volume: completely inaudible.

---

## 4. Spatial Audio: Sound in 3D Space

### What PannerNode Does

A `PannerNode` has a position in 3D audio space. The `AudioContext.listener` (the player's ears) also has a position and orientation. Given both, the Web Audio engine automatically computes:

1. **Distance attenuation** — closer = louder. The `inverse` model uses inverse-square falloff: double the distance → one-quarter the volume.

2. **Stereo panning** — a source to the right produces more signal in the right channel than the left.

3. **HRTF** (Head-Related Transfer Function) — a pre-computed model of how a physical head and ears modify sound based on direction. High-frequency content arrives slightly earlier at the nearer ear. The head's shape adds subtle frequency coloration based on elevation. HRTF produces convincing 3D localization in headphones.

```javascript
const panner = ctx.createPanner()
panner.panningModel  = 'HRTF'        // physically accurate stereo model
panner.distanceModel = 'inverse'     // inverse-square falloff
panner.refDistance   = 2             // volume is unattenuated at this distance
panner.maxDistance   = 18            // beyond this, volume is minimal
panner.rolloffFactor = 1.8           // how fast volume drops

panner.positionX.value = npcX
panner.positionY.value = npcY
panner.positionZ.value = npcZ

// Signal chain:  source → gain → panner → ctx.destination
```

### The Listener

Spatial audio only computes correctly if the engine knows where the player's ears are:

```javascript
ctx.listener.positionX.value = camera.position.x
ctx.listener.positionY.value = camera.position.y
ctx.listener.positionZ.value = camera.position.z
ctx.listener.forwardX.value  = forwardDirection.x
ctx.listener.forwardY.value  = forwardDirection.y
ctx.listener.forwardZ.value  = forwardDirection.z
ctx.listener.upX.value       = upVector.x
// ...
```

Three vectors fully describe the listener's orientation:
- **Position** — where in the world
- **Forward** — which direction the head faces
- **Up** — which way is "up" relative to the head (usually 0,1,0 for a standing player)

Without updating orientation, distance attenuation still works but stereo panning is wrong — sounds won't pan left/right as you turn. `AudioBridge.jsx` exists to keep all three vectors current.

---

## 5. The AudioBridge Pattern

### The Challenge

The Web Audio API listener needs the camera's position and orientation. The camera lives inside the R3F Canvas, only accessible via `useThree()`. The audio API is completely outside the Canvas. How do you bridge them every frame?

Exactly the same pattern as `CameraSync` in App.jsx: a **null-rendering component inside Canvas** that runs `useFrame`:

```jsx
// AudioBridge.jsx
export default function AudioBridge() {
  const { camera } = useThree()
  const forward = useRef(new Vector3())   // reuse — no allocation per frame

  useFrame(() => {
    camera.getWorldDirection(forward.current)
    const f = forward.current, p = camera.position, u = camera.up
    updateListener(p.x, p.y, p.z,  f.x, f.y, f.z,  u.x, u.y, u.z)
  })

  return null
}
```

This component has no visual output. Its only purpose is to run code every frame that has access to the camera. The `Vector3` ref is reused to avoid allocating a new object per frame — a micro-optimization that matters when code runs 60×/sec.

### Why Not Throttle Like CameraSync?

`CameraSync` throttles to 20Hz because it writes to a Zustand store — every write triggers a React re-render of components subscribed to `cameraYaw`. AudioBridge writes directly to Web Audio `AudioParam` objects, bypassing React entirely. Zero re-renders. Full frame rate (60Hz) costs nothing measurable and prevents perceptible audio direction lag when turning quickly.

This is the same principle from DayNightCycle: when you're mutating non-React objects, there's no reason to throttle.

---

## 6. The Footstep System — Landing and Surface Detection

### Landing Detection

```javascript
const wasAirborne = useRef(false)

// In useFrame, BEFORE the ground snap:
if (camera.position.y <= groundY) {
  const fallSpeed = -velocityY.current   // positive when falling
  if (wasAirborne.current && fallSpeed > LAND_VELOCITY_THRESHOLD) {
    playLand(Math.min(1.0, fallSpeed / JUMP_VELOCITY))
  }
  camera.position.y = groundY
  velocityY.current = 0   // ← snap zeros velocity here
}

// Update for the NEXT frame
wasAirborne.current = camera.position.y > groundY + 0.05
```

**Why read `velocityY` before the snap?** After `velocityY.current = 0`, the fall speed is gone. Reading it immediately before zeroing captures the maximum impact velocity.

**The threshold (3.5 u/s).** On every grounded frame, gravity pushes velocityY about 0.37 u/s negative before the snap resets it. Without a threshold, landing would fire every frame while standing. The 3.5 u/s threshold is well above normal ground contact but well below a genuine jump landing (~7.5 u/s).

**Intensity scaling.** `Math.min(1.0, fallSpeed / JUMP_VELOCITY)` maps fall speed to [0,1]. Full jump height → intensity 1.0. Shorter falls are quieter. The `playLand` function scales the synthesized thud's amplitude by this value.

### Surface-Aware Footsteps

```javascript
// Throttled to every 0.5 seconds
downRaycaster.current.set(camera.position, downVec.current)
const hits = downRaycaster.current.intersectObjects(scene.children, true)

let surface = 'grass'
for (const hit of hits) {
  if (hit.distance > 8) break
  let obj = hit.object
  while (obj) {
    if (obj.name === 'buildings' || obj.name === 'landmark') { surface = 'stone'; break }
    if (obj.name === 'rocks') { surface = 'stone'; break }
    obj = obj.parent
  }
  break
}
surfaceRef.current = surface

// Footstep plays the detected surface:
playFootstep(surfaceRef.current, volume)
```

**Why throttle to 0.5s?** Raycasting against the full scene tree is O(n) in triangles. At 60Hz this would be 120 raycasts/sec. Surface type changes at walking speed are imperceptible below 500ms intervals.

**Why walk up the parent chain?** `intersectObjects(..., true)` returns individual mesh objects — leaf nodes of the scene tree. A building is a `<mesh>` inside `<group name="buildings">`. The hit is the mesh. `obj = obj.parent` walks up to the named group that identifies the surface type.

---

## 7. NPC Ambient Sound: Positional Audio in Practice

Each NPC emits a quiet murmur every 8–22 seconds, synthesized from bandpass-filtered noise in the 250–480 Hz range (human voice fundamental frequencies). Because it runs through a PannerNode, it localizes in 3D — louder when close, panning left/right as you move around the NPC.

```javascript
// NPC.jsx — inside useFrame
murmurTimer.current -= delta
if (murmurTimer.current <= 0) {
  murmurTimer.current = 8 + Math.random() * 14

  if (!useInteractionStore.getState().activeDialogue) {
    playNPCMurmur(
      snappedPosition[0],
      snappedPosition[1] + HEAD_HEIGHT,   // 1.62 — mouth height
      snappedPosition[2],
      PITCH_SCALES[npcId] ?? 1.0,
    )
  }
}
```

**Key design decisions:**

`phaseOffset * 2.5 + 4` as initial timer. The `phaseOffset` prop was originally for the idle animation phase. Reusing it staggers the three NPCs' first murmurs — they don't all sound simultaneously 8 seconds in.

`useInteractionStore.getState()` not `useInteractionStore()`. The NPC already subscribes to `lookingAt` via the hook. Subscribing to `activeDialogue` via a hook would re-render the component every time any dialogue opens — even for NPCs not involved. `getState()` reads directly without subscribing. Since this runs in `useFrame` (already 60Hz), a subscription hook would be wasteful and redundant.

**Per-NPC pitch scale** (`PITCH_SCALES = { npc_01: 0.92, npc_02: 1.08, npc_03: 0.85 }`). Scaling the center frequency of the bandpass by 0.85–1.08 gives each character a subtle voice difference. The Gatekeeper (0.85×) sounds slightly deeper; the Wanderer (1.08×) slightly brighter. Individually the difference is subtle. Together, three distinct voices emerge.

**Sound at head height** (`+ HEAD_HEIGHT`). The PannerNode is positioned at mouth level so the sound appears to come from where you'd expect a person's voice, not from their feet.

---

## 8. Ambient Music: LFO Modulation and Detuning

### The Am7 Chord

The ambient pad uses an A minor seventh voicing: A, E, G, A, B, E across two octaves. Four properties make this ideal for ambient underscore:

- **Minor quality** — slightly melancholic, introspective, never aggressive
- **Open voicing** — wide intervals avoid a cluttered or busy feel
- **Seventh (G)** — adds harmonic color without demanding resolution
- **No leading tone** — doesn't pull toward any destination chord, just floats

### Detuning: Physics of Warmth

Each oscillator is detuned by 0–3 cents:

```javascript
const tones = [
  [110.00,  0],   // A2 — perfectly in tune
  [164.81,  2],   // E3 — 2 cents sharp
  [196.00, -2],   // G3 — 2 cents flat
  [220.00,  1],   // A3 — 1 cent sharp
  [246.94, -3],   // B3 — 3 cents flat
  [329.63,  3],   // E4 — 3 cents sharp
]
```

**Why does detuning sound warm?** When two oscillators are slightly out of tune, they produce **beating** — periodic amplitude fluctuations at the frequency of their pitch difference. Two oscillators 2 cents apart at 220Hz beat at approximately 0.26 Hz — one slow pulse every ~4 seconds. This gentle pulsing makes the sound feel alive rather than static and digital. It is the same physics that makes a chorus pedal, a vintage Mellotron, or a pipe organ with multiple pipes per note sound "warm." One cent = 1/100 of a semitone, so 3 cents is an interval so small it's nearly imperceptible as a pitch difference but clearly audible as beating.

### LFO Tremolo

```javascript
const lfo = ctx.createOscillator()
lfo.type = 'sine'
lfo.frequency.value = 0.04   // one cycle every 25 seconds

const lfoGain = ctx.createGain()
lfoGain.gain.value = volume * 0.55   // swell adds 55% of base volume at peak

lfo.connect(lfoGain)
lfoGain.connect(master.gain)   // ← connects to an AudioParam, not an audio input
```

`lfoGain.connect(master.gain)` connects the LFO's output signal (a slowly varying number) to `master.gain`'s value. The LFO's output is added to the gain's base value each sample. The result: master volume oscillates gently at 0.04 Hz — one slow breath every 25 seconds. This is **tremolo** (amplitude modulation at sub-audible rate).

Connecting an audio signal to an `AudioParam` is one of the most powerful patterns in Web Audio. LFO→Gain = tremolo. LFO→OscillatorFrequency = vibrato. LFO→FilterFrequency = a sweeping "wah" effect. The same LFO technique appears in the wind system (`0.07 Hz`), the water opacity pulse in `Water.jsx` (`0.7 Hz`), and the day/night ambient light variation. The concept is universal: slow periodic modulation makes things feel alive.

---

## 9. The Browser Security Model: User Gesture Requirement

Browsers block `AudioContext` creation and `ctx.resume()` unless inside a user-gesture event handler. This prevents websites from playing audio without permission.

**What counts as a user gesture:** click/tap, keydown/keyup, pointer lock acquisition.

**What does NOT count:** setTimeout, requestAnimationFrame, fetch callbacks, `useEffect` on page load.

```javascript
// useAudio.js
useEffect(() => {
  if (!isLocked || initialized.current) return
  initialized.current = true

  // `isLocked` flipped to true because of a pointer-lock click.
  // This effect fires in the same microtask tick as that click event.
  // Browsers accept this as "inside a user gesture."
  resumeAudioContext()

  const windTimer  = setTimeout(() => startWind(0.06), 300)
  const musicTimer = setTimeout(() => startAmbientMusic(0.035), 1200)
  ...
}, [isLocked])
```

**The timing stagger matters.** 300ms: wind fades in after the click artifact settles. 1200ms: music starts after wind establishes the soundscape. The music's `linearRampToValueAtTime` fades it in over 5 more seconds. The result: silence → click → wind → music emerging — an atmospheric sequence that feels intentional rather than everything starting at once.

---

## 10. Architecture: The Singleton AudioContext

`AudioManager.js` exports functions, not a class. The AudioContext is a module-level variable:

```javascript
let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}
```

**Why a singleton?** Browsers limit the number of AudioContexts per page (typically 6). Two contexts cannot share nodes or a clock. One context for the entire application is the correct architecture.

**Why lazy creation?** The browser blocks `new AudioContext()` before a user gesture. Making it a module-level constant would throw immediately on import. Lazy creation defers construction to the first `getCtx()` call, which happens inside `resumeAudioContext()` from `useAudio.js`, which only runs on pointer-lock click.

**Why `ctx.resume()` on every call?** Browsers automatically suspend the AudioContext when a tab loses focus. `getCtx()` resumes it defensively on every call. The cost of calling `resume()` on an already-running context is negligible.

**Why `window.webkitAudioContext`?** Older Safari versions used a prefixed name. The `|| window.webkitAudioContext` fallback provides compatibility without needing a polyfill library.

---

## 11. Exercises

Work through these with the browser's developer tools open — Firefox's Audio tab shows a live view of the Web Audio node graph while the game is running.

**Exercise 1 — Wind volume.** In `useAudio.js`, change `startWind(0.06)` to `startWind(0.18)`. Lock in and listen. Try `0.02`. What volume level makes the environment feel alive without being distracting?

**Exercise 2 — Music timing.** Change the music timer delay from `1200` to `5000`. Lock in and listen to the soundscape establish itself: silence → lock click → wind → (5 seconds) → music. Conversely, try `0` — does simultaneous wind+music feel right for this setting?

**Exercise 3 — Major vs minor.** In `startAmbientMusic`, replace the `tones` array with an A major chord: `[[110,0],[164.81,2],[220,1],[329.63,3]]` (A, E, A, E — open major fifth). Lock in and walk around. How does major vs minor feel for a slightly ominous exploration game? Try `[[110,0],[138.59,-2],[165,1],[220,0]]` (Am with added 3rd below — darker).

**Exercise 4 — Fast murmur.** In `NPC.jsx`, change `8 + Math.random() * 14` to `1.5 + Math.random() * 2`. The NPCs murmur constantly. Walk close to The Gatekeeper, circle them slowly. Listen to the sound pan left and right in your headphones. This is HRTF doing real-time spatial audio.

**Exercise 5 — Disable orientation.** In `AudioManager.js` `updateListener`, comment out the `forwardX/forwardY/forwardZ` assignments. Lock in and turn to face each NPC. Distance attenuation still works — volume changes as you walk toward/away. But the stereo panning is frozen — sounds don't shift left/right as you turn. Restore the orientation lines and feel the difference.

**Exercise 6 — Footstep surface switch.** Find a boulder in the scene. Jump on top of it. While standing on the rock, walk around — you should hear a stone footstep sound. Walk off the rock back to grass — the sound switches back. This is the downward raycast surface detection in action.

**Exercise 7 — Brown vs white wind.** In `startWind`, change `createNoiseBuffer(5, 'brown')` to `createNoiseBuffer(5, 'white')`. Lock in and listen. White noise bandpass-filtered still sounds like wind, but much harsher — industrial hiss rather than outdoor ambience. Change back. Now you understand why brown noise is preferred for natural ambient sounds.

**Exercise 8 — PannerNode rolloff.** In `createPanner`, change `rolloffFactor` from `1.8` to `6.0`. Approach an NPC slowly. The sound appears much later (closer) and drops away faster when you step back. `rolloffFactor = 1.0` is physically accurate inverse-square. Higher values compress the audio "world" — sounds only exist at very close range.

**Exercise 9 — LFO speed.** In `startAmbientMusic`, change `lfo.frequency.value = 0.04` to `0.5` (one swell per 2 seconds). Lock in and listen — the pad now "throbs" audibly, more like a horror cue than ambient exploration music. Change to `0.008` (one swell per 2 minutes) — the breathing is so slow you'll barely perceive it. The original `0.04` sits in the sweet spot between imperceptible and intrusive.

**Exercise 10 — Add a new sound.** Write a `playPickup()` function in `AudioManager.js` that synthesizes a short ascending glissando: `OscillatorNode` with `type = 'sine'`, sweeping from 400Hz to 1200Hz over 150ms via `exponentialRampToValueAtTime`, with a fast attack and decay. Export it, import it in `Player.jsx`, and call it when F is pressed on any item (not just consumables). You've now written your first full custom synthesized sound from scratch.

---

*The Web Audio API is one of the most capable APIs in the browser and one of the most underused. Every concept here — signal graphs, synthesis, envelopes, LFOs, spatial audio — applies equally to professional DAWs, hardware synthesizers, and AAA game audio engines. The difference is just the API surface. The physics and the math are the same.*
