import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildFigure } from './figure'
import { buildHeroHead } from './heroHeadGeometry'

// Shared articulated costumes for the miniature, reconstruction, and final ghosts. Geometry
// carries the identifying details even in monochrome stone; colours clarify the holograms.
const cache = {}
const memo = (key, make) => cache[key] || (cache[key] = make())
const sphere = () => memo('sphere', () => new THREE.SphereGeometry(1, 16, 12))
const box = () => memo('box', () => new THREE.BoxGeometry(1, 1, 1))
const cylinder = () => memo('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 24))
const cone = () => memo('cone', () => new THREE.ConeGeometry(1, 1, 12))
const rock = () => memo('rock', () => new THREE.DodecahedronGeometry(1, 0))
const torus = () => memo('torus', () => new THREE.TorusGeometry(1, 0.055, 6, 32))
const shape = (key, points) => memo(key, () => {
  const path = new THREE.Shape()
  points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y))
  path.closePath()
  return new THREE.ExtrudeGeometry(path, { depth: 0.06, bevelEnabled: false })
})
const star = () => shape('star', Array.from({ length: 10 }, (_, i) => {
  const angle = Math.PI / 2 + i * Math.PI / 5
  return [Math.cos(angle) * (i % 2 ? 0.42 : 1), Math.sin(angle) * (i % 2 ? 0.42 : 1)]
}))
const BUILDS = {
  strange: { bulk: 1, cape: true, collar: true }, loki: { bulk: 0.95, cape: true, horns: true },
  thor: { bulk: 1.23, cape: true, wings: true }, ironman: { bulk: 1.16 }, cap: { bulk: 1.1, wings: true },
  hulk: { bulk: 1.8, headScale: 1.2 }, panther: { bulk: 1 }, spider: { bulk: 0.91 },
  reed: { bulk: 0.92 }, sue: { bulk: 0.85 }, johnny: { bulk: 0.96 }, ben: { bulk: 1.72, headScale: 1.25 },
}
const PALETTES = {
  strange: ['#234a7b', '#b52e40', '#d6ad88', '#201f27', '#d5ad4c'],
  loki: ['#226049', '#153e31', '#d7b18d', '#171d21', '#e0bb55'],
  thor: ['#384b62', '#b93642', '#dab18f', '#d6b16c', '#c3d5e2'],
  ironman: ['#ad2435', '#d7a746', '#ad2435', '#5a1c28', '#dbefff'],
  cap: ['#254f89', '#b62e42', '#deb899', '#183051', '#f1eee6'],
  hulk: ['#6aab54', '#5c3b74', '#6aab54', '#202b25', '#c4d2ac'],
  panther: ['#46516b', '#9d68e5', '#46516b', '#252e40', '#d4dde8'],
  spider: ['#c52e42', '#254c93', '#c52e42', '#202638', '#f3f8ff'],
  reed: ['#2865a4', '#172c45', '#dbb49b', '#343743', '#f0f3ee'],
  sue: ['#2865a4', '#172c45', '#e0bca1', '#d3b676', '#f0f3ee'],
  johnny: ['#ed6e2d', '#ffbb50', '#ed6e2d', '#b53b26', '#ffdf83'],
  ben: ['#d28a4b', '#28518b', '#d28a4b', '#8a5438', '#e7dfbd'],
}

// Every uniform except colour stays shared with the caller, so all costume colours scan,
// lose power and dissolve together without a second animation loop or per-frame allocations.
function tint(source, color, monochrome) {
  if (!source.uniforms?.uColor || monochrome) return source
  const material = source.clone()
  material.uniforms = { ...source.uniforms, uColor: { value: new THREE.Color(color) } }
  return material
}

