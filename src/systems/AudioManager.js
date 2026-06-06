/**
 * AudioManager.js
 *
 * A procedural audio engine built on the Web Audio API.
 * Every sound in the game is synthesized from scratch using oscillators,
 * noise generators, and filters — no audio files required.
 *
 * This is a singleton: one AudioContext shared across the entire app.
 * The context is created lazily on first user interaction, which is a
 * browser security requirement — audio cannot start without a gesture.
 *
 * ── Signal Processing Primer ─────────────────────────────────────────────
 *
 * The Web Audio API models sound as a graph of connected nodes:
 *
 *   Source → Filter → Gain → Destination (speakers)
 *
 * Sources generate sound:
 *   OscillatorNode  — a pure tone at a given frequency
 *   AudioBufferSourceNode — plays a pre-filled buffer of samples (our noise)
 *
 * Filters shape the frequency content:
 *   BiquadFilterNode — lowpass, highpass, bandpass, etc.
 *
 * Gain nodes control volume (and can be modulated by other nodes for effects):
 *   GainNode — multiplies the signal by a value
 *
 * Everything connects to AudioContext.destination, which is your speakers.
 *
 * ── Noise Synthesis ──────────────────────────────────────────────────────
 *
 * Most real-world sounds (footsteps, wind, impacts) are better modeled as
 * shaped noise than as pure tones. We generate noise by filling an array
 * with random values and playing it as an AudioBuffer. Filtering this
 * noise at different frequency bands gives different surface textures:
 *
 *   Low bandpass (200-400 Hz)  → soft, earthy sounds (grass, dirt, sand)
 *   Mid bandpass (600-900 Hz)  → harder surfaces (wood, packed earth)
 *   High bandpass (1000+ Hz)   → stone, concrete, metal
 *
 * Brown noise (integrated white noise) has more energy at low frequencies
 * and less at high, making it ideal for wind and rumble sounds.
 */

// ── Singleton AudioContext ────────────────────────────────────────────────

let ctx = null

/**
 * Returns the shared AudioContext, creating it on first call.
 * Resumes it if it was suspended by the browser.
 */
function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (ctx.state === 'suspended') {
    ctx.resume()
  }
  return ctx
}

// ── Noise Buffer Factory ──────────────────────────────────────────────────

/**
 * Generates a noise buffer of the given duration.
 *
 * White noise: each sample is independent and random.
 *   Flat frequency spectrum — equal energy at all frequencies.
 *   Good for: hiss, static, high-frequency impacts.
 *
 * Brown noise: each sample is the previous sample plus a small random step.
 *   Frequency spectrum falls off at 6dB/octave (more bass, less treble).
 *   Good for: wind, rumble, ocean, thunder.
 */
function createNoiseBuffer(duration, type = 'white') {
  const c = getCtx()
  const frameCount = Math.floor(c.sampleRate * duration)
  const buffer = c.createBuffer(1, frameCount, c.sampleRate)
  const data = buffer.getChannelData(0)

  if (type === 'white') {
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1
    }
  } else if (type === 'brown') {
    // Integrate white noise — each sample is a random walk from the last
    let lastOut = 0.0
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1
      data[i] = (lastOut + 0.02 * white) / 1.02
      lastOut = data[i]
      data[i] *= 3.5  // normalize amplitude
    }
  }

  return buffer
}

// ── Footstep Sounds ───────────────────────────────────────────────────────

/**
 * Plays a single footstep sound synthesized from filtered noise.
 *
 * The "surface" parameter controls the bandpass filter frequency,
 * which determines the tonal color of the impact:
 *   - grass/dirt: low frequency (soft, thuddy)
 *   - wood:       mid frequency (resonant knock)
 *   - stone:      high frequency (sharp click)
 *
 * @param {'grass'|'wood'|'stone'} surface
 * @param {number} volume  0.0 – 1.0
 */
