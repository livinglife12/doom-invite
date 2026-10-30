import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { SpotLight } from '@react-three/drei'
import * as THREE from 'three'
import { world, beam, input, litAmount, showMeshes } from '../world'
import { stoneTex, clippingCanvas, toTexture, crackTexture, emblemTexture } from '../lib/textures'
import { holoMaterial } from '../lib/materials'
import { setPose } from '../lib/figure'
import { buildHero } from '../lib/heroes'
import { buildHeroHead } from '../lib/heroHeadGeometry'
import { Throne, DoomPresence } from './ThroneDoom'
import HeroStatues from './HeroStatues'
import { SHRINES } from '../config/shrines'
import Switch from './Switch'
import { Shield, useShieldMats } from './Relics'

function useRoomMats() {
  return useMemo(
    () => ({
      wall: new THREE.MeshStandardMaterial({ map: stoneTex([4, 3]), color: '#5d625f', roughness: 0.8, metalness: 0.05 }),
      pillar: new THREE.MeshStandardMaterial({ map: stoneTex([1, 4]), color: '#6a6f6b', roughness: 0.7, metalness: 0.1 }),
      metal: new THREE.MeshStandardMaterial({ color: '#2b302d', roughness: 0.3, metalness: 0.95 }),
      throne: new THREE.MeshStandardMaterial({ color: '#1c221e', roughness: 0.25, metalness: 0.9 }),
      gold: new THREE.MeshStandardMaterial({ color: '#a8873f', roughness: 0.3, metalness: 1 }),
      crystal: new THREE.MeshStandardMaterial({ color: '#0a1a0f', emissive: '#ff9a3c', emissiveIntensity: 0.4, roughness: 0.2 }),
      cloth: new THREE.MeshStandardMaterial({ color: '#0d2214', roughness: 1 }),
      statue: new THREE.MeshStandardMaterial({ map: stoneTex([1, 1]), color: '#96998f', roughness: 0.86 }),
      carpet: new THREE.MeshStandardMaterial({ color: '#0b2614', roughness: 1 }),
    }),
    []
  )
}

const box = (M, pos, size, mat, { key, ...extra } = {}) => (
  <mesh key={key} position={pos} material={mat} castShadow receiveShadow {...extra}>
    <boxGeometry args={size} />
  </mesh>
)

export default function ThroneRoom({ quality }) {
  const grp = useRef()
  const M = useRoomMats()
  useFrame(() => {
    showMeshes(grp.current, world.throneVisible)
  })
  return (
    <group ref={grp}>
      <Floor quality={quality} M={M} />
      <Architecture M={M} />
      <Throne M={M} />
      <DoomPresence />
      <RoomLighting />
      <ShieldProp />
      <Helmet />
      <CloakStatue M={M} />
      <Cracks />
      <Papers />
      <HeroStatues M={M} />
      <BrokenHolo M={M} />
      <Sconces M={M} />
      <Doors M={M} />
      <Switch />
      <Flashlight quality={quality} />
    </group>
  )
}

function Floor({ quality, M }) {
  const tex = useMemo(() => stoneTex([6, 10]), [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -7.5]} receiveShadow>
        <planeGeometry args={[18, 31]} />
        {/* glossy polished stone: env + light reflections without a second scene render */}
        <meshStandardMaterial map={tex} color="#2c2d2c" roughness={0.18} metalness={0.45} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -8]} material={M.carpet} receiveShadow>
        <planeGeometry args={[2.2, 23]} />
      </mesh>
    </group>
  )
}

function Pillar({ M, pos }) {
  return (
    <group position={pos}>
      {box(M, [0, 6, 0], [1.2, 12, 1.2], M.pillar)}
      {box(M, [0, 0.25, 0], [1.6, 0.5, 1.6], M.pillar)}
      {box(M, [0, 11.5, 0], [1.6, 0.7, 1.6], M.pillar)}
      {box(M, [0, 3.5, 0], [1.25, 0.12, 1.25], M.gold)}
    </group>
  )
}

