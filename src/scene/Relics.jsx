import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { burnable, additive, beamMaterial } from '../lib/materials'
import { buttonCanvas, toTexture, BUTTON_BODY, crackTexture, makeCanvas } from '../lib/textures'
import { makeEmitter, makeBolt, camPos } from '../lib/particles'
import { taperedTube } from '../lib/figure'
import { bump, smooth, seg, lerp } from '../lib/util'
import ModelAsset from './ModelAsset'
import { buildHeroHead } from '../lib/heroHeadGeometry'



// Every relic has an "act": rt.transform runs 0..1 after the hologram and the relic performs
// (the cloak flies, the shield ricochets, Mjolnir calls lightning...). Positions are local to the relic plinth top.

let shineTex
function shineTexture() {
  if (shineTex) return shineTex
  const [c, g] = makeCanvas(256, 64)
  const gr = g.createLinearGradient(0, 0, 256, 0)
  gr.addColorStop(0.0, 'rgba(255,255,255,0)')
  gr.addColorStop(0.42, 'rgba(255,255,255,0)')
  gr.addColorStop(0.5, 'rgba(255,255,255,0.85)')
  gr.addColorStop(0.58, 'rgba(255,255,255,0)')
  gr.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 64)
  shineTex = toTexture(c, { srgb: false })
  shineTex.wrapS = THREE.RepeatWrapping
  return shineTex
}

// The supplied Marvel button as a physical device: a gunmetal bezel with a ready-light, and a cap that travels.
// api receives { cap, ring, body, shine } so the owner can drive hover/press/glow per frame.
export function ButtonModel({ style, label, burnMats, api, bezel = false }) {
  const m = useMemo(() => {
    const body = burnable(new THREE.MeshStandardMaterial({ color: BUTTON_BODY[style], metalness: style === 'gold' ? 1 : 0.25, roughness: style === 'velvet' ? 0.85 : 0.32, emissive: '#ffffff', emissiveIntensity: 0 }))
    const faceTex = toTexture(buttonCanvas(style, label))
    const face = burnable(new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, alphaTest: 0.5, metalness: style === 'gold' ? 0.35 : 0.1, roughness: 0.42, emissive: '#ffffff', emissiveMap: faceTex, emissiveIntensity: 0.05 }))
    const shine = new THREE.MeshBasicMaterial({ map: shineTexture().clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    shine.map.wrapS = THREE.RepeatWrapping
    const frame = burnable(new THREE.MeshStandardMaterial({ color: '#25272a', metalness: 1, roughness: 0.3 }))
    const ring = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffcf7a', emissiveIntensity: 0 })
    if (burnMats) burnMats.push(body, face, frame)
    return { body, face, shine, frame, ring }
  }, [style, label])
  const cap = useRef()
  if (api) Object.assign(api, { body: m.body, shine: m.shine, ring: m.ring, cap })
  return (
    <group>
      {bezel && (
        <>
          <RoundedBox args={[1.2, 0.5, 0.09]} radius={0.04} smoothness={3} position={[0, 0, -0.03]} material={m.frame} castShadow />
          <RoundedBox args={[1.07, 0.39, 0.03]} radius={0.05} smoothness={3} position={[0, 0, 0.02]} material={m.ring} />
          {[-0.54, 0.54].map((x) => (
            <mesh key={x} material={m.frame} position={[x, 0.19, 0.02]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.018, 0.018, 0.02, 10]} />
            </mesh>
          ))}
        </>
      )}
      <group ref={cap} position={[0, 0, bezel ? 0.07 : 0]}>
        <RoundedBox args={[1, 0.32, 0.12]} radius={0.05} smoothness={4} material={m.body} castShadow />
        <mesh material={m.face} position={[0, 0, 0.0615]}>
          <planeGeometry args={[0.99, 0.317]} />
        </mesh>
        <mesh material={m.shine} position={[0, 0, 0.063]}>
          <planeGeometry args={[0.97, 0.3]} />
        </mesh>
      </group>
    </group>
  )
}

function useBurn(burnMats, make) {
  return useMemo(() => {
    const mats = make()
    Object.values(mats).forEach((m) => burnable(m, '#7dff9a'))
    burnMats.push(...Object.values(mats))
    return mats
  }, [])
}

// Shared one-shot spark/flash burst for relic acts.
function useBurst(color = '#fff2c8', end = '#ff8a2a', n = 80) {
  return useMemo(() => makeEmitter(n, { color, colorEnd: end, size: 0.05, sizeEnd: 0.25 }), [])
}
const burst = (em, p, n = 40, speed = 1.6) => em.emit(n, () => ({ p, v: [(Math.random() - 0.5) * speed, (Math.random() - 0.3) * speed, (Math.random() - 0.5) * speed], life: 0.4 + Math.random() * 0.5 }))

// Is the relic near the camera? Skip per-frame work for distant shrines.
function useNear(rt) {
  const ref = useRef()
  const wp = useMemo(() => new THREE.Vector3(), [])
  const near = () => {
    if (!ref.current || rt?.done || (rt && rt.unfurl < 0.001)) return false
    for (let parent = ref.current; parent; parent = parent.parent) if (!parent.visible) return false
    ref.current.getWorldPosition(wp)
    return Math.abs(camPos.x - wp.x) < 30
  }
  return [ref, near]
}

