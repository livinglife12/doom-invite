import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { holoMaterial, beamMaterial, additive } from '../lib/materials'
import { poseAt, setPose } from '../lib/figure'
import { buildHero } from '../lib/heroes'
import { makeEmitter, makeBolt } from '../lib/particles'
import { mandalaTexture, crackTexture } from '../lib/textures'
import { clamp, seg, smooth, bump, lerp } from '../lib/util'
import { world } from '../world'

// Every hologram is a real 3D miniature: procedural rigs posed over time with a scanline/fresnel shader,
// projected from a physical emitter. p (0..1) is the reconstruction progress driven by the director.

export function holoOn(rt, t) {
  if (rt.holo <= 0) return 0
  const boot = rt.holo < 0.02 ? (Math.sin(t * 90) > 0 ? 1 : 0.25) : 1
  return boot * (1 - clamp(rt.burn * 1.4))
}

// All exhibits stay mounted to avoid shader/material churn. Only the live exhibit
// advances its rigs, bolts and particle pools; Object3D visibility alone does not
// stop React Three Fiber's frame subscriptions.
function holoActive(rt, root) {
  if (!world.hall.visible || rt.done || rt.holo <= 0 || rt.burn >= 1 / 1.4) return false
  for (let parent = root.parent; parent; parent = parent.parent) if (!parent.visible) return false
  return true
}

function clearEmitters(emitters) {
  for (const emitter of emitters) {
    if (emitter.clear) emitter.clear()
    else emitter.update(10)
  }
}

function useHoloFrame(rt, hologram, callback) {
  const playback = useRef({ active: false, progress: 0 })
  useFrame((state, dt) => {
    const was = playback.current
    if (!holoActive(rt, hologram.g)) {
      if (was.active) clearEmitters(hologram.emitters)
      was.active = false
      return
    }
    if (rt.holo < was.progress) {
      clearEmitters(hologram.emitters)
      hologram.popped?.clear()
      if ('burst' in hologram) hologram.burst = false
    }
    was.active = true
    was.progress = rt.holo
    callback(state, Math.min(dt, 0.05))
  })
}

export function driveHolo(mats, t, rt, on) {
  const corrupt = clamp(rt.burn * 3)
  const burnD = clamp(rt.burn * 2 - 0.15)
  const spike = Math.random() < 0.012 ? Math.random() : 0
  const mal = rt.malfunction
  for (const m of mats) {
    const u = m.uniforms
    u.uTime.value = t
    const flick = mal > 0 && Math.random() < mal * 0.4 ? 0.2 : 1
    u.uOpacity.value = on * (m.userData.o ?? 1) * flick
    u.uGlitch.value = 0.015 + spike * 0.15 + mal * 1.5 + corrupt * 1.2 + (m.userData.g || 0)
    u.uDissolve.value = Math.max(m.userData.d || 0, burnD, smooth(0.45, 1, mal))
    u.uCorrupt.value = Math.max(corrupt, m.userData.c || 0, mal * 0.5)
    u.uGrey.value = m.userData.grey || 0
  }
}

export function Projector({ rt, color, metal, radius = 0.25, height = 1.35, children }) {
  const mats = useMemo(() => ({ beam: beamMaterial(color), ring: additive(color, 0.6) }), [color])
  const em = useMemo(() => makeEmitter(50, { color, size: 0.022, colorEnd: '#ffffff' }), [color])
  const inner = useRef()
  const root = useRef()
  const st = useMemo(() => ({ holoMats: null, base: new THREE.Vector3(), active: false }), [])
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    let visible = world.hall.visible && !rt.done && rt.unfurl > 0.001
    if (visible) for (let parent = root.current.parent; parent; parent = parent.parent) if (!parent.visible) { visible = false; break }
    if (!visible) {
      if (st.active) { clearEmitters([em]); st.active = false }
      return
    }
    st.active = true
    const on = holoOn(rt, t)
    // Holograms are skipped entirely while off, and scan upward from the emitter when they boot.
    const g = inner.current
    g.visible = on > 0.001
    if (g.visible) {
      if (!st.holoMats) {
        st.holoMats = []
        g.traverse((o) => o.material?.uniforms?.uBuild && st.holoMats.push(o.material))
      }
      g.getWorldPosition(st.base)
      const top = st.base.y + smooth(0, 0.06, rt.holo) * height * 1.2 - 0.02
      for (const m of st.holoMats) m.uniforms.uBuild.value = top
    }
    const standby = rt.burn > 0 ? 0 : 0.06 + 0.04 * Math.sin(t * 2)
    mats.beam.uniforms.uTime.value = t
    mats.beam.uniforms.uOpacity.value = Math.max(standby * 0.5, on * 0.18)
    mats.ring.opacity = (0.25 + on * 0.75) * (1 - clamp(rt.burn * 2))
    if (on > 0.2 && Math.random() < dt * 40 * on) {
      em.emit(1, () => ({ p: [(Math.random() - 0.5) * radius * 1.3, 0.06, (Math.random() - 0.5) * radius * 1.3], v: [0, 0.2 + Math.random() * 0.3, 0], life: 1.6 }))
    }
    em.update(dt, { turbulence: 0.3, t })
  })
  return (
    <group ref={root}>
      <mesh material={metal} position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[radius, radius * 1.18, 0.07, 32]} />
      </mesh>
      <mesh material={mats.ring} position={[0, 0.068, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius * 0.5, radius * 0.82, 40]} />
      </mesh>
      <mesh material={mats.beam} position={[0, 0.07 + height / 2, 0]}>
        <cylinderGeometry args={[radius * 1.7, radius * 0.55, height, 32, 1, true]} />
      </mesh>
      <primitive object={em.points} />
      <group ref={inner} position={[0, 0.075, 0]} scale={1.45}>
        {children}
      </group>
    </group>
  )
}

