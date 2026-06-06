# 3D Models

Place `.glb` files here. They'll be accessible at `/models/filename.glb`.

## Free CC0 model sources

| Source | Best for |
|---|---|
| [Quaternius](https://quaternius.com/) | Low-poly characters, nature, buildings |
| [KhronosGroup samples](https://github.com/KhronosGroup/glTF-Sample-Assets) | PBR test models (DamagedHelmet, Sponza, etc.) |
| [Sketchfab](https://sketchfab.com/features/free-3d-models) | Filter by CC0 or CC BY |

## Suggested downloads for this project

| File | Where to get it |
|---|---|
| `tree.glb` | Quaternius Ultimate Nature Pack |
| `character.glb` | Quaternius Ultimate Platformer Pack |
| `rock.glb` | Quaternius Ultimate Nature Pack |

## Loading in code

```jsx
import { GLTFWithFallback } from '../components/GLTFModel'
import ProceduralTree from './Trees'

<GLTFWithFallback
  url="/models/tree.glb"
  fallback={<ProceduralTree position={[5, 0, -10]} />}
  position={[5, 0, -10]}
/>
```

The `GLTFWithFallback` component automatically shows the fallback when the file doesn't exist.
