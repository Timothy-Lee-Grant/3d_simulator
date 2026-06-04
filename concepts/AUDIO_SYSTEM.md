# The Audio System

> How `AudioManager.js` synthesizes every game sound from scratch using the Web Audio API, and how footsteps are timed to the camera's head bob.

---

## Why No Audio Files?

Most games ship `.mp3` or `.wav` files for every sound. We took a different approach: every sound is **synthesized at runtime** using the browser's Web Audio API. This means:

- The project stays self-contained — no asset downloads needed
- You learn signal processing concepts that apply everywhere (music, game audio, telecommunications)
- You can tune any sound by changing a few numbers rather than re-recording

The tradeoff: procedural sounds are simple and abstract compared to recorded audio. When you're ready to add realism, swap `playFootstep()` internals to load a real `.mp3` — the calling code in `Player.jsx` doesn't change.

---

## The Web Audio API: A Signal Graph

The Web Audio API models audio as a **directed graph of nodes**. Sound flows from a source, through processing nodes, and finally to your speakers:

```
Source → [Filter] → [Filter] → Gain → Destination (speakers)
```

Every node is created from an `AudioContext`, which is the central object that owns the audio hardware, manages timing, and connects to your speakers.

```javascript
const ctx = new AudioContext()

const osc  = ctx.createOscillator()   // source: generates a tone
const gain = ctx.createGain()          // processing: controls volume

osc.connect(gain)          // osc → gain
gain.connect(ctx.destination)  // gain → speakers

osc.start()
```

### The three main node types

**Source nodes** — generate audio signal:

| Node | What it produces |
|---|---|
| `OscillatorNode` | A pure sine, square, sawtooth, or triangle wave at a set frequency |
| `AudioBufferSourceNode` | Plays an array of pre-computed audio samples |
| `MediaElementAudioSourceNode` | Wraps an `<audio>` HTML element |

**Processing nodes** — transform the signal:

| Node | What it does |
|---|---|
| `BiquadFilterNode` | Lowpass, highpass, bandpass, shelving — shapes frequency content |
| `GainNode` | Multiplies the signal by a value (volume control) |
| `ConvolverNode` | Applies a room impulse response (reverb) |
| `DelayNode` | Delays the signal by a fixed time (echo) |
| `DynamicsCompressorNode` | Limits the dynamic range (prevents clipping) |

**Destination node** — the output: `ctx.destination` is a read-only node that represents your speakers. Everything eventually connects here.

---

## The Browser Autoplay Problem

Browsers block audio until the user has physically interacted with the page (clicked, pressed a key, etc.). If you try to play audio on page load, the browser silently refuses and logs a warning.

This is why `AudioManager.js` uses a **lazy initialization** pattern:

```javascript
let ctx = null

function getCtx() {
  if (!ctx) {
    // Creates the context — only allowed after a user gesture
    ctx = new AudioContext()
  }
  if (ctx.state === 'suspended') {
    ctx.resume()  // resumes if the browser suspended it
  }
  return ctx
}
```

The `AudioContext` is created the first time any audio function is called. In our game, that's when `resumeAudioContext()` is called from `useAudio.js` — which fires on the pointer-lock click.

### The suspended state

Even after creation, an `AudioContext` can be in three states:

| State | Meaning |
|---|---|
| `running` | Normal — audio plays |
| `suspended` | Browser has paused it (no user gesture yet, or tab was backgrounded) |
| `closed` | Permanently shut down |

Calling `ctx.resume()` transitions from `suspended` to `running`. Our `getCtx()` function handles this on every call, so audio works even if the tab was backgrounded and came back.

---

## Synthesizing Noise

Most game sounds (footsteps, impacts, wind, explosions) are better modeled with **noise** than with pure tones. Noise is a signal containing all frequencies simultaneously — like a waterfall, or static on a radio.

### White noise

Every sample is an independent random number between -1 and +1:

```javascript
const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate)
const data = buffer.getChannelData(0)

for (let i = 0; i < data.length; i++) {
  data[i] = Math.random() * 2 - 1
}
```

White noise has **equal energy at all frequencies** — it sounds like hiss or static. By itself, it's harsh and thin.

### Brown noise (Brownian noise)

Each sample is the previous sample plus a small random step (a random walk):

```javascript
let lastOut = 0
for (let i = 0; i < data.length; i++) {
  const white = Math.random() * 2 - 1
  data[i] = (lastOut + 0.02 * white) / 1.02
  lastOut = data[i]
}
```

This integration process causes low frequencies to dominate — the spectrum falls at 6dB per octave (twice the frequency = half the amplitude). The result sounds like a waterfall, ocean waves, or wind. It's the right starting material for ambient sounds.

---

## How Footsteps Work: Shaped Noise

A footstep is a brief burst of noise, shaped by two things:

**1. Frequency content (the filter):** Different surfaces have different resonant frequencies.
- **Grass/dirt**: soft impact, energy concentrated around 200–400 Hz (low band)
- **Wood**: hollow knock, energy around 500–700 Hz
- **Stone**: sharp click, energy around 900–1200 Hz

We use a `BiquadFilterNode` in **bandpass** mode to isolate this frequency band from the white noise burst.

**2. Volume over time (the envelope):** A footstep has an instant attack (the foot hits) and a fast decay (the impact dissipates). This is modeled with an **ADSR envelope** (Attack, Decay, Sustain, Release) — though for footsteps we only use Attack and Decay:

```javascript
const gain = ctx.createGain()
const now  = ctx.currentTime

gain.gain.setValueAtTime(0, now)                           // starts silent
gain.gain.linearRampToValueAtTime(0.4, now + 0.004)        // attack: 4ms to peak
gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)  // decay: 100ms to silence
```

