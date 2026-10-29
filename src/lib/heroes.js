import * as THREE from 'three'
import { buildFigure, taperedTube } from './figure'

// Character builds on top of the base rig. Every hologram, figurine and corrupted ghost uses these, so each
// hero is recognisable by silhouette: costume pieces, signature props and proportions.
// buildHero(id, mat, { glow }) -> { root, j, meshes, parts }  (parts exposes props the animations drive)
//
// To use real models instead, load a GLB per hero and return the same { root, j, parts } shape here.

const g = {}
const memo = (k, f) => g[k] || (g[k] = f())
const sphere = () => memo('s', () => new THREE.SphereGeometry(1, 14, 10))
const box = () => memo('b', () => new THREE.BoxGeometry(1, 1, 1))
const cyl = () => memo('c', () => new THREE.CylinderGeometry(1, 1, 1, 18))
const cone = () => memo('k', () => new THREE.ConeGeometry(1, 1, 10))
const starGeo = () =>
  memo('star', () => {
    const s = new THREE.Shape()
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 ? 0.4 : 1
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false })
  })

const BUILDS = {
  strange: { bulk: 1, cape: true, collar: true },
  loki: { bulk: 0.95, cape: true, horns: true },
  thor: { bulk: 1.3, cape: true, wings: true },
  ironman: { bulk: 1.2 },
  cap: { bulk: 1.12, wings: true },
  hulk: { bulk: 1.85 },
  panther: { bulk: 0.98 },
  spider: { bulk: 0.92 },
  reed: { bulk: 0.9 },
  sue: { bulk: 0.86 },
  johnny: { bulk: 0.9 },
  ben: { bulk: 1.75, rocky: true },
}

export function buildHero(id, mat, o = {}) {
  const b = BUILDS[id] || { bulk: 1 }
  const fig = buildFigure(mat, { ...b, shadows: o.shadows })
  const { j } = fig
  const glow = o.glow || mat
  const parts = {}
  const add = (geo, parent, pos, scale, m = mat, rot) => {
    const me = new THREE.Mesh(geo, m)
    me.position.set(...pos)
    me.scale.set(...scale)
    if (rot) me.rotation.set(...rot)
    me.castShadow = !!o.shadows
    parent.add(me)
    fig.meshes.push(me)
    return me
  }
  const k = b.bulk
  const emblem4 = () => {
    add(cyl(), j.spine, [0, 0.22, 0.062 * k], [0.03, 0.006, 0.03], glow, [Math.PI / 2, 0, 0])
  }
  switch (id) {
    case 'strange': {
      parts.eye = add(sphere(), j.spine, [0, 0.235, 0.07], [0.018, 0.018, 0.01], glow)
      add(memo('torusS', () => new THREE.TorusGeometry(1, 0.25, 6, 16)), j.spine, [0, 0.235, 0.068], [0.022, 0.022, 0.022])
      break
    }
    case 'thor': {
      const hammer = new THREE.Group()
      add(cyl(), hammer, [0, -0.05, 0], [0.008, 0.13, 0.008])
      parts.hammerHead = add(box(), hammer, [0, -0.13, 0], [0.095, 0.055, 0.055])
      hammer.rotation.x = Math.PI
      hammer.position.set(0, -0.005, 0.01)
      j.rHand.add(hammer)
      parts.hammer = hammer
      for (const s of [-1, 1]) for (const y of [0.2, 0.25]) add(cyl(), j.spine, [s * 0.04 * k, y, 0.06 * k], [0.014, 0.004, 0.014], mat, [Math.PI / 2, 0, 0])
      break
    }
    case 'ironman': {
      for (const s of [-1, 1]) add(sphere(), j.spine, [s * 0.12 * k, 0.285, 0], [0.05 * k, 0.04, 0.05 * k])
      add(box(), j.spine, [0, 0.2, 0.045 * k], [0.15 * k, 0.12, 0.03])
      parts.reactor = add(cyl(), j.spine, [0, 0.215, 0.064 * k], [0.024, 0.006, 0.024], glow, [Math.PI / 2, 0, 0])
      add(box(), j.head, [0, 0.06, 0.05], [0.08, 0.085, 0.03])
      parts.eyes = [-1, 1].map((s) => add(box(), j.head, [s * 0.02, 0.078, 0.067], [0.022, 0.006, 0.004], glow))
      for (const side of ['l', 'r']) {
        add(box(), j[side + 'Elbow'], [0, -0.15, 0], [0.045 * k, 0.06, 0.04 * k])
        parts[side + 'Palm'] = add(cyl(), j[side + 'Elbow'], [0, -0.185, 0.012], [0.012, 0.004, 0.012], glow, [Math.PI / 2, 0, 0])
        add(box(), j[side + 'Knee'], [0, -0.2, 0.01], [0.055 * k, 0.07, 0.06])
      }
      break
    }
    case 'cap': {
      const shield = new THREE.Group()
      add(cyl(), shield, [0, 0, 0], [0.13, 0.014, 0.13], mat)
      add(cyl(), shield, [0, 0.008, 0], [0.07, 0.012, 0.07], glow)
      shield.rotation.x = Math.PI / 2
      shield.position.set(0, -0.11, 0.05)
      j.lElbow.add(shield)
      parts.shield = shield
      add(starGeo(), j.spine, [0, 0.215, 0.06 * k], [0.035, 0.035, 0.05], glow)
      break
    }
    case 'hulk': {
      for (const side of ['l', 'r']) add(sphere(), j[side + 'Elbow'], [0, -0.19, 0.01], [0.05, 0.05, 0.05])
      add(sphere(), j.spine, [0, 0.27, -0.02], [0.13, 0.07, 0.08])
      break
    }
    case 'panther': {
      for (const s of [-1, 1]) add(cone(), j.head, [s * 0.035, 0.135, 0.005], [0.016, 0.04, 0.012], mat, [0, 0, -s * 0.25])
      parts.necklace = add(memo('torusN', () => new THREE.TorusGeometry(1, 0.12, 6, 24)), j.spine, [0, 0.3, 0.012], [0.055, 0.055, 0.05], glow, [Math.PI / 2 - 0.3, 0, 0])
      for (const side of ['l', 'r']) for (const x of [-0.012, 0, 0.012]) add(cone(), j[side + 'Elbow'], [x, -0.215, 0.01], [0.004, 0.03, 0.004], glow, [Math.PI, 0, 0])
      break
    }
    case 'spider': {
      for (const s of [-1, 1]) add(sphere(), j.head, [s * 0.026, 0.08, 0.058], [0.022, 0.03, 0.008], glow, [0, 0, s * 0.5])
      const leg = memo('spiderLeg', () => taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.012, 0), new THREE.Vector3(0.035, -0.004, 0)]), 0.003, 0.001, 6, 4))
      add(sphere(), j.spine, [0, 0.215, 0.06 * k], [0.012, 0.018, 0.006], glow)
      for (const s of [-1, 1]) for (const r of [-0.4, 0, 0.4]) add(leg, j.spine, [0, 0.215, 0.064 * k], [s, 1, 1], glow, [0, 0, r])
      parts.webHand = j.rHand
      break
    }
    case 'reed':
    case 'sue':
    case 'johnny':
      emblem4()
      break
    default:
      break
  }
  return { ...fig, parts }
}
