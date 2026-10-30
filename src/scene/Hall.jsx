import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world } from '../world'
import { SHRINES } from '../config/shrines'
import { HALL_END, V_MASK, PILLAR_X, SHRINE_POS } from '../config/layout'
import { stoneTex, bannerTexture, softDot } from '../lib/textures'
import { rng, smooth, seg } from '../lib/util'
import { Shrine, TeamShrine } from './Shrine'
import { makeEmitter } from '../lib/particles'
import { particleScale } from '../lib/quality'

const XAXIS = new THREE.Vector3(1, 0, 0)
const _p = new THREE.Vector3()
const _d = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _e = new THREE.Euler()

// Instanced architecture that can fracture, float and be swallowed by the vortex at V_MASK.
// c = world.hall.collapse (0 intact .. 1 gone).
function Pieces({ items, geometry, material, seed = 1 }) {
  const ref = useRef()
  const data = useMemo(() => {
    const r = rng(seed * 101)
    return items.map((it) => ({
      p: new THREE.Vector3(...it.p),
      e: new THREE.Euler(...(it.r || [0, 0, 0])),
      s: new THREE.Vector3(...it.s),
      seed: r(),
      delay: r() * 0.35 + Math.max(0, (it.p[0] - 50) / 30) * -0.1 + 0.1,
      axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      fall: 0.5 + r() * 1.5,
    }))
  }, [items])
  const last = useRef(-1)
  const write = (c, t) => {
    const mesh = ref.current
    data.forEach((d, i) => {
      _p.copy(d.p)
      _q.setFromEuler(d.e)
      _s.copy(d.s)
      if (c > 0) {
        const k = smooth(0, 1, (c - d.delay) / 0.4)
        const pull = smooth(0.58 + d.seed * 0.2, 1.0, c)
        _p.x += Math.sin(t * 20 + d.seed * 50) * 0.04 * k * (1 - pull)
        _p.y += d.p.y > 4 ? -d.fall * k * k * 2.5 : d.fall * k * 0.45
        _p.z += Math.sign(d.p.z || d.seed - 0.5) * k * d.fall * 1.2
        _q2.setFromAxisAngle(d.axis, k * (0.5 + d.seed) + pull * 5)
        _q.multiply(_q2)
        if (pull > 0) {
          _d.copy(_p).sub(V_MASK)
          _d.applyAxisAngle(XAXIS, pull * 2.6 * (d.seed > 0.5 ? 1 : -1))
          _p.copy(V_MASK).addScaledVector(_d, 1 - pull)
        }
        _s.multiplyScalar(Math.max(0.001, 1 - pull * 0.99))
      }
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => write(0, 0), [])
  useFrame((s) => {
    const c = world.hall.collapse
    if (!world.hall.visible || (c === last.current && (c === 0 || c >= 0.999))) return
    last.current = c
    write(c, s.clock.elapsedTime)
  })
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow frustumCulled={false} />
}

function useLayout() {
  return useMemo(() => {
    const floor = []
    for (let x = 11; x < HALL_END; x += 4) for (const z of [-4.4, 0, 4.4]) floor.push({ p: [x, -0.15, z], s: [3.98, 0.3, 4.38] })
    const walls = []
    for (let x = 12; x < HALL_END; x += 6) for (const z of [-6.7, 6.7]) walls.push({ p: [x, 5, z], s: [5.98, 10, 0.4] })
    for (const z of [-4.5, 0, 4.5]) for (const y of [2.5, 7.5]) walls.push({ p: [HALL_END + 0.2, y, z], s: [0.4, 4.98, 4.48] })
    const ceiling = []
    for (let x = 12; x < HALL_END; x += 6) ceiling.push({ p: [x, 10.2, 0], s: [5.98, 0.4, 13.8] })
    const pillars = []
    for (const x of PILLAR_X) for (const z of [-6.1, 6.1]) pillars.push({ p: [x, 5, z], s: [1, 10, 1] })
    const beams = []
    for (const x of PILLAR_X) beams.push({ p: [x, 9.7, 0], s: [0.7, 0.7, 13.2] })
    const strips = []
    for (let x = 12; x < HALL_END; x += 6) for (const z of [-6.0, 6.0]) strips.push({ p: [x, 0.03, z], s: [5.6, 0.04, 0.08] })
    const banners = []
    // banners hang opposite each single shrine
    for (const [x, z] of SHRINE_POS.slice(0, -1).map((p) => [p.x, -Math.sign(p.z) * 6.45])) banners.push({ p: [x, 6.2, z], s: [1.6, 4, 1], r: [0, z > 0 ? Math.PI : 0, 0] })
    return { floor, walls, ceiling, pillars, beams, strips, banners }
  }, [])
}

export default function Hall({ quality }) {
  const grp = useRef()
  const L = useLayout()
  const M = useMemo(
    () => ({
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      floor: new THREE.MeshStandardMaterial({ map: stoneTex([1, 1]), color: '#2a2f2c', roughness: 0.2, metalness: 0.45 }),
      wall: new THREE.MeshStandardMaterial({ map: stoneTex([2, 3]), color: '#4b514d', roughness: 0.75, metalness: 0.05 }),
      pillar: new THREE.MeshStandardMaterial({ map: stoneTex([1, 5]), color: '#5d635f', roughness: 0.6, metalness: 0.1 }),
      metal: new THREE.MeshStandardMaterial({ color: '#1e2321', roughness: 0.35, metalness: 0.9 }),
      strip: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb45a', emissiveIntensity: 0 }),
      banner: new THREE.MeshStandardMaterial({ map: bannerTexture(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    }),
    []
  )
  const key = useRef()
  const keyTarget = useMemo(() => new THREE.Object3D(), [])
  const holoLight = useRef()
  const fillA = useRef()
  const fillB = useRef()
  const red = useMemo(() => new THREE.Color('#ff2a3a'), [])
  const green = useMemo(() => new THREE.Color('#ffc58a'), [])

  useFrame(({ camera, clock }) => {
    const h = world.hall
    const t = clock.elapsedTime
    grp.current.visible = h.visible
    if (!h.visible) {
      key.current.intensity = 0
      holoLight.current.intensity = 0
      fillA.current.intensity = 0
      fillB.current.intensity = 0
      return
    }
    const c = h.collapse
    const flick = c > 0 ? (Math.random() < c * 0.5 ? Math.random() * 0.3 : 1) : 1
    M.strip.emissiveIntensity = h.lights * 0.8 * flick * (1 - smooth(0.6, 0.9, c))
    M.strip.emissive.copy(green).lerp(red, c > 0 && Math.sin(t * 9) > 0.3 ? Math.min(1, c * 2) : 0)
    key.current.position.lerp(h.keyFrom, 0.08)
    keyTarget.position.lerp(h.keyTarget, 0.08)
    keyTarget.updateMatrixWorld()
    key.current.intensity = h.keyOn * 65 * (1 - c)
    holoLight.current.position.copy(h.holoPos)
    holoLight.current.color.copy(h.holoColor)
    holoLight.current.intensity = h.holoOn * 3.5
    fillA.current.position.set(camera.position.x + 5, 6, -3)
    fillB.current.position.set(camera.position.x - 4, 6, 3)
    const fi = h.lights * 38 * flick * (1 - c * 0.6)
    fillA.current.intensity = fi
    fillB.current.intensity = fi
    fillA.current.color.copy(green).lerp(red, c * 0.8)
  })

  return (
    <group>
      <group ref={grp}>
        <Pieces items={L.floor} geometry={M.box} material={M.floor} seed={1} />
        <Pieces items={L.walls} geometry={M.box} material={M.wall} seed={2} />
        <Pieces items={L.ceiling} geometry={M.box} material={M.wall} seed={3} />
        <Pieces items={L.pillars} geometry={M.box} material={M.pillar} seed={4} />
        <Pieces items={L.beams} geometry={M.box} material={M.metal} seed={5} />
        <Pieces items={L.strips} geometry={M.box} material={M.strip} seed={6} />
        <Pieces items={L.banners} geometry={M.plane} material={M.banner} seed={7} />
        <Torches quality={quality} />
        {SHRINES.map((cfg, i) => (cfg.team ? <TeamShrine key={cfg.id} i={i} cfg={cfg} quality={quality} /> : <Shrine key={cfg.id} i={i} cfg={cfg} quality={quality} />))}
      </group>
      <primitive object={keyTarget} />
      <spotLight ref={key} target={keyTarget} position={[20, 7, -1]} angle={0.6} penumbra={0.8} distance={16} decay={1.3} color="#eafff0" intensity={0} />
      <pointLight ref={holoLight} distance={5} decay={1.5} intensity={0} />
      <pointLight ref={fillA} color="#ffc58a" distance={20} decay={1.3} intensity={0} />
      <pointLight ref={fillB} color="#a9bcff" distance={20} decay={1.3} intensity={0} />
    </group>
  )
}

const TORCH_X = PILLAR_X
const TORCHES = TORCH_X.flatMap((x) => [[x, 3.3, -5.45], [x, 3.3, 5.45]])

// Wall torches on every pillar: iron brackets, flame particles and a soft glow halo. They gutter out as the hall collapses.
function Torches({ quality }) {
  const iron = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c1d1f', metalness: 0.9, roughness: 0.45 }), [])
  const coal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff7a2a', emissiveIntensity: 2 }), [])
  const fire = useMemo(() => makeEmitter(Math.floor(520 * particleScale(quality)), { color: '#fff1b8', colorEnd: '#b8260a', size: 0.3, sizeEnd: 0.6 }), [])
  // Twenty fixtures share three draws instead of sixty individual meshes.
  const fixtures = useMemo(() => {
    const group = new THREE.Group()
    const layouts = [
      [new THREE.BoxGeometry(0.06, 0.06, 0.45), iron, [0, -0.25, -0.18], -0.6],
      [new THREE.CylinderGeometry(0.16, 0.08, 0.16, 12, 1, true), iron, [0, 0, 0], 0],
      [new THREE.SphereGeometry(0.1, 10, 6), coal, [0, 0.04, 0], 0],
    ]
    const base = new THREE.Object3D()
    const local = new THREE.Object3D()
    const matrix = new THREE.Matrix4()
    for (const [geometry, material, position, rotationX] of layouts) {
      const mesh = new THREE.InstancedMesh(geometry, material, TORCHES.length)
      local.position.set(...position)
      local.rotation.set(rotationX, 0, 0)
      local.updateMatrix()
      TORCHES.forEach(([x, y, z], i) => {
        base.position.set(x, y, z)
        base.rotation.set(0, z > 0 ? Math.PI : 0, 0)
        base.updateMatrix()
        matrix.multiplyMatrices(base.matrix, local.matrix)
        mesh.setMatrixAt(i, matrix)
      })
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
    return group
  }, [iron, coal])
  const emission = useMemo(() => ({ nearby: [], cameraX: Infinity, carry: 0, active: false }), [])
  const halo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TORCHES.flatMap(([x, y, z]) => [x, y + 0.25, z])), 3))
    const m = new THREE.PointsMaterial({ size: 3.4, map: softDot(), color: '#ff9a4a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    return p
  }, [])
  useEffect(() => () => {
    fixtures.traverse(object => object.geometry?.dispose())
    fire.dispose?.()
    halo.geometry.dispose()
    halo.material.dispose()
    iron.dispose()
    coal.dispose()
  }, [fixtures, fire, halo, iron, coal])
  useFrame((st, rawDt) => {
    const h = world.hall
    if (!h.visible) {
      halo.material.opacity = 0
      coal.emissiveIntensity = 0
      if (emission.active) { fire.clear?.(); emission.active = false; emission.carry = 0 }
      return
    }
    emission.active = true
    const dt = Math.min(rawDt, 0.05)
    const live = h.lights * (1 - smooth(0.2, 0.5, h.collapse))
    halo.material.opacity = live * (0.32 + Math.sin(st.clock.elapsedTime * 9) * 0.04)
    coal.emissiveIntensity = 2 * live
    if (live > 0.05) {
      if (Math.abs(st.camera.position.x - emission.cameraX) > 2) {
        emission.cameraX = st.camera.position.x
        emission.nearby.length = 0
        TORCHES.forEach((torch, i) => { if (Math.abs(torch[0] - emission.cameraX) < 22) emission.nearby.push(i) })
      }
      emission.carry += dt * 13 * emission.nearby.length * live
      const count = Math.floor(emission.carry)
      emission.carry -= count
      if (count > 0) fire.emit(count, () => {
        const index = emission.nearby[(Math.random() * emission.nearby.length) | 0]
        const [x, y, z] = TORCHES[index]
        return { p: [x + (Math.random() - 0.5) * 0.14, y + 0.12, z + (Math.random() - 0.5) * 0.14], v: [(Math.random() - 0.5) * 0.12, 0.55 + Math.random() * 0.4, (Math.random() - 0.5) * 0.12], life: 0.45 + Math.random() * 0.3 }
      })
    }
    fire.update(dt, { turbulence: 0.9, t: st.clock.elapsedTime })
  })
  return (
    <group>
      <primitive object={fixtures} />
      <primitive object={fire.points} />
      <primitive object={halo} />
    </group>
  )
}
