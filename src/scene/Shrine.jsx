import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { audio } from '../audio'
import { camPos } from '../lib/particles'
import { world } from '../world'
import { setS } from '../state'
import { director, FF_WINDOWS } from '../director'
import { SHRINE_POS, FF_MEMBER_X } from '../config/layout'
import { shrineMats, burnable } from '../lib/materials'
import { clippingCanvas, toTexture, plaqueCanvas, emblemTexture } from '../lib/textures'
import { makeEmitter, makeBolt } from '../lib/particles'
import { clamp, seg, smooth } from '../lib/util'
import { particleScale } from '../lib/quality'
import { Projector, HOLOS, Figurine } from './Holograms'
import { RELICS, ButtonModel } from './Relics'

const box = (pos, size, mat, extra = {}) => (
  <mesh position={pos} material={mat} castShadow receiveShadow {...extra}>
    <boxGeometry args={size} />
  </mesh>
)

function useShrineCore(i) {
  const rt = world.shrines[i]
  const burnMats = useMemo(() => [], [])
  const M = useMemo(() => {
    const m = shrineMats()
    burnMats.push(...Object.values(m))
    return m
  }, [])
  return { rt, burnMats, M }
}

// The shrine's activation device: the supplied button set in a bezel on a lectern.
// Hover lifts the cap, pointer-down drives it into the bezel, release springs it back and triggers the shrine.
function ShrineButton({ i, rt, cfg, burnMats, position, rotation }) {
  const api = useMemo(() => ({}), [])
  const st = useMemo(() => ({ hover: 0, press: 0, armed: false }), [])
  const halo = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd08a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  useFrame((s) => {
    const t = s.clock.elapsedTime
    const ready = rt.ready ? 1 : 0
    const press = Math.max(st.press, rt.pressed)
    if (api.cap?.current) {
      api.cap.current.position.z = 0.07 + st.hover * 0.014 - press * 0.055
      api.cap.current.scale.set(1 + press * 0.01, 1 + press * 0.01, 1 - press * 0.25)
    }
    if (api.ring) api.ring.emissiveIntensity = ready * (0.9 + Math.sin(t * 3) * 0.45) + press * 1.6
    if (api.body) api.body.emissiveIntensity = st.hover * 0.03 + press * 0.05
    if (api.shine) {
      const ph = (t * 0.45) % 1.8
      api.shine.map.offset.x = 0.9 - ph
      api.shine.opacity = ready * 0.55 + st.hover * 0.3
    }
    halo.opacity = ready * (0.025 + Math.sin(t * 3) * 0.015) + press * 0.08
  })
  const over = (e) => {
    e.stopPropagation()
    if (!rt.ready) return
    document.body.style.cursor = 'pointer'
    gsap.to(st, { hover: 1, duration: 0.18 })
  }
  const out = () => {
    document.body.style.cursor = ''
    st.armed = false
    gsap.to(st, { hover: 0, press: 0, duration: 0.25 })
  }
  const down = (e) => {
    e.stopPropagation()
    if (!rt.ready) return
    st.armed = true
    audio.btnDown()
    gsap.to(st, { press: 1, duration: 0.07, ease: 'power2.in' })
  }
  const up = (e) => {
    e.stopPropagation()
    if (!st.armed) return
    st.armed = false
    audio.btnUp()
    gsap.to(st, { press: 0, duration: 0.7, ease: 'elastic.out(1, 0.32)' })
    director.press(i)
  }
  return (
    <group position={position} rotation={rotation}>
      <mesh material={halo} position={[0, 0, -0.09]}>
        <planeGeometry args={[1.5, 0.75]} />
      </mesh>
      <group onPointerOver={over} onPointerOut={out} onPointerDown={down} onPointerUp={up}>
        <ButtonModel style={cfg.button.style} label={cfg.button.label} burnMats={burnMats} api={api} bezel />
        {/* generous invisible hit area so the button is easy to tap on a phone */}
        <mesh visible={false}>
          <boxGeometry args={[1.7, 0.9, 0.4]} />
        </mesh>
      </group>
    </group>
  )
}