// ---------- Doctor Strange: the Cloak of Levitation lifts from its bell jar and flies ----------
function useCloak() {
  return useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 32, 36)
    const p = g.attributes.position
    const col = new Float32Array(p.count * 3)
    const red = new THREE.Color('#9a1022')
    const gold = new THREE.Color('#d9a743')
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) * 2
      const v = 0.5 - p.getY(i)
      const y = -v * 0.95
      p.setXYZ(i, u * (0.22 + v * 0.18), y + Math.cos(u * Math.PI * 3) * 0.018 * v * v,
        -0.13 + u * u * 0.2 + Math.sin(u * Math.PI * 5) * 0.018 * v)
      ;(v > 0.94 || Math.abs(u) > 0.96 ? gold : red).toArray(col, i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeVertexNormals()
    const collar = new THREE.CylinderGeometry(0.24, 0.12, 0.28, 36, 4, true, Math.PI * 0.22, Math.PI * 1.56)
    return { g, base: p.array.slice(), collar }
  }, [])
}

function animateCloak(c, t, amp, flow = 0) {
  const p = c.g.attributes.position.array
  const b = c.base
  for (let i = 0; i < p.length; i += 3) {
    const x = b[i]
    const y = b[i + 1]
    const z = b[i + 2]
    const down = Math.min(1, Math.max(0, (-y - 0.12) / 0.83))
    p[i] = x + Math.sin(t * 1.7 + y * 6) * amp * down
    p[i + 2] = z + Math.sin(x * 15 + t * (1.4 + flow * 4) + y * 5) * (0.012 + flow * 0.07) * down - flow * down * down * 0.25
  }
  c.g.attributes.position.needsUpdate = true
  c.g.computeVertexNormals()
}

export function CloakRelic({ rt, burnMats }) {
  const cloak = useCloak()
  const M = useBurn(burnMats, () => ({
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }),
    red: new THREE.MeshStandardMaterial({ color: '#9a1022', roughness: 0.72 }),
    lining: new THREE.MeshStandardMaterial({ color: '#2e0509', roughness: 0.9, side: THREE.BackSide }),
    gold: new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 1, roughness: 0.28 }),
    form: new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.9 }),
  }))
  const jar = useMemo(() => new THREE.LatheGeometry([[0, 1.36], [0.09, 1.35], [0.25, 1.27], [0.34, 1.1], [0.37, 0.85], [0.38, 0.05], [0.4, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 40), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8efe6', transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0.95, depthWrite: false, side: THREE.DoubleSide }), [])
  const jarRef = useRef()
  const fly = useRef()
  const trail = useMemo(() => makeEmitter(140, { color: '#ffb46a', colorEnd: '#a01020', size: 0.05, sizeEnd: 0.2 }), [])
  const [ref, near] = useNear(rt)
  useFrame((s, dt) => {
    if (!near()) return
    const t = s.clock.elapsedTime
    const p = rt.transform
    const air = bump(p, 0.12, 0.25, 0.8, 0.95)
    const u = seg(p, 0.18, 0.86)
    // a figure-of-eight over the whole shrine, banking into each turn
    const px = 1.15 + Math.sin(u * Math.PI * 2) * 1.05
    const py = 1.02 + 0.55 + Math.sin(u * Math.PI * 4) * 0.3
    const pz = 0.35 + Math.sin(u * Math.PI * 4) * 0.35
    fly.current.position.set(lerp(0, px, air), lerp(1.02, py, air), lerp(0, pz, air))
    fly.current.rotation.set(air * Math.sin(u * Math.PI * 4) * 0.4, air * Math.cos(u * Math.PI * 2) * 1.2, air * -Math.cos(u * Math.PI * 2) * 0.5)
    animateCloak(cloak, t, 0.006 + bump(p, 0, 0.06, 0.12, 0.2) * 0.06, air)
    if (air > 0.3) trail.emit(2, () => ({ p: [fly.current.position.x + (Math.random() - 0.5) * 0.3, fly.current.position.y - 0.6, fly.current.position.z], v: [0, -0.1, 0], life: 0.8 }))
    trail.update(dt, { turbulence: 0.4, t })
    const lift = smooth(0.0, 0.14, p) * (1 - smooth(0.9, 1, p))
    jarRef.current.position.y = lift * 1.8
    glass.opacity = 0.1 * (1 - lift * 0.8) * (1 - smooth(0.05, 0.3, rt.burn))
  })
  return (
    <group ref={ref}>
      <mesh ref={jarRef} geometry={jar} material={glass} />
      <mesh material={M.gold} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.04, 40]} />
      </mesh>
      <mesh material={M.form} position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.4, 8]} />
      </mesh>
      <mesh material={M.form} position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.03, 20]} />
      </mesh>
      <group ref={fly} position={[0, 1.02, 0]}>
        <mesh geometry={cloak.g} material={M.cloth} castShadow />
        <mesh geometry={cloak.g} material={M.lining} />
        <mesh geometry={cloak.collar} material={M.red} position={[0, 0.1, -0.03]} rotation-x={-0.18} castShadow />
        <mesh geometry={cloak.collar} material={M.lining} position={[0, 0.1, -0.03]} rotation-x={-0.18} />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.06, -0.035, 0.105]}>
            <mesh material={M.gold} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.032, 0.032, 0.01, 20]} />
            </mesh>
          </group>
        ))}
      </group>
      <primitive object={trail.points} />
    </group>
  )
}

