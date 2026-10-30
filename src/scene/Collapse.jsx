import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world } from '../world'
import { V_MASK, FF_X } from '../config/layout'
// collapse set pieces are placed relative to the team memorial that closes the hall
const O = FF_X - 73.5
import { SHRINES } from '../config/shrines'
import { riftMaterial, holoMaterial } from '../lib/materials'
import { setPose } from '../lib/figure'
import { buildHero } from '../lib/heroes'
import { clippingCanvas, toTexture, softDot } from '../lib/textures'
import { rng, smooth, seg, bump } from '../lib/util'
import { particleScale } from '../lib/quality'

const XAXIS = new THREE.Vector3(1, 0, 0)
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _e = new THREE.Euler()

// Multiversal collapse: rifts tear open, corrupted hero holograms bleed through,
// debris and newspapers float, then everything is dragged into the vortex where the mask will form.
export default function Collapse({ quality }) {
  const ps = particleScale(quality)
  return (
    <group>
      <Rifts />
      <Corrupted />
      <Debris count={Math.floor(110 * ps)} />
      <FloatingPapers count={Math.floor(36 * ps)} />
      <Ash count={Math.floor(700 * ps)} />
      <Stars count={Math.floor(900 * ps)} />
    </group>
  )
}

const RIFTS = [
  { p: [68 + O, 4, -6.3], r: [0, 0, 0.2], s: [3, 7], at: 0.05 },
  { p: [72 + O, 3.5, 6.3], r: [0, Math.PI, -0.3], s: [2.6, 6], at: 0.12 },
  { p: [76 + O, 6, -6.3], r: [0, 0, -0.5], s: [3.5, 8], at: 0.2 },
  { p: [74 + O, 9.6, 0], r: [Math.PI / 2, 0, 0.8], s: [4, 9], at: 0.28 },
  { p: [80.5 + O, 5, 2], r: [0, -Math.PI / 2, 0.1], s: [4, 9], at: 0.35 },
  { p: [V_MASK.x + 9, V_MASK.y + 2, -6], r: [0, -Math.PI / 2, 0.4], s: [6, 16], at: 0.75 },
  { p: [V_MASK.x + 10, V_MASK.y - 1, 5], r: [0, -Math.PI / 2, -0.3], s: [5, 14], at: 0.8 },
  { p: [V_MASK.x + 12, V_MASK.y + 6, 0], r: [0, -Math.PI / 2, 1.3], s: [5, 18], at: 0.85 },
]

function Rifts() {
  const items = useMemo(() => RIFTS.map((r, i) => ({ ...r, mat: riftMaterial(i % 2 ? '#8fb0ff' : '#d6e2ff', i % 3 ? '#ff3a24' : '#8a3cff') })), [])
  const refs = useRef([])
  useFrame((s) => {
    const c = world.hall.collapse
    if (c <= 0 || world.env.void <= 0.001) return
    const t = s.clock.elapsedTime
    items.forEach((it, i) => {
      const lingering = i >= 5
      const open = lingering ? smooth(it.at, it.at + 0.15, c) : bump(c, it.at, it.at + 0.15, 0.82, 0.95)
      it.mat.uniforms.uOpen.value = open * (0.85 + Math.sin(t * 2 + i) * 0.15) * world.env.void
      it.mat.uniforms.uTime.value = t
      refs.current[i].visible = open > 0.01
    })
  })
  return items.map((it, i) => (
    <mesh key={i} ref={(m) => (refs.current[i] = m)} position={it.p} rotation={it.r} material={it.mat}>
      <planeGeometry args={it.s} />
    </mesh>
  ))
}

// The fallen, one last time: life-size character holograms of every hero flicker back into the hall,
// are torn apart by Doom's corruption (glitch slicing, green burn, red ghost echo) and dragged into the rifts.
const GHOSTS = [
  { hero: 'strange', pose: 'cast', p: [-11, 0, -4.2], ry: 0.6 },
  { hero: 'loki', pose: 'raise', p: [-9, 0, 4.0], ry: -2.4 },
  { hero: 'thor', pose: 'raise', p: [-7, 0, -3.8], ry: 0.8 },
  { hero: 'ironman', pose: 'cast', p: [-5, 0, 3.6], ry: -2.2 },
  { hero: 'cap', pose: 'crouchShield', p: [-3, 0, -3.6], ry: 0.9 },
  { hero: 'hulk', pose: 'strain', p: [-1, 0, 3.4], ry: -2.0 },
  { hero: 'panther', pose: 'crouchShield', p: [1, 0, -3.2], ry: 1.1 },
  { hero: 'spider', pose: 'flameOn', p: [2.5, 0, 2.8], ry: -1.7 },
  { hero: 'ben', pose: 'stance', p: [4, 0, -2.4], ry: 1.4 },
]
const HERO_COLOR = Object.fromEntries(SHRINES.flatMap((s) => (s.members ? s.members.map((m) => [m.id, m.color]) : [[s.id, s.color]])))

