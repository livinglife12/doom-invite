# Visual review

## Implemented changes

The original source at `77e32a2` reused a primitive mannequin, applied a mostly edge-lit additive hologram shader, and sent every shrine through one lightning-and-smoke destruction path. These choices weakened character recognition, obscured interior detail and made the exhibits repetitive.

| Area | Current implementation |
| --- | --- |
| Characters | Shaped bodies, individual costume palettes and signature details; all 12 characters use the shared head geometry system. Iron Man, Panther, Spider-Man and Loki artifacts reuse their character heads. |
| Holograms and artifacts | Shaded hologram cores, calmer interference, softer projectors and larger displays. Local Mjolnir and Arc Reactor models provide recognizable focal objects. |
| Destruction | Nine hero-specific profiles vary architecture movement, timing, effect geometry and debris behavior. Bolts use seeded branching; artifact motion follows authored curves. |
| Doom mask | Sharper cached geometry; total tessellation across the complete mesh, halves and assembly parts falls from about 59,164 to 16,088 triangles. |
| Copy and flow | Main captions and plaques use plain character names, and the broadcast presents event information. The visitor experience has no review panel, selectors or sliders. |
| Runtime work | Inactive hologram simulation stops; torch fixtures are instanced; particle updates and uploads follow live particles rather than scanning empty capacity. Shader preparation no longer forces eight complete-world renders. |

## Licensed models

- `public/models/mjolnir.glb`: **mjolner** by **OZZYBOI**, [source](https://poly.pizza/m/dmZcQxpEZl5), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). 35,008 bytes, 558 triangles, three material primitives.
- `public/models/arc-reactor.glb`: **Arc Reactor** by **Heiko Jakob**, [source](https://poly.pizza/m/efgURjIpJbm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). 1,449,532 bytes, 34,346 triangles, four material primitives.

Both GLBs load through Three.js `GLTFLoader`, retain attribution metadata, have centered unit-scale bounds, and require no external textures or decoder extensions. Full attribution is in [ASSET_CREDITS.md](ASSET_CREDITS.md) and `/models/LICENSES.txt` in the app.

## Verification and performance evidence

`npm run verify:visuals` and `npm run verify:effects` pass. They check character rigs and poses, finite geometry, shared animation uniforms and heads, local model integrity, particle lifecycle and seeded effect behavior. Production browser inspection of the latest changes is reported separately when complete.

Concrete structural reductions are 60 to 3 torch fixture draws, removal of startup off-screen world renders and whole-world shader compilation, and 12 to 0 active hologram animation callbacks while all exhibits are inactive. A single active exhibit advances its own reconstruction; the Fantastic Four advances its four members.

Playback now defaults to balanced DPR 1 without fullscreen postprocessing, MSAA, shadow rendering or a volumetric flashlight. Stage visibility removes inactive lights from Three's lighting passes. Hidden tabs pause rendering, GSAP playback and active audio without resuming previously paused media. Completed shrine-rise transforms stop changing, and cloth updates are limited to 20 Hz. One wide view is retained for every shrine stage and the four-member memorial; close-ups have been removed. `npm run verify:playback` exercises the actual director timelines, desktop/phone projection, quality budgets, staged adaptation, pause ownership and active light selection.

A local CPU particle-helper benchmark used a capacity of 420 and 20,000 updates per case:

| Live particles | Previous helper | Updated helper |
| --- | ---: | ---: |
| 12 | 28.8 ms | 13.7 ms |
| 42 | 41.8 ms | 25.9 ms |
| 420 | 204.2 ms | 203.9 ms |

The improvement comes from sparse pools; full pools remain effectively unchanged. These helper timings and draw-count reductions are not measurements of browser FPS. No measured frame-rate improvement is claimed.

## Internal QA and remaining limits

Use `/?debug&scene=ironman&mode=artifact&p=.05&q=mid` for developer inspection without rendered controls. `scene` accepts `strange`, `loki`, `thor`, `ironman`, `cap`, `hulk`, `panther`, `spider` and `ff`; `mode` accepts `holo`, `artifact` and `destruction`; optional `p` holds normalized progress. Normal visits, including old `?review` links, start at the television.

Bodies remain stylized procedural rigs, not photorealistic movie likenesses or imported rigged character bodies. Destruction is authored animation, instanced debris and dissolves rather than rigid-body fracture simulation. Fan-created asset licenses cover their creators' model contributions, not ownership of Marvel characters or trademarks. Automated geometry/effect checks do not prove device frame rate, every cinematic transition, or hosted RSVP delivery.