// ---------- Loki: the horned helm rises and splits into golden illusions ----------
export function HelmRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({
    gold: new THREE.MeshStandardMaterial({ color: '#d8ae52', metalness: 1, roughness: 0.2 }),
    darkGold: new THREE.MeshStandardMaterial({ color: '#8a6526', metalness: 1, roughness: 0.35 }),
    velvet: new THREE.MeshStandardMaterial({ color: '#123a1f', roughness: 0.95 }),
    gem: new THREE.MeshStandardMaterial({ color: '#0a2a4a', emissive: '#59c4ff', emissiveIntensity: 2.2, roughness: 0.1 }),
    lining: new THREE.MeshStandardMaterial({ color: '#0d1f12', roughness: 1 }),
  }))
  const geo = useMemo(() => {
    const blade = taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.06, 0), new THREE.Vector3(0.03, 0.14, 0), new THREE.Vector3(-0.02, 0.19, 0)]), 0.014, 0.001, 16, 6)
    return { blade }
  }, [])
  const ghost = useMemo(() => additive('#ffd36b', 0), [])
  const helmets = useMemo(() => {
    const make = (gold, dark) => {
      const h = buildHeroHead('loki', { primary: gold, secondary: dark, skin: dark, hair: dark, metal: gold, eye: gold }, { shadows: true, maskOnly: true })
      h.root.scale.setScalar(2.7)
      h.root.position.y = -0.1
      return h.root
    }
    return { actual: make(M.gold, M.darkGold), copies: [make(ghost, ghost), make(ghost, ghost), make(ghost, ghost)] }
  }, [M, ghost])
  const hover = useRef()
  const ghosts = useRef([])
  const flash = useBurst('#fff4c0', '#ffb030')
  const st = useMemo(() => ({ fired: false }), [])
  const [ref, near] = useNear(rt)
  useFrame((s, dt) => {
    if (!near()) return
    const t = s.clock.elapsedTime
    const p = rt.transform
    const rise = bump(p, 0, 0.18, 0.82, 1)
    hover.current.position.y = 0.34 + Math.sin(t * 1.2) * 0.015 + rise * 0.55
    hover.current.rotation.y = Math.sin(t * 0.45) * 0.25 + p * Math.PI * 2
    const split = bump(p, 0.22, 0.32, 0.7, 0.8)
    ghost.opacity = split * (0.35 + (Math.random() < 0.15 ? 0.3 : 0))
    ghosts.current.forEach((gh, k) => {
      if (!gh) return
      const a = t * 1.6 + (k / 3) * Math.PI * 2
      gh.visible = split > 0.01
      gh.position.set(Math.cos(a) * 0.55 * split, hover.current.position.y, Math.sin(a) * 0.4 * split)
      gh.rotation.y = -a
    })
    if (p > 0.8 && !st.fired) {
      st.fired = true
      burst(flash, [0, hover.current.position.y, 0], 50)
    }
    if (p < 0.1) st.fired = false
    flash.update(dt, { drag: 2 })
  })
  return (
    <group ref={ref}>
      <mesh material={M.velvet} position={[0, 0.07, 0]} scale={[0.32, 0.07, 0.27]} castShadow>
        <sphereGeometry args={[1, 24, 12]} />
      </mesh>
      <group ref={hover}><primitive object={helmets.actual} /></group>
      {[0, 1, 2].map((k) => (
        <group key={k} ref={(g) => (ghosts.current[k] = g)} visible={false}>
          <primitive object={helmets.copies[k]} />
        </group>
      ))}
      <group position={[0.02, 0.15, 0.17]} rotation={[0, 0.35, Math.PI / 2 - 0.12]}>
        <mesh material={M.darkGold}>
          <cylinderGeometry args={[0.011, 0.011, 0.5, 10]} />
        </mesh>
        <group position={[0, 0.25, 0]}>
          <mesh material={M.gem} position={[0, 0.045, 0]}>
            <icosahedronGeometry args={[0.03, 0]} />
          </mesh>
          <mesh geometry={geo.blade} material={M.gold} position={[0, 0.02, 0]} />
          <mesh geometry={geo.blade} material={M.gold} position={[0, 0.02, 0]} scale={[-1, 1, 1]} />
        </group>
      </group>
      <primitive object={flash.points} />
    </group>
  )
}

