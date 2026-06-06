/**
 * pointerLock.js — module-level store for the pointer-lock request function.
 *
 * LockBridge (App.jsx) stores `gl.domElement.requestPointerLock` here once the
 * Canvas mounts. Any module (Overlay.jsx, Player.jsx) can then call requestLock()
 * without needing access to the Canvas context or prop drilling.
 *
 * Why not Zustand? gl.domElement is a live DOM node, not serialisable state.
 * A plain module variable is the right tool for this one-off reference.
 */

let _requestLock = null

/** Called by LockBridge on Canvas mount to register the lock function. */
export function setLockFn(fn) {
  _requestLock = fn
}

/**
 * Request pointer lock. Must be called from within a user-gesture event
 * handler (click, keydown) for browsers to grant it.
 */
export function requestLock() {
  _requestLock?.()
}