function Corrupted() {
  const ghosts = useMemo(
    () =>
      GHOSTS.map((g, i) => {
        const mat = holoMaterial(HERO_COLOR[g.hero] || '#ffffff')
        const glow = holoMaterial('#ffffff')
        const echo = holoMaterial('#ff2a3a')
        const f = buildHero(g.hero, mat, { glow })
        const e = buildHero(g.hero, echo, { monochrome: true })
        setPose(f.j, g.pose)
        setPose(e.j, i % 2 ? 'kneel' : 'limp')
        f.root.scale.setScalar(2.2)
        e.root.scale.setScalar(2.2)
        const grp = new THREE.Group()
        grp.add(f.root, e.root)
        const base = new THREE.Vector3(FF_X + g.p[0], g.p[1], g.p[2])
        grp.position.copy(base)
        grp.rotation.y = g.ry
        return { grp, mats: [mat, glow, echo], e: e.root, base, seed: i }
      }),
    []
  )
  useFrame((s) => {
    const c = world.hall.collapse
    if (c <= 0 || world.env.void <= 0.001) return
    const t = s.clock.elapsedTime
    ghosts.forEach((g) => {
      const at = 0.03 + g.seed * 0.022
      const vis = bump(c, at, at + 0.06, 0.48, 0.64)
      g.grp.visible = vis > 0.01
      if (!g.grp.visible) return
      const tear = seg(c, at + 0.12, 0.5)
      const pull = seg(c, 0.45, 0.64)
      g.grp.position.lerpVectors(g.base, _p.set(g.base.x + 4, 6.5, g.base.z * 1.5), pull * pull)
      g.grp.rotation.z = pull * (g.seed % 2 ? 1 : -1) * 1.2
      g.grp.scale.setScalar(1 - pull * 0.85)
      g.e.position.x = Math.sin(t * 7 + g.seed) * 0.1 * (1 + tear * 2)
      const [mat, glow, echo] = g.mats
      for (const [m, o] of [[mat, 0.95], [glow, 1.2], [echo, 0.4 + tear * 0.5]]) {
        const u = m.uniforms
        u.uTime.value = t
        u.uOpacity.value = vis * o * (Math.random() < 0.12 + tear * 0.3 ? 0.15 : 1)
        u.uGlitch.value = 0.6 + tear * 2.5
        u.uCorrupt.value = tear * 0.8
        u.uDissolve.value = tear * 0.7
      }
    })
  })
  return ghosts.map((g, i) => <primitive key={i} object={g.grp} />)
}

function swirl(out, base, c, seed, from = 0.62) {
  const pull = smooth(from + seed * 0.15, 1.0, c)
  if (pull <= 0) return out.copy(base)
  out.copy(base).sub(V_MASK).applyAxisAngle(XAXIS, pull * 3 * (seed > 0.5 ? 1 : -1))
  return out.multiplyScalar(1 - pull).add(V_MASK)
}