export function playFootstep(surface = 'grass', volume = 1.0) {
  const c = getCtx()
  const now = c.currentTime

  // Surface properties
  const props = {
    grass: { freq: 280,  q: 0.7, duration: 0.10, lowCut: 900  },
    wood:  { freq: 550,  q: 1.0, duration: 0.08, lowCut: 2000 },
    stone: { freq: 1000, q: 1.4, duration: 0.07, lowCut: 3500 },
  }
  const p = props[surface] ?? props.grass

  // ── Noise source ─────────────────────────────────────────────────────
  const buffer = createNoiseBuffer(p.duration * 2)
  const source = c.createBufferSource()
  source.buffer = buffer

  // ── Bandpass — shapes the noise into the surface's character ─────────
  const bandpass = c.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = p.freq
  bandpass.Q.value = p.q

  // ── Low-pass — removes harsh high-frequency noise ────────────────────
  const lowpass = c.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = p.lowCut

  // ── Gain envelope — sharp attack, fast exponential decay ─────────────
  // This models the physics of an impact: instant force, then rapid decay
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume * 0.4, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + p.duration)

  // ── Graph: source → bandpass → lowpass → gain → speakers ─────────────
  source.connect(bandpass)
  bandpass.connect(lowpass)
  lowpass.connect(gain)
  gain.connect(c.destination)

  source.start(now)
  source.stop(now + p.duration + 0.01)
}

// ── Landing / Impact ──────────────────────────────────────────────────────

/**
 * Played when the player lands after a jump.
 * Combines a low-frequency oscillator (thud) with a noise burst (texture).
 *
 * @param {number} intensity  0.0–1.0, scaled by fall height
 */
export function playLand(intensity = 1.0) {
  const c = getCtx()
  const now = c.currentTime

  // ── Tonal thud: pitched sine swept downward ──────────────────────────
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(90 + intensity * 30, now)
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.18)

  const oscGain = c.createGain()
  oscGain.gain.setValueAtTime(intensity * 0.55, now)
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

  osc.connect(oscGain)
  oscGain.connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.2)

  // ── Noise texture: adds the "crunch" of the impact ───────────────────
  const noise = createNoiseBuffer(0.15)
  const noiseSrc = c.createBufferSource()
  noiseSrc.buffer = noise

  const noiseFilter = c.createBiquadFilter()
  noiseFilter.type = 'lowpass'
  noiseFilter.frequency.value = 500

  const noiseGain = c.createGain()
  noiseGain.gain.setValueAtTime(intensity * 0.35, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)

  noiseSrc.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(c.destination)
  noiseSrc.start(now)
  noiseSrc.stop(now + 0.15)
}

// ── Wind Ambience ─────────────────────────────────────────────────────────

/**
 * Persistent wind ambient sound built from brown noise shaped by filters
 * and modulated by a slow LFO (Low Frequency Oscillator) to simulate
 * natural gusting.
 *
 * Signal chain:
 *   Brown noise → Bandpass (200–500 Hz) → High-shelf cut → Master gain
 *                                                                 ↑
 *                                                     LFO → LFO gain (modulates master gain)
 *
 * The LFO (0.07 Hz ≈ one gust every 14 seconds) slowly raises and lowers
 * the master gain, making the wind feel alive rather than static.
 */

// Module-level references so we can stop/adjust the wind later
let _windSource   = null
let _windLFO      = null
let _windMaster   = null

export function startWind(volume = 0.07) {
  if (_windSource) return  // already running

  const c = getCtx()

  // ── Loop a long brown noise buffer seamlessly ─────────────────────────
  const buffer = createNoiseBuffer(5, 'brown')
  const source = c.createBufferSource()
  source.buffer = buffer
  source.loop = true

  // ── Bandpass — shapes brown noise into a wind frequency band ─────────
  const bandpass = c.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 320
  bandpass.Q.value = 0.35

  // ── High-shelf cut — removes piercing high-frequency content ─────────
  const shelf = c.createBiquadFilter()
  shelf.type = 'highshelf'
  shelf.frequency.value = 1800
  shelf.gain.value = -14

  // ── Master gain — overall volume ─────────────────────────────────────
  const master = c.createGain()
  master.gain.value = volume

  // ── LFO — slowly modulates master gain to simulate gusts ─────────────
  const lfo = c.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.07  // one gust cycle every ~14 seconds

  const lfoGain = c.createGain()
  lfoGain.gain.value = volume * 0.5  // gusts add/subtract 50% of base volume

  // LFO output is an audio-rate signal — connecting it to a gain's .gain
  // parameter causes that gain to oscillate at the LFO frequency
  lfo.connect(lfoGain)
  lfoGain.connect(master.gain)

  // ── Wire the graph ────────────────────────────────────────────────────
  source.connect(bandpass)
  bandpass.connect(shelf)
  shelf.connect(master)
  master.connect(c.destination)

  lfo.start()
  source.start()

  // Save references for later control
  _windSource = source
  _windLFO    = lfo
  _windMaster = master
}