function Clipping({ clip, seed, rt, burnMats, position, rotation = [0, 0, 0], size = [0.6, 0.84], delay = 0 }) {
  const ref = useRef()
  const data = useMemo(() => {
    const canvas = clippingCanvas(clip, seed)
    const mat = new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.95, color: '#b8ae98', transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, emissive: '#fff4dd', emissiveIntensity: 0 })
    burnMatsPush(burnMats, mat)
    return { canvas, mat }
  }, [])
  useFrame((s) => {
    const d = smooth(0.6 + delay * 0.6, 0.85 + delay * 0.6, rt.unfurl)
    const t = s.clock.elapsedTime
    ref.current.position.set(position[0], position[1] + (1 - d) * 2.5, position[2])
    ref.current.rotation.set(rotation[0] + (1 - d) * 2, rotation[1] + (1 - d) * 3, rotation[2] + Math.sin(t * 0.8 + seed) * 0.015)
    ref.current.visible = d > 0.001
    data.mat.emissiveIntensity = 0
  })
  const onClick = (e) => {
    e.stopPropagation()
    if (rt.unfurl < 0.9 || rt.burn > 0) return
    setS({ inspect: { src: data.canvas.toDataURL('image/jpeg', 0.9), headline: clip.headline } })
  }
  return (
    <mesh ref={ref} material={data.mat} onClick={onClick} castShadow>
      <planeGeometry args={size} />
    </mesh>
  )
}

function burnMatsPush(list, mat) {
  burnable(mat, '#ffb04a')
  list.push(mat)
}

function Plaque({ title, line, burnMats, position, width = 0.8 }) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: toTexture(plaqueCanvas(title, line)), metalness: 0.4, roughness: 0.4, emissive: '#ffffff', emissiveMap: toTexture(plaqueCanvas(title, line)), emissiveIntensity: 0.25 })
    burnable(m)
    burnMats.push(m)
    return m
  }, [])
  return (
    <mesh material={mat} position={position}>
      <planeGeometry args={[width, width * (170 / 512)]} />
    </mesh>
  )
}

// Unfurl: parts rise out of the floor in order when the button is pressed (rt.unfurl 0..1).
function Rise({ rt, at = 0, dur = 0.3, depth = 3, spin = 0, children }) {
  const ref = useRef()
  useFrame(() => {
    const k = smooth(at, at + dur, rt.unfurl)
    const g = ref.current
    g.visible = k > 0.001
    if (!g.visible) return
    const over = Math.sin(seg(rt.unfurl, at, at + dur) * Math.PI) * 0.06
    g.position.y = -(1 - k) * depth + over
    g.scale.set(1, Math.max(0.001, k), 1)
    g.rotation.y = (1 - k) * spin
  })
  return <group ref={ref}>{children}</group>
}

function useUnfurlDust(rt, width) {
  const dust = useMemo(() => makeEmitter(160, { color: '#8c8478', colorEnd: '#2a2723', size: 0.5, sizeEnd: 1.6, additive: false, soft: 2, opacity: 0.5 }), [])
  useFrame((s, dt) => {
    const u = rt.unfurl
    if (u > 0.01 && u < 0.6) dust.emit(Math.ceil(dt * 90), () => ({ p: [(Math.random() - 0.5) * width, 0.1, -1.2 + Math.random() * 2], v: [(Math.random() - 0.5) * 0.6, 0.25 + Math.random() * 0.4, (Math.random() - 0.2) * 0.5], life: 1.6 + Math.random() }))
    dust.update(dt, { drag: 1.2 })
  })
  return dust
}