export function buildHero(id, mat, o = {}) {
  const build = BUILDS[id] || { bulk: 1 }
  const fig = buildFigure(mat, { ...build, horns: false, wings: false, shadows: o.shadows })
  const { j, surfaces } = fig
  const paletteMaterials = new Map()
  const colorMaterial = color => {
    if (!paletteMaterials.has(color)) paletteMaterials.set(color, tint(mat, color, o.monochrome))
    return paletteMaterials.get(color)
  }
  const defaults = (PALETTES[id] || PALETTES.reed).map(colorMaterial)
  const override = o.materials || {}
  const body = override.body || defaults[0], accent = override.accent || defaults[1]
  const skin = override.skin || defaults[2], dark = override.dark || defaults[3], trim = override.trim || defaults[4]
  const light = override.light || o.glow || colorMaterial('#e9f7ff')
  const parts = {}
  const k = build.bulk
  const add = (geometry, parent, position, scale, material = body, rotation) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position); mesh.scale.set(...scale)
    if (rotation) mesh.rotation.set(...rotation)
    mesh.castShadow = !!o.shadows
    parent.add(mesh); fig.meshes.push(mesh)
    return mesh
  }
  const dress = (regions, material) => regions.forEach(region => surfaces[region]?.forEach(mesh => { mesh.material = material }))
  dress(Object.keys(surfaces), body)
  dress(['head', 'skin', 'hands'], skin); dress(['cape', 'collar'], accent); dress(['horns', 'wings'], trim)
  const disc = (parent, position, radius, depth, material) => add(cylinder(), parent, position, [radius, depth, radius], material, [Math.PI / 2, 0, 0])
  const bar = (parent, a, b, width, material = trim) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
    const mesh = add(cylinder(), parent, start.clone().add(end).multiplyScalar(0.5).toArray(), [width, start.distanceTo(end), width], material)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize())
    return mesh
  }
  const belt = (material = dark) => add(sphere(), j.spine, [0, 0.035, 0.002], [0.079 * k, 0.015, 0.047 * k], material)
  const boots = (material = dark) => {
    dress(['feet', 'shins'], material)
    for (const side of ['l', 'r']) add(cylinder(), j[side + 'Knee'], [0, -0.1, 0], [0.035 * k, 0.04, 0.031 * k], material)
  }
  const gloves = (material = accent) => {
    dress(['hands', 'forearms'], material)
    for (const side of ['l', 'r']) add(cylinder(), j[side + 'Elbow'], [0, -0.055, 0], [0.028 * k, 0.022, 0.027 * k], material)
  }
  const emblem4 = () => {
    disc(j.spine, [0.034, 0.237, 0.078 * k], 0.029, 0.003, trim)
    disc(j.spine, [0.034, 0.237, 0.082 * k], 0.024, 0.003, dark)
    add(shape('four', [[-0.2, 0.9], [-0.65, -0.15], [0.25, -0.15], [0.25, -0.8], [0.55, -0.8], [0.55, 0.9], [0.25, 0.9], [0.25, 0.14], [-0.19, 0.14], [0.12, 0.9]]), j.spine, [0.034, 0.237, 0.086 * k], [0.02, 0.02, 0.03], trim)
  }
  const suit = () => {
    dress(['hands', 'feet'], dark); belt(dark)
    for (const s of [-1, 1]) bar(j.spine, [s * 0.08 * k, 0.08, 0.035], [s * 0.097 * k, 0.24, 0.03], 0.008, dark)
    emblem4()
  }
  switch (id) {
    case 'strange': {
      boots(dark); belt(dark); dress(['hands'], skin)
      for (const s of [-1, 1]) {
        bar(j.spine, [s * 0.07, 0.29, 0.035], [s * 0.012, 0.17, 0.062], 0.007, dark)
      }
      add(shape('tabard', [[-1, 1], [1, 1], [0.65, -1], [-0.65, -1]]), j.hips, [0, -0.025, 0.06], [0.068, 0.14, 0.05], body)
      parts.eye = disc(j.spine, [0, 0.22, 0.075], 0.019, 0.005, trim)
      add(torus(), j.spine, [0, 0.22, 0.08], [0.024, 0.014, 0.024], trim)
      disc(j.spine, [0, 0.22, 0.083], 0.008, 0.003, light)
      break
    }
    case 'loki': {
      boots(dark); gloves(dark); belt(trim)
      for (const s of [-1, 1]) {
        bar(j.spine, [s * 0.084, 0.285, 0.04], [0, 0.12, 0.06], 0.008, trim)
        bar(j.spine, [s * 0.06, 0.07, 0.048], [s * 0.055, 0.23, 0.057], 0.004, trim)
        add(shape('dagger', [[-0.13, -0.2], [0, 1], [0.13, -0.2]]), j[s === 1 ? 'lHand' : 'rHand'], [0, -0.045, 0.008], [0.04, 0.095, 0.03], trim, [0, 0, s * 0.28])
      }
      break
    }
    case 'thor': {
      boots(dark); gloves(trim); belt(trim)
      dress(['upperArms', 'elbows'], skin); dress(['head'], trim)
      for (const s of [-1, 1]) for (const y of [0.11, 0.19, 0.265]) disc(j.spine, [s * 0.047 * k, y, 0.077 * k], 0.023, 0.008, trim)
      const hammer = new THREE.Group()
      add(cylinder(), hammer, [0, -0.045, 0], [0.009, 0.15, 0.009], dark)
      for (let i = 0; i < 5; i++) add(cylinder(), hammer, [0, -0.1 + i * 0.02, 0], [0.011, 0.005, 0.011], trim)
      parts.hammerHead = add(box(), hammer, [0, -0.145, 0], [0.12, 0.065, 0.065], trim)
      for (const s of [-1, 1]) add(box(), hammer, [s * 0.062, -0.145, 0], [0.012, 0.052, 0.052], dark)
      hammer.rotation.x = Math.PI; hammer.position.set(0, -0.005, 0.01)
      j.rHand.add(hammer); parts.hammer = hammer
      break
    }
    case 'ironman': {
      dress(['head', 'skin', 'hands'], body); belt(dark)
      for (const side of ['l', 'r']) {
        const s = side === 'l' ? 1 : -1
        add(sphere(), j.spine, [s * 0.125, 0.27, 0], [0.053, 0.046, 0.053], body)
        add(box(), j.spine, [s * 0.049, 0.227, 0.058], [0.075, 0.074, 0.032], body, [0, s * 0.12, s * 0.1])
        add(sphere(), j[side + 'Shoulder'], [0, -0.07, 0.007], [0.032, 0.073, 0.033], accent)
        add(box(), j[side + 'Elbow'], [0, -0.095, 0.014], [0.05, 0.13, 0.05], body)
        add(box(), j[side + 'Hip'], [0, -0.11, 0.017], [0.058, 0.15, 0.04], accent)
        add(box(), j[side + 'Knee'], [0, -0.12, 0.012], [0.061, 0.17, 0.05], body)
        parts[side + 'Palm'] = disc(j[side + 'Elbow'], [0, -0.18, 0.027], 0.011, 0.004, light)
      }
      disc(j.spine, [0, 0.22, 0.077], 0.031, 0.007, dark)
      parts.reactor = disc(j.spine, [0, 0.22, 0.085], 0.023, 0.005, light)
      for (const y of [0.08, 0.12, 0.16]) add(box(), j.spine, [0, y, 0.051], [0.084, 0.024, 0.016], accent)
      break
    }
    case 'cap': {
      boots(accent); gloves(accent); belt(dark); dress(['head'], body)
      add(star(), j.spine, [0, 0.225, 0.083], [0.043, 0.043, 0.07], trim)
      for (let x = -2; x <= 2; x++) add(box(), j.spine, [x * 0.025, 0.1, 0.045], [0.024, 0.1, 0.016], x % 2 ? accent : trim)
      for (const s of [-1, 1]) bar(j.spine, [s * 0.075, 0.285, 0.043], [s * 0.047, 0.04, 0.06], 0.005, dark)
      const shield = new THREE.Group()
      for (const [radius, y, material] of [[0.151, 0, accent], [0.125, 0.006, trim], [0.101, 0.012, accent], [0.076, 0.018, body]]) add(cylinder(), shield, [0, y, 0], [radius, 0.01, radius], material)
      add(star(), shield, [0, 0.029, 0], [0.06, 0.06, 0.08], trim, [-Math.PI / 2, 0, 0])
      shield.rotation.x = Math.PI / 2; shield.position.set(0, -0.1, 0.058)
      j.lElbow.add(shield); parts.shield = shield
      break
    }
    case 'hulk': {
      dress(['hips', 'thighs'], accent); belt(accent)
      for (const s of [-1, 1]) {
        add(sphere(), j.spine, [s * 0.084, 0.225, 0.062], [0.087, 0.067, 0.049], body)
        add(sphere(), j.spine, [s * 0.035, 0.135, 0.071], [0.045, 0.063, 0.027], body)
      }
      for (const side of ['l', 'r']) {
        add(sphere(), j[side + 'Shoulder'], [0, -0.07, 0], [0.067, 0.083, 0.062], body)
        add(sphere(), j[side + 'Elbow'], [0, -0.18, 0.012], [0.061, 0.06, 0.053], body)
        for (const x of [-1, 0, 1]) add(cone(), j[side + 'Hip'], [x * 0.032, -0.215, 0.024], [0.025, 0.055, 0.03], accent, [Math.PI, 0, 0])
        add(sphere(), j[side + 'Knee'], [0, -0.212, 0.045], [0.055, 0.032, 0.081], body)
      }
      break
    }
    case 'panther': {
      dress(['head', 'skin', 'hands'], body)
      for (const s of [-1, 1]) {
        bar(j.spine, [s * 0.069, 0.269, 0.04], [s * 0.016, 0.18, 0.063], 0.003, accent)
      }
      parts.necklace = add(torus(), j.spine, [0, 0.278, 0.01], [0.069, 0.047, 0.047], trim, [0.2, 0, 0])
      for (let i = 0; i < 7; i++) {
        const angle = Math.PI * (0.15 + i * 0.7 / 6)
        add(cone(), j.spine, [Math.cos(angle) * 0.067, 0.276 - Math.sin(angle) * 0.04, 0.058], [0.008, 0.025, 0.005], trim, [0, 0, Math.PI])
      }
      for (const side of ['l', 'r']) for (const x of [-0.014, 0, 0.014]) add(cone(), j[side + 'Elbow'], [x, -0.219, 0.012], [0.003, 0.031, 0.003], trim, [Math.PI, 0, 0])
      break
    }
    case 'spider': {
      dress(['thighs', 'hips', 'upperArms'], accent); dress(['head', 'skin', 'hands', 'shins', 'feet'], body)
      for (const s of [-1, 1]) {
        bar(j.spine, [s * 0.018, 0.04, 0.048], [s * 0.07, 0.29, 0.065], 0.0018, dark)
      }
      for (const y of [0.09, 0.145, 0.2, 0.255]) bar(j.spine, [-0.07, y, 0.066], [0.07, y, 0.066], 0.0017, dark)
      add(sphere(), j.spine, [0, 0.221, 0.069], [0.009, 0.017, 0.006], dark)
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const y = 0.202 + i * 0.012
        bar(j.spine, [s * 0.005, 0.219, 0.069], [s * 0.022, y, 0.07], 0.0025, dark)
        bar(j.spine, [s * 0.022, y, 0.07], [s * 0.033, y + (i < 2 ? -0.014 : 0.014), 0.069], 0.002, dark)
      }
      parts.webHand = j.rHand
      break
    }
    case 'reed': {
      suit()
      break
    }
    case 'sue': {
      suit()
      break
    }
    case 'johnny': {
      for (const side of ['l', 'r']) for (let i = 0; i < 3; i++) add(cone(), j[side + 'Elbow'], [0, -0.045 - i * 0.04, -0.022], [0.02, 0.065, 0.02], accent, [-0.5, 0, 0])
      break
    }
    case 'ben': {
      dress(['hips'], accent)
      const plates = (parent, rows, cols, width, height, depth) => {
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
          const x = (col - (cols - 1) / 2 + (row % 2 ? 0.16 : -0.16)) * width
          add(rock(), parent, [x, row * height, depth], [width * 0.64, height * 0.63, width * 0.42], (row + col) % 5 ? body : skin, [row * 0.3, col * 0.7, row + col])
        }
      }
      plates(j.spine, 5, 5, 0.065, 0.058, 0.072)
      for (const side of ['l', 'r']) {
        for (const joint of ['Shoulder', 'Elbow', 'Hip', 'Knee']) for (let i = 0; i < 4; i++) add(rock(), j[side + joint], [0, -0.025 - i * 0.048, 0.022], [joint === 'Hip' ? 0.061 : 0.059, 0.036, 0.048], body, [i * 0.3, i, 0.2])
        add(rock(), j[side + 'Elbow'], [0, -0.19, 0.02], [0.073, 0.061, 0.062], body)
      }
      belt(accent)
      break
    }
    default: break
  }

  // Every mask and face uses the same sculpt as its matching relic. Remove the base rig's
  // temporary head and any legacy costume pieces before attaching the centred replacement.
  j.head.clear()
  const headTrim = override.headTrim || (id === 'strange' ? colorMaterial('#b8bec9') : trim)
  const head = buildHeroHead(id, { primary: body, secondary: accent, skin, hair: dark, metal: headTrim, eye: light }, { shadows: o.shadows })
  head.root.position.y = .07
  j.head.add(head.root)
  j.headMesh = head.meshes[0]
  if (id === 'ironman') parts.eyes = head.meshes.filter(mesh => mesh.material === light)

  // Batch details within a rigid joint and material, preserving the rig and animated props.
  const protectedObjects = new Set(Object.values(parts).flat().filter(object => object?.isMesh))
  const groups = []
  fig.root.traverse(object => { if (object.isGroup) groups.push(object) })
  for (const group of groups) {
    const byMaterial = new Map()
    for (const mesh of [...group.children]) {
      if (!mesh.isMesh || protectedObjects.has(mesh) || mesh === j.cape || mesh === j.headMesh) continue
      const list = byMaterial.get(mesh.material) || []; list.push(mesh); byMaterial.set(mesh.material, list)
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue
      meshes.forEach(mesh => mesh.updateMatrix())
      const signature = meshes.map(mesh => `${mesh.geometry.uuid}:${mesh.matrix.elements.join(',')}`).join('|')
      const geometry = memo(`batch:${signature}`, () => {
        const geometries = meshes.map(mesh => {
          const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix)
          for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(key)) geometry.deleteAttribute(key)
          // Mirrored costume pieces need their winding corrected after baking their transform.
          if (mesh.matrix.determinant() < 0) for (const attribute of Object.values(geometry.attributes)) {
            const { array, itemSize, count } = attribute
            for (let vertex = 0; vertex < count; vertex += 3) for (let component = 0; component < itemSize; component++) {
              const a = (vertex + 1) * itemSize + component, b = (vertex + 2) * itemSize + component
              const value = array[a]; array[a] = array[b]; array[b] = value
            }
          }
          return geometry
        })
        const merged = mergeGeometries(geometries, false)
        geometries.forEach(geometry => geometry.dispose())
        return merged
      })
      if (!geometry) continue
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = !!o.shadows
      meshes.forEach(child => group.remove(child)); group.add(mesh)
    }
  }
  fig.meshes = []
  fig.root.traverse(object => { if (object.isMesh) fig.meshes.push(object) })
  return { ...fig, parts }
}
