import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildHero } from './heroes'
import { setPose } from './figure'

export const ROOM_STATUES = [
  { hero: 'cap', position: [-7.1, 0, -10.6], yaw: 0.4, scale: 3.6 },
  { hero: 'thor', position: [7, 0, -16.2], yaw: -0.35, scale: 3.7 },
]
export const STATUE_PLINTH_TOP = 0.78

const cache = new Map()
const geometry = (key, create) => {
  if (!cache.has(key)) cache.set(key, create())
  return cache.get(key)
}
const cylinder = (radius, height, segments = 20) => geometry(`cylinder:${radius}:${height}:${segments}`, () => new THREE.CylinderGeometry(radius, radius, height, segments))
const box = (x, y, z) => geometry(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z))
function bevelBox(key, width, height, depth, bevel) {
  return geometry(key, () => {
    const outline = new THREE.Shape()
    outline.moveTo(-width / 2 + bevel, -height / 2)
    outline.lineTo(width / 2 - bevel, -height / 2)
    outline.lineTo(width / 2, -height / 2 + bevel)
    outline.lineTo(width / 2, height / 2 - bevel)
    outline.lineTo(width / 2 - bevel, height / 2)
    outline.lineTo(-width / 2 + bevel, height / 2)
    outline.lineTo(-width / 2, height / 2 - bevel)
    outline.lineTo(-width / 2, -height / 2 + bevel)
    outline.closePath()
    const result = new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: true, bevelThickness: bevel * 0.45, bevelSize: bevel * 0.45, bevelSegments: 2 })
    result.translate(0, 0, -depth / 2)
    return result
  })
}
function add(parent, shape, material, position = [0, 0, 0], rotation) {
  const mesh = new THREE.Mesh(shape, material)
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

const SHIELD_RADIUS = 0.18
const dishZ = radius => 0.027 * (1 - (radius / SHIELD_RADIUS) ** 2)
function shieldBand(inner, outer) {
  return geometry(`shield:${inner}:${outer}`, () => {
    const positions = [], uv = [], indices = []
    const rings = 5, segments = 72
    for (let row = 0; row <= rings; row++) {
      const radius = THREE.MathUtils.lerp(inner, outer, row / rings)
      for (let k = 0; k <= segments; k++) {
        const angle = k / segments * Math.PI * 2
        positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, dishZ(radius))
        uv.push(Math.cos(angle) * radius / SHIELD_RADIUS / 2 + 0.5, Math.sin(angle) * radius / SHIELD_RADIUS / 2 + 0.5)
      }
    }
    for (let row = 0; row < rings; row++) for (let k = 0; k < segments; k++) {
      const a = row * (segments + 1) + k, b = a + segments + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    result.setIndex(indices)
    result.computeVertexNormals()
    return result
  })
}
function shieldStar() {
  return geometry('room-shield-star', () => {
    const outline = new THREE.Shape()
    for (let k = 0; k < 10; k++) {
      const angle = Math.PI / 2 + k * Math.PI / 5
      const radius = k % 2 ? 0.026 : 0.062
      k ? outline.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius) : outline.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    outline.closePath()
    const result = new THREE.ExtrudeGeometry(outline, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2 })
    const position = result.attributes.position
    for (let i = 0; i < position.count; i++) position.setZ(i, position.getZ(i) + dishZ(Math.hypot(position.getX(i), position.getY(i))) + 0.0015)
    result.computeVertexNormals()
    return result
  })
}
function makeShield(materials) {
  const shield = new THREE.Group()
  shield.name = 'captain-america-carved-shield'
  shield.userData.front = new THREE.Vector3(0, 0, 1)
  add(shield, shieldBand(0.14, SHIELD_RADIUS), materials.bronze)
  add(shield, shieldBand(0.107, 0.14), materials.relief)
  add(shield, shieldBand(0.074, 0.107), materials.bronze)
  add(shield, shieldBand(0.001, 0.074), materials.suit)
  const star = add(shield, shieldStar(), materials.relief)
  star.name = 'shield-raised-five-point-star'
  add(shield, geometry('shield-rim', () => new THREE.TorusGeometry(SHIELD_RADIUS, 0.003, 8, 72)), materials.metal)
  const back = add(shield, geometry('shield-back', () => new THREE.CircleGeometry(SHIELD_RADIUS - 0.003, 64)), materials.dark, [0, 0, -0.006], [0, Math.PI, 0])
  back.name = 'shield-concave-back'
  // Rear straps sit around the forearm; the star always belongs to the outward face.
  for (const x of [-0.045, 0.045]) add(shield, geometry('shield-strap', () => new THREE.TorusGeometry(0.024, 0.004, 6, 20, Math.PI)), materials.dark, [x, 0, -0.027], [Math.PI / 2, 0, Math.PI / 2])
  return shield
}
function makeHammer(materials) {
  const hammer = new THREE.Group()
  hammer.name = 'thor-carved-mjolnir'
  add(hammer, cylinder(0.009, 0.18), materials.dark, [0, -0.035, 0])
  for (let k = 0; k < 8; k++) add(hammer, cylinder(0.0105, 0.004), materials.bronze, [0, 0.035 - k * 0.019, 0])
  const head = add(hammer, bevelBox('mjolnir-chamfered-head', 0.154, 0.081, 0.078, 0.012), materials.relief, [0, -0.166, 0])
  head.name = 'mjolnir-square-head'
  // End caps and the raised central collar echo the hammer's forged construction.
  for (const side of [-1, 1]) add(hammer, bevelBox('mjolnir-end-cap', 0.011, 0.059, 0.059, 0.002), materials.metal, [side * 0.075, -0.166, 0])
  add(hammer, cylinder(0.013, 0.018), materials.metal, [0, -0.118, 0])
  const loop = add(hammer, geometry('mjolnir-wrist-loop', () => new THREE.TorusGeometry(0.022, 0.0035, 6, 24)), materials.dark, [0, 0.071, 0])
  loop.scale.y = 1.4
  return hammer
}

