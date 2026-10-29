import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world } from '../world'
import { NOISE } from '../lib/noise'
import { makeEmitter } from '../lib/particles'

// The signed decree, held in front of the camera and burned from its edges inward.
// The fire front is ordered by distance from the signature so the mark is the last thing to go.
function pageMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uBurn: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 }, uSig: { value: new THREE.Vector2(0.5, 0.25) }, uAspect: { value: 0.7 } },
    vertexShader: /* glsl */ `
      uniform float uBurn, uTime, uAspect; uniform vec2 uSig; varying vec2 vUv; varying float vF;
      ${NOISE}
      float field(vec2 uv){
        float d = length((uv - uSig) * vec2(uAspect, 1.0)) / 1.05;
        return clamp(1.0 - d, 0.0, 1.0) * 0.8 + fbm(vec3(uv * 5.0, 1.0)) * 0.25;
      }
      void main(){
        vUv = uv;
        float f = field(uv);
        vF = f;
        float charred = clamp((uBurn * 1.15 - f) * 6.0, 0.0, 1.0);
        vec3 p = position;
        p.z += charred * 0.12 * (0.6 + 0.4 * sin(uv.x * 12.0 + uTime));
        p.y += charred * 0.04;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uBurn, uFade, uTime; varying vec2 vUv; varying float vF;
      ${NOISE}
      void main(){
        float f = vF + (fbm(vec3(vUv * 18.0, uTime * 0.2)) - 0.5) * 0.06;
        float front = uBurn * 1.15 - 0.05;
        if (f < front) discard;
        vec4 tex = texture2D(map, vUv);
        float dist = f - front;
        float charZone = 1.0 - smoothstep(0.0, 0.09, dist);
        float glow = 1.0 - smoothstep(0.0, 0.018, dist);
        vec3 col = mix(tex.rgb, vec3(0.06, 0.035, 0.02), charZone * step(0.001, uBurn));
        col += vec3(1.6, 0.75, 0.2) * glow * step(0.001, uBurn) * (0.8 + 0.4 * sin(uTime * 30.0 + vUv.x * 50.0));
        gl_FragColor = vec4(col, uFade);
      }`,
    transparent: true,
    side: THREE.DoubleSide,
  })
}

export default function BurnPage({ quality }) {
  const mesh = useRef()
  const mat = useMemo(pageMaterial, [])
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1, 64, 64), [])
  const embers = useMemo(() => makeEmitter(quality === 'low' ? 150 : 400, { color: '#ffa04a', size: 0.012 }), [])
  const ash = useMemo(() => makeEmitter(quality === 'low' ? 60 : 160, { color: '#4a3a30', size: 0.02, additive: false }), [])
  const t = useMemo(() => ({ fwd: new THREE.Vector3(), placed: false, w: 1, h: 1 }), [])
  const local = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, clock }, dt) => {
    const pg = world.page
    mesh.current.visible = pg.visible
    if (!pg.visible) return
    if (!t.placed) {
      t.placed = true
      mat.uniforms.map.value = pg.texture
      mat.uniforms.uAspect.value = pg.aspect
      mat.uniforms.uSig.value.set(pg.sig[0], pg.sig[1])
      const d = 1.4
      const halfH = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const halfW = halfH * camera.aspect
      let h = halfH * 2 * 0.86
      let w = h * pg.aspect
      if (w > halfW * 2 * 0.92) {
        w = halfW * 2 * 0.92
        h = w / pg.aspect
      }
      t.w = w
      t.h = h
      camera.getWorldDirection(t.fwd)
      mesh.current.position.copy(camera.position).addScaledVector(t.fwd, d)
      mesh.current.quaternion.copy(camera.quaternion)
      mesh.current.scale.set(w, h, 1)
    }
    const tm = clock.elapsedTime
    mat.uniforms.uTime.value = tm
    mat.uniforms.uBurn.value = pg.burn
    mat.uniforms.uFade.value = pg.fade
    if (pg.burn > 0.01 && pg.burn < 0.98) {
      // spawn along a shrinking ring around the signature (approximates the fire front)
      const n = Math.ceil(dt * 220)
      embers.emit(n, () => {
        const a = Math.random() * Math.PI * 2
        const r = (1 - pg.burn) * 0.75 + 0.05
        local.set(pg.sig[0] - 0.5 + (Math.cos(a) * r) / pg.aspect, pg.sig[1] - 0.5 + Math.sin(a) * r, 0)
        local.x = Math.max(-0.5, Math.min(0.5, local.x))
        local.y = Math.max(-0.5, Math.min(0.5, local.y))
        mesh.current.localToWorld(local)
        return { p: [local.x, local.y, local.z], v: [(Math.random() - 0.5) * 0.15, 0.15 + Math.random() * 0.35, (Math.random() - 0.5) * 0.15], life: 0.8 + Math.random() * 1.2 }
      })
      if (Math.random() < 0.5) {
        ash.emit(1, () => {
          local.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, 0)
          mesh.current.localToWorld(local)
          return { p: [local.x, local.y, local.z], v: [(Math.random() - 0.5) * 0.1, 0.1 + Math.random() * 0.2, 0], life: 2.5 }
        })
      }
    }
    embers.update(dt, { turbulence: 0.5, t: tm })
    ash.update(dt, { turbulence: 0.2, t: tm, gravity: 0.02 })
  })

  return (
    <>
      <mesh ref={mesh} geometry={geo} material={mat} renderOrder={10} />
      <primitive object={embers.points} />
      <primitive object={ash.points} />
    </>
  )
}
