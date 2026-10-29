import * as THREE from 'three'
import { SHRINES } from './config/shrines'

// Mutable runtime shared between the director (GSAP timelines) and scene components (useFrame readers).
export const input = { x: 0, y: -0.1, moved: false, last: 0 }

export const beam = {
  origin: new THREE.Vector3(),
  dir: new THREE.Vector3(0, 0, -1),
  pointerRay: new THREE.Ray(),
  angle: 0.34,
  on: 0,
}

export const world = {
  flashlight: { intensity: 0, enabled: false, lower: 0 },
  sw: { charge: 0, activated: false, vibrate: 0, flip: 0, latch: 0, sparks: 0, cable: 0, lights: 0 },
  doors: { open: 0 },
  throneVisible: true,
  hall: {
    lights: 0,
    collapse: 0,
    visible: true,
    keyTarget: new THREE.Vector3(20, 0, -5.2),
    keyFrom: new THREE.Vector3(20, 7, -1),
    keyOn: 0,
    holoColor: new THREE.Color('#ffffff'),
    holoPos: new THREE.Vector3(20, 2, -5),
    holoOn: 0,
  },
  shrines: SHRINES.map(() => ({
    unfurl: 0,
    ready: false,
    pressed: 0,
    holo: 0,
    transform: 0,
    burn: 0,
    token: 0,
    malfunction: 0,
    done: false,
    onPress: null,
  })),
  tv: { visible: true, power: 0, static: 1, roll: 0, knob: 0, mode: 'off', text: '' },
  mask: { visible: false, assemble: 0, glow: 0, open: 0 },
  page: { visible: false, fade: 0, burn: 0, texture: null, aspect: 0.7, sig: [0.5, 0.2] },
  env: { intensity: 0.02, ambient: 0.02, fog: 0.045, void: 1 },
}

// Hide/show a subtree without removing its lights: a change in light count forces every lit material
// to recompile, which stutters badly on phones.
export function showMeshes(root, v) {
  const prev = root.userData.shown ?? true
  root.userData.shown = v
  if (prev === v) return
  root.traverse((o) => {
    if (o === root || o.isLight || !(o.isMesh || o.isPoints || o.isLine)) return
    if (!v) {
      o.userData.wasVisible = o.visible
      o.visible = false
    } else {
      o.visible = o.userData.wasVisible ?? true
    }
  })
}

const _v = new THREE.Vector3()
// How strongly the flashlight cone covers a world point (0..1).
export function litAmount(p, spread = 1) {
  if (beam.on <= 0.01) return 0
  _v.copy(p).sub(beam.origin)
  const d = _v.length()
  if (d < 0.001) return 0
  _v.divideScalar(d)
  const ang = Math.acos(Math.min(1, _v.dot(beam.dir)))
  return Math.max(0, 1 - ang / (beam.angle * spread)) * Math.min(1, beam.on) * Math.min(1, 26 / (d * d + 1))
}