function useHolo(build) {
  return useMemo(() => {
    const mats = []
    const M = (c, surface = true) => {
      const m = holoMaterial(c, surface)
      mats.push(m)
      return m
    }
    const g = new THREE.Group()
    const extra = build(M, g)
    const emitters = Object.values(extra).filter(value => value?.points && typeof value.update === 'function')
    return { g, mats, emitters, ...extra }
  }, [])
}

const GREEN = '#5dff8a'
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const _c = new THREE.Vector3()

// ---------------- Doctor Strange ----------------
export function StrangeHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const fig = buildHero('strange', mat)
    fig.root.scale.setScalar(0.62)
    g.add(fig.root)
    const runeMat = additive(color, 0.9, mandalaTexture())
    const rings = [
      { pos: [0, 0.4, 0.26], ry: 0 },
      { pos: [-0.27, 0.42, 0.06], ry: 1.1 },
      { pos: [0.27, 0.42, 0.06], ry: -1.1 },
    ].map((d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), runeMat)
      m.position.set(...d.pos)
      m.rotation.y = d.ry
      g.add(m)
      return { m, base: new THREE.Vector3(...d.pos) }
    })
    const chamberMat = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const chamber = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.46, 1)), chamberMat)
    chamber.position.y = 0.35
    g.add(chamber)
    const crackMat = additive('#ffffff', 0, crackTexture(4))
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), crackMat)
    crack.position.set(0, 0.42, -0.32)
    g.add(crack)
    const shardGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(-0.02, -0.02, 0), new THREE.Vector3(0.025, -0.015, 0)])
    const shards = []
    for (let i = 0; i < 27; i++) {
      const sm = new THREE.Mesh(shardGeo, runeMat)
      const r = rings[i % 3]
      sm.userData = { from: r.base.clone(), dir: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2 - 0.2, (Math.random() - 0.3) * 2).normalize(), spin: Math.random() * 10 }
      sm.visible = false
      g.add(sm)
      shards.push(sm)
    }
    const bolt = makeBolt(GREEN, 14, 0.02)
    g.add(bolt.line)
    return { fig, mat, rings, runeMat, chamber, chamberMat, crack, crackMat, shards, bolt }
  })
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.1, 'cast'], [0.38, 'castWide'], [0.55, 'brace'], [0.68, 'brace'], [0.75, 'limp']], p)
    s.fig.root.rotation.x = -Math.pow(seg(p, 0.7, 0.82), 2) * 1.45
    s.fig.root.position.z = -seg(p, 0.7, 0.82) * 0.05
    s.mat.userData.d = seg(p, 0.82, 1) * 0.95
    const ringIn = smooth(0.06, 0.18, p)
    const shatter = p > 0.66
    const stress = seg(p, 0.45, 0.66)
    s.rings.forEach((r, i) => {
      r.m.visible = !shatter && ringIn > 0.01
      r.m.scale.setScalar(ringIn * (1 + Math.sin(t * 30 + i) * 0.05 * stress))
      r.m.rotateZ(dt * (0.8 + i * 0.4) * (i % 2 ? -1 : 1))
      r.m.position.copy(r.base).addScaledVector(tmpA.set(Math.random() - 0.5, Math.random() - 0.5, 0), 0.02 * stress)
    })
    s.runeMat.opacity = on * (0.9 - stress * 0.4 * (Math.random() < 0.3 ? 1 : 0))
    const sh = seg(p, 0.66, 0.95)
    s.shards.forEach((m) => {
      m.visible = shatter && sh < 1
      m.position.copy(m.userData.from).addScaledVector(m.userData.dir, sh * 0.55)
      m.position.y -= sh * sh * 0.3
      m.rotation.set(sh * m.userData.spin, sh * m.userData.spin * 0.7, 0)
    })
    s.chamber.rotation.y += dt * 0.25
    s.chamber.scale.setScalar(1 + (shatter ? Math.sin(t * 50) * 0.04 * (1 - sh) : 0))
    s.chamberMat.opacity = on * 0.35 * (1 - seg(p, 0.66, 0.8) * 0.8)
    const cr = smooth(0.28, 0.62, p)
    s.crack.scale.set(0.2 + cr, 0.2 + cr * 1.1, 1)
    s.crackMat.opacity = on * cr * (0.8 + Math.sin(t * 9) * 0.2)
    s.bolt.line.visible = on > 0 && p > 0.6 && p < 0.7 && Math.sin(t * 40) > 0
    if (s.bolt.line.visible) s.bolt.set(tmpA.set(0, 0.45, -0.3), tmpB.set(0, 0.4, 0.26), 0.08)
    s.bolt.mat.opacity = on
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------------- Loki ----------------
export function LokiHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mk = (opts) => {
      const mat = M(color)
      const fig = buildHero('loki', mat)
      fig.root.scale.setScalar(0.6)
      g.add(fig.root)
      const scepter = new THREE.Group()
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6), mat)
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), mat)
      gem.position.y = 0.23
      scepter.add(staff, gem)
      scepter.position.set(0, -0.01, 0.02)
      fig.j.rHand.add(scepter)
      return { fig, mat, scepter }
    }
    const main = mk()
    const clones = []
    for (let k = 0; k < 5; k++) {
      const c = mk()
      c.fig.root.scale.setScalar(0.48)
      c.angle = (k / 5) * Math.PI * 2
      clones.push(c)
    }
    const bolts = [0, 1].map(() => {
      const b = makeBolt(GREEN, 14, 0.02)
      g.add(b.line)
      return b
    })
    const pops = makeEmitter(120, { color, size: 0.02 })
    g.add(pops.points)
    return { main, clones, bolts, pops, popped: new Set() }
  })
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    poseAt(s.main.fig.j, [[0, 'idle'], [0.1, 'raise'], [0.32, 'raise'], [0.42, 'cast'], [0.66, 'cast'], [0.74, 'idle'], [0.82, 'kneel']], p)
    s.main.mat.userData.o = 1 - 0.7 * bump(p, 0.2, 0.28, 0.6, 0.68)
    s.main.mat.userData.d = seg(p, 0.86, 1)
    s.main.scepter.visible = p < 0.76
    const appear = smooth(0.18, 0.3, p)
    let bi = 0
    s.bolts.forEach((b) => (b.line.visible = false))
    s.clones.forEach((c, k) => {
      const hitAt = 0.36 + k * 0.06
      const r = 0.34 + Math.sin(t + k) * 0.02
      c.angle += dt * 0.7
      c.fig.root.position.set(Math.cos(c.angle) * r * appear, 0, Math.sin(c.angle) * r * appear)
      c.fig.root.rotation.y = -c.angle + Math.PI / 2
      poseAt(c.fig.j, [[0, 'idle'], [1, 'raise']], (Math.sin(t * 2 + k) + 1) / 2)
      c.mat.userData.o = appear * 0.75
      c.mat.userData.d = seg(p, hitAt, hitAt + 0.05)
      c.mat.userData.c = bump(p, hitAt - 0.02, hitAt, hitAt + 0.02, hitAt + 0.05)
      c.fig.root.visible = appear > 0.01 && p < hitAt + 0.06
      if (p > hitAt - 0.02 && p < hitAt + 0.015 && bi < 2) {
        const b = s.bolts[bi++]
        b.line.visible = Math.sin(t * 50) > -0.3
        c.fig.root.getWorldPosition(tmpB)
        b.line.parent.worldToLocal(tmpB)
        b.set(tmpA.set(0, 1.1, 0), tmpB.setY(0.35), 0.1)
      }
      if (p > hitAt + 0.01 && !s.popped.has(k)) {
        s.popped.add(k)
        const cp = c.fig.root.position
        s.pops.emit(24, () => ({ p: [cp.x, 0.3, cp.z], v: [(Math.random() - 0.5) * 0.8, Math.random() * 0.8, (Math.random() - 0.5) * 0.8], life: 0.9 }))
      }
    })
    if (p < 0.2) s.popped.clear()
    if (p > 0.71 && p < 0.75 && bi < 2) {
      const b = s.bolts[bi++]
      b.line.visible = true
      b.set(tmpA.set(0, 1.1, 0), tmpB.set(0, 0.45, 0), 0.1)
    }
    s.main.mat.userData.c = bump(p, 0.7, 0.72, 0.75, 0.8)
    s.bolts.forEach((b) => (b.mat.opacity = on))
    s.pops.update(dt, { gravity: -0.5 })
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------------- Captain America ----------------
export function CapHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const shieldMat = M('#ffffff')
    const fig = buildHero('cap', mat, { glow: shieldMat })
    fig.root.scale.setScalar(0.6)
    g.add(fig.root)
    const shield = fig.parts.shield
    const halves = [0, 1].map((k) => {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.008, 16, 1, false, k * Math.PI, Math.PI), shieldMat)
      h.visible = false
      g.add(h)
      return h
    })
    const gridMat = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const grid = new THREE.PolarGridHelper(0.42, 8, 4, 40)
    grid.material = gridMat
    g.add(grid)
    const rubble = []
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.04 + Math.random() * 0.05, 0.03 + Math.random() * 0.06, 0.04 + Math.random() * 0.04), mat)
      const a = Math.random() * Math.PI * 2
      r.position.set(Math.cos(a) * (0.18 + Math.random() * 0.2), 0.02, Math.sin(a) * (0.18 + Math.random() * 0.2))
      r.rotation.set(Math.random(), Math.random(), Math.random())
      g.add(r)
      rubble.push(r)
    }
    const bolts = [0, 1, 2].map(() => {
      const b = makeBolt(GREEN, 14, 0.02)
      g.add(b.line)
      return b
    })
    const sparks = makeEmitter(100, { color: '#ffffff', size: 0.018 })
    g.add(sparks.points)
    return { fig, mat, shield, shieldMat, halves, gridMat, bolts, sparks }
  })
  const base = useRef(new THREE.Vector3())
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.08, 'defiant'], [0.18, 'crouchShield'], [0.58, 'crouchShield'], [0.64, 'kneel'], [0.7, 'kneel'], [0.78, 'defiant']], p)
    const cracked = p > 0.58
    s.shield.visible = !cracked
    const firing = p > 0.2 && p < 0.58
    s.bolts.forEach((b, k) => {
      b.line.visible = firing && Math.sin(t * 35 + k * 2) > 0.2
      if (b.line.visible) {
        s.shield.getWorldPosition(tmpB)
        s.g.worldToLocal(tmpB)
        b.set(tmpA.set(0.5 - k * 0.2, 0.9, 0.45), tmpB, 0.08)
        if (Math.random() < 0.3) s.sparks.emit(3, () => ({ p: [tmpB.x, tmpB.y, tmpB.z], v: [(Math.random() - 0.5) * 1.2, Math.random(), (Math.random() - 0.2) * 1.2], life: 0.4 }))
      }
      b.mat.opacity = on
    })
    s.shieldMat.userData.o = 1 + (firing && Math.sin(t * 35) > 0.5 ? 1.5 : 0)
    const fall = seg(p, 0.58, 0.72)
    s.halves.forEach((h, k) => {
      h.visible = cracked && p < 0.95
      h.position.set(0.12 + (k ? 0.08 : -0.04) * (1 + fall * 2), lerp(0.3, 0.015, fall * fall), 0.14 + fall * 0.05)
      h.rotation.set(Math.PI / 2 - fall * 1.5, fall * (k ? 1 : -1), k ? fall * 0.6 : -fall * 0.6)
    })
    s.g.getWorldPosition(base.current)
    const wipe = seg(p, 0.8, 1)
    for (const m of s.mats) m.uniforms.uWipe.value = wipe > 0 ? base.current.y + wipe * 0.7 - 0.02 : -100
    s.gridMat.opacity = on * 0.5 * (1 - wipe)
    s.sparks.update(dt, { gravity: -2 })
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------------- Hulk ----------------
export function HulkHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const fig = buildHero('hulk', mat)
    g.add(fig.root)
    const waveMat = additive(color, 0)
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), waveMat)
    wave.rotation.x = -Math.PI / 2
    wave.position.y = 0.01
    g.add(wave)
    const chainMat = M(GREEN)
    const linkGeo = new THREE.TorusGeometry(0.022, 0.006, 6, 12)
    const hoops = [0.3, 0.45, 0.6].map((y, h) => {
      const hoop = new THREE.Group()
      for (let i = 0; i < 18; i++) {
        const l = new THREE.Mesh(linkGeo, chainMat)
        const a = (i / 18) * Math.PI * 2
        l.position.set(Math.cos(a), 0, Math.sin(a))
        l.rotation.set(0, -a, i % 2 ? Math.PI / 2 : 0)
        hoop.add(l)
      }
      hoop.position.y = y
      hoop.userData.tilt = (h - 1) * 0.25
      g.add(hoop)
      return hoop
    })
    return { fig, mat, wave, waveMat, hoops, chainMat }
  })
  useHoloFrame(rt, s, (st) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.08, 'smashUp'], [0.2, 'smashUp'], [0.25, 'smashDown'], [0.34, 'smashDown'], [0.44, 'strain'], [0.7, 'strain'], [0.8, 'kneelChained']], p)
    const shrink = seg(p, 0.7, 0.86)
    const strain = bump(p, 0.44, 0.5, 0.66, 0.7)
    const sc = lerp(0.72, 0.42, shrink) * (1 + strain * Math.sin(t * 40) * 0.015)
    s.fig.root.scale.set(sc * lerp(1, 0.75, shrink), sc, sc * lerp(1, 0.75, shrink))
    const w = seg(p, 0.25, 0.42)
    s.wave.scale.setScalar(0.05 + w * 0.5)
    s.waveMat.opacity = on * (1 - w) * (w > 0 ? 1 : 0)
    const close = smooth(0.3, 0.46, p)
    const tight = smooth(0.7, 0.85, p)
    s.hoops.forEach((h, i) => {
      const r = lerp(1.3, 0.2, close) - tight * 0.07 + strain * (0.03 + Math.sin(t * 25 + i) * 0.02)
      h.scale.set(r, 1, r)
      h.position.y = (0.3 + i * 0.15) * lerp(1, 0.75, shrink)
      h.rotation.set(h.userData.tilt, t * (i % 2 ? 0.6 : -0.6), 0)
      h.visible = close > 0.01
    })
    s.mat.userData.d = seg(p, 0.86, 1)
    s.chainMat.userData.d = seg(p, 0.9, 1)
    s.mat.userData.g = strain * 0.6
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------------- Fantastic Four members ----------------
// win: [a,b] window inside rt.holo when this member's reconstruction plays. Each ends partially dissolved;
// rt.malfunction finishes them all together.
const memberP = (rt, win) => seg(rt.holo, win[0], win[1])

