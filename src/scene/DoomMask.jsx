import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, showMeshes } from '../world'
import { V_MASK } from '../config/layout'
import { buildMaskPlate, buildMaskParts, RIVETS, frontZ, inMask, maskNormal } from '../lib/maskShape'
import { makeCanvas, toTexture } from '../lib/textures'
import { portalMaterial, additive } from '../lib/materials'
import { makeEmitter } from '../lib/particles'
import { rng, smooth, seg, easeInOut } from '../lib/util'

const SCALE = 2.25
const Z = new THREE.Vector3(0, 0, 1)
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _c = new THREE.Color()
const HOT = new THREE.Color('#ffb070').multiplyScalar(3)
const STEEL = new THREE.Color('#6c7278')

// Brushed, scuffed steel: horizontal grain plus random scratches in the roughness channel.
let steelRough
function steelRoughness() {
  if (steelRough) return steelRough
  const [c, g] = makeCanvas(512, 512)
  g.fillStyle = '#6a6a6a'
  g.fillRect(0, 0, 512, 512)
  for (let y = 0; y < 512; y++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},0,0,${Math.random() * 0.06})`
    g.fillRect(0, y, 512, 1)
  }
  for (let i = 0; i < 260; i++) {
    const v = Math.random() < 0.6 ? 20 : 220
    g.strokeStyle = `rgba(${v},${v},${v},${0.2 + Math.random() * 0.4})`
    g.lineWidth = 0.5 + Math.random() * 1.2
    const x = Math.random() * 512
    const y = Math.random() * 512
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 30)
    g.stroke()
  }
  steelRough = toTexture(c, { srgb: false })
  steelRough.wrapS = steelRough.wrapT = THREE.RepeatWrapping
  steelRough.repeat.set(3, 3)
  return steelRough
}

function cowlGeometry() {
  const prof = [[0.0, 0.98], [0.3, 0.95], [0.56, 0.8], [0.68, 0.5], [0.7, 0.1], [0.72, -0.35], [0.82, -0.75], [1.05, -1.05], [1.4, -1.35]].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(prof, 64, 0.62, Math.PI * 2 - 1.24)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const a = Math.atan2(x, z)
    const fold = Math.sin(a * 9 + y * 3) * 0.025 * Math.min(1, (1 - y) * 0.8)
    const r = Math.hypot(x, z)
    if (r > 0.001) {
      p.setX(i, x * (1 + fold / r))
      p.setZ(i, z * (1 + fold / r) - 0.12)
    }
  }
  g.computeVertexNormals()
  return g
}

// side 1 = right half, -1 = left half
function Half({ side, geo, M }) {
  return (
    <group>
      <mesh geometry={geo.plate} material={M.steel} castShadow />
      <mesh geometry={geo.parts.brow} material={M.steelDark} castShadow />
      <mesh geometry={geo.parts.nose} material={M.steel} castShadow />
      <mesh geometry={geo.parts.cheek} material={M.steelDark} />
      <mesh geometry={geo.parts.jaw} material={M.steelDark} />
      {[0.05, 0.1, 0.15].map((x) => (
        <mesh key={x} material={M.grille} position={[side * x, -0.333, frontZ(side * x, -0.33) - 0.035]}>
          <boxGeometry args={[0.022, 0.235, 0.02]} />
        </mesh>
      ))}
      <mesh material={M.black} position={[side * 0.09, -0.333, frontZ(side * 0.09, -0.33) - 0.06]}>
        <boxGeometry args={[0.18, 0.24, 0.01]} />
      </mesh>
      {RIVETS.map(([x, y], k) => (
        <mesh key={k} material={M.rivet} position={[side * x, y, frontZ(side * x, y) + 0.004]}>
          <sphereGeometry args={[0.016, 12, 8]} />
        </mesh>
      ))}
      <mesh material={M.steelDark} position={[side * 0.57, 0.18, -0.24]} rotation={[0, side * 1.25, 0]}>
        <boxGeometry args={[0.22, 0.42, 0.04]} />
      </mesh>
      <mesh material={M.eye} position={[side * 0.24, 0.165, frontZ(side * 0.24, 0.165) - 0.07]} rotation-z={side * 0.17}>
        <planeGeometry args={[0.3, 0.05]} />
      </mesh>
    </group>
  )
}

// Doom's mask assembles from the hall's remains: hundreds of white-hot fragments fly in and cool to steel,
// the solid faceplate takes over, the eyes ignite and the two halves swing open on their hinges.
export default function DoomMask({ quality }) {
  const grp = useRef()
  const left = useRef()
  const right = useRef()
  const frags = useRef()
  const eyeLight = useRef()
  const keyLight = useRef()
  const rimLight = useRef()
  const count = quality === 'low' ? 200 : 420

  const M = useMemo(() => {
    const rough = steelRoughness()
    const mk = (color, r) => new THREE.MeshStandardMaterial({ color, metalness: 0.72, roughness: r, roughnessMap: rough, transparent: true, opacity: 0, envMapIntensity: 1.3 })
    const steel = mk('#9aa0a6', 0.46)
    const steelDark = mk('#6a7076', 0.5)
    const rivet = mk('#a4a7a8', 0.25)
    const grille = mk('#2c2f32', 0.5)
    const clasp = mk('#b0904e', 0.3)
    const black = new THREE.MeshBasicMaterial({ color: '#020202', transparent: true, opacity: 0 })
    const cowl = new THREE.MeshStandardMaterial({ color: '#16391f', roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0, envMapIntensity: 0.15 })
    const frag = new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.35 })
    // Fragments glow while their instance colour is hot (r >> b): orange glows, grey steel does not.
    frag.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor * clamp((vColor.r - vColor.b) * 0.8, 0.0, 3.0);\n#endif')
    }
    return { steel, steelDark, rivet, grille, black, cowl, clasp, frag, eye: additive('#b8ffc8', 0), portal: portalMaterial(), solid: [steel, steelDark, rivet, grille, clasp] }
  }, [])

  const geo = useMemo(
    () => ({
      right: { plate: buildMaskPlate(1), parts: buildMaskParts(1) },
      left: { plate: buildMaskPlate(-1), parts: buildMaskParts(-1) },
      cowl: cowlGeometry(),
      frag: new THREE.BoxGeometry(0.07, 0.07, 0.018),
    }),
    []
  )

  const data = useMemo(() => {
    const r = rng(2024)
    const out = []
    while (out.length < count) {
      const x = (r() * 2 - 1) * 0.56
      const y = r() * 1.52 - 0.77
      if (!inMask(x, y)) continue
      const target = new THREE.Vector3(x, y, frontZ(x, y) + 0.006)
      const q = new THREE.Quaternion().setFromUnitVectors(Z, maskNormal(x, y))
      const a = r() * Math.PI * 2
      const rad = 2 + r() * 3.5
      out.push({ target, q, start: new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 2 + r() * 4), spin: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), delay: r() * 0.55, seed: r() })
    }
    return out
  }, [count])

  const smoke = useMemo(() => makeEmitter(quality === 'low' ? 40 : 90, { color: '#262a28', colorEnd: '#0a0b0b', size: 2.4, sizeEnd: 1.6, additive: false, soft: 2.4, opacity: 0.5 }), [])
  const embers = useMemo(() => makeEmitter(quality === 'low' ? 80 : 220, { color: '#fff0c0', colorEnd: '#b8200a', size: 0.06, sizeEnd: 0.2 }), [])

  // Seed instance colours before the startup compile so the program includes instancing colour.
  useLayoutEffect(() => {
    for (let i = 0; i < count; i++) frags.current.setColorAt(i, HOT)
  }, [count])

  useFrame((s, dt) => {
    const mk = world.mask
    const t = s.clock.elapsedTime
    showMeshes(grp.current, mk.visible)
    if (!mk.visible) return
    const A = mk.assemble
    const mesh = frags.current
    const fragFade = 1 - smooth(0.9, 1.0, A)
    mesh.visible = fragFade > 0.001
    data.forEach((d, i) => {
      const k = seg(A, d.delay * 0.8, d.delay * 0.8 + 0.4)
      const e = easeInOut(k)
      const orbit = (1 - e) * (t * (0.6 + d.seed))
      _p.copy(d.start).applyAxisAngle(Z, orbit).lerp(d.target, e)
      _q.copy(d.spin).slerp(d.q, e)
      _s.setScalar(Math.max(0.001, fragFade * (0.6 + 0.4 * e)))
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
      const heat = k < 1 ? 1 : 1 - seg(A - (d.delay * 0.8 + 0.4), 0, 0.3)
      _c.copy(STEEL).lerp(HOT, heat)
      mesh.setColorAt(i, _c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    const solid = smooth(0.82, 1, A)
    for (const m of M.solid) {
      m.opacity = solid
      m.transparent = solid < 1
      m.depthWrite = solid > 0.5
    }
    M.black.opacity = solid
    const o = easeInOut(mk.open)
    M.cowl.opacity = smooth(0.6, 1, A) * (1 - smooth(0.0, 0.5, mk.open) * 0.85)
    const glow = mk.glow
    M.eye.opacity = glow * (0.75 + Math.sin(t * 6) * 0.15 + (Math.random() < 0.03 ? -0.4 : 0))
    eyeLight.current.intensity = glow * 3
    keyLight.current.intensity = smooth(0.3, 1, A) * 70
    rimLight.current.intensity = smooth(0.3, 1, A) * 30
    left.current.rotation.y = -o * 1.6
    right.current.rotation.y = o * 1.6
    M.portal.uniforms.uTime.value = t
    M.portal.uniforms.uOpacity.value = smooth(0, 0.4, mk.open)
    grp.current.position.y = V_MASK.y + Math.sin(t * 0.6) * 0.05
    grp.current.rotation.z = Math.sin(t * 0.4) * 0.012

    if (Math.random() < dt * 30) smoke.emit(1, () => ({ p: [(Math.random() - 0.5) * 7, -3 + Math.random() * 3, -1.5 - Math.random() * 3], v: [(Math.random() - 0.5) * 0.3, 0.25, 0], life: 7 }))
    smoke.update(dt)
    if (A > 0.05 && Math.random() < dt * 60 * (1 - solid * 0.7)) embers.emit(1, () => ({ p: [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, Math.random()], v: [(Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.6, 0.2], life: 2 }))
    embers.update(dt, { turbulence: 0.6, t })
  })

  return (
    <group ref={grp} position={V_MASK.toArray()} rotation-y={-Math.PI / 2}>
      <primitive object={smoke.points} />
      <primitive object={embers.points} />
      <pointLight ref={keyLight} position={[3.5, 4.5, 8]} distance={24} decay={1.2} color="#f4f6ff" intensity={0} />
      <pointLight ref={rimLight} position={[-3, 1.5, -2]} distance={14} decay={1.2} color="#9fb4ff" intensity={0} />
      <group scale={SCALE}>
        <instancedMesh ref={frags} args={[geo.frag, M.frag, count]} frustumCulled={false} />
        <mesh geometry={geo.cowl} material={M.cowl} position={[0, 0.02, 0]} />
        {[-1, 1].map((s) => (
          <mesh key={s} material={M.clasp} position={[s * 0.34, -0.93, 0.5]} rotation-x={Math.PI / 2 - 0.4}>
            <cylinderGeometry args={[0.07, 0.07, 0.025, 24]} />
          </mesh>
        ))}
        <mesh material={M.portal} position={[0, 0, -0.18]}>
          <circleGeometry args={[0.66, 48]} />
        </mesh>
        <pointLight ref={eyeLight} position={[0, 0.17, 0.7]} color="#a8ffbc" distance={4} decay={1.5} intensity={0} />
        {/* faceplate halves hinge at their outer edges */}
        <group ref={left} position={[-0.56, 0, -0.27]}>
          <group position={[0.56, 0, 0.27]}>
            <Half side={-1} geo={geo.left} M={M} />
          </group>
        </group>
        <group ref={right} position={[0.56, 0, -0.27]}>
          <group position={[-0.56, 0, 0.27]}>
            <Half side={1} geo={geo.right} M={M} />
          </group>
        </group>
      </group>
    </group>
  )
}