// ---------- Thor: Mjolnir crackles, lifts, spins and slams down in a flash ----------
export function HammerRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({
    stone: new THREE.MeshStandardMaterial({ color: '#4b4c4a', roughness: 0.95, flatShading: true }),
  }))
  const hammer = useRef()
  const bolts = useMemo(() => [0, 1, 2].map(() => makeBolt('#aee0ff', 14, 0.05)), [])
  const flash = useBurst('#eaf6ff', '#5aa8ff', 120)
  const st = useMemo(() => ({ slammed: false }), [])
  const a = useMemo(() => new THREE.Vector3(), [])
  const b = useMemo(() => new THREE.Vector3(), [])
  const [ref, near] = useNear(rt)
  useFrame((s, dt) => {
    if (!near()) return
    const t = s.clock.elapsedTime
    const p = rt.transform
    const lift = smooth(0.18, 0.4, p) * (1 - smooth(0.66, 0.74, p))
    const h = hammer.current
    h.position.set(0, 0.38 + lift * 0.75 + Math.sin(t * 7) * 0.02 * lift, 0)
    h.rotation.set(0, lift * t * 6, lift * Math.sin(t * 3) * 0.3)
    const charging = p > 0.05 && p < 0.72
    bolts.forEach((bo, k) => {
      bo.line.visible = charging && Math.random() < 0.5
      if (!bo.line.visible) return
      if (lift > 0.5) bo.set(a.set((Math.random() - 0.5) * 0.4, 2.6, (Math.random() - 0.5) * 0.4), b.copy(h.position), 0.25)
      else bo.set(a.copy(h.position).add(b.set(0, 0.1, 0)), b.set((Math.random() - 0.5) * 0.6, 0.05, (Math.random() - 0.5) * 0.6), 0.12)
    })
    if (p > 0.74 && !st.slammed) {
      st.slammed = true
      burst(flash, [0, 0.4, 0], 110, 2.4)
    }
    if (p < 0.1) st.slammed = false
    flash.update(dt, { drag: 1.5 })
  })
  return (
    <group ref={ref}>
      {[[0, 0.1, 0, 0.32, 0.14, 0.26], [0.18, 0.07, 0.06, 0.12, 0.08, 0.12]].map(([x, y, z, sx, sy, sz], k) => (
        <mesh key={k} material={M.stone} position={[x, y, z]} scale={[sx, sy, sz]} rotation={[k, k * 2, 0]} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      <group ref={hammer}>
        <ModelAsset url="/models/mjolnir.glb" burnMats={burnMats} size={0.72} energy={rt} />
      </group>
      {bolts.map((bo, k) => (
        <primitive key={k} object={bo.line} />
      ))}
      <primitive object={flash.points} />
    </group>
  )
}

// ---------- Iron Man: faceplate opens, eyes ignite, the helmet hovers on repulsor glow ----------
export function IronHelmRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({
    red: new THREE.MeshStandardMaterial({ color: '#9c1726', metalness: 0.72, roughness: 0.3 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d5a855', metalness: 0.7, roughness: 0.32 }),
    post: new THREE.MeshStandardMaterial({ color: '#151b23', metalness: 0.6, roughness: 0.48 }),
    eye: new THREE.MeshStandardMaterial({ color: '#c9f3ff', emissive: '#88d8ff', emissiveIntensity: 0.25 }),
  }))
  const head = useMemo(() => {
    const result = buildHeroHead('ironman', { primary: M.red, secondary: M.gold, skin: M.red, hair: M.post, metal: M.gold, eye: M.eye }, { shadows: true })
    result.root.scale.setScalar(2.5)
    return result
  }, [M])
  const repulsor = useMemo(() => beamMaterial('#9fe0ff'), [])
  const helm = useRef()
  const [ref, near] = useNear(rt)
  useFrame((s) => {
    if (!near() || rt.done) return
    const t = s.clock.elapsedTime, p = rt.transform
    const open = bump(p, 0.02, 0.18, 0.82, 0.95)
    const hover = bump(p, 0.2, 0.35, 0.75, 0.9)
    if (head.faceplate) {
      head.faceplate.position.copy(head.faceplate.userData.restPosition)
      head.faceplate.rotation.copy(head.faceplate.userData.restRotation)
      head.faceplate.rotation.x -= open * 1.08
    }
    helm.current.position.y = hover * 0.42 + Math.sin(t * 2.2) * 0.012 * hover
    helm.current.rotation.y = hover * Math.sin(t * 0.55) * 0.45
    M.eye.emissiveIntensity = (0.25 + smooth(0.1, 0.25, p) * 1.5) * (1 - smooth(0.85, 1, p) * 0.8)
    repulsor.uniforms.uTime.value = t
    repulsor.uniforms.uOpacity.value = hover * (1 - smooth(0, 0.5, rt.burn)) * 0.55
  })
  return (
    <group ref={ref}>
      <mesh material={M.post} position={[0, 0.12, 0]}><cylinderGeometry args={[0.035, 0.11, 0.24, 20]} /></mesh>
      <group position={[-0.26, 0.15, 0.04]} rotation={[0, 0.2, -0.15]}>
        <ModelAsset url="/models/arc-reactor.glb" burnMats={burnMats} size={0.26} />
      </group>
      <group ref={helm}>
        <primitive object={head.root} position={[0, 0.39, 0]} />
        <mesh material={repulsor} position={[0, 0.12, -0.01]} rotation-x={Math.PI}><coneGeometry args={[0.09, 0.28, 24, 1, true]} /></mesh>
      </group>
    </group>
  )
}

// ---------- Captain America: dished shield (also used in the throne room) ----------
let shieldGeoCache
export function shieldGeometry() {
  if (shieldGeoCache) return shieldGeoCache
  const R = 0.42
  const prof = []
  const rings = [0.11, 0.21, 0.31]
  for (let i = 0; i <= 42; i++) {
    const r = (i / 42) * R
    let y = 0.045 * (1 - (r / R) ** 2)
    for (const rr of rings) y += 0.004 * Math.exp(-(((r - rr) / 0.006) ** 2))
    prof.push(new THREE.Vector2(r, y))
  }
  prof.push(new THREE.Vector2(R + 0.006, -0.004), new THREE.Vector2(R - 0.004, -0.014), new THREE.Vector2(0.001, -0.01))
  const front = new THREE.LatheGeometry(prof.reverse(), 72)
  const pos = front.attributes.position
  const col = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i))
    const back = pos.getY(i) < -0.002
    if (back) c.set('#6d7177')
    else if (r < 0.11) c.set('#1d3c8f')
    else if (r < 0.21) c.set('#a3161f')
    else if (r < 0.31) c.set('#c9ccd2')
    else c.set('#a3161f')
    c.toArray(col, i * 3)
  }
  front.setAttribute('color', new THREE.BufferAttribute(col, 3))
  front.computeVertexNormals()
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? 0.038 : 0.096
    i ? s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad)
  }
  const star = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 })
  star.rotateX(-Math.PI / 2)
  star.translate(0, 0.045, 0)
  shieldGeoCache = { front, star }
  return shieldGeoCache
}