export function ReedHolo({ rt, color, win }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const fig = buildHero('reed', mat)
    fig.root.scale.setScalar(0.5)
    fig.root.position.x = -0.16
    fig.root.rotation.y = 0.9
    g.add(fig.root)
    const consoleMat = M(color)
    const con = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.1), consoleMat)
    body.position.y = 0.09
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.01), consoleMat)
    screen.position.set(0, 0.24, -0.02)
    screen.rotation.x = -0.3
    con.add(body, screen)
    con.position.set(0.2, 0, 0.05)
    g.add(con)
    const coreMat = M(GREEN, false)
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), coreMat)
    core.position.set(0.2, 0.25, 0.05)
    g.add(core)
    return { fig, mat, con, consoleMat, core, coreMat }
  })
  useHoloFrame(rt, s, (st) => {
    const t = st.clock.elapsedTime
    const p = memberP(rt, win)
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.1, 'reach'], [0.48, 'reachFar'], [0.62, 'reachFar'], [0.78, 'limp']], p)
    const grow = smooth(0.5, 0.75, p)
    s.core.scale.setScalar(0.05 + grow * 2.6)
    s.core.rotation.y = t
    s.coreMat.userData.o = grow > 0 ? 0.6 : 0
    s.coreMat.userData.d = seg(p, 0.85, 1) * 0.9
    s.consoleMat.userData.g = bump(p, 0.3, 0.45, 0.55, 0.6) * 2
    s.consoleMat.userData.d = seg(p, 0.6, 0.8) * 0.8
    s.mat.userData.d = seg(p, 0.72, 1) * 0.5
    s.mat.userData.c = grow * 0.5
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

