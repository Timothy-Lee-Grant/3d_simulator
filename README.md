# 3D Simulator

A first-person 3D world built with vanilla Three.js, running entirely in the browser. No build tools, no npm, no server — just open `index.html`.

## Controls

| Input | Action |
|---|---|
| Click | Lock mouse / start |
| W A S D | Move |
| Arrow Keys | Move (alternate) |
| Mouse | Look around |
| Shift | Sprint |
| ESC | Pause / release mouse |

## Files

| File | Description |
|---|---|
| `index.html` | The game — open this in your browser |
| `ENGINEERING_CONCEPTS.md` | Deep-dive into every concept used in this project |

## How to Run

Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge). No installation required.

## Tech

- **Three.js r128** — 3D rendering via WebGL (loaded from CDN)
- **Pointer Lock API** — mouse capture for first-person look
- **requestAnimationFrame** — the game loop
- **Shadow mapping** with PCF soft shadows
- **Exponential fog** for atmospheric depth

## Learning

If you're new to 3D or browser game development, read `ENGINEERING_CONCEPTS.md`. It covers every concept used here — from the event loop and game loop, to vectors, quaternions, shadow mapping, and delta time — written for engineers coming from a linear programming background.