function bakeStoneBody(figure, protectedRoots) {
  figure.root.updateMatrixWorld(true)
  const inverse = figure.root.matrixWorld.clone().invert(), batches = new Map(), owned = []
  figure.root.traverse(mesh => {
    if (!mesh.isMesh) return
    for (let parent = mesh; parent; parent = parent.parent) if (protectedRoots.has(parent)) return
    const list = batches.get(mesh.material) || []
    list.push(mesh); batches.set(mesh.material, list)
  })
  for (const [material, meshes] of batches) {
    const pieces = meshes.map(mesh => {
      const result = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      result.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld))
      for (const name of Object.keys(result.attributes)) if (!['position', 'normal', 'uv'].includes(name)) result.deleteAttribute(name)
      return result
    })
    const merged = mergeGeometries(pieces, false)
    pieces.forEach(piece => piece.dispose())
    if (!merged) continue
    owned.push(merged)
    meshes.forEach(mesh => mesh.removeFromParent())
    const mesh = add(figure.root, merged, material)
    mesh.name = 'baked-carved-body'
  }
  return owned
}

// These are static sculptures, with colour expressed as carved stone and metal inlays.
// The existing animated heroes keep their original rig and materials.
export function buildRoomStatue(hero, materials) {
  if (!['cap', 'thor'].includes(hero)) throw new Error('Unknown room statue: ' + hero)
  const figure = buildHero(hero, materials.stone, { shadows: true, materials: {
    body: materials.suit, accent: hero === 'thor' ? materials.cape : materials.bronze,
    skin: materials.stone, dark: materials.dark, trim: materials.relief,
    light: materials.dark, headTrim: materials.relief,
  } })
  const j = figure.j
  setPose(j, 'idle')
  j.spine.rotation.x = -0.025
  j.head.rotation.x = -0.035
  j.lShoulder.rotation.set(-0.09, 0, 0.09)
  j.lElbow.rotation.set(-0.19, 0, 0)
  j.rShoulder.rotation.set(-0.08, 0, hero === 'thor' ? -0.25 : -0.1)
  j.rElbow.rotation.set(-0.15, 0, 0)
  j.lHip.rotation.z = 0.035
  j.rHip.rotation.z = -0.035
  j.rKnee.rotation.x = 0.035
  const protectedRoots = new Set()
  const owned = []
  if (hero === 'cap') {
    figure.parts.shield.removeFromParent()
    const shield = makeShield(materials)
    shield.position.set(0.04, -0.075, 0.095)
    shield.rotation.x = 0.305 // Counter the resting shoulder/elbow pitch: the star faces the aisle.
    j.lElbow.add(shield)
    figure.parts.shield = shield
    owned.push(...bakeStoneBody({ root: shield }, new Set([shield.getObjectByName('shield-raised-five-point-star')])))
    protectedRoots.add(shield)
  } else {
    figure.parts.hammer.removeFromParent()
    const hammer = makeHammer(materials)
    j.rHand.add(hammer)
    figure.parts.hammer = hammer
    figure.parts.hammerHead = hammer.getObjectByName('mjolnir-square-head')
    owned.push(...bakeStoneBody({ root: hammer }, new Set([figure.parts.hammerHead])))
    protectedRoots.add(hammer)
    if (j.cape) { j.cape.scale.set(1.12, 1.27, 1); j.cape.material = materials.cape }
  }
  owned.push(...bakeStoneBody(figure, protectedRoots))
  figure.root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(figure.root)
  figure.root.position.y -= bounds.min.y
  figure.root.name = hero + '-carved-room-statue'
  figure.root.updateMatrixWorld(true)
  figure.dispose = () => owned.forEach(item => item.dispose())
  figure.root.traverse(mesh => { if (mesh.isMesh) mesh.receiveShadow = true })
  return figure
}
