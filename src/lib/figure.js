import * as THREE from 'three'
import { lerp, seg, smooth } from './util'

// A small procedural rig (~1 unit tall, facing +z, feet at y=0) used for holograms, figurines and statues.
// Swap buildFigure for a GLB + AnimationMixer later without touching the shrine sequencing.
const geoCache = {}
const capsule = (r, l) => geoCache[`c${r}_${l}`] || (geoCache[`c${r}_${l}`] = new THREE.CapsuleGeometry(r, l, 4, 10))
const sphere = () => geoCache.s || (geoCache.s = new THREE.SphereGeometry(1, 16, 12))

export function buildFigure(mat, o = {}) {
  const b = o.bulk || 1
  const root = new THREE.Group()
  const j = {}
  const meshes = []
  const grp = (n, p, pos) => {
    const x = new THREE.Group()
    x.position.set(...pos)
    p.add(x)
    j[n] = x
    return x
  }
  const add = (geo, p, pos, sc, m = mat, rot) => {
    const me = new THREE.Mesh(geo, m)
    me.position.set(...pos)
    if (sc) me.scale.set(...sc)
    if (rot) me.rotation.set(...rot)
    me.castShadow = !!o.shadows
    p.add(me)
    meshes.push(me)
    return me
  }
  const hips = grp('hips', root, [0, 0.5, 0])
  add(pelvis(), hips, [0, -0.02, 0], [b, 1, b])
  const spine = grp('spine', hips, [0, 0.02, 0])
  add(torso(), spine, [0, 0, 0], [1.22 * b, 1, 0.78 * b])
  add(sphere(), spine, [0, 0.3, 0], [0.028, 0.035, 0.028])
  const head = grp('head', spine, [0, 0.33, 0])
  j.headMesh = add(sphere(), head, [0, 0.07, 0], [0.058, 0.07, 0.064])
  add(sphere(), head, [0, 0.035, 0.018], [0.045, 0.035, 0.045])
  const sh = 0.118 * b
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1
    add(sphere(), spine, [sx * sh, 0.27, 0], [0.042 * b, 0.038 * b, 0.04 * b])
    const S = grp(side + 'Shoulder', spine, [sx * sh, 0.27, 0])
    add(limb(0.032 * b, 0.026 * b, 0.15), S, [0, -0.08, 0])
    const E = grp(side + 'Elbow', S, [0, -0.165, 0])
    add(sphere(), E, [0, 0, 0], [0.025 * b, 0.025 * b, 0.025 * b])
    add(limb(0.026 * b, 0.02 * b, 0.15), E, [0, -0.08, 0])
    add(box(), E, [0, -0.18, 0.004], [0.032 * b, 0.05, 0.022 * b])
    grp(side + 'Hand', E, [0, -0.18, 0])
    const H = grp(side + 'Hip', hips, [sx * 0.058 * b, -0.02, 0])
    add(limb(0.045 * b, 0.034 * b, 0.21), H, [0, -0.115, 0])
    const K = grp(side + 'Knee', H, [0, -0.23, 0])
    add(sphere(), K, [0, 0, 0], [0.033 * b, 0.033 * b, 0.033 * b])
    add(limb(0.034 * b, 0.024 * b, 0.21), K, [0, -0.11, 0])
    add(box(), K, [0, -0.225, 0.025], [0.04 * b, 0.025, 0.09])
  }
  if (o.horns) {
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.035 * s, 0.11, 0.045),
        new THREE.Vector3(0.075 * s, 0.17, 0.02),
        new THREE.Vector3(0.09 * s, 0.25, -0.04),
        new THREE.Vector3(0.065 * s, 0.33, -0.11),
      ])
      add(taperedTube(curve, 0.014, 0.002), head, [0, 0, 0])
    }
  }
  if (o.wings) {
    for (const s of [-1, 1]) add(wingGeo(), head, [0.06 * s, 0.08, 0], [s, 1, 1])
  }
  if (o.rocky) {
    const rock = new THREE.DodecahedronGeometry(1, 0)
    const spots = [[0.06, 0.2, 0.05], [-0.06, 0.18, 0.05], [0, 0.1, 0.06], [0.09, 0.27, 0], [-0.09, 0.27, 0], [0, 0.22, -0.06]]
    spots.forEach((p, k) => add(rock, spine, p, [0.035 * b, 0.03 * b, 0.03 * b], mat, [k, k * 2, k * 0.5]))
  }
  if (o.cape) {
    const cape = new THREE.Mesh(capeGeo(0.24 * b, 0.5), mat)
    cape.position.set(0, 0.29, -0.06 * b)
    spine.add(cape)
    meshes.push(cape)
    j.cape = cape
  }
  if (o.collar) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * b, 0.065 * b, 0.12, 16, 1, true, Math.PI * 0.65, Math.PI * 1.7), mat)
    col.position.set(0, 0.34, -0.01)
    spine.add(col)
    meshes.push(col)
  }
  return { root, j, meshes }
}