function Architecture({ M }) {
  return (
    <group>
      {box(M, [-9.2, 6, -7.5], [0.4, 12, 31.4], M.wall)}
      {box(M, [9.2, 6, 5.1], [0.4, 12, 5.8], M.wall)}
      {box(M, [9.2, 6, -12.6], [0.4, 12, 20.8], M.wall)}
      {box(M, [9.2, 9.6, 0], [0.4, 4.8, 4.4], M.wall)}
      {box(M, [0, 6, -23.2], [18.8, 12, 0.4], M.wall)}
      {box(M, [0, 6, 8.2], [18.8, 12, 0.4], M.wall)}
      {box(M, [0, 12.1, -7.5], [18.8, 0.4, 31.4], M.wall)}
      {[5, -1, -7, -13, -19].map((z) => (
        <Pillar key={'l' + z} M={M} pos={[-8.4, 0, z]} />
      ))}
      {[5.6, 2.9, -2.9, -6.6, -13, -19].map((z) => (
        <Pillar key={'r' + z} M={M} pos={[8.4, 0, z]} />
      ))}
      {/* dais */}
      {box(M, [0, 0.15, -19.8], [8, 0.3, 6], M.pillar)}
      {box(M, [0, 0.45, -20.3], [6.4, 0.3, 5], M.pillar)}
      {box(M, [0, 0.75, -20.8], [4.8, 0.3, 4], M.pillar)}
      <mesh position={[0, 7.5, -22.95]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial map={emblemTexture()} transparent emissive="#c9a25a" emissiveMap={emblemTexture()} emissiveIntensity={0.05} color="#3a2f1c" metalness={0.8} roughness={0.4} />
      </mesh>
    </group>
  )
}

function RoomLighting() {
  const rim = useRef(), key = useRef()
  const target = useMemo(() => { const object = new THREE.Object3D(); object.position.set(0, 2.65, -20.85); object.updateMatrixWorld(); return object }, [])
  useFrame(() => {
    const visible = world.throneVisible ? 1 : 0
    const room = world.sw.lights
    rim.current.intensity = visible * (0.04 + room * 0.62)
    key.current.intensity = visible * (0.7 + room * 48)
  })
  return <>
    <primitive object={target} />
    <directionalLight ref={rim} color="#bbcbd4" position={[-4, 7, 5]} intensity={0} />
    <spotLight ref={key} target={target} color="#e8e0cf" position={[2.4, 6.3, -14]} angle={0.46} penumbra={0.75} distance={15} decay={1.25} intensity={0} />
  </>
}

function ShieldProp() {
  const light = useRef()
  const mats = useShieldMats()
  const p = useMemo(() => new THREE.Vector3(-7.45, 0.75, -3.4), [])
  useFrame((s) => {
    if (!world.throneVisible) return
    const l = litAmount(p, 1.1)
    light.current.intensity = l * 9 * (0.85 + Math.sin(s.clock.elapsedTime * 3) * 0.15)
  })
  return (
    <group>
      <group position={p.toArray()} rotation={[0.2, 0, -Math.PI / 2 + 0.28]} scale={1.7}>
        <Shield mats={mats} />
      </group>
      <pointLight ref={light} position={[-5.6, 0.15, -3.0]} color="#cfe0ff" intensity={0} distance={5} decay={1.6} />
    </group>
  )
}

function Helmet() {
  const materials = useMemo(() => ({
    red: new THREE.MeshStandardMaterial({ color: '#842331', metalness: 0.68, roughness: 0.38 }),
    gold: new THREE.MeshStandardMaterial({ color: '#b79957', metalness: 0.68, roughness: 0.42 }),
    liner: new THREE.MeshStandardMaterial({ color: '#161c23', roughness: 0.8 }),
    eye: new THREE.MeshStandardMaterial({ color: '#9fb8bf', emissive: '#99d1e0', emissiveIntensity: 0.03 }),
  }), [])
  const helmet = useMemo(() => {
    const head = buildHeroHead('ironman', { primary: materials.red, secondary: materials.gold, skin: materials.red, hair: materials.liner, metal: materials.gold, eye: materials.eye }, { shadows: true })
    head.root.name = 'fallen-ironman-helmet'
    head.root.scale.setScalar(4.2)
    head.root.rotation.set(0.18, 0.8, 1.12)
    const bounds = new THREE.Box3().setFromObject(head.root)
    head.root.position.y = 0.012 - bounds.min.y
    return head.root
  }, [materials])
  const p = useMemo(() => new THREE.Vector3(2.4, 0.3, -5.4), [])
  const state = useMemo(() => ({ lit: 0 }), [])
  useFrame((_, dt) => {
    if (!world.throneVisible) return
    const target = litAmount(p) > 0.4 ? 1 : 0
    state.lit += (target - state.lit) * Math.min(1, dt * 3)
    materials.eye.emissiveIntensity = 0.03 + state.lit * 1.4
  })
  return <group position={[2.4, 0, -5.4]}><primitive object={helmet} /></group>
}



export function animateCloth(cloth, t, amp, curl = 0.25) {
  if (t - (cloth.updatedAt ?? -Infinity) < 0.05) return
  cloth.updatedAt = t
  const p = cloth.g.attributes.position.array
  const b = cloth.base
  for (let i = 0; i < p.length; i += 3) {
    const x = b[i]
    const y = b[i + 1]
    const fall = Math.min(1, -y * 1.2)
    p[i + 2] = b[i + 2] - Math.cos(x * 2.4) * curl + Math.sin(y * 7 + t * 2.1 + x * 3) * amp * fall
    p[i] = x + Math.sin(y * 5 + t * 1.7) * amp * 0.4 * fall
  }
  cloth.g.attributes.position.needsUpdate = true
  cloth.g.computeVertexNormals()
}

function CloakStatue({ M }) {
  const red = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7c2230', roughness: 0.86, side: THREE.DoubleSide }), [])
  const figure = useMemo(() => {
    const f = buildHero('strange', M.statue, { shadows: true, materials: { body: M.statue, accent: red, skin: M.statue, dark: M.statue, trim: M.gold, light: M.statue, headTrim: M.statue } })
    setPose(f.j, 'cast')
    f.root.scale.setScalar(2.65)
    f.root.name = 'doctor-strange-sculpture'
    const cape = f.j.cape
    cape.geometry = cape.geometry.clone()
    return { f, cloth: { g: cape.geometry, base: cape.geometry.attributes.position.array.slice() } }
  }, [M, red])
  const point = useMemo(() => new THREE.Vector3(-5.8, 2.3, -16.2), [])
  const state = useMemo(() => ({ twitch: 0, was: 0 }), [])
  useFrame((s, dt) => {
    if (!world.throneVisible) return
    const light = litAmount(point)
    if (light > 0.4 && state.was <= 0.4) state.twitch = 1
    state.was = light
    state.twitch = Math.max(0, state.twitch - dt * 0.8)
    animateCloth(figure.cloth, s.clock.elapsedTime, 0.001 + state.twitch * 0.014 + light * 0.004, 0)
  })
  return <group position={[-5.8, 0, -16.2]} rotation-y={0.38}>
    {box(M, [0, 0.45, 0], [1.4, 0.9, 1.4], M.pillar)}
    <group position={[0, 0.9, 0]}><primitive object={figure.f.root} /></group>
  </group>
}

function Cracks() {
  const mats = useMemo(() => [1, 2, 3].map(seed => new THREE.MeshStandardMaterial({ alphaMap: crackTexture(seed), color: '#151e18', roughness: 1, transparent: true, opacity: 0.65, depthWrite: false })), [])
  return (
    <group>
      <mesh position={[-8.98, 4.5, -9]} rotation-y={Math.PI / 2} material={mats[0]}>
        <planeGeometry args={[5, 8]} />
      </mesh>
      <mesh position={[-4.5, 6, -22.98]} material={mats[1]}>
        <planeGeometry args={[4, 9]} />
      </mesh>
      <mesh position={[8.98, 3.5, -15.5]} rotation-y={-Math.PI / 2} material={mats[2]}>
        <planeGeometry args={[4, 6]} />
      </mesh>
      <mesh position={[1.5, 0.012, -15]} rotation={[-Math.PI / 2, 0, 0.8]} material={mats[0]}>
        <planeGeometry args={[2.5, 5]} />
      </mesh>
    </group>
  )
}

const PAPER_SPOTS = [
  [1.1, -2.6, 0.4],
  [-2.3, -8.8, 2.1],
  [4.3, -11.2, -0.6],
  [-0.9, -13.6, 1.3],
  [2.1, -16.4, 2.7],
  [-3.6, -4.6, -1.1],
]

function Papers() {
  const items = useMemo(() => {
    const clips = SHRINES.flatMap((s) => s.clippings)
    return PAPER_SPOTS.map(([x, z, r], i) => {
      const mat = new THREE.MeshStandardMaterial({ map: toTexture(clippingCanvas(clips[i % clips.length], i + 40, 256, 360)), roughness: 0.9, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
      return { x, z, r, mat, p: new THREE.Vector3(x, 0.1, z), lift: 0 }
    })
  }, [])
  const refs = useRef([])
  useFrame((s, dt) => {
    if (!world.throneVisible) return
    const t = s.clock.elapsedTime
    items.forEach((it, i) => {
      const l = litAmount(it.p)
      it.lift += ((l > 0.35 ? 1 : 0) - it.lift) * Math.min(1, dt * 2)
      const m = refs.current[i]
      m.position.y = 0.012 + it.lift * (0.12 + Math.sin(t * 3 + i) * 0.05)
      m.rotation.x = -Math.PI / 2 + it.lift * Math.sin(t * 4 + i) * 0.25
    })
  })
  return items.map((it, i) => (
    <mesh key={i} ref={(m) => (refs.current[i] = m)} position={[it.x, 0.012, it.z]} rotation={[-Math.PI / 2, 0, it.r]} material={it.mat} receiveShadow>
      <planeGeometry args={[0.5, 0.7]} />
    </mesh>
  ))
}



function BrokenHolo({ M }) {
  const s = useMemo(() => {
    const mat = holoMaterial('#5aa8ff')
    const f = buildHero('reed', mat)
    setPose(f.j, 'defiant')
    f.root.scale.setScalar(0.9)
    return { mat, f, p: new THREE.Vector3(5.6, 1, -18), on: 0 }
  }, [])
  useFrame((st, dt) => {
    if (!world.throneVisible) return
    const l = litAmount(s.p, 1.2)
    s.on = l > 0.3 ? 1 : Math.max(0, s.on - dt * 1.5)
    const u = s.mat.uniforms
    u.uTime.value = st.clock.elapsedTime
    u.uOpacity.value = s.on * (Math.random() < 0.7 ? 1 : 0.1)
    u.uGlitch.value = 1.2
  })
  return (
    <group position={[5.6, 0, -18]} rotation={[0, -0.6, 0.06]}>
      <mesh material={M.metal} position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.35, 0.4, 0.12, 24]} />
      </mesh>
      <group position={[0, 0.13, 0]}>
        <primitive object={s.f.root} />
      </group>
    </group>
  )
}

const SCONCES = [
  [-8.75, 3.6, 2, Math.PI / 2],
  [-8.75, 3.6, -4, Math.PI / 2],
  [-8.75, 3.6, -10, Math.PI / 2],
  [-8.75, 3.6, -16, Math.PI / 2],
  [8.75, 3.6, -10.2, -Math.PI / 2],
  [8.75, 3.6, -16, -Math.PI / 2],
]

function Sconces({ M }) {
  const crystals = useMemo(() => SCONCES.map(() => new THREE.MeshStandardMaterial({ color: '#1a0d04', emissive: '#ff9a3c', emissiveIntensity: 0 })), [])
  const l1 = useRef()
  const l2 = useRef()
  useFrame((s) => {
    const L = world.throneVisible ? world.sw.lights : 0
    crystals.forEach((m, i) => {
      const on = Math.min(1, Math.max(0, L * 6 - i))
      m.emissiveIntensity = on * (3 + Math.sin(s.clock.elapsedTime * 7 + i) * 0.4)
    })
    l1.current.intensity = L * 22
    l2.current.intensity = L * 22
  })
  return (
    <group>
      {SCONCES.map(([x, y, z, ry], i) => (
        <group key={i} position={[x, y, z]} rotation-y={ry}>
          {box(M, [0, -0.2, 0.15], [0.3, 0.12, 0.4], M.metal)}
          <mesh position={[0, 0.1, 0.3]} material={crystals[i]}>
            <octahedronGeometry args={[0.16, 0]} />
          </mesh>
        </group>
      ))}
      <pointLight ref={l1} position={[-6.5, 4.5, -7]} color="#ffb46a" intensity={0} distance={20} decay={1.5} />
      <pointLight ref={l2} position={[6.5, 4.5, -13]} color="#ffb46a" intensity={0} distance={20} decay={1.5} />
    </group>
  )
}

function Doors({ M }) {
  const a = useRef()
  const b = useRef()
  const seam = useMemo(() => new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb45a', emissiveIntensity: 0.6 }), [])
  const plate = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1f1c', metalness: 0.9, roughness: 0.35, map: emblemTexture() }), [])
  useFrame((s) => {
    if (!world.throneVisible) return
    const o = world.doors.open
    a.current.rotation.y = -o * 1.45
    b.current.rotation.y = o * 1.45
    seam.emissiveIntensity = 0.5 + world.sw.lights * 2 + Math.sin(s.clock.elapsedTime * 2) * 0.2
  })
  const leaf = (sign) => (
    <>
      {box(M, [0, 3.5, -sign * 1.1], [0.3, 7, 2.2], M.throne)}
      {box(M, [-0.16, 3.5, -sign * 2.17], [0.04, 7, 0.05], seam)}
      <mesh position={[-0.16, 4.2, -sign * 1.1]} rotation-y={-Math.PI / 2} material={plate}>
        <circleGeometry args={[0.75, 32]} />
      </mesh>
    </>
  )
  return (
    <group position={[9.05, 0, 0]}>
      <group ref={a} position={[0, 0, 2.2]}>
        {leaf(1)}
      </group>
      <group ref={b} position={[0, 0, -2.2]}>
        {leaf(-1)}
      </group>
    </group>
  )
}

function Flashlight({ quality }) {
  const shadowsOn = useThree((st) => st.gl.shadowMap.enabled)
  const light = useRef()
  const target = useMemo(() => new THREE.Object3D(), [])
  const t = useMemo(() => ({ aim: new THREE.Vector3(0, 0.6, -10), desired: new THREE.Vector3(), v2: new THREE.Vector2(), ray: new THREE.Raycaster(), right: new THREE.Vector3(), up: new THREE.Vector3() }), [])
  useFrame(({ camera, clock }, dt) => {
    if (!world.throneVisible) { beam.on = 0; light.current.intensity = 0; return }
    const f = world.flashlight
    t.v2.set(input.x, input.y)
    t.ray.setFromCamera(t.v2, camera)
    beam.pointerRay.copy(t.ray.ray)
    t.desired.copy(t.ray.ray.origin).addScaledVector(t.ray.ray.direction, 14)
    t.desired.y -= f.lower * 10
    t.aim.lerp(t.desired, 1 - Math.exp(-dt * 12))
    t.right.setFromMatrixColumn(camera.matrixWorld, 0)
    t.up.setFromMatrixColumn(camera.matrixWorld, 1)
    const L = light.current
    L.position.copy(camera.position).addScaledVector(t.right, 0.28).addScaledVector(t.up, -0.3)
    target.position.copy(t.aim)
    target.updateMatrixWorld()
    beam.origin.copy(L.position)
    beam.dir.copy(t.aim).sub(L.position).normalize()
    beam.on = f.enabled ? f.intensity : 0
    const flick = 0.94 + Math.sin(clock.elapsedTime * 31) * 0.03 + (Math.random() < 0.01 ? -0.4 : 0)
    L.intensity = f.intensity * 240 * flick
    // drei's volumetric cone lives under the light; hide it while the torch is off
    for (const c of L.children) c.visible = f.intensity > 0.02 && world.throneVisible
  })
  return (
    <>
      <primitive object={target} />
      <SpotLight
        ref={light}
        target={target}
        castShadow={shadowsOn}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
        color="#ffefd6"
        angle={0.4}
        penumbra={0.5}
        distance={42}
        decay={1.35}
        attenuation={11}
        anglePower={4}
        radiusTop={0.04}
        radiusBottom={4.5}
        opacity={0.16}
        intensity={0}
        volumetric={quality === 'high'}
      />
    </>
  )
}