/**
 * Fades out and stops the wind ambience.
 */
export function stopWind() {
  if (!_windSource) return
  const c = getCtx()

  _windMaster.gain.setValueAtTime(_windMaster.gain.value, c.currentTime)
  _windMaster.gain.linearRampToValueAtTime(0, c.currentTime + 2.5)

  const src = _windSource
  const lfo = _windLFO
  setTimeout(() => {
    try { src.stop(); lfo.stop() } catch (_) {}
  }, 2600)

  _windSource = null
  _windLFO    = null
  _windMaster = null
}

/**
 * Smoothly changes wind volume, e.g. to get quieter indoors.
 * @param {number} volume  0.0 – 1.0
 * @param {number} rampTime  seconds to reach new volume
 */
export function setWindVolume(volume, rampTime = 1.0) {
  if (!_windMaster) return
  const c = getCtx()
  _windMaster.gain.setValueAtTime(_windMaster.gain.value, c.currentTime)
  _windMaster.gain.linearRampToValueAtTime(volume, c.currentTime + rampTime)
}

// ── Spatial Audio Listener ────────────────────────────────────────────────

/**
 * Syncs the Web Audio API listener position and orientation to the camera.
 *
 * Call this every frame from AudioBridge.jsx (inside Canvas, via useFrame)
 * so all PannerNodes correctly calculate distance and panning relative to
 * where the player currently is.
 *
 * ── Why this must happen every frame ─────────────────────────────────────
 *
 * The Web Audio API's spatial model works like this:
 *
 *   AudioListener (= ears) has a 3D position + orientation in "audio space."
 *   PannerNode   (= sound source) has a 3D position in the same audio space.
 *
 * The engine computes the vector between listener and source, applies the
 * distance model (inverse square falloff), and calculates left/right panning
 * using the HRTF model. Both position AND orientation matter:
 *
 *   - If you face an NPC directly, the sound comes from straight ahead.
 *   - If you turn 90°, the same NPC's sound comes from your left.
 *
 * None of this updates automatically — we must push new values every frame.
 *
 * @param {number} px,py,pz  Camera world position
 * @param {number} fx,fy,fz  Camera forward direction (unit vector)
 * @param {number} ux,uy,uz  Camera up direction (usually 0,1,0)
 */
export function updateListener(px, py, pz, fx, fy, fz, ux, uy, uz) {
  if (!ctx || ctx.state !== 'running') return
  const listener = ctx.listener

  // Use AudioParam (.value) when available — the legacy setPosition/setOrientation
  // APIs are deprecated in most browsers.
  if (listener.positionX !== undefined) {
    listener.positionX.value = px
    listener.positionY.value = py
    listener.positionZ.value = pz
    listener.forwardX.value  = fx
    listener.forwardY.value  = fy
    listener.forwardZ.value  = fz
    listener.upX.value       = ux
    listener.upY.value       = uy
    listener.upZ.value       = uz
  } else {
    // Safari / older browsers fallback
    listener.setPosition(px, py, pz)
    listener.setOrientation(fx, fy, fz, ux, uy, uz)
  }
}

// ── Positional (Spatial) Sounds ───────────────────────────────────────────

/**
 * Creates a PannerNode configured for in-world sound sources.
 *
 * PannerNode is a Web Audio API node that applies:
 *   - Distance attenuation (inverse-square law: doubles distance → quarter volume)
 *   - HRTF stereo panning (Head-Related Transfer Function: physically accurate
 *     left/right ear simulation — sounds from the right arrive at the right ear
 *     a few microseconds earlier, giving true 3D directionality)
 *
 * @param {AudioContext} c   The shared AudioContext
 * @param {number} x,y,z    World position of the sound source
 * @param {number} refDist  Distance at which attenuation begins (default 2m)
 * @param {number} maxDist  Distance at which sound is effectively silent (default 18m)
 */