// Doom's strike: ribbon lightning, white-hot embers that cool to red, rising smoke and a green flash.
// Also drives every burnable material in the shrine and topples its architecture.
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
function useDestruction(rt, burnMats, fallers, scale, quality) {
  const fx = useMemo(() => {
    const ps = particleScale(quality)
    const embers = makeEmitter(Math.floor(420 * ps), { color: '#fff1c4', colorEnd: '#c2200a', size: 0.06, sizeEnd: 0.4 })
    const doom = makeEmitter(Math.floor(220 * ps), { color: '#d8ffe2', colorEnd: '#1f9a45', size: 0.09, sizeEnd: 0.2 })
    const smoke = makeEmitter(Math.floor(70 * ps), { color: '#2a2c2b', colorEnd: '#0b0c0c', size: 1.2, sizeEnd: 3, additive: false, soft: 2.2, opacity: 0.55 })
    const bolts = [0, 1, 2, 3].map(() => makeBolt('#9dffbe', 18, 0.09))
    return { embers, doom, smoke, bolts }
  }, [])
  useFrame((s, dt) => {
    const b = rt.burn
    const t = s.clock.elapsedTime
    for (let k = 0; k < burnMats.length; k++) {
      const u = burnMats[k].userData.uBurn
      if (u) u.value = clamp(b * 1.1 - (k % 5) * 0.02)
    }
    const f = smooth(0.15, 1, b)
    fallers.forEach((r, k) => {
      if (!r.current) return
      const g = r.current
      const d = g.userData
      if (!d.base) d.base = { p: g.position.clone(), r: g.rotation.clone() }
      g.position.set(d.base.p.x, d.base.p.y - f * f * (0.6 + k * 0.3), d.base.p.z)
      g.rotation.set(d.base.r.x + f * f * (k % 2 ? 0.5 : -0.4), d.base.r.y, d.base.r.z + f * f * (k % 2 ? -0.7 : 0.7))
    })
    const active = b > 0.001 && b < 0.999
    fx.bolts.forEach((bo, k) => {
      bo.line.visible = active && b < 0.55 && Math.random() < 0.55
      if (bo.line.visible) bo.set(_a.set((k - 1.5) * 0.5 * scale, 7.5, 1.6), _b.set((Math.random() - 0.5) * 2.4 * scale, 0.6 + Math.random() * 2.4, (Math.random() - 0.6) * 1.2), 0.7)
    })
    if (active) {
      const heat = Math.sin(b * Math.PI)
      const n = Math.ceil(dt * 200 * heat)
      fx.embers.emit(n, () => ({ p: [(Math.random() - 0.5) * 2.8 * scale, Math.random() * 3.2, (Math.random() - 0.6) * 1.8], v: [(Math.random() - 0.5) * 0.7, 0.5 + Math.random() * 1.8, (Math.random() - 0.5) * 0.7], life: 0.9 + Math.random() * 1.6 }))
      fx.doom.emit(Math.ceil(n * 0.5), () => ({ p: [(Math.random() - 0.5) * 2.4 * scale, Math.random() * 2.6, (Math.random() - 0.6) * 1.4], v: [0, 0.8 + Math.random() * 1.2, 0], life: 0.5 + Math.random() * 0.5 }))
      if (Math.random() < dt * 14 * heat) fx.smoke.emit(1, () => ({ p: [(Math.random() - 0.5) * 2 * scale, 0.5 + Math.random() * 2, -0.6 + Math.random() * 0.6], v: [(Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, 0.05], life: 3 + Math.random() * 2 }))
    }
    fx.embers.update(dt, { turbulence: 1.4, t, drag: 0.5, gravity: -0.15 })
    fx.doom.update(dt, { turbulence: 0.6, t })
    fx.smoke.update(dt, { turbulence: 0.15, t, drag: 0.2 })
  })
  return fx
}

function DestructionFX({ fx }) {
  return (
    <>
      <primitive object={fx.smoke.points} />
      <primitive object={fx.embers.points} />
      <primitive object={fx.doom.points} />
      {fx.bolts.map((b, i) => (
        <primitive key={i} object={b.line} />
      ))}
    </>
  )
}

// After destruction the shrine's remains collapse into its sigil, which rises and is claimed.
function Token({ rt, cfg, position }) {
  const ref = useRef()
  useFrame((s) => {
    const appear = smooth(0.55, 0.9, rt.burn)
    const fly = rt.token
    ref.current.visible = appear > 0.01 && fly < 0.999
    ref.current.position.set(position[0], position[1] + fly * 3.5, position[2] + fly * 1.5)
    ref.current.scale.setScalar(appear * 0.85 * (1 - fly))
    ref.current.rotation.y = s.clock.elapsedTime * 2 + fly * 8
  })
  return (
    <group ref={ref}>
      <ButtonModel style={cfg.button.style} label={cfg.button.label} />
    </group>
  )
}

function Brazier({ M, position, quality }) {
  const fire = useMemo(() => makeEmitter(quality === 'low' ? 18 : 40, { color: '#fff0b0', colorEnd: '#c2300a', size: 0.14, sizeEnd: 0.35 }), [])
  useFrame((s, dt) => {
    if (Math.random() < dt * 40) fire.emit(1, () => ({ p: [(Math.random() - 0.5) * 0.12, 0.72, (Math.random() - 0.5) * 0.12], v: [(Math.random() - 0.5) * 0.1, 0.45 + Math.random() * 0.35, (Math.random() - 0.5) * 0.1], life: 0.45 + Math.random() * 0.3 }))
    fire.update(dt, { turbulence: 0.8, t: s.clock.elapsedTime })
  })
  return (
    <group position={position}>
      <mesh material={M.metal} position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 0.6, 10]} />
      </mesh>
      <mesh material={M.metal} position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.16, 0.07, 0.12, 14]} />
      </mesh>
      <mesh material={M.glow} position={[0, 0.71, 0]} scale={[1, 0.3, 1]}>
        <sphereGeometry args={[0.1, 12, 8]} />
      </mesh>
      <primitive object={fire.points} />
    </group>
  )
}

