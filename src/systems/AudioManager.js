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