function createPanner(c, x, y, z, refDist = 2, maxDist = 18) {
  const panner = c.createPanner()
  panner.panningModel  = 'HRTF'         // physically accurate stereo model
  panner.distanceModel = 'inverse'       // 1/distance falloff
  panner.refDistance   = refDist
  panner.maxDistance   = maxDist
  panner.rolloffFactor = 1.8
  // Cone: omni-directional source (plays equally in all directions)
  panner.coneInnerAngle = 360
  panner.coneOuterAngle = 360
  panner.positionX.value = x
  panner.positionY.value = y
  panner.positionZ.value = z
  return panner
}

/**
 * NPC ambient murmur — quiet speech-like sound positioned at the NPC.
 *
 * Synthesized from bandpass-filtered noise in the 250–480 Hz range
 * (the fundamental frequency band of human voices). A short amplitude
 * envelope shapes each murmur burst. Multiple calls produce a stream
 * of quiet, indistinct speech sounds.
 *
 * Because the sound runs through a PannerNode, it gets louder as you
 * approach the NPC and pans left/right as you circle them.
 *
 * @param {number} x, y, z   NPC head position in world space
 * @param {number} pitchScale  Per-NPC pitch variation (0.8–1.2), distinguishes voices
 * @param {number} volume      Master volume for this murmur (default 0.04)
 */
export function playNPCMurmur(x, y, z, pitchScale = 1.0, volume = 0.04) {
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const now = c.currentTime

  // Duration and shape of this murmur syllable
  const duration   = 0.12 + Math.random() * 0.22
  const centerFreq = (260 + Math.random() * 180) * pitchScale   // voice fundamental

  // ── Noise source ─────────────────────────────────────────────────────
  const buffer = createNoiseBuffer(duration + 0.05)
  const source = c.createBufferSource()
  source.buffer = buffer

  // ── Bandpass — sculpts noise into "voice" frequency region ───────────
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = centerFreq
  bp.Q.value = 4.0   // narrow Q = more tonal/vowel-like

  // ── Gentle high-shelf cut — removes metallic noise artifacts ─────────
  const shelf = c.createBiquadFilter()
  shelf.type = 'highshelf'
  shelf.frequency.value = 1200
  shelf.gain.value = -8

  // ── Gain envelope — soft attack, sustained body, smooth release ───────
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.025)
  gain.gain.setValueAtTime(volume, now + duration * 0.55)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  // ── PannerNode — places the sound at the NPC's world position ─────────
  const panner = createPanner(c, x, y, z, 1.5, 14)

  // ── Signal chain ─────────────────────────────────────────────────────
  source.connect(bp)
  bp.connect(shelf)
  shelf.connect(gain)
  gain.connect(panner)
  panner.connect(c.destination)

  source.start(now)
  source.stop(now + duration + 0.02)
}

// ── UI / Interaction Sounds ───────────────────────────────────────────────

/**
 * Item pickup — a short ascending two-tone chime.
 * Gives positive feedback without being intrusive.
 */
export function playItemPickup() {
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const now = c.currentTime

  // Two chime tones: root + fifth
  const tones = [880, 1320]
  tones.forEach((freq, i) => {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const gain = c.createGain()
    gain.gain.setValueAtTime(0, now + i * 0.06)
    gain.gain.linearRampToValueAtTime(0.18, now + i * 0.06 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.22)

    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(now + i * 0.06)
    osc.stop(now + i * 0.06 + 0.25)
  })
}

/**
 * UI click — a very short, quiet mid-frequency tick.
 * Used for dialogue response selection.
 */
export function playUIClick() {
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const now = c.currentTime

  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 620

  const gain = c.createGain()
  gain.gain.setValueAtTime(0.07, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)

  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.05)
}

/**
 * Dialogue open — a soft, low "thunk" that signals a state change.
 */
export function playDialogueOpen() {
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const now = c.currentTime

  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(200, now)
  osc.frequency.exponentialRampToValueAtTime(130, now + 0.12)

  const gain = c.createGain()
  gain.gain.setValueAtTime(0.15, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)

  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.16)
}

// ── Ambient Music ─────────────────────────────────────────────────────────