export function SueHolo({ rt, color, win }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const fig = buildHero('sue', mat)
    fig.root.scale.setScalar(0.5)
    g.add(fig.root)
    const bubbleMat = M(color, false)
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), bubbleMat)
    bubble.position.y = 0.26
    g.add(bubble)
    const press = makeEmitter(140, { color: GREEN, size: 0.02 })
    g.add(press.points)
    const shards = makeEmitter(80, { color, size: 0.03 })
    g.add(shards.points)
    return { fig, mat, bubble, bubbleMat, press, shards, burst: false }
  })
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = memberP(rt, win)
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.1, 'shieldUp'], [0.62, 'shieldUp'], [0.75, 'limp']], p)
    const up = smooth(0.08, 0.22, p)
    const pressure = seg(p, 0.3, 0.62)
    s.bubble.scale.setScalar(up * (1 - pressure * 0.18 + Math.sin(t * 30) * 0.01 * pressure))
    s.bubble.visible = p < 0.72
    s.bubbleMat.userData.o = 0.55 + pressure * 0.6
    s.bubbleMat.userData.g = pressure * 1.5
    s.bubbleMat.userData.d = seg(p, 0.62, 0.72)
    if (on > 0 && p > 0.3 && p < 0.65) {
      s.press.emit(2, () => {
        const a = Math.random() * Math.PI * 2
        const b = Math.random() * Math.PI
        const d = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a))
        return { p: [d.x * 0.7, 0.26 + d.y * 0.7, d.z * 0.7], v: [-d.x * 1.2, -d.y * 1.2, -d.z * 1.2], life: 0.35 }
      })
    }
    if (p > 0.64 && !s.burst) {
      s.burst = true
      s.shards.emit(60, () => {
        const a = Math.random() * Math.PI * 2
        const y = Math.random() * 2 - 1
        return { p: [Math.cos(a) * 0.25, 0.26 + y * 0.25, Math.sin(a) * 0.25], v: [Math.cos(a) * 0.9, y * 0.6, Math.sin(a) * 0.9], life: 0.8 }
      })
    }
    if (p < 0.1) s.burst = false
    s.press.update(dt)
    s.shards.update(dt, { gravity: -1.5 })
    s.mat.userData.d = seg(p, 0.72, 1) * 0.5
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