let scratchC
function scratchCanvas() {
  if (scratchC) return scratchC
  const [c, g] = makeCanvas(256, 256)
  g.fillStyle = '#555'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},255,${0.1 + Math.random() * 0.3})`
    g.lineWidth = Math.random() * 1.5
    const x = Math.random() * 256
    const y = Math.random() * 256
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 20)
    g.stroke()
  }
  return (scratchC = c)
}

export function useShieldMats(burnMats) {
  return useMemo(() => {
    const m = {
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.48, roughnessMap: toTexture(scratchCanvas(), { srgb: false }) }),
      star: new THREE.MeshStandardMaterial({ color: '#dfe3ea', metalness: 1, roughness: 0.22 }),
    }
    if (burnMats) {
      burnable(m.paint)
      burnable(m.star)
      burnMats.push(m.paint, m.star)
    }
    return m
  }, [])
}

export function Shield({ mats }) {
  const g = shieldGeometry()
  return (
    <group>
      <mesh geometry={g.front} material={mats.paint} castShadow />
      <mesh geometry={g.star} material={mats.star} castShadow />
    </group>
  )
}

const RICOCHET = [[0, 0.46, 0], [1.9, 1.5, 0.3], [1.15, 2.5, -0.5], [0.3, 1.4, 0.6], [0, 0.46, 0]]
export function ShieldRelic({ rt, burnMats }) {
  const mats = useShieldMats(burnMats)
  const M = useBurn(burnMats, () => ({ stand: new THREE.MeshStandardMaterial({ color: '#2a2c2e', metalness: 0.9, roughness: 0.35 }) }))
  const sh = useRef()
  const flash = useBurst('#ffffff', '#5aa8ff', 100)
  const st = useMemo(() => ({ hit: -1 }), [])
  const [ref, near] = useNear(rt)
  useFrame((s, dt) => {
    if (!near()) return
    const t = s.clock.elapsedTime
    const p = rt.transform
    const u = seg(p, 0.12, 0.85) * (RICOCHET.length - 1)
    const k = Math.min(RICOCHET.length - 2, Math.floor(u))
    const f = u - k
    const A = RICOCHET[k]
    const B = RICOCHET[k + 1]
    const active = p > 0.12 && p < 0.85
    sh.current.position.set(lerp(A[0], B[0], f), lerp(A[1], B[1], f) + Math.sin(f * Math.PI) * 0.2, lerp(A[2], B[2], f))
    sh.current.rotation.set(active ? Math.PI / 2 : Math.PI / 2 - 0.28, 0, active ? t * 18 : 0.08)
    if (active && k !== st.hit && k > 0) {
      st.hit = k
      burst(flash, A, 40, 1.8)
    }
    if (p < 0.1) st.hit = -1
    flash.update(dt, { drag: 2 })
  })
  return (
    <group ref={ref}>
      <mesh material={M.stand} position={[0, 0.04, -0.06]}>
        <boxGeometry args={[0.46, 0.08, 0.26]} />
      </mesh>
      <mesh material={M.stand} position={[0, 0.25, -0.12]} rotation-x={-0.3}>
        <boxGeometry args={[0.04, 0.42, 0.03]} />
      </mesh>
      <group ref={sh} position={[0, 0.46, 0]} rotation={[Math.PI / 2 - 0.28, 0, 0.08]}>
        <Shield mats={mats} />
      </group>
      <primitive object={flash.points} />
    </group>
  )
}

// ---------- Hulk: chains rattle and strain until the cuff snaps open ----------
function cuffGeometry(open = 0) {
  const prof = [[0.17, -0.06], [0.215, -0.06], [0.215, 0.06], [0.17, 0.06]].map(([x, y]) => new THREE.Vector2(x, y))
  prof.push(prof[0].clone())
  return new THREE.LatheGeometry(prof, 40, open, Math.PI * 2 - open)
}

export function ShackleRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({
    iron: new THREE.MeshStandardMaterial({ color: '#3b3e42', metalness: 0.95, roughness: 0.42, roughnessMap: toTexture(scratchCanvas(), { srgb: false }) }),
    rivet: new THREE.MeshStandardMaterial({ color: '#77746c', metalness: 1, roughness: 0.3 }),
    rock: new THREE.MeshStandardMaterial({ color: '#4c4a45', roughness: 0.95, flatShading: true }),
    cloth: new THREE.MeshStandardMaterial({ color: '#4d1d6e', roughness: 0.92, side: THREE.DoubleSide }),
  }))
  const g = useMemo(() => {
    const cloth = new THREE.PlaneGeometry(0.34, 0.26, 12, 10)
    const p = cloth.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      p.setZ(i, Math.sin(x * 30) * 0.012 + Math.sin(y * 22 + x * 8) * 0.01 - (y < -0.08 ? (y + 0.08) * 0.6 : 0))
    }
    cloth.computeVertexNormals()
    return { half: cuffGeometry(0.9 + Math.PI * 0.5), link: new THREE.TorusGeometry(0.045, 0.014, 8, 18).scale(1, 1.6, 1), cloth }
  }, [])
  const cuff = useRef()
  const halves = [useRef(), useRef()]
  const chain = useRef()
  const dust = useBurst('#9a8f80', '#3a352e', 120)
  const st = useMemo(() => ({ snapped: false }), [])
  const [ref, near] = useNear(rt)
  useFrame((s, dt) => {
    if (!near()) return
    const t = s.clock.elapsedTime
    const p = rt.transform
    const strain = seg(p, 0.05, 0.55)
    const snap = smooth(0.55, 0.65, p) * (1 - smooth(0.9, 1, p))
    const shake = strain * (1 - snap) * 0.04
    cuff.current.position.set(-0.05 + Math.sin(t * 60) * shake, 0.36 + strain * 0.12 * (1 - snap), Math.cos(t * 47) * shake)
    cuff.current.scale.setScalar(1 + strain * 0.05 * Math.sin(t * 20))
    halves[0].current.rotation.z = snap * 0.9
    halves[1].current.rotation.z = -snap * 0.9
    halves[0].current.position.x = -snap * 0.12
    halves[1].current.position.x = snap * 0.12
    chain.current.rotation.z = Math.sin(t * 25) * strain * 0.15 * (1 - snap)
    if (p > 0.56 && !st.snapped) {
      st.snapped = true
      burst(dust, [-0.05, 0.36, 0], 100, 2.2)
    }
    if (p < 0.1) st.snapped = false
    dust.update(dt, { gravity: -1.5, drag: 1 })
  })
  const rivets = (n, r, y) =>
    Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2
      return (
        <mesh key={`${y}${k}`} material={M.rivet} position={[Math.sin(a) * r, y, Math.cos(a) * r]}>
          <sphereGeometry args={[0.012, 8, 6]} />
        </mesh>
      )
    })
  return (
    <group ref={ref}>
      {[[0, 0.07, 0, 0.3, 0.12, 0.26], [0.17, 0.05, 0.08, 0.13, 0.08, 0.12], [-0.17, 0.05, -0.06, 0.12, 0.07, 0.1]].map(([x, y, z, a, b, c], k) => (
        <mesh key={k} material={M.rock} position={[x, y, z]} scale={[a, b, c]} rotation={[k, k * 2, 0]} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      <group ref={cuff} position={[-0.05, 0.36, 0]} rotation={[0.35, 0.3, 0.15]}>
        <group ref={halves[0]}>
          <mesh geometry={g.half} material={M.iron} castShadow />
          {rivets(6, 0.217, 0.035)}
        </group>
        <group ref={halves[1]} rotation-y={Math.PI}>
          <mesh geometry={g.half} material={M.iron} castShadow />
          {rivets(6, 0.217, -0.035)}
        </group>
      </group>
      <group ref={chain} position={[0.16, 0.31, 0.04]}>
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} geometry={g.link} material={M.iron} position={[k * 0.035, -k * 0.07, k * 0.02]} rotation={[0.2, k % 2 ? Math.PI / 2 : 0, 0.5]} castShadow />
        ))}
      </group>
      <mesh geometry={g.cloth} material={M.cloth} position={[-0.15, 0.17, 0.15]} rotation={[-0.75, 0.4, 0.3]} castShadow />
      <primitive object={dust.points} />
    </group>
  )
}

// ---------- Black Panther: the mask rises as kinetic energy ripples out ----------
export function PantherRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({
    suit: new THREE.MeshStandardMaterial({ color: '#28313f', metalness: 0.55, roughness: 0.38 }),
    silver: new THREE.MeshStandardMaterial({ color: '#c9ccd3', metalness: 1, roughness: 0.25 }),
    post: new THREE.MeshStandardMaterial({ color: '#2a2530', metalness: 0.6, roughness: 0.5 }),
  }))
  const eye = useBurn(burnMats, () => ({ eye: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#e8dcff', emissiveIntensity: 0.1 }) })).eye
  const rings = useMemo(() => [0, 1, 2].map(() => additive('#b78bff', 0)), [])
  const head = useMemo(() => { const h = buildHeroHead('panther', { primary: M.suit, secondary: M.post, skin: M.suit, hair: M.post, metal: M.silver, eye }, { shadows: true }); h.root.scale.setScalar(2.5); return h }, [M, eye])
  const mask = useRef()
  const ringRefs = useRef([])
  const [ref, near] = useNear(rt)
  useFrame((s) => {
    if (!near()) return
    const t = s.clock.elapsedTime
    const p = rt.transform
    const rise = bump(p, 0.02, 0.2, 0.82, 0.96)
    mask.current.position.y = 0.36 + rise * 0.4
    mask.current.rotation.y = rise * Math.sin(t) * 0.5
    eye.emissiveIntensity = 0.15 + rise * 1.4
    rings.forEach((m, k) => {
      const w = seg(p, 0.25 + k * 0.15, 0.45 + k * 0.15)
      m.opacity = w > 0 && w < 1 ? (1 - w) * 0.8 : 0
      const r = ringRefs.current[k]
      if (r) {
        r.scale.setScalar(0.2 + w * 3)
        r.position.y = mask.current.position.y
      }
    })
  })
  return (
    <group ref={ref}>
      <mesh material={M.post} position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.05, 0.1, 0.24, 6]} />
      </mesh>
      <mesh material={M.silver} position={[0, 0.24, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.12, 0.012, 8, 32]} />
      </mesh>
      {Array.from({ length: 12 }, (_, k) => {
        const a = (k / 12) * Math.PI * 2
        return (
          <mesh key={k} material={M.silver} position={[Math.cos(a) * 0.12, 0.215, Math.sin(a) * 0.12]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.01, 0.045, 6]} />
          </mesh>
        )
      })}
      <group ref={mask}><primitive object={head.root} /></group>
      {rings.map((m, k) => (
        <mesh key={k} ref={(r) => (ringRefs.current[k] = r)} material={m} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.18, 0.2, 48]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------- Spider-Man: the pinned mask shoots webs to the shrine's corners, then they snap ----------


const WEB_TARGETS = [[1.9, 2.6, -0.9], [0.5, 3.3, -0.9], [2.6, 0.5, 0.9], [-0.4, 2.2, -0.7]]
export function SpiderMaskRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({
    mask: new THREE.MeshStandardMaterial({ color: '#b51c32', roughness: 0.72 }),
    lens: new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.2, metalness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.15 }),
    rim: new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.5 }),
    board: new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.8 }),
    pin: new THREE.MeshStandardMaterial({ color: '#d0d4da', metalness: 1, roughness: 0.2 }),
  }))
  const head = useMemo(() => { const h = buildHeroHead('spider', { primary: M.mask, secondary: M.rim, skin: M.mask, hair: M.rim, metal: M.rim, eye: M.lens }, { shadows: true }); h.root.scale.setScalar(2.6); return h }, [M])
  const webMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f4f6ff', transparent: true, opacity: 0 }), [])
  const webs = useMemo(
    () =>
      WEB_TARGETS.map(([x, y, z]) => {
        const geo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true)
        geo.translate(0, 0.5, 0)
        const len = Math.hypot(x, y - 0.4, z)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y - 0.4, z).normalize())
        return { geo, len, q }
      }),
    []
  )
  const webRefs = useRef([])
  const [ref, near] = useNear(rt)
  useFrame(() => {
    if (!near()) return
    const p = rt.transform
    const snap = smooth(0.7, 0.8, p)
    webMat.opacity = (1 - snap) * (p > 0.02 ? 0.85 : 0)
    webs.forEach((w, k) => {
      const m = webRefs.current[k]
      if (!m) return
      const grow = smooth(0.05 + k * 0.08, 0.15 + k * 0.08, p)
      m.scale.set(1, Math.max(0.001, w.len * grow * (1 - snap * 0.6)), 1)
      m.visible = grow > 0.01 && snap < 1
    })
    M.lens.emissiveIntensity = 0.15 + bump(p, 0.02, 0.1, 0.7, 0.8) * 2
  })
  return (
    <group ref={ref}>
      <mesh material={M.board} position={[0, 0.4, -0.13]}>
        <boxGeometry args={[0.46, 0.56, 0.04]} />
      </mesh>
      <group position={[0, 0.4, 0]}>
        <primitive object={head.root} />
        {[[-0.18, 0.24], [0.18, 0.24], [-0.18, -0.24], [0.18, -0.24]].map(([x, y], k) => (
          <mesh key={k} material={M.pin} position={[x, y, -0.1]}>
            <sphereGeometry args={[0.012, 8, 6]} />
          </mesh>
        ))}
      </group>
      {webs.map((w, k) => (
        <mesh key={k} ref={(m) => (webRefs.current[k] = m)} geometry={w.geo} material={webMat} position={[0, 0.4, 0.05]} quaternion={w.q} visible={false} />
      ))}
    </group>
  )
}

// ---------- Fantastic Four relics ----------
export function BandsRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({
    blue: new THREE.MeshStandardMaterial({ color: '#2a63c9', metalness: 0.9, roughness: 0.28, emissive: '#1a4fa6', emissiveIntensity: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.9, roughness: 0.35 }),
    white: new THREE.MeshStandardMaterial({ color: '#dfe6ef', metalness: 0.4, roughness: 0.4 }),
  }))
  const helix = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 120; i++) pts.push(new THREE.Vector3(Math.cos(i * 0.45) * (0.03 + Math.sin(i * 0.05) * 0.015), 0.06 + i * 0.0034, Math.sin(i * 0.45) * 0.04))
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.007, 6)
  }, [])
  const rings = useRef()
  const coil = useRef()
  useFrame((s) => {
    const t = s.clock.elapsedTime
    const a = bump(rt.transform, 0, 0.2, 0.8, 1)
    rings.current.children.forEach((r, i) => {
      r.rotation.set(t * (0.3 + i * 0.2) * (1 + a * 6), t * 0.4 * (i % 2 ? -1 : 1), i)
      r.scale.setScalar(1 + a * 0.6 * (i + 1) * 0.3)
    })
    coil.current.scale.y = 1 + a * 1.6
  })
  return (
    <group>
      <mesh material={M.steel} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.22, 0.04, 32]} />
      </mesh>
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2
        return (
          <mesh key={k} material={M.steel} position={[Math.cos(a) * 0.17, 0.25, Math.sin(a) * 0.17]}>
            <cylinderGeometry args={[0.01, 0.01, 0.46, 8]} />
          </mesh>
        )
      })}
      <mesh ref={coil} geometry={helix} material={M.white} />
      <group ref={rings} position={[0, 0.27, 0]}>
        {[0.12, 0.14, 0.16].map((r) => (
          <mesh key={r} material={M.blue}>
            <torusGeometry args={[r, 0.008, 8, 48]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

export function DistortionRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({ frame: new THREE.MeshStandardMaterial({ color: '#a9bac4', metalness: 1, roughness: 0.18 }) }))
  const prongs = useMemo(
    () =>
      [0, 1, 2, 3].map((k) => {
        const a = (k / 4) * Math.PI * 2
        const c = Math.cos(a)
        const s = Math.sin(a)
        return taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(c * 0.06, 0.04, s * 0.06), new THREE.Vector3(c * 0.17, 0.14, s * 0.17), new THREE.Vector3(c * 0.15, 0.27, s * 0.15), new THREE.Vector3(c * 0.09, 0.34, s * 0.09)]), 0.014, 0.003, 16, 6)
      }),
    []
  )
  const shell = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
        vertexShader: `uniform float uTime; varying vec3 vN; varying vec3 vV;
          void main(){ vec3 p = position + normal * sin(position.y * 30.0 + uTime * 3.0) * 0.006;
            vec4 w = modelMatrix * vec4(p,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
            gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform float uTime, uFade; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 3.0);
            float flick = step(0.25, fract(sin(floor(uTime * 8.0)) * 43758.5));
            vec3 irid = 0.5 + 0.5 * cos(6.2831 * (f + vec3(0.0, 0.33, 0.67) + uTime * 0.1));
            gl_FragColor = vec4(mix(vec3(0.75, 0.95, 1.0), irid, 0.4) * f * 1.6, f * (0.35 + 0.65 * flick) * uFade); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  )
  const orb = useRef()
  useFrame((s) => {
    shell.uniforms.uTime.value = s.clock.elapsedTime
    const vanish = bump(rt.transform, 0.1, 0.25, 0.6, 0.8)
    shell.uniforms.uFade.value = (1 - seg(rt.burn, 0.1, 0.4)) * (1 - vanish * 0.9)
    orb.current.scale.setScalar(1 + vanish * 0.8)
  })
  return (
    <group>
      <mesh material={M.frame} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 0.05, 24]} />
      </mesh>
      {prongs.map((g, k) => (
        <mesh key={k} geometry={g} material={M.frame} />
      ))}
      <mesh ref={orb} material={shell} position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.14, 40, 28]} />
      </mesh>
    </group>
  )
}

