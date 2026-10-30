# Asset credits

These models are stored locally so the experience does not depend on a third-party asset host at runtime. Both source pages explicitly offer free downloads under Creative Commons Attribution 3.0. Keep these credits available when distributing the experience.

| Local asset | Model and creator | Source | License | Changes made |
| --- | --- | --- | --- | --- |
| `public/models/mjolnir.glb` | **mjolner** by **OZZYBOI** | [Poly Pizza](https://poly.pizza/m/dmZcQxpEZl5) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Recentered and uniformly scaled; meshes merged by material for fewer draw calls. Runtime material and lighting adjustments. |
| `public/models/arc-reactor.glb` | **Arc Reactor** by **Heiko Jakob** | [Poly Pizza](https://poly.pizza/m/efgURjIpJbm) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Recentered and uniformly scaled; meshes merged by material for fewer draw calls. Runtime material and lighting adjustments. |

Downloaded and source licenses checked on **29 October 2026**. GLB metadata also preserves the source, author, license and modification notes. These are fan-created model assets; their Creative Commons licenses cover the creators' model contributions and do not grant ownership of Marvel characters or trademarks. This project is a fan watch-party invitation and claims no official affiliation.

Remaining character figures, relics and visual effects are authored procedurally in the project, rather than extracted from commercial games. No paid model, restricted viewer extraction, or asset with an unknown license is included.

## Re-download sources

- mjolner original GLB: `https://static.poly.pizza/677ba798-2813-4cd7-82d1-4f893225d08b.glb`
- Arc Reactor original GLB: `https://static.poly.pizza/a044d325-5a97-42e4-8e5e-18e0961d8da0.glb`

To reproduce the optimization, group source primitives by material, retain positions/normals/triangle indices, recenter at the bounding-box center and uniformly scale the longest dimension to one unit. No Draco or Meshopt decoder is required.
