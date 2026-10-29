import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, beam, litAmount } from '../world'
import { getS } from '../state'
import { director } from '../director'
import { audio } from '../audio'
import { makeEmitter } from '../lib/particles'
import { additive } from '../lib/materials'

const SWITCH_POS = new THREE.Vector3(8.35, 1.5, -8.6)
const HIT = new THREE.Sphere(SWITCH_POS, 1.15)

// Energy pulse that travels along a tube (uv.x = distance along the cable).
function cableMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uProg: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uProg, uTime; varying vec2 vUv;
      void main(){
        vec3 base = vec3(0.02, 0.03, 0.025);
        float lit = step(vUv.x, uProg);
        float head = exp(-((vUv.x - uProg) * 40.0) * ((vUv.x - uProg) * 40.0)) * step(0.001, uProg) * step(uProg, 0.999);
        float idle = pow(fract(-vUv.x * 3.0 - uTime * 0.35), 18.0) * 0.35;
        vec3 g = vec3(0.25, 1.0, 0.45);
        vec3 col = base + g * (lit * (0.45 + 0.15 * sin(vUv.x * 60.0 - uTime * 8.0)) + head * 3.0 + idle * 0.55 * (1.0 - lit));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

export default function Switch() {
  const grp = useRef()
  const lever = useRef()
  const latch = useRef()
  const ring = useRef()
  const M = useMemo(
    () => ({
      housing: new THREE.MeshStandardMaterial({ color: '#262b28', metalness: 0.9, roughness: 0.38 }),
      rib: new THREE.MeshStandardMaterial({ color: '#3a3f3b', metalness: 1, roughness: 0.25 }),
      brass: new THREE.MeshStandardMaterial({ color: '#8a6d33', metalness: 1, roughness: 0.3 }),
      pulse: new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uCharge: { value: 0 }, uOn: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime, uCharge, uOn; varying vec2 vUv;
          void main(){ float p = pow(fract(vUv.y - uTime * 0.45), 10.0);
            float v = 0.15 + p * 1.6 + uCharge * 2.5 + uOn * 2.0;
            gl_FragColor = vec4(vec3(0.25, 1.0, 0.45) * v, 1.0); }`,
      }),
      ring: additive('#6dff9a', 0.9),
      cable: cableMaterial(),
    }),
    []
  )
  const cables = useMemo(() => {
    const mk = (pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 120, 0.045, 6)
    return [
      mk([[8.3, 0.3, -8.6], [8.0, 0.04, -8.2], [7.6, 0.04, -6.0], [7.7, 0.04, -3.0], [8.6, 0.04, -2.4], [8.9, 0.3, -2.3]]),
      mk([[8.3, 0.3, -8.8], [7.8, 0.04, -9.4], [3, 0.04, -9.8], [-3, 0.04, -9.6], [-8.6, 0.04, -9.8], [-8.9, 3.4, -10]]),
      mk([[7.7, 0.04, -3.4], [5.0, 0.04, -4.6], [0, 0.04, -5.2], [-6, 0.04, -4.4], [-8.85, 3.4, -4]]),
    ]
  }, [])
  const sparks = useMemo(() => makeEmitter(160, { color: '#9dffb8', size: 0.06 }), [])
  const st = useMemo(() => ({ wasHit: false, ringCharge: -1 }), [])

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    const sw = world.sw
    const phase = getS().phase
    if (phase === 'flashlight' && !sw.activated) {
      const hit = beam.on > 0.3 && (beam.pointerRay.intersectsSphere(HIT) || litAmount(SWITCH_POS, 0.6) > 0.35)
      if (hit) sw.charge = Math.min(1, sw.charge + dt / 1.2)
      else sw.charge = Math.max(0, sw.charge - dt * 3)
      audio.charge(sw.charge)
      if (hit && !st.wasHit) audio.sparks(0.2)
      st.wasHit = hit
      if (sw.charge >= 1) director.activateSwitch()
    }
    const jitter = sw.vibrate * 0.025 + sw.charge * 0.006
    grp.current.position.set(SWITCH_POS.x + (Math.random() - 0.5) * jitter, SWITCH_POS.y + (Math.random() - 0.5) * jitter, SWITCH_POS.z + (Math.random() - 0.5) * jitter)
    lever.current.rotation.x = THREE.MathUtils.lerp(0.95, -0.95, sw.flip)
    latch.current.position.y = 0.42 + sw.latch * 0.16
    ring.current.visible = sw.charge > 0.01 && !sw.activated
    if (ring.current.visible && Math.abs(st.ringCharge - sw.charge) > 0.01) {
      st.ringCharge = sw.charge
      ring.current.geometry.dispose()
      ring.current.geometry = new THREE.RingGeometry(0.62, 0.68, 48, 1, Math.PI / 2, -Math.PI * 2 * sw.charge)
    }
    M.pulse.uniforms.uTime.value = t
    M.pulse.uniforms.uCharge.value = sw.charge
    M.pulse.uniforms.uOn.value = sw.lights
    M.cable.uniforms.uTime.value = t
    M.cable.uniforms.uProg.value = sw.cable
    if (sw.sparks > 0.01 || sw.charge > 0.5) {
      const n = Math.ceil((sw.sparks * 6 + (sw.charge > 0.5 ? 1 : 0)) * dt * 60)
      sparks.emit(n, () => ({
        p: [SWITCH_POS.x - 0.3, SWITCH_POS.y + (Math.random() - 0.3) * 0.8, SWITCH_POS.z + (Math.random() - 0.5) * 0.6],
        v: [-Math.random() * 2.5, Math.random() * 2.5, (Math.random() - 0.5) * 2.5],
        life: 0.4 + Math.random() * 0.6,
      }))
    }
    sparks.update(dt, { gravity: -6 })
  })

  const onTap = (e) => {
    e.stopPropagation()
    if (getS().phase === 'flashlight') director.activateSwitch()
  }

  return (
    <group>
      {cables.map((g, i) => (
        <mesh key={i} geometry={g} material={M.cable} />
      ))}
      <primitive object={sparks.points} />
      {/* local +z faces into the room (-x world) */}
      <group ref={grp} position={SWITCH_POS.toArray()} rotation-y={-Math.PI / 2}>
        <mesh material={M.housing} castShadow onClick={onTap}>
          <boxGeometry args={[0.9, 1.7, 0.45]} />
        </mesh>
        {[-0.38, 0.38].map((x) => (
          <mesh key={x} material={M.rib} position={[x, 0, 0.1]} castShadow>
            <boxGeometry args={[0.12, 1.8, 0.4]} />
          </mesh>
        ))}
        <mesh material={M.rib} position={[0, 0.92, 0.05]}>
          <boxGeometry args={[1.05, 0.14, 0.55]} />
        </mesh>
        <mesh material={M.pulse} position={[0, 0, 0.231]}>
          <planeGeometry args={[0.1, 1.4]} />
        </mesh>
        <mesh ref={latch} material={M.brass} position={[0.22, 0.42, 0.26]}>
          <boxGeometry args={[0.12, 0.18, 0.08]} />
        </mesh>
        <group ref={lever} position={[0, -0.1, 0.26]}>
          <mesh material={M.brass} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.09, 0.09, 0.32, 16]} />
          </mesh>
          <mesh material={M.rib} position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.045, 0.05, 0.72, 12]} />
          </mesh>
          <mesh material={M.brass} position={[0, 0.74, 0]} rotation-z={Math.PI / 2} onClick={onTap}>
            <cylinderGeometry args={[0.07, 0.07, 0.42, 16]} />
          </mesh>
        </group>
        <mesh ref={ring} material={M.ring} position={[0, 0, 0.5]}>
          <ringGeometry args={[0.62, 0.68, 48]} />
        </mesh>
        {/* generous invisible tap target */}
        <mesh visible={false} onClick={onTap}>
          <sphereGeometry args={[1.0, 8, 8]} />
        </mesh>
      </group>
    </group>
  )
}
