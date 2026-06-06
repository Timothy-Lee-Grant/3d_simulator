import { useEffect, useRef } from 'react'
import { resumeAudioContext, startWind, startAmbientMusic } from '../systems/AudioManager'

/**
 * useAudio — initializes the audio system when the game starts.
 *
 * The Web Audio API's AudioContext cannot start automatically — browsers
 * block audio until the user has interacted with the page (clicked, typed, etc.).
 * Our game's first interaction is the pointer-lock click, so we watch for
 * `isLocked` to flip from false to true and boot audio at that moment.
 *
 * This hook is called once in App.jsx. Nothing else needs to import it.
 *
 * @param {boolean} isLocked  true when pointer lock is active (game is running)
 */
export default function useAudio(isLocked) {
  const initialized = useRef(false)

  useEffect(() => {
    // Only initialize once, on the first lock
    if (!isLocked || initialized.current) return
    initialized.current = true

    // Resume/create the AudioContext — this call must be inside a user-gesture
    // callback. Since this effect runs in response to the pointer-lock click,
    // it qualifies as a user gesture.
    resumeAudioContext()

    // Short delay lets the pointer-lock transition fully settle before
    // we start playing audio (avoids a click artifact on some browsers)
    const windTimer  = setTimeout(() => startWind(0.06), 300)
    // Ambient music fades in slowly — start it a beat after the wind
    // so the wind establishes the soundscape first
    const musicTimer = setTimeout(() => startAmbientMusic(0.035), 1200)

    return () => {
      clearTimeout(windTimer)
      clearTimeout(musicTimer)
    }
  }, [isLocked])
}
