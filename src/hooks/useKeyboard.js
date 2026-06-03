import { useEffect, useRef } from 'react'

/**
 * Tracks which keyboard keys are currently held down.
 * Returns a ref (not state) so reads inside useFrame don't trigger re-renders.
 *
 * Usage:
 *   const keys = useKeyboard()
 *   // inside useFrame:
 *   if (keys.current['KeyW']) { ... }
 */
export default function useKeyboard() {
  const keys = useRef({})

  useEffect(() => {
    const onDown = (e) => { keys.current[e.code] = true  }
    const onUp   = (e) => { keys.current[e.code] = false }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)

    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup',   onUp)
    }
  }, [])

  return keys
}