const pelvis = () => geoCache.pelvis || (geoCache.pelvis = new THREE.SphereGeometry(1, 14, 10).scale(0.075, 0.06, 0.055))
const box = () => geoCache.box || (geoCache.box = new THREE.BoxGeometry(1, 1, 1))
const limb = (r0, r1, l) => geoCache[`l${r0}_${r1}_${l}`] || (geoCache[`l${r0}_${r1}_${l}`] = new THREE.CylinderGeometry(r0, r1, l, 10, 1))
// Lathed torso: narrow waist, broad chest, sloping trapezius.
const torso = () =>
  geoCache.torso ||
  (geoCache.torso = new THREE.LatheGeometry(
    [[0.0, 0.0], [0.058, 0.0], [0.062, 0.05], [0.058, 0.1], [0.072, 0.17], [0.086, 0.23], [0.088, 0.27], [0.06, 0.31], [0.025, 0.33], [0, 0.335]].map(([x, y]) => new THREE.Vector2(x, y)),
    18
  ))
const wingGeo = () => {
  if (geoCache.wing) return geoCache.wing
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(0.045, 0.03)
  s.lineTo(0.03, 0.0)
  s.lineTo(0.05, -0.005)
  s.lineTo(0.0, -0.02)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false })
  g.rotateY(Math.PI / 2)
  return (geoCache.wing = g)
}
const capeGeo = (w, h) => {
  const k = `cape${w}_${h}`
  if (geoCache[k]) return geoCache[k]
  const g = new THREE.PlaneGeometry(w, h, 6, 8)
  g.translate(0, -h / 2, 0)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const t = -y / h
    p.setX(i, x * (1 + t * 0.9))
    p.setZ(i, -t * 0.08 - Math.cos((x / w) * Math.PI) * 0.03 + Math.sin(x * 60) * 0.006 * t)
  }
  g.computeVertexNormals()
  return (geoCache[k] = g)
}

// Tube whose radius tapers from r0 to r1 along the curve (horns, tusks, spikes).
export function taperedTube(curve, r0, r1, seg = 24, radial = 10) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    const c = curve.getPointAt(t)
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8)
    for (let k = 0; k <= radial; k++) {
      const idx = i * (radial + 1) + k
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(r).add(c)
      p.setXYZ(idx, v.x, v.y, v.z)
    }
  }
  g.computeVertexNormals()
  return g
}