export function Shrine({ i, cfg, quality }) {
  const { rt, burnMats, M } = useShrineCore(i)
  const P = SHRINE_POS[i]
  const root = useRef()
  const fallers = [useRef(), useRef(), useRef(), useRef()]
  const fx = useDestruction(rt, burnMats, fallers, 1, quality)
  const dust = useUnfurlDust(rt, 3.4)
  const Relic = RELICS[cfg.relic]
  const Holo = HOLOS[cfg.holo]
  useFrame(() => {
    root.current.visible = !rt.done && Math.abs(camPos.x - P.x) < 30
  })
  return (
    <group position={[P.x, 0, P.z]} rotation-y={P.ry}>
      <group ref={root}>
        {/* before it is pressed, only the lectern and its button stand here */}
        {box([0, 0.5, 0.98], [0.16, 1.0, 0.16], M.metal)}
        {box([0, 0.03, 0.98], [0.5, 0.06, 0.5], M.metal)}
        {box([0, 1.02, 1.02], [0.7, 0.05, 0.36], M.metal, { rotation: [0.55, 0, 0] })}
        <ShrineButton i={i} rt={rt} cfg={cfg} burnMats={burnMats} position={[0, 1.08, 1.05]} rotation={[-1.0, 0, 0]} />
        <Rise rt={rt} at={0} dur={0.22} depth={0.3}>
          {box([0, 0.09, -0.2], [3.7, 0.18, 2.7], M.darkStone)}
        </Rise>
        <Rise rt={rt} at={0.06} depth={5}>
          <group ref={fallers[0]}>
            {box([0, 2.4, -1.45], [3.5, 4.8, 0.4], M.stone)}
            <mesh material={M.gold} position={[0, 4.05, -1.22]}>
              <torusGeometry args={[0.44, 0.04, 10, 48]} />
            </mesh>
            <mesh position={[0, 4.05, -1.24]}>
              <circleGeometry args={[0.42, 40]} />
              <meshStandardMaterial color="#2a2418" map={emblemTexture()} metalness={0.85} roughness={0.35} emissive="#d8a85a" emissiveMap={emblemTexture()} emissiveIntensity={0.35} transparent />
            </mesh>
          </group>
        </Rise>
        {[-1.68, 1.68].map((x, k) => (
          <Rise key={x} rt={rt} at={0.14 + k * 0.04} depth={4.5}>
            <group ref={fallers[2 + k]} position={[x, 0, -0.95]}>
              {box([0, 2.1, 0], [0.42, 3.9, 0.42], M.stone)}
              {box([0, 4.1, 0], [0.62, 0.22, 0.62], M.gold)}
              {box([0, 0.3, 0], [0.6, 0.25, 0.6], M.darkStone)}
            </group>
          </Rise>
        ))}
        <Rise rt={rt} at={0.26} depth={2.5}>
          <group ref={fallers[1]}>
            <mesh material={M.stone} position={[0, 4.2, -0.95]} castShadow>
              <torusGeometry args={[1.68, 0.2, 10, 40, Math.PI]} />
            </mesh>
            <mesh material={M.darkStone} position={[0, 4.2, -1.22]}>
              <circleGeometry args={[1.62, 40, 0, Math.PI]} />
            </mesh>
            <mesh material={M.gold} position={[0, 5.92, -0.95]}>
              <boxGeometry args={[0.32, 0.42, 0.46]} />
            </mesh>
          </group>
        </Rise>
        <Rise rt={rt} at={0.34} depth={1.4} spin={1.5}>
          {box([0, 0.68, 0.05], [0.95, 1.0, 0.85], M.darkStone)}
          {box([0, 1.2, 0.05], [1.05, 0.06, 0.95], M.gold)}
          <Plaque title={cfg.title} line={cfg.epitaph} burnMats={burnMats} position={[0, 0.62, 0.48]} width={0.88} />
          <group position={[0, 1.23, 0.05]}>
            <Projector rt={rt} color={cfg.color} metal={M.metal}>
              <Holo rt={rt} color={cfg.color} />
            </Projector>
          </group>
        </Rise>
        <Rise rt={rt} at={0.44} depth={1.8}>
          {box([-1.15, 0.83, -0.45], [0.72, 1.3, 0.72], M.stone)}
          <group position={[-1.15, 1.48, -0.45]}>
            <Relic rt={rt} burnMats={burnMats} />
          </group>
        </Rise>
        <Rise rt={rt} at={0.5} depth={1.4}>
          {box([1.15, 0.63, -0.3], [0.6, 0.9, 0.6], M.stone)}
          <group position={[1.15, 1.08, -0.3]} rotation-y={-0.5}>
            <Figurine mat={M.figurine} hero={cfg.figurine.hero} pose={cfg.figurine.pose} scale={0.42} />
          </group>
        </Rise>
        <Rise rt={rt} at={0.56} depth={1}>
          <Brazier M={M} position={[-1.65, 0.18, 0.95]} quality={quality} />
          <Brazier M={M} position={[1.65, 0.18, 0.95]} quality={quality} />
        </Rise>
        <Clipping clip={cfg.clippings[0]} seed={i * 10 + 1} rt={rt} burnMats={burnMats} position={[-0.9, 2.85, -1.22]} rotation={[0, 0, 0.06]} delay={0} />
        <Clipping clip={cfg.clippings[1]} seed={i * 10 + 2} rt={rt} burnMats={burnMats} position={[0.9, 2.7, -1.22]} rotation={[0, 0, -0.08]} delay={0.15} />
        <Clipping clip={cfg.clippings[2]} seed={i * 10 + 3} rt={rt} burnMats={burnMats} position={[1.25, 0.5, 0.75]} rotation={[-0.35, -0.4, 0.05]} size={[0.46, 0.64]} delay={0.3} />
      </group>
      <primitive object={dust.points} />
      <DestructionFX fx={fx} />
      <Token rt={rt} cfg={cfg} position={[0, 1.7, 0.4]} />
    </group>
  )
}