/**
 * Synthesized ambient pad — a detuned chord of sine waves that slowly
 * breathes via an LFO.
 *
 * ── What makes this "ambient music" ──────────────────────────────────────
 *
 * Real ambient music (Eno, Schulze) uses long sustained tones, slow harmonic
 * change, and randomised timing to produce a sound that's present but not
 * demanding. We synthesise this with:
 *
 *   1. A minor-7 chord (A2 = 110 Hz, E3, A3, G3) — dark, open, non-intrusive.
 *   2. Detuning each oscillator by ±1–3 cents — creates a "chorus" effect
 *      as slightly mismatched frequencies drift in and out of phase.
 *      This is the same technique used in hardware synthesizers.
 *   3. An LFO at 0.04 Hz (one cycle every 25 seconds) on the master gain —
 *      makes the whole pad gently swell and recede like breathing.
 *
 * ── Cents and detuning ────────────────────────────────────────────────────
 *
 * One cent = 1/100 of a semitone. A very small interval — two notes
 * 3 cents apart are almost identical but produce audible beating as their
 * waves drift in and out of phase. This beating creates warmth and movement
 * from otherwise static tones.
 *
 * ── The LFO pattern ───────────────────────────────────────────────────────
 *
 * An LFO (Low Frequency Oscillator) runs below the audible range (< 20 Hz).
 * Instead of producing a tone, it produces a slowly varying value that
 * modulates another parameter — here, the master gain's value. The result:
 * the whole pad breathes at 0.04 Hz, completely inaudibly slow.
 *
 * This exact technique — LFO on gain = tremolo — is used in every synthesizer
 * and is the same pattern already used in `startWind()`.
 */

let _musicOscs  = []
let _musicMaster = null

export function startAmbientMusic(volume = 0.035) {
  if (_musicOscs.length > 0) return   // already running
  const c = getCtx()
  if (!c) return

  // ── Master gain — overall volume, fades in over 5 seconds ────────────
  const master = c.createGain()
  master.gain.setValueAtTime(0, c.currentTime)
  master.gain.linearRampToValueAtTime(volume, c.currentTime + 5)
  master.connect(c.destination)
  _musicMaster = master

  // ── LFO — gentle swell (one breath every ~25 seconds) ────────────────
  const lfo = c.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.04
  const lfoGain = c.createGain()
  lfoGain.gain.value = volume * 0.55    // swell adds 55% of base volume at peak
  lfo.connect(lfoGain)
  lfoGain.connect(master.gain)
  lfo.start()
  _musicOscs.push(lfo)

  // ── Chord tones — Am7 voicing, spread across two octaves ─────────────
  // [frequency, detuneInCents]
  const tones = [
    [110.00,  0 ],    // A2 — root, perfectly in tune
    [164.81,  2 ],    // E3 — perfect fifth, slightly sharp
    [196.00, -2 ],    // G3 — minor seventh, slightly flat
    [220.00,  1 ],    // A3 — octave, barely detuned
    [246.94, -3 ],    // B3 — added ninth (creates tension and openness)
    [329.63,  3 ],    // E4 — fifth an octave up, wider detune = more shimmer
  ]

  for (const [freq, detune] of tones) {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.detune.value = detune
    osc.connect(master)
    osc.start()
    _musicOscs.push(osc)
  }
}

export function stopAmbientMusic(fadeTime = 3.0) {
  if (!_musicMaster) return
  const c = getCtx()
  _musicMaster.gain.setValueAtTime(_musicMaster.gain.value, c.currentTime)
  _musicMaster.gain.linearRampToValueAtTime(0, c.currentTime + fadeTime)

  const oscs = _musicOscs
  setTimeout(() => { oscs.forEach(o => { try { o.stop() } catch (_) {} }) }, (fadeTime + 0.2) * 1000)
  _musicOscs  = []
  _musicMaster = null
}

// ── Utility ───────────────────────────────────────────────────────────────

/**
 * Must be called from a user-gesture handler (click, keydown).
 * Browsers suspend the AudioContext until a user interaction occurs.
 */
export function resumeAudioContext() {
  getCtx()  // creates it if needed
}

/**
 * Returns true if the AudioContext exists and is running.
 */
export function audioIsReady() {
  return ctx !== null && ctx.state === 'running'
}
