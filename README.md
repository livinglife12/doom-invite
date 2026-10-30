# Doom Invites You

A cinematic, portrait-first 3D RSVP for a Doomsday watch party, built with Next.js, React Three Fiber, Drei, GSAP and postprocessing. Procedural characters, architecture and effects are combined with two locally hosted, freely licensed models: Mjolnir and an Arc Reactor. See [asset credits](docs/ASSET_CREDITS.md); the app links to `/models/LICENSES.txt`.

```sh
npm install
npm run dev            # http://localhost:3000
npm run build
npm start
npm run verify:visuals # rigs, poses, shared heads, uniforms and GLBs
npm run verify:effects # particle pools, seeded bolts and effect lifecycle
npm run verify:room    # seated contacts, statue props and flashlight discovery
```

## The experience

1. Turn the television dial to receive the broadcast and event information.
2. Explore the throne room with a mouse- or touch-controlled flashlight. Hold its beam on the switch to activate it; tapping and a delayed prompt provide alternatives.
3. Enter the hall and activate nine exhibits. Each reveals its architecture, artifact, figurine, clippings and animated hologram before its own destruction sequence.
4. The hall collapses into the mask assembly, followed by the RSVP form and signature.
5. The signed page burns away; the invitation can then be replayed.

The main captions and plaques identify characters by their names. The broadcast presents party information without repeated epithets and boast captions. SKIP advances the current sequence; SOUND toggles audio. Quality is detected automatically and can be forced with `?q=low|mid|high`.

## Characters, artifacts and effects

Doom now sits centrally on an intact throne, with supported forearms, grounded boots, silver armor, a green hood/tunic/cape and paired clasps. Captain America and Thor are carved sculptures facing incoming visitors, with a readable shield face and lowered Mjolnir. The room's Strange sculpture is intact, and the discarded Iron Man helmet shares the canonical head geometry. See [throne-room accuracy notes](docs/THRONE_ROOM.md).

All 12 character bodies remain stylized articulated rigs with individual proportions, costume palettes, emblems and signature props. Their heads use a shared geometry system with distinct face, hair, helmet and mask shapes. Iron Man, Black Panther, Spider-Man and Loki artifacts reuse that head geometry so the display objects agree with their characters. Holograms use a shaded core and restrained scanlines; larger displays and softer projection cones preserve costume detail.

The imported `public/models/mjolnir.glb` and `public/models/arc-reactor.glb` are centered, normalized and merged by material. Per-exhibit materials isolate each dissolve. Doom's sharper mask geometry is cached and uses approximately 16,088 triangles across its complete mesh, halves and assembly parts, down from 59,164.

| Exhibit | Destruction treatment |
| --- | --- |
| Doctor Strange | Contracting portals draw the structure inward. |
| Loki | Gold illusion fragments rise as the structure narrows away. |
| Thor | Branched storm strikes throw columns outward. |
| Iron Man | An EMP pulse and arcs precede staggered power-down drops. |
| Captain America | A lateral fracture separates the structure. |
| Hulk | A ground impact launches debris before the structure falls. |
| Black Panther | A violet kinetic burst expands and recoils inward. |
| Spider-Man | Silk strands snap separately as the structure falls backward. |
| Fantastic Four | Four effect channels and staggered falls dismantle the memorial. |

Bolts use seeded branches, artifact motion follows authored curves, and particle pools update only their live prefix. Hidden holograms stop advancing, torch fixtures are instanced into three draws, and startup uses one small off-screen render plus asynchronous shader preparation. Adaptive quality ignores startup stalls and hidden tabs, then permits one sustained-performance downgrade without rebuilding scene resources.

## Internal scene verification

Normal visits play the introduction. There are no rendered scene selectors, review controls or sliders. For development QA only, open:

```text
http://localhost:3000/?debug&scene=ironman&mode=artifact&p=.05&q=mid
```

The `debug` parameter is required. `scene` accepts `strange`, `loki`, `thor`, `ironman`, `cap`, `hulk`, `panther`, `spider` or `ff`; `mode` accepts `holo`, `artifact` or `destruction`; optional `p` holds progress from 0 to 1. Developer-console helpers are available through `window.__doom.review`. Old `?review` links no longer bypass the introduction.

See [visual review and validation limits](docs/VISUAL_REVIEW.md).

## Customise

- **Party details**: `src/config/event.js`.
- **Exhibit content**: `src/config/shrines.js`.
- **Characters**: `src/lib/heroes.js`, `src/lib/figure.js` and `src/lib/heroHeadGeometry.js`. Preserve the `{ root, j, parts }` interface when replacing a rig.
- **Artifacts / imported models**: `src/scene/Relics.jsx` and `src/scene/ModelAsset.jsx`. Preserve the [CC BY 3.0 attribution](docs/ASSET_CREDITS.md).
- **Altar architecture / destruction**: `src/scene/Shrine.jsx` and `src/scene/AltarDestruction.jsx`.
- **Particles / bolts**: `src/lib/particles.js`.
- **Story timing / camera**: `src/director.js`; internal QA framing is in `src/review.js`.
- **Button faces**: `buttonCanvas` in `src/lib/textures.js`; original clips are in `public/buttons/`.
- **RSVP delivery**: POST `/api/rsvp` appends to `data/rsvps.json` when self-hosted. Set `RSVP_ADMIN_KEY` to inspect submissions through `/api/rsvp?key=...`. Serverless files are not persistent; configure `NEXT_PUBLIC_RSVP_ENDPOINT` for a persistent external form service or backend.