export function JohnnyHolo({ rt, color, win }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const fig = buildHero('johnny', mat)
    fig.root.scale.setScalar(0.5)
    g.add(fig.root)
    const flames = makeEmitter(220, { color: '#ffb04a', size: 0.035 })
    g.add(flames.points)
    const waveMat = M(GREEN, false)
    const wave = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), waveMat)
    wave.rotation.z = -Math.PI / 2
    g.add(wave)
    return { fig, mat, flames, wave, waveMat }
  })
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = memberP(rt, win)
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.1, 'flameOn'], [0.6, 'flameOn'], [0.75, 'limp']], p)
    const fallen = seg(p, 0.62, 0.82)
    s.fig.root.position.y = (0.18 + Math.sin(t * 2) * 0.02) * (1 - fallen) * smooth(0, 0.12, p)
    s.fig.root.rotation.z = fallen * 1.3
    const intensity = p < 0.56 ? 0.3 + seg(p, 0, 0.55) * 1.4 : 0
    if (on > 0 && intensity > 0) {
      const n = Math.ceil(intensity * 5)
      const y0 = s.fig.root.position.y
      s.flames.emit(n, () => ({ p: [(Math.random() - 0.5) * 0.12, y0 + 0.1 + Math.random() * 0.35, (Math.random() - 0.5) * 0.1], v: [(Math.random() - 0.5) * 0.15, 0.3 + Math.random() * 0.5 * intensity, (Math.random() - 0.5) * 0.15], life: 0.5 + Math.random() * 0.4 }))
    }
    s.flames.update(dt, { turbulence: 0.6, t })
    const w = seg(p, 0.52, 0.66)
    s.wave.visible = w > 0 && w < 1
    s.wave.position.x = lerp(-0.6, 0.6, w)
    s.wave.scale.set(0.15, 0.45, 0.45)
    s.waveMat.userData.o = 0.9
    s.mat.userData.grey = seg(p, 0.58, 0.68)
    s.mat.userData.d = seg(p, 0.75, 1) * 0.5
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

