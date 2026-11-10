# NEON GRID STRIKE

A cyberpunk first-person combat sandbox built with Three.js. The original single-file
prototype has been split into ES modules and rebuilt with concrete PBR materials,
wet reflective streets, bloom / glitch post-processing, a matrix-code sky and detailed
NPC, vehicle, weapon and pickup models.

## Run

ES modules cannot be loaded from `file://`, so serve the folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, etc.). There is no build
step. Three.js 0.160 is loaded from jsDelivr through the import map in `index.html`,
so the first load needs a network connection.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look |
| Left click | Fire |
| `Space` | Jump on foot / brake in a vehicle |
| `E` | Enter or exit the nearest vehicle |
| `M` | City map; click the map to fast travel |
| `Scroll` / `1`–`5` | Switch weapons |
| Click | Lock pointer / respawn after death |
| Touch | Left stick moves, drag to look, tap to fire |

## Mobile

On a phone or tablet the game switches to a touch profile when held in landscape:

- **Left stick** (translucent) moves; it is fixed above the bottom-left corner.
- **Drag** anywhere else to look around.
- **Tap** without dragging to fire the current weapon.
- A rotate prompt blocks play in portrait, and the start screen uses a touch briefing.

The mobile profile lowers the pixel ratio, disables shadow maps, halves reflection
resolution, thins the matrix rain / traffic / crowds, computes bloom at reduced
resolution and refreshes the planar street reflection every other frame. If a
touch device still cannot hold a smooth frame rate, render resolution scales
down automatically (to 0.68x at the floor) and recovers when there is headroom.
Desktop keeps its fixed high-quality 1.5x render scale. Append `?mobile=1` to
force the touch profile on a desktop (useful for testing) or `?mobile=0` to force
the desktop profile on a hybrid device.

The canvas refits the visible viewport on window resize, device rotation, browser
chrome changes and fullscreen, including mobile `visualViewport` updates.

## Module map

| File | Responsibility |
| --- | --- |
| `src/main.js` | Renderer bootstrap, frame loop, wiring |
| `src/config.js` | World tuning, neon palette, weapon stats |
| `src/state.js` | Shared game state, collider spatial grid |
| `src/textures.js` | Procedural concrete, facades, signage, glyph atlas, PBR helpers |
| `src/world.js` | Sky, matrix rain, reflective ground, city generation, jail, drones, holograms |
| `src/entities.js` | Detailed NPCs, vehicles, pickups, AI and per-frame updates |
| `src/player.js` | Pointer-lock controller, weapon rig, firing, vehicles, map |
| `src/mobile.js` | Touch joystick, swipe-look, tap-fire and mobile start flow |
| `src/combat.js` | Damage, explosions, arrests, ragdoll deaths and score |
| `src/effects.js` | Explosion flash, fireball, shockwave, smoke, embers and scorch decals |
| `src/ui.js` | HUD, health bars, messages, minimap and full map |
| `src/postfx.js` | Bloom, chromatic glitch, grain, scanlines, output pass |
| `src/audio.js` | Lazy WebAudio weapon and engine synthesis |

## Rendering notes

WebGL has no hardware ray tracing, so the game uses a ray-traced-style stack:

- a mirrored planar reflection pass on the wet street (`Reflector` + custom shader)
  with puddle masks, ripples and neon grid lines,
- image-based lighting from a procedurally generated PMREM environment,
- shadow-mapped moonlight that follows the player,
- HDR bloom and a chromatic-tearing / scanline post-process.

All concrete, window, signage, glyph and advertising textures are generated on
`<canvas>` at boot, so no texture downloads are required.

The matrix rain is a single `Points` cloud driven by a custom glyph-atlas shader;
the sky dome adds drifting smog bands and occasional row glitches.

## Combat sandbox

Every explosion is a stack of layered effects: a white-hot sprite flash, an expanding
fireball and core, a fast ground shockwave ring, drifting smoke puffs, an ember spray
and a scorch decal that slowly fades off the wet street. A shared point light pulses
with the flash, and nearby bodies already on the floor are thrown again.

Dead NPCs become ragdolls. The torso and limbs detach as rigid pieces, inherit the
shot or blast impulse, tumble under gravity, bounce once off the ground and settle
before sinking away. The number of live ragdoll pieces is capped so corpses cannot
drain the frame rate.

The city is zoned rather than uniform: the outskirts are filled with low modern
houses (stacked volumes, cantilevered slabs, warm window ribbons) and gabled row
houses, the middle ring holds the mid-rise towers, and sparse supertall skyscrapers
reach 230-450 m with setback tiers, neon corner strips, lit crowns and antenna
beacons.

## Tuning

World size, population counts, fog density, reflection resolution and weapon balance
live in `src/config.js`. The mobile quality profile is defined there too; lower
`reflectionSize` or `shadowMapSize` for weaker GPUs.