export function FlameRelic({ rt, burnMats }) {
  const geo = useMemo(() => {
    const pts = [[0, 0], [0.09, 0.02], [0.12, 0.1], [0.09, 0.18], [0.13, 0.28], [0.06, 0.36], [0.09, 0.45], [0.03, 0.56], [0, 0.62]].map(([x, y]) => new THREE.Vector2(x, y))
    const g = new THREE.LatheGeometry(pts, 28)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      const a = Math.atan2(p.getX(i), p.getZ(i))
      const k = 1 + Math.sin(a * 3 + y * 14) * 0.18
      p.setX(i, p.getX(i) * k + Math.sin(y * 9) * 0.02)
      p.setZ(i, p.getZ(i) * k * 0.75)
    }
    g.computeVertexNormals()
    return g
  }, [])
  const M = useBurn(burnMats, () => ({
    char: new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.92, emissive: '#ff6a1a', emissiveMap: crackTexture(7), emissiveIntensity: 2 }),
    base: new THREE.MeshStandardMaterial({ color: '#26282b', metalness: 0.9, roughness: 0.4 }),
  }))
  const embers = useMemo(() => makeEmitter(160, { color: '#ffe2a0', colorEnd: '#ff3a0a', size: 0.05, sizeEnd: 0.35 }), [])
  useFrame((s, dt) => {
    const flare = bump(rt.transform, 0, 0.15, 0.7, 0.9)
    M.char.emissiveIntensity = 2 + flare * 6
    if (Math.random() < dt * (10 + flare * 90)) embers.emit(1 + Math.floor(flare * 3), () => ({ p: [(Math.random() - 0.5) * 0.12, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.1], v: [(Math.random() - 0.5) * 0.2, 0.3 + flare * 0.8, 0], life: 1 + Math.random() * 0.6 }))
    embers.update(dt, { turbulence: 0.4, t: s.clock.elapsedTime })
  })
  return (
    <group>
      <mesh material={M.base} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.04, 24]} />
      </mesh>
      <mesh geometry={geo} material={M.char} position={[0, 0.03, 0]} rotation-y={0.4} castShadow />
      <primitive object={embers.points} />
    </group>
  )
}

