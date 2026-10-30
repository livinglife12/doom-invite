import * as THREE from 'three'
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Doom's faceplate, built as armour: extruded plates with real holes, tessellated and bent around a head.
// Local units: ~1.1 wide, ~1.5 tall, front faces +z. side: 1 right half, -1 left half, 0 full plate.

const RIGHT_OUTLINE = [
  [0.0, 0.76], [0.28, 0.735], [0.47, 0.62], [0.55, 0.38], [0.565, 0.015], [0.485, -0.24], [0.405, -0.56], [0.29, -0.75], [0.0, -0.78],
]
const RIGHT_EYE = [[0.095, 0.188], [0.383, 0.224], [0.36, 0.142], [0.128, 0.108]]
const RIGHT_MOUTH = [[0.014, -0.22], [0.17, -0.22], [0.17, -0.445], [0.014, -0.445]]

const DEPTH = 0.045
const BEVEL = 0.012
const plateCache = new Map()
const partsCache = new Map()

export function bendZ(x, y) {
  return 0.85 * x * x + 0.35 * Math.max(0, -y - 0.5) ** 2 + 0.12 * Math.max(0, y - 0.55) ** 2
}
export const frontZ = (x, y) => DEPTH + BEVEL - bendZ(x, y)

const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse()

function shapeFrom(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
  return s
}

function finish(geo, zOff = 0, maxEdge = 0.075) {
  let g = geo.index ? geo.toNonIndexed() : geo
  g = new TessellateModifier(maxEdge, 5).modify(g)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    p.setZ(i, p.getZ(i) + zOff - bendZ(x, y))
  }
  g = toCreasedNormals(g, 0.7)
  g.computeBoundingSphere()
  return g
}

const extrude = (shape, depth, bevel = BEVEL) =>
  new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 })

function sidePts(pts, side) {
  return side < 0 ? mirror(pts) : pts
}

export function buildMaskPlate(side = 0) {
  if (plateCache.has(side)) return plateCache.get(side)
  let outline
  let holes
  if (side === 0) {
    outline = [...RIGHT_OUTLINE, ...mirror(RIGHT_OUTLINE).slice(1, -1)]
    holes = [RIGHT_EYE, mirror(RIGHT_EYE), [[-0.17, -0.22], [0.17, -0.22], [0.17, -0.445], [-0.17, -0.445]]]
  } else {
    outline = sidePts(RIGHT_OUTLINE, side)
    holes = [sidePts(RIGHT_EYE, side), sidePts(RIGHT_MOUTH, side)]
  }
  const geometry = finish(extrude(shapeFrom(outline, holes), DEPTH))
  plateCache.set(side, geometry)
  return geometry
}

// Raised armour pieces (brow, nose ridge, cheek guard) for one half.
export function buildMaskParts(side = 1) {
  if (partsCache.has(side)) return partsCache.get(side)
  const brow = [[0.02, 0.255], [0.47, 0.325], [0.455, 0.414], [0.0, 0.335]]
  const nose = [[0.0, 0.29], [0.05, 0.265], [0.075, -0.11], [0.045, -0.17], [0.0, -0.19]]
  const cheek = [[0.27, 0.068], [0.532, 0.112], [0.486, -0.197], [0.357, -0.25], [0.306, -0.1]]
  const jaw = [[0.205, -0.49], [0.393, -0.465], [0.284, -0.727], [0.115, -0.75]]
  const g = (pts, d, z) => finish(extrude(shapeFrom(sidePts(pts, side)), d, 0.008), z, 0.085)
  const parts = { brow: g(brow, 0.045, DEPTH), nose: g(nose, 0.075, DEPTH + 0.018), cheek: g(cheek, 0.025, DEPTH), jaw: g(jaw, 0.022, DEPTH), eye: g(RIGHT_EYE, 0.002, DEPTH - 0.035) }
  partsCache.set(side, parts)
  return parts
}

export const RIVETS = [[0.5, 0.52], [0.535, 0.28], [0.535, 0.02], [0.47, -0.3], [0.36, -0.58], [0.16, -0.71], [0.22, 0.6], [0.42, -0.08], [0.24, -0.47]]

// Kept for the throne relief and Doom's silhouette, which use a single full plate.
export const buildMaskGeometry = (side = 0) => buildMaskPlate(side)

function inPoly(x, y, pts) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

const FULL = [...RIGHT_OUTLINE, ...mirror(RIGHT_OUTLINE).slice(1, -1)]
export function inMask(x, y) {
  if (!inPoly(x, y, FULL)) return false
  const ax = Math.abs(x)
  if (inPoly(ax, y, RIGHT_EYE)) return false
  if (ax < 0.18 && y < -0.21 && y > -0.455) return false
  return true
}

export function maskNormal(x, y, out = new THREE.Vector3()) {
  return out.set(1.7 * x, -0.7 * Math.max(0, -y - 0.5) + 0.24 * Math.max(0, y - 0.55), 1).normalize()
}