`exponentialRampToValueAtTime` is used for decay (not linear) because human hearing perceives loudness **logarithmically** — an exponential drop sounds like a natural, smooth fade, while a linear drop sounds abrupt.

### The full footstep signal chain

```
White noise buffer
       │
   BiquadFilter (bandpass @ 280 Hz, Q=0.7)   ← removes everything except the target band
       │
   BiquadFilter (lowpass @ 900 Hz)           ← further smooths harshness
       │
   GainNode (4ms attack, 100ms decay)        ← shapes the impact envelope
       │
   ctx.destination
```

---

## How Wind Works: Brown Noise + LFO

Wind is a sustained, slowly-evolving sound. The signal chain:

```
Brown noise buffer (looping)
          │
    BiquadFilter (bandpass @ 320 Hz, Q=0.35)   ← isolates wind frequency band
          │
    BiquadFilter (highshelf @ 1800 Hz, -14dB)  ← cuts harshness above 1800 Hz
          │
    GainNode (master volume)
          ↑
    LFO OscillatorNode (0.07 Hz)
          │
    GainNode (LFO amplitude)
          │
    (connected to master gain's .gain AudioParam)
```

### What an LFO does

**LFO** stands for Low Frequency Oscillator — an oscillator running at a frequency too low to hear as a tone (below ~20 Hz), but fast enough to produce a perceptible rhythm.

When the LFO's output is connected to a `GainNode.gain` AudioParam, it **modulates** (varies) the gain over time:

```javascript
const lfo = ctx.createOscillator()
lfo.frequency.value = 0.07   // cycles every ~14 seconds

const lfoGain = ctx.createGain()
lfoGain.gain.value = 0.04    // LFO swings the master gain by ±0.04

lfo.connect(lfoGain)
lfoGain.connect(master.gain)  // modulates the gain parameter directly
```

The master gain sits at 0.07 (base volume). The LFO at 0.07 Hz sweeps it between 0.03 and 0.11 over 14-second cycles. The result sounds like wind gusting — not static background noise.

This technique (connecting one audio node's output to another node's **parameter** rather than its audio input) is called **AudioParam modulation** and is one of the Web Audio API's most powerful features. It's how synthesizers produce vibrato, tremolo, filter sweeps, and complex effects without any JavaScript running per-sample.

---

## How Footsteps Sync to the Camera Bob

The head bob in `Player.jsx` uses a sine wave:

```javascript
camera.position.y = EYE_HEIGHT + Math.sin(bobTime) * amplitude
```

As `bobTime` accumulates, `Math.sin(bobTime)` oscillates between -1 and +1. **One full cycle** of the sine wave = one full stride (left foot + right foot).

A footstep happens when one foot strikes the ground — at the **bottom** of each half-cycle. The sine wave crosses zero twice per cycle: once going downward (positive → negative), once going upward (negative → positive). Each crossing corresponds to one foot hitting the ground.

```
sin(bobTime)
     │
  1  ┤    ╭──╮                ╭──╮
     │   ╯    ╰              ╯    ╰
  0  ┤──╯──────╰────────────╯──────╰── ← zero crossings here
     │          ╰─╮        ╯
 -1  ┤             ╰──────╯
     │
     └────────────────────────────────
          ↑         ↑
        left      right
        foot       foot
```

In `Player.jsx`'s `useFrame`, we store the previous frame's sine value and check for sign changes:

```javascript
const sinNow = Math.sin(bobTime.current)
const sinWas = prevSinVal.current

if (sinWas >= 0 && sinNow < 0) playFootstep('grass', 0.35)  // + → − : left foot
if (sinWas <  0 && sinNow >= 0) playFootstep('grass', 0.35) // − → + : right foot

prevSinVal.current = sinNow
```

This approach automatically handles any bob frequency — walking or sprinting — because it detects sign changes rather than specific time intervals. It's also frame-rate independent: even if a frame is dropped, the detection catches up on the next frame.

---

## Data Flow: From Keyboard to Speaker

```
[Keyboard: W held]
       │
  useKeyboard ref updated
       │
  Player.jsx useFrame fires (every frame, ~60/s)
       │
  bobTime accumulates → sin(bobTime) computed
       │
  Zero crossing detected?
       │ yes
  playFootstep('grass', 0.35)
       │
  AudioManager.js creates nodes:
    - NoiseBuffer → BandpassFilter → LowpassFilter → GainNode → destination
       │
  GainNode envelope plays out over 100ms
       │
  [Speaker: footstep thud]
```

The entire path from key press to speaker is under 2ms of compute time and produces no React re-renders, no garbage collection pressure, and no frame drops.

---

## Files Changed in This Implementation

| File | What changed |
|---|---|
| `src/systems/AudioManager.js` | New — full procedural audio engine |
| `src/hooks/useAudio.js` | New — initializes audio on first pointer lock |
| `src/components/Player.jsx` | Added `playFootstep` import, `prevSinVal` ref, zero-crossing detection in `useFrame` |
| `src/App.jsx` | Added `useAudio(locked)` call |

---

## What to Add Next in Audio

| Feature | How |
|---|---|
| Stone/wood footsteps | Raycast down from player in `useFrame`, check surface type, pass to `playFootstep()` |
| Jump sound | Add `playJump()` to `AudioManager.js` (frequency-swept oscillator), trigger on Space press |
| Land sound | `playLand(intensity)` already in `AudioManager.js`, trigger when player hits ground |
| Positional NPC sounds | Use `PannerNode` with 3D position, connected between source and destination |
| Indoor wind reduction | Call `setWindVolume(0.01)` when inside a building bounding box |
| Music | `OscillatorNode` sequences driven by a clock — or load an `.mp3` with `fetch` + `decodeAudioData` |