export function RockHandRelic({ rt, burnMats }) {
  const M = useBurn(burnMats, () => ({ rock: new THREE.MeshStandardMaterial({ color: '#b5682c', roughness: 0.95, flatShading: true }) }))
  const fist = useRef()
  const parts = useMemo(() => {
    const out = [[0, 0.13, 0, 0.12, 0.11, 0.08]]
    for (let f = 0; f < 4; f++) {
      const x = -0.075 + f * 0.05
      out.push([x, 0.25, 0.03, 0.03, 0.045, 0.035], [x, 0.27, 0.085, 0.028, 0.035, 0.03], [x, 0.22, 0.11, 0.026, 0.03, 0.028])
    }
    out.push([0.13, 0.15, 0.06, 0.035, 0.05, 0.035], [0.12, 0.2, 0.1, 0.03, 0.035, 0.03], [0, 0.02, -0.01, 0.07, 0.06, 0.06])
    return out
  }, [])
  useFrame(() => {
    const p = rt.transform
    const up = bump(p, 0.05, 0.3, 0.42, 0.48)
    fist.current.position.y = up * 0.45
    fist.current.rotation.x = -up * 0.6
  })
  return (
    <group ref={fist} rotation-z={0.12}>
      {parts.map(([x, y, z, a, b, c], i) => (
        <mesh key={i} material={M.rock} position={[x, y + 0.03, z]} scale={[a, b, c]} rotation={[i, i * 2, i * 0.5]} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  )
}

export const RELICS = {
  cloak: CloakRelic,
  helm: HelmRelic,
  hammer: HammerRelic,
  ironhelm: IronHelmRelic,
  shield: ShieldRelic,
  shackle: ShackleRelic,
  panther: PantherRelic,
  spidermask: SpiderMaskRelic,
  bands: BandsRelic,
  distortion: DistortionRelic,
  flame: FlameRelic,
  rockhand: RockHandRelic,
}