function Debris({ count }) {
  const ref = useRef()
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#555b57', roughness: 0.8, metalness: 0.2, emissive: '#2bff6a', emissiveIntensity: 0.05 }), [])
  const data = useMemo(() => {
    const r = rng(77)
    return Array.from({ length: count }, () => ({
      start: new THREE.Vector3(62 + O + r() * 20, 9.8, (r() - 0.5) * 12),
      rest: new THREE.Vector3(62 + O + r() * 20, 0.3 + r() * 6, (r() - 0.5) * 11),
      s: 0.15 + r() * 0.5,
      seed: r(),
      axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      delay: r() * 0.3,
    }))
  }, [count])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((s) => {
    const c = world.hall.collapse
    const mesh = ref.current
    mesh.visible = c > 0.15 && c < 1
    if (!mesh.visible) return
    const t = s.clock.elapsedTime
    data.forEach((d, i) => {
      const k = smooth(0.18 + d.delay, 0.4 + d.delay, c)
      tmp.lerpVectors(d.start, d.rest, k)
      tmp.y += Math.sin(t * 0.8 + d.seed * 10) * 0.3 * k
      swirl(_p, tmp, c, d.seed)
      _q.setFromAxisAngle(d.axis, t * (0.3 + d.seed) + c * 6)
      const sc = d.s * (k > 0 ? 1 : 0) * (1 - smooth(0.85, 1, c))
      _s.setScalar(Math.max(0.001, sc))
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, mat, count]} frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
    </instancedMesh>
  )
}

function FloatingPapers({ count }) {
  const ref = useRef()
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: toTexture(clippingCanvas(SHRINES[4].clippings[0], 99, 256, 360)), side: THREE.DoubleSide, transparent: true, alphaTest: 0.4, roughness: 0.9, emissive: '#ff8a3a', emissiveIntensity: 0.15 })
    return m
  }, [])
  const data = useMemo(() => {
    const r = rng(55)
    return Array.from({ length: count }, () => ({ base: new THREE.Vector3(60 + O + r() * 22, 0.05, (r() - 0.5) * 11), seed: r(), spin: new THREE.Vector3(r(), r(), r()) }))
  }, [count])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((s) => {
    const c = world.hall.collapse
    const mesh = ref.current
    mesh.visible = c > 0.1 && c < 1
    if (!mesh.visible) return
    const t = s.clock.elapsedTime
    data.forEach((d, i) => {
      const lift = smooth(0.1 + d.seed * 0.15, 0.6, c)
      tmp.copy(d.base)
      tmp.y += lift * (2 + d.seed * 5) + Math.sin(t + d.seed * 9) * 0.2 * lift
      tmp.x += Math.sin(t * 0.5 + d.seed * 4) * lift
      swirl(_p, tmp, c, d.seed, 0.66)
      _e.set(d.spin.x * t * lift, d.spin.y * t, d.spin.z * t * lift - Math.PI / 2 * (1 - lift))
      _q.setFromEuler(_e)
      _s.set(0.45, 0.63, 1).multiplyScalar(1 - smooth(0.88, 1, c))
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, mat, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

// Ash drifts around the camera from the hall onward; thickens during the collapse.
function Ash({ count }) {
  const pts = useMemo(() => {
    const r = rng(9)
    const pos = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * 24
      pos[i * 3 + 1] = r() * 10
      pos[i * 3 + 2] = (r() - 0.5) * 14
      seeds[i] = r()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({ size: 0.05, map: softDot(), color: '#9fffb8', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    return { p, pos, seeds, m, base: pos.slice() }
  }, [count])
  useFrame(({ camera, clock }, dt) => {
    if (world.hall.collapse <= 0 || world.env.void <= 0.001) return
    const t = clock.elapsedTime
    const c = world.hall.collapse
    const inHall = !world.throneVisible || world.mask.visible
    pts.p.visible = inHall || world.sw.lights > 0
    pts.m.opacity = 0.35 + c * 0.6
    const speed = 0.25 + c * 1.5
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      pts.pos[i3 + 1] -= dt * speed * (0.3 + pts.seeds[i]) * (c > 0.5 ? -1 : 1)
      pts.pos[i3] += Math.sin(t * 0.7 + pts.seeds[i] * 20) * dt * 0.3
      if (pts.pos[i3 + 1] < 0) pts.pos[i3 + 1] += 10
      if (pts.pos[i3 + 1] > 10) pts.pos[i3 + 1] -= 10
    }
    pts.p.position.set(camera.position.x, 0, 0)
    pts.p.geometry.attributes.position.needsUpdate = true
  })
  return <primitive object={pts.p} />
}

function Stars({ count }) {
  const pts = useMemo(() => {
    const r = rng(3)
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2
      const b = Math.acos(r() * 2 - 1)
      const rad = 60 + r() * 40
      pos[i * 3] = V_MASK.x + Math.abs(Math.sin(b) * Math.cos(a)) * rad
      pos[i * 3 + 1] = V_MASK.y + Math.cos(b) * rad
      pos[i * 3 + 2] = Math.sin(b) * Math.sin(a) * rad
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({ size: 0.35, map: softDot(), color: '#c8ffe0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    return { p, m }
  }, [count])
  useFrame((s) => {
    if (world.hall.collapse < 0.7 || world.env.void <= 0.001) return
    pts.m.opacity = smooth(0.7, 1, world.hall.collapse) * 0.8 * world.env.void
    pts.p.visible = pts.m.opacity > 0.01
    pts.p.rotation.x = s.clock.elapsedTime * 0.01
  })
  return <primitive object={pts.p} />
}