// The Fantastic Four memorial: four sub-displays around a central obelisk, unfurled from a single button.
export function TeamShrine({ i, cfg, quality }) {
  const { rt, burnMats, M: base } = useShrineCore(i)
  const M = useMemo(() => {
    const fourGlow = burnable(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#4fa8ff', emissiveIntensity: 2.6 }))
    burnMats.push(fourGlow)
    return { ...base, fourGlow }
  }, [])
  const P = SHRINE_POS[i]
  const root = useRef()
  const fallers = [useRef(), useRef(), useRef(), useRef(), useRef()]
  const fx = useDestruction(rt, burnMats, fallers, 2.6, quality)
  const dust = useUnfurlDust(rt, 8.6)
  useFrame(() => {
    root.current.visible = !rt.done && Math.abs(camPos.x - P.x) < 30
  })
  return (
    <group position={[P.x, 0, P.z]} rotation-y={P.ry}>
      <group ref={root}>
        {box([0, 0.45, 0.4], [0.16, 0.9, 0.16], M.metal)}
        {box([0, 0.03, 0.4], [0.5, 0.06, 0.5], M.metal)}
        {box([0, 0.94, 0.43], [0.7, 0.05, 0.36], M.metal, { rotation: [0.55, 0, 0] })}
        <ShrineButton i={i} rt={rt} cfg={cfg} burnMats={burnMats} position={[0, 1.0, 0.46]} rotation={[-1.0, 0, 0]} />
        <Rise rt={rt} at={0} dur={0.22} depth={0.3}>
          {box([0, 0.1, -0.3], [8.8, 0.2, 3.4], M.darkStone)}
        </Rise>
        <Rise rt={rt} at={0.06} depth={6.5}>
          <group ref={fallers[0]}>
            {box([0, 3.0, -1.9], [9, 6, 0.45], M.stone)}
            {box([0, 6.1, -1.85], [9.4, 0.3, 0.7], M.gold)}
          </group>
        </Rise>
        <Rise rt={rt} at={0.16} depth={4} spin={2}>
          <group ref={fallers[1]}>
            {box([0, 1.9, -1.1], [1.1, 3.8, 0.8], M.darkStone)}
            <mesh material={M.fourGlow} position={[0, 3.3, -0.69]}>
              <torusGeometry args={[0.38, 0.04, 10, 48]} />
            </mesh>
            {box([0.08, 3.3, -0.69], [0.07, 0.52, 0.05], M.fourGlow)}
            {box([0.0, 3.22, -0.69], [0.36, 0.06, 0.05], M.fourGlow)}
            {box([-0.04, 3.385, -0.69], [0.42, 0.06, 0.05], M.fourGlow, { rotation: [0, 0, 0.94] })}
            <Plaque title={cfg.title} line={cfg.epitaph} burnMats={burnMats} position={[0, 1.4, -0.69]} width={1.0} />
          </group>
        </Rise>
        {[-4.25, -2.2, 2.2, 4.25].map((x, k) => (
          <Rise key={x} rt={rt} at={0.12 + k * 0.03} depth={5.5}>
            <group ref={fallers[2 + (k % 3)]} position={[x, 0, -1.4]}>
              {box([0, 2.6, 0], [0.4, 5.0, 0.4], M.stone)}
              {box([0, 5.2, 0], [0.6, 0.2, 0.6], M.gold)}
            </group>
          </Rise>
        ))}
        {cfg.members.map((m, k) => {
          const x = FF_MEMBER_X[k]
          const Holo = HOLOS[m.id]
          const Relic = RELICS[m.relic]
          return (
            <Rise key={m.id} rt={rt} at={0.3 + k * 0.07} depth={1.6} spin={1.2}>
              {box([x, 0.55, 0.15], [0.95, 0.9, 0.75], M.darkStone)}
              {box([x, 1.02, 0.15], [1.02, 0.05, 0.82], M.gold)}
              <group position={[x - 0.05, 1.05, 0.25]}>
                <Projector rt={rt} color={m.color} metal={M.metal} radius={0.16} height={0.85}>
                  <Holo rt={rt} color={m.color} win={FF_WINDOWS[k]} />
                </Projector>
              </group>
              <group position={[x + 0.33, 1.05, -0.05]} rotation-y={-0.4}>
                <Figurine mat={M.figurine} hero={m.figurine.hero} pose={m.figurine.pose} scale={0.26} />
              </group>
              {box([x, 0.8, -0.35], [0.5, 1.5, 0.4], M.stone)}
              <group position={[x, 1.55, -0.35]}>
                <Relic rt={rt} burnMats={burnMats} />
              </group>
            </Rise>
          )
        })}
        {cfg.members.map((m, k) => (
          <Clipping key={m.id} clip={m.clip} seed={50 + k} rt={rt} burnMats={burnMats} position={[FF_MEMBER_X[k], 3.3, -1.64]} rotation={[0, 0, (k % 2 ? -1 : 1) * 0.05]} size={[0.7, 0.98]} delay={k * 0.1} />
        ))}
        <Clipping clip={cfg.clippings[0]} seed={61} rt={rt} burnMats={burnMats} position={[-1.2, 4.9, -1.64]} rotation={[0, 0, 0.08]} size={[0.6, 0.84]} delay={0.4} />
        <Clipping clip={cfg.clippings[1]} seed={62} rt={rt} burnMats={burnMats} position={[1.2, 4.9, -1.64]} rotation={[0, 0, -0.06]} size={[0.6, 0.84]} delay={0.45} />
        <Rise rt={rt} at={0.6} depth={1}>
          <Brazier M={M} position={[-3.9, 0.2, 1.0]} quality={quality} />
          <Brazier M={M} position={[3.9, 0.2, 1.0]} quality={quality} />
        </Rise>
      </group>
      <primitive object={dust.points} />
      <DestructionFX fx={fx} />
      <Token rt={rt} cfg={cfg} position={[0, 2.2, 0.5]} />
    </group>
  )
}