export function BenHolo({ rt, color, win }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const fig = buildHero('ben', mat)
    fig.root.scale.setScalar(0.5)
    g.add(fig.root)
    const storm = makeEmitter(200, { color: GREEN, size: 0.022 })
    g.add(storm.points)
    const crackMat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const pts = []
    for (let k = 0; k < 6; k++) {
      let a = (k / 6) * Math.PI * 2
      let x = 0
      let z = 0
      for (let i = 0; i < 6; i++) {
        pts.push(new THREE.Vector3(x, 0.005, z))
        a += (Math.random() - 0.5) * 0.8
        x += Math.cos(a) * 0.06
        z += Math.sin(a) * 0.06
        pts.push(new THREE.Vector3(x, 0.005, z))
      }
    }
    const crackGeo = new THREE.BufferGeometry().setFromPoints(pts)
    const cracks = new THREE.LineSegments(crackGeo, crackMat)
    g.add(cracks)
    const dust = makeEmitter(120, { color, size: 0.02 })
    g.add(dust.points)
    return { fig, mat, storm, cracks, crackGeo, crackMat, total: pts.length, dust, frozenAt: null }
  })
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = memberP(rt, win)
    const on = holoOn(rt, t)
    const frozen = p > 0.62
    if (!frozen) poseAt(s.fig.j, [[0, 'idle'], [0.1, 'stance'], [0.6, 'stance']], p)
    s.fig.root.position.x = frozen ? 0 : Math.sin(t * 16) * 0.004 * seg(p, 0.3, 0.6)
    if (on > 0 && p > 0.05 && p < 0.62) {
      s.storm.emit(3, () => {
        const a = Math.random() * Math.PI * 2
        return { p: [Math.cos(a) * 0.6, Math.random() * 0.5, Math.sin(a) * 0.6 + 0.2], v: [-Math.cos(a) * 0.5 + Math.sin(a) * 0.6, 0, -Math.sin(a) * 0.5 - Math.cos(a) * 0.6], life: 0.8 }
      })
    }
    s.storm.update(dt)
    const c = seg(p, 0.4, 0.6)
    s.crackGeo.setDrawRange(0, Math.floor(s.total * c / 2) * 2)
    s.crackMat.opacity = on
    s.mat.userData.grey = frozen ? 1 : 0
    s.mat.userData.g = frozen ? 0 : 0.1
    const dis = seg(p, 0.75, 1)
    s.mat.userData.d = dis * 0.5
    if (on > 0 && dis > 0 && dis < 1) s.dust.emit(2, () => ({ p: [(Math.random() - 0.5) * 0.2, Math.random() * 0.5, (Math.random() - 0.5) * 0.15], v: [0, 0.3 + Math.random() * 0.3, 0], life: 1 }))
    s.dust.update(dt, { turbulence: 0.4, t })
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------- Thor: calls down the storm through Mjolnir; it turns green and strikes him down ----------
export function ThorHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const fig = buildHero('thor', mat)
    fig.root.scale.setScalar(0.62)
    g.add(fig.root)
    const cloudMat = M(color, false)
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat)
    cloud.position.y = 0.95
    cloud.scale.y = 0.18
    g.add(cloud)
    const bolts = [0, 1, 2].map((k) => {
      const b = makeBolt(k === 2 ? GREEN : '#cfeeff', 14, 0.025)
      g.add(b.line)
      return b
    })
    const sparks = makeEmitter(90, { color: '#e4f6ff', size: 0.02 })
    g.add(sparks.points)
    return { fig, mat, cloud, cloudMat, bolts, sparks }
  })
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.1, 'raise'], [0.5, 'raise'], [0.58, 'brace'], [0.68, 'kneel'], [1, 'kneel']], p)
    s.cloud.scale.set(1 + Math.sin(t) * 0.04, 0.18, 1)
    s.cloud.rotation.y = t * 0.3
    s.cloudMat.userData.o = 0.25 + smooth(0, 0.2, p) * 0.5
    s.cloudMat.userData.c = smooth(0.45, 0.55, p)
    const callUp = p > 0.12 && p < 0.48
    const strike = p > 0.5 && p < 0.62
    s.fig.parts.hammer.getWorldPosition(tmpB)
    s.g.worldToLocal(tmpB)
    s.bolts.forEach((b, k) => {
      b.line.visible = on > 0 && ((k < 2 && callUp && Math.random() < 0.6) || (k === 2 && strike && Math.sin(t * 40) > -0.2))
      if (!b.line.visible) return
      if (k < 2) b.set(tmpA.set((Math.random() - 0.5) * 0.5, 0.93, (Math.random() - 0.5) * 0.3), tmpB, 0.09)
      else b.set(tmpA.set(0, 0.95, 0), _c.set(0, 0.4, 0), 0.08)
      b.mat.opacity = on
    })
    if (callUp && Math.random() < 0.4) s.sparks.emit(3, () => ({ p: [tmpB.x, tmpB.y, tmpB.z], v: [(Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)], life: 0.35 }))
    s.sparks.update(dt, { gravity: -1.5 })
    s.fig.parts.hammer.visible = p < 0.64
    s.mat.userData.c = smooth(0.5, 0.6, p) * 0.6
    s.mat.userData.d = seg(p, 0.8, 1)
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------- Iron Man: repulsor flight, a failing unibeam, and the armour powers down ----------
export function IronManHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const glow = M('#e8f8ff')
    const fig = buildHero('ironman', mat, { glow })
    fig.root.scale.setScalar(0.6)
    g.add(fig.root)
    const thrust = makeEmitter(120, { color: '#dff6ff', colorEnd: '#ff8a3a', size: 0.03, sizeEnd: 0.08 })
    g.add(thrust.points)
    const beamMat = M('#e8f8ff', false)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.8, 12, 1, true), beamMat)
    beam.rotation.x = Math.PI / 2
    beam.position.set(0, 0.48, 0.46)
    g.add(beam)
    const bolt = makeBolt(GREEN, 14, 0.025)
    g.add(bolt.line)
    return { fig, mat, glow, thrust, beam, beamMat, bolt }
  })
  useHoloFrame(rt, s, (st, dt) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.1, 'flameOn'], [0.3, 'cast'], [0.55, 'cast'], [0.68, 'limp'], [1, 'limp']], p)
    const fly = smooth(0.06, 0.18, p) * (1 - smooth(0.62, 0.76, p))
    s.fig.root.position.y = fly * (0.25 + Math.sin(t * 2.4) * 0.02)
    s.fig.root.rotation.x = smooth(0.66, 0.8, p) * -1.3
    if (on > 0 && fly > 0.2) s.thrust.emit(2, () => ({ p: [(Math.random() - 0.5) * 0.08, s.fig.root.position.y + 0.02, 0], v: [(Math.random() - 0.5) * 0.15, -0.7, 0], life: 0.35 }))
    s.thrust.update(dt)
    const firing = bump(p, 0.32, 0.36, 0.5, 0.56)
    s.beam.visible = firing > 0.01
    s.beam.position.y = 0.48 + s.fig.root.position.y * 0.6
    s.beamMat.userData.o = firing * (Math.random() < 0.3 ? 0.4 : 1)
    s.bolt.line.visible = on > 0 && p > 0.5 && p < 0.62 && Math.random() < 0.7
    if (s.bolt.line.visible) s.bolt.set(tmpA.set(0.6, 0.9, 0.4), tmpB.set(0, 0.45 + s.fig.root.position.y * 0.6, 0.04), 0.08)
    s.bolt.mat.opacity = on
    const dying = seg(p, 0.55, 0.7)
    s.glow.userData.o = (1 - dying) * (1 + Math.sin(t * 18) * 0.25) + (dying > 0 && Math.random() < 0.2 ? 0.6 : 0)
    s.mat.userData.d = seg(p, 0.82, 1)
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------- Black Panther: absorbs the blows, releases a kinetic blast, struck down mid-leap ----------
export function PantherHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const glow = M('#f0e4ff')
    const fig = buildHero('panther', mat, { glow })
    fig.root.scale.setScalar(0.6)
    g.add(fig.root)
    const waveMat = M(color, false)
    const wave = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), waveMat)
    wave.position.y = 0.3
    g.add(wave)
    const bolts = [0, 1].map(() => {
      const b = makeBolt(GREEN, 12, 0.022)
      g.add(b.line)
      return b
    })
    return { fig, mat, glow, wave, waveMat, bolts }
  })
  useHoloFrame(rt, s, (st) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    poseAt(s.fig.j, [[0, 'idle'], [0.08, 'crouchShield'], [0.4, 'crouchShield'], [0.48, 'castWide'], [0.56, 'flameOn'], [0.7, 'limp'], [1, 'limp']], p)
    const absorbing = p > 0.1 && p < 0.42
    s.bolts.forEach((b, k) => {
      b.line.visible = on > 0 && ((absorbing && Math.sin(t * 30 + k * 3) > 0.3) || (p > 0.6 && p < 0.68 && k === 0))
      if (b.line.visible) b.set(tmpA.set(k ? -0.6 : 0.6, 0.8, 0.4), tmpB.set(0, 0.32 + s.fig.root.position.y, 0.05), 0.08)
      b.mat.opacity = on
    })
    s.glow.userData.o = 0.5 + seg(p, 0.1, 0.42) * 2.5 * (p < 0.5 ? 1 : 0.2)
    const blast = seg(p, 0.44, 0.56)
    s.wave.visible = blast > 0 && blast < 1
    s.wave.scale.setScalar(0.2 + blast * 2.2)
    s.waveMat.userData.o = (1 - blast) * 0.8
    const leap = bump(p, 0.52, 0.58, 0.62, 0.72)
    s.fig.root.position.y = leap * 0.35
    s.fig.root.rotation.x = smooth(0.62, 0.74, p) * -1.3
    s.mat.userData.c = smooth(0.6, 0.66, p) * 0.6
    s.mat.userData.d = seg(p, 0.82, 1)
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

// ---------- Spider-Man: swings between anchor points until every web is cut ----------
const ANCHORS = [[-0.4, 0.95, -0.1], [0.4, 0.95, 0.05], [-0.25, 0.95, 0.2]]
export function SpiderHolo({ rt, color }) {
  const s = useHolo((M, g) => {
    const mat = M(color)
    const glow = M('#ffffff')
    const fig = buildHero('spider', mat, { glow })
    fig.root.scale.setScalar(0.55)
    g.add(fig.root)
    const webMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const webGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const web = new THREE.Line(webGeo, webMat)
    web.frustumCulled = false
    g.add(web)
    const cut = makeBolt(GREEN, 12, 0.02)
    g.add(cut.line)
    return { fig, mat, web, webGeo, webMat, cut }
  })
  useHoloFrame(rt, s, (st) => {
    const t = st.clock.elapsedTime
    const p = rt.holo
    const on = holoOn(rt, t)
    const swings = seg(p, 0.06, 0.6) * ANCHORS.length
    const k = Math.min(ANCHORS.length - 1, Math.floor(swings))
    const f = swings - k
    const A = ANCHORS[k]
    const falling = p > 0.6
    const ang = Math.sin(f * Math.PI - Math.PI / 2) * 0.9
    const len = 0.6
    const px = falling ? A[0] + 0.1 : A[0] + Math.sin(ang) * len * 0.8
    const py = falling ? lerp(0.35, 0, seg(p, 0.6, 0.75)) : A[1] - Math.cos(ang) * len
    s.fig.root.position.set(px, Math.max(0, py - 0.25), A[2])
    s.fig.root.rotation.set(falling ? smooth(0.6, 0.75, p) * -1.4 : 0, 0, falling ? 0 : -ang * 0.6)
    poseAt(s.fig.j, falling ? [[0, 'flameOn'], [1, 'limp']] : [[0, 'raise'], [1, 'raise']], falling ? seg(p, 0.6, 0.8) : 0)
    const pos = s.webGeo.attributes.position
    s.fig.parts.webHand.getWorldPosition(tmpB)
    s.g.worldToLocal(tmpB)
    pos.setXYZ(0, A[0], A[1], A[2])
    pos.setXYZ(1, tmpB.x, tmpB.y, tmpB.z)
    pos.needsUpdate = true
    s.web.visible = !falling
    s.webMat.opacity = on * 0.9
    s.cut.line.visible = on > 0 && p > 0.56 && p < 0.62
    if (s.cut.line.visible) s.cut.set(tmpA.set(0.6, 1, 0.3), _c.set(A[0], A[1] - 0.2, A[2]), 0.08)
    s.cut.mat.opacity = on
    s.mat.userData.d = seg(p, 0.8, 1)
    driveHolo(s.mats, t, rt, on)
  })
  return <primitive object={s.g} />
}

export const HOLOS = { strange: StrangeHolo, loki: LokiHolo, thor: ThorHolo, ironman: IronManHolo, cap: CapHolo, hulk: HulkHolo, panther: PantherHolo, spider: SpiderHolo, reed: ReedHolo, sue: SueHolo, johnny: JohnnyHolo, ben: BenHolo }

// Stone figurine posed in the hero's final moment.
export function Figurine({ mat, hero, pose, scale = 0.4, extra }) {
  const f = useMemo(() => {
    const fig = buildHero(hero, mat, { shadows: true })
    setPose(fig.j, pose === 'fallen' ? 'fallen' : pose)
    if (pose === 'fallen') {
      fig.root.rotation.x = -Math.PI / 2
      fig.root.position.set(0, 0.06, 0.4)
    }
    if (pose === 'flameOn') {
      fig.root.rotation.z = 1.2
      fig.root.position.y = 0.1
    }
    return fig
  }, [])
  return (
    <group scale={scale}>
      <primitive object={f.root} />
      {extra}
    </group>
  )
}