const Z = [0, 0, 0]
export const POSES = {
  idle: { lShoulder: [0, 0, 0.12], rShoulder: [0, 0, -0.12] },
  cast: { lShoulder: [-1.45, 0, 0.35], rShoulder: [-1.45, 0, -0.35], lElbow: [-0.3, 0, 0], rElbow: [-0.3, 0, 0], spine: [0.05, 0, 0] },
  castWide: { lShoulder: [-0.7, 0, 1.25], rShoulder: [-0.7, 0, -1.25], lElbow: [-0.6, 0, 0], rElbow: [-0.6, 0, 0], lHip: [-0.2, 0, 0.12], rHip: [0.15, 0, -0.12], lKnee: [0.25, 0, 0] },
  brace: { spine: [0.35, 0, 0], lShoulder: [-1.9, 0, 0.25], rShoulder: [-1.9, 0, -0.25], lElbow: [-1.2, 0, 0], rElbow: [-1.2, 0, 0], lHip: [-0.6, 0, 0.1], lKnee: [0.8, 0, 0], rHip: [0.35, 0, -0.1], rKnee: [0.4, 0, 0], y: -0.06 },
  raise: { rShoulder: [-2.9, 0, -0.2], rElbow: [-0.2, 0, 0], lShoulder: [-0.3, 0, 0.4], lElbow: [-0.6, 0, 0], spine: [-0.1, 0, 0], head: [-0.25, 0, 0] },
  kneel: { y: -0.2, lHip: [-1.5, 0, 0.08], lKnee: [1.55, 0, 0], rHip: [0.25, 0, -0.06], rKnee: [2.1, 0, 0], spine: [0.3, 0, 0], head: [0.45, 0, 0], lShoulder: [-0.2, 0, 0.15], rShoulder: [-0.4, 0, -0.1], lElbow: [-0.4, 0, 0] },
  kneelShield: { y: -0.2, lHip: [-1.5, 0, 0.08], lKnee: [1.55, 0, 0], rHip: [0.25, 0, -0.06], rKnee: [2.1, 0, 0], spine: [0.15, 0, 0], head: [0.2, 0, 0], lShoulder: [-1.3, 0, 0.1], lElbow: [-1.3, 0, 0], rShoulder: [-0.3, 0, -0.2] },
  kneelChained: { y: -0.2, lHip: [-1.5, 0, 0.08], lKnee: [1.55, 0, 0], rHip: [0.25, 0, -0.06], rKnee: [2.1, 0, 0], spine: [0.4, 0, 0], head: [0.5, 0, 0], lShoulder: [0.3, 0, 0.9], rShoulder: [0.3, 0, -0.9], lElbow: [-0.5, 0, 0], rElbow: [-0.5, 0, 0] },
  crouchShield: { y: -0.12, spine: [0.35, 0, 0], lShoulder: [-1.55, 0, 0], lElbow: [-1.4, 0, 0], rShoulder: [-0.4, 0, -0.3], rElbow: [-0.5, 0, 0], lHip: [-1.1, 0, 0.1], lKnee: [1.6, 0, 0], rHip: [-0.3, 0, -0.1], rKnee: [1.2, 0, 0] },
  defiant: { spine: [-0.08, 0, 0], head: [-0.15, 0, 0], lShoulder: [-1.2, 0, 0.3], lElbow: [-1.3, 0, 0], rShoulder: [0, 0, -0.25], rElbow: [-0.3, 0, 0], lHip: [-0.15, 0, 0.12], rHip: [0.15, 0, -0.12] },
  smashUp: { lShoulder: [-3.0, 0, 0.3], rShoulder: [-3.0, 0, -0.3], lElbow: [-0.4, 0, 0], rElbow: [-0.4, 0, 0], spine: [-0.25, 0, 0], head: [-0.3, 0, 0] },
  smashDown: { y: -0.1, lShoulder: [-1.0, 0, 0.2], rShoulder: [-1.0, 0, -0.2], spine: [0.7, 0, 0], lHip: [-0.7, 0, 0.15], lKnee: [0.9, 0, 0], rHip: [-0.7, 0, -0.15], rKnee: [0.9, 0, 0] },
  strain: { lShoulder: [0, 0, 1.35], rShoulder: [0, 0, -1.35], lElbow: [-0.9, 0, 0], rElbow: [-0.9, 0, 0], spine: [-0.15, 0, 0], head: [-0.4, 0, 0], lHip: [0, 0, 0.25], rHip: [0, 0, -0.25] },
  reach: { rShoulder: [-1.45, 0.3, -0.2], rElbow: [0, 0, 0], lShoulder: [-0.4, 0, 0.3], spine: [0.15, 0, 0], sR: 1 },
  reachFar: { rShoulder: [-1.45, 0.3, -0.2], rElbow: [0, 0, 0], lShoulder: [-0.6, 0, 0.3], spine: [0.25, 0, 0], sR: 2.6 },
  shieldUp: { lShoulder: [-2.1, 0, 0.45], rShoulder: [-2.1, 0, -0.45], lElbow: [-0.25, 0, 0], rElbow: [-0.25, 0, 0], lHip: [-0.2, 0, 0.12], rHip: [0.2, 0, -0.12] },
  flameOn: { lShoulder: [-2.4, 0, 0.9], rShoulder: [-2.4, 0, -0.9], lHip: [-0.1, 0, 0.12], rHip: [0.2, 0, -0.12], rKnee: [0.4, 0, 0], y: 0.04 },
  limp: { y: -0.05, spine: [0.5, 0, 0], head: [0.6, 0, 0], lShoulder: [0.1, 0, 0.2], rShoulder: [0.1, 0, -0.2], lKnee: [0.3, 0, 0], rKnee: [0.5, 0, 0] },
  stance: { lHip: [0, 0, 0.3], rHip: [0, 0, -0.3], lShoulder: [-0.9, 0, 0.45], lElbow: [-1.3, 0, 0], rShoulder: [-0.9, 0, -0.45], rElbow: [-1.3, 0, 0], spine: [0.15, 0, 0], y: -0.03 },
  fallen: { lShoulder: [-0.2, 0, 1.2], rShoulder: [-0.1, 0, -0.9], lHip: [-0.1, 0, 0.2], rKnee: [0.6, 0, 0] },
}

const JOINTS = ['spine', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow', 'lHip', 'lKnee', 'rHip', 'rKnee']

export function applyPose(j, A, B, k) {
  for (const n of JOINTS) {
    const a = A[n] || Z
    const c = B[n] || Z
    j[n].rotation.set(lerp(a[0], c[0], k), lerp(a[1], c[1], k), lerp(a[2], c[2], k))
  }
  j.hips.position.y = 0.5 + lerp(A.y || 0, B.y || 0, k)
  j.rShoulder.scale.y = lerp(A.sR || 1, B.sR || 1, k)
  j.lShoulder.scale.y = lerp(A.sL || 1, B.sL || 1, k)
}

// kf: [[t, 'poseName'], ...] sorted by t
export function poseAt(j, kf, t) {
  let i = 0
  while (i < kf.length - 1 && t > kf[i + 1][0]) i++
  const [t0, a] = kf[i]
  const [t1, b] = kf[Math.min(i + 1, kf.length - 1)]
  const k = t1 > t0 ? smooth(0, 1, seg(t, t0, t1)) : 0
  applyPose(j, POSES[a], POSES[b], k)
}

export function setPose(j, name) {
  applyPose(j, POSES[name], POSES[name], 0)
}
