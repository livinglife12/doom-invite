import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { world, showMeshes } from '../world'
import { director } from '../director'
import { getS } from '../state'
import { TV_POS } from '../config/layout'
import { makeCanvas, toTexture, stoneTex } from '../lib/textures'
import { crtMaterial, makeTVCanvas, drawTV } from '../lib/tvScreen'
import { taperedTube } from '../lib/figure'
import { makeEmitter } from '../lib/particles'

function woodCanvas(base = '#4a2a14', grain = '#2a160a') {
  const [c, g] = makeCanvas(512, 512)
  g.fillStyle = base
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = grain
    g.globalAlpha = 0.08 + Math.random() * 0.25
    g.lineWidth = 0.6 + Math.random() * 2.4
    g.beginPath()
    const y = Math.random() * 512
    g.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 6 + Math.sin(x * 0.005 + i * 3) * 14)
    g.stroke()
  }
  g.globalAlpha = 1
  return c
}

function grilleCanvas() {
  const [c, g] = makeCanvas(128, 160)
  g.fillStyle = '#2a1c10'
  g.fillRect(0, 0, 128, 160)
  g.fillStyle = '#b89a62'
  for (let y = 8; y < 160; y += 12) g.fillRect(8, y, 112, 4)
  return c
}

function plateCanvas() {
  const [c, g] = makeCanvas(256, 48)
  const gr = g.createLinearGradient(0, 0, 256, 48)
  gr.addColorStop(0, '#e2c27c')
  gr.addColorStop(0.5, '#a8803c')
  gr.addColorStop(1, '#e2c27c')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 48)
  g.fillStyle = '#2a1a08'
  g.font = '700 26px Cinzel, Georgia, serif'
  g.textAlign = 'center'
  g.fillText('DOOMVISION', 128, 33)
  return c
}


function wallpaperCanvas() {
  const [c, g] = makeCanvas(256, 256)
  g.fillStyle = '#1b1f1c'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(160,140,90,0.07)'
  g.fillStyle = 'rgba(160,140,90,0.045)'
  g.lineWidth = 2
  // damask medallion repeated on a half-drop
  for (const [cx, cy] of [[64, 64], [192, 192], [192, -64], [-64, 192], [64, 320], [320, 64]]) {
    g.save()
    g.translate(cx, cy)
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2)
      g.beginPath()
      g.moveTo(0, 0)
      g.bezierCurveTo(18, -10, 30, -38, 0, -54)
      g.bezierCurveTo(-30, -38, -18, -10, 0, 0)
      g.fill()
      g.stroke()
    }
    g.beginPath()
    g.arc(0, 0, 10, 0, Math.PI * 2)
    g.stroke()
    g.restore()
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'
  for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 1, 256)
  return c
}

function rugCanvas() {
  const [c, g] = makeCanvas(512, 320)
  g.fillStyle = '#3a0f12'
  g.fillRect(0, 0, 512, 320)
  g.strokeStyle = '#b08a4a'
  g.lineWidth = 6
  g.strokeRect(18, 18, 476, 284)
  g.strokeStyle = '#1c2a3a'
  g.lineWidth = 14
  g.strokeRect(38, 38, 436, 244)
  g.fillStyle = 'rgba(176,138,74,0.22)'
  for (let i = 0; i < 9; i++) {
    g.save()
    g.translate(256, 160)
    g.rotate((i / 9) * Math.PI * 2)
    g.beginPath()
    g.ellipse(0, -46, 14, 40, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`
    g.fillRect(Math.random() * 512, Math.random() * 320, 2, 2)
  }
  return c
}

// Oil portrait of the master of the house, almost lost in the dark.
function portraitCanvas() {
  const [c, g] = makeCanvas(256, 320)
  const bg = g.createRadialGradient(128, 130, 10, 128, 160, 220)
  bg.addColorStop(0, '#2b3a2c')
  bg.addColorStop(1, '#0a0d0a')
  g.fillStyle = bg
  g.fillRect(0, 0, 256, 320)
  g.fillStyle = '#163120'
  g.beginPath()
  g.moveTo(20, 320)
  g.quadraticCurveTo(30, 170, 128, 70)
  g.quadraticCurveTo(226, 170, 236, 320)
  g.fill()
  const s = 150
  const right = [[0.0, 0.745], [0.24, 0.72], [0.47, 0.66], [0.53, 0.45], [0.555, 0.12], [0.505, -0.18], [0.41, -0.5], [0.27, -0.72], [0.0, -0.765]]
  const pts = [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y])]
  const mg = g.createLinearGradient(80, 100, 180, 260)
  mg.addColorStop(0, '#9aa0a2')
  mg.addColorStop(1, '#3d4244')
  g.fillStyle = mg
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(128 + x * s * 0.62, 168 - y * s * 0.62) : g.moveTo(128 + x * s * 0.62, 168 - y * s * 0.62)))
  g.fill()
  g.fillStyle = '#9dffb0'
  g.shadowColor = '#5dff8a'
  g.shadowBlur = 8
  for (const sx of [1, -1]) g.fillRect(128 + sx * 12 - (sx < 0 ? 22 : 0), 150, 22, 4)
  g.shadowBlur = 0
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 220},0,${Math.random() * 0.04})`
    g.fillRect(Math.random() * 256, Math.random() * 320, 2, 2)
  }
  return c
}

export default function TVIntro({ quality }) {
  const grp = useRef()
  const knob = useRef()
  const screenLight = useRef()
  const lamp = useRef()
  const tv = useMemo(() => {
    const { canvas, g } = makeTVCanvas()
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const screen = new THREE.PlaneGeometry(0.66, 0.5, 32, 24)
    const p = screen.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / 0.33
      const y = p.getY(i) / 0.25
      p.setZ(i, 0.035 * (1 - x * x * 0.5 - y * y * 0.5))
    }
    screen.computeVertexNormals()
    const wood = toTexture(woodCanvas())
    return {
      g,
      tex,
      screen,
      crt: crtMaterial(tex),
      wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42, metalness: 0.05 }),
      woodDark: new THREE.MeshStandardMaterial({ map: wood, color: '#5a4030', roughness: 0.5 }),
      bezel: new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.55, metalness: 0.2 }),
      brass: new THREE.MeshStandardMaterial({ color: '#b8924a', roughness: 0.3, metalness: 1 }),
      grille: new THREE.MeshStandardMaterial({ map: toTexture(grilleCanvas()), roughness: 0.7 }),
      plate: new THREE.MeshStandardMaterial({ map: toTexture(plateCanvas()), roughness: 0.3, metalness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0a0c0c', roughness: 0.3, metalness: 0.6, transparent: true, opacity: 0.18, depthWrite: false }),
      lampMat: new THREE.MeshStandardMaterial({ color: '#2a1404', emissive: '#ff8a2a', emissiveIntensity: 1 }),
      floor: new THREE.MeshStandardMaterial({ map: toTexture(woodCanvas('#24170e', '#120a05'), { repeat: [3, 3] }), roughness: 0.55 }),
      wall: new THREE.MeshStandardMaterial({ map: toTexture(wallpaperCanvas(), { repeat: [9, 5] }), roughness: 0.85 }),
      rug: new THREE.MeshStandardMaterial({ map: toTexture(rugCanvas()), roughness: 1 }),
      portrait: new THREE.MeshStandardMaterial({ map: toTexture(portraitCanvas()), roughness: 0.55 }),
      frame: new THREE.MeshStandardMaterial({ color: '#8a6a32', metalness: 0.9, roughness: 0.35 }),
      shaft: new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uTime, uOpacity; varying vec2 vUv; void main(){ float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x); float fall = smoothstep(0.0, 0.6, vUv.y); float bars = 0.75 + 0.25 * step(0.08, abs(fract(vUv.x * 2.0) - 0.5)); gl_FragColor = vec4(vec3(0.55, 0.66, 0.9), edge * fall * bars * 0.13 * uOpacity); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
      antenna: taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.45, 0)]), 0.008, 0.003, 4, 6),
      last: { mode: '', text: '', tick: -1 },
      dust: makeEmitter(quality === 'low' ? 40 : 110, { color: '#c8d4f0', size: 0.014, soft: 1.2 }),
    }
  }, [])

  useFrame((s, dt) => {
    const T = world.tv
    const t = s.clock.elapsedTime
    showMeshes(grp.current, T.visible)
    if (!T.visible) return
    const tick = Math.floor(t * 4)
    if (T.mode !== tv.last.mode || T.text !== tv.last.text || tick !== tv.last.tick) {
      drawTV(tv.g, T.mode, T.text, t)
      tv.tex.needsUpdate = true
      Object.assign(tv.last, { mode: T.mode, text: T.text, tick })
    }
    const u = tv.crt.uniforms
    u.uTime.value = t
    u.uPower.value = T.power
    u.uStatic.value = T.static
    u.uRoll.value = T.roll
    knob.current.rotation.z = -T.knob * 1.9
    screenLight.current.intensity = T.power * (2.2 + Math.random() * 0.4 + T.static * 1.5)
    tv.lampMat.emissiveIntensity = T.power > 0 ? 2.5 : 0.6 + Math.sin(t * 2.4) * 0.4
    if (Math.random() < dt * 20) tv.dust.emit(1, () => ({ p: [-2.4 + Math.random() * 2.2, 0.3 + Math.random() * 2.6, -0.6 + Math.random() * 1.6], v: [(Math.random() - 0.3) * 0.04, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03], life: 6 + Math.random() * 4 }))
    tv.dust.update(dt, { turbulence: 0.02, t })
  })

  const powerOn = (e) => {
    e.stopPropagation()
    if (getS().phase === 'tv') director.powerOnTV()
  }

  return (
    <group ref={grp} position={TV_POS.toArray()}>
      {/* parlour */}
      <mesh material={tv.floor} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[9, 9]} />
      </mesh>
      <mesh material={tv.wall} position={[0, 2.5, -1.6]}>
        <planeGeometry args={[9, 5]} />
      </mesh>
      <mesh material={tv.woodDark} position={[0, 0.06, -1.55]}>
        <boxGeometry args={[9, 0.12, 0.06]} />
      </mesh>
      <mesh material={tv.rug} rotation-x={-Math.PI / 2} position={[0, 0.005, 0.4]}>
        <planeGeometry args={[2.6, 1.6]} />
      </mesh>
      {/* the master's portrait */}
      <group position={[0.15, 2.35, -1.56]}>
        <mesh material={tv.frame}>
          <boxGeometry args={[0.78, 0.96, 0.05]} />
        </mesh>
        <mesh material={tv.portrait} position={[0, 0, 0.028]}>
          <planeGeometry args={[0.64, 0.8]} />
        </mesh>
      </group>
      {/* moonlit window on the left wall with its light shaft */}
      <group position={[-3.2, 1.9, -0.2]} rotation-y={Math.PI / 2}>
        <mesh>
          <planeGeometry args={[1.2, 1.6]} />
          <meshBasicMaterial color="#5f74a8" />
        </mesh>
        {[[-0.62, 0, 0.06, 1.7], [0.62, 0, 0.06, 1.7], [0, 0.82, 1.3, 0.06], [0, -0.82, 1.3, 0.06], [0, 0, 1.3, 0.04], [0, 0, 0.04, 1.7]].map(([x, y, w, h], k) => (
          <mesh key={k} material={tv.woodDark} position={[x, y, 0.03]}>
            <boxGeometry args={[w, h, 0.06]} />
          </mesh>
        ))}
      </group>
      <mesh material={tv.shaft} position={[-1.7, 1.15, 0.0]} rotation={[0, 0, 0.62]}>
        <planeGeometry args={[1.3, 3.4]} />
      </mesh>
      <primitive object={tv.dust.points} />
      <pointLight position={[-2.6, 2.4, 0.4]} intensity={20} distance={9} decay={1.4} color="#8aa4d8" />
      <pointLight position={[0.2, 3.4, 1.8]} intensity={5} distance={6} decay={1.5} color="#9fb2dc" />
      <pointLight position={[1.8, 1.6, 1.2]} intensity={3} distance={5} decay={1.6} color="#ffb070" />
      <pointLight ref={screenLight} position={[-0.12, 1.5, 1.3]} color="#d8e4ff" distance={5} decay={1.6} intensity={0} />
      {/* television */}
      <group position={[0, 0, 0]} onClick={powerOn}>
        {[[-0.48, -0.26], [0.48, -0.26], [-0.48, 0.26], [0.48, 0.26]].map(([x, z], k) => (
          <mesh key={k} material={tv.woodDark} position={[x * 1.02, 0.28, z * 1.02]} rotation={[z * -0.25, 0, x * 0.22]}>
            <cylinderGeometry args={[0.025, 0.015, 0.58, 10]} />
          </mesh>
        ))}
        <RoundedBox args={[1.15, 0.86, 0.72]} radius={0.06} smoothness={4} position={[0, 0.98, 0]} material={tv.wood} castShadow />
        <RoundedBox args={[0.8, 0.62, 0.06]} radius={0.06} smoothness={4} position={[-0.12, 1.0, 0.345]} material={tv.bezel} />
        <mesh geometry={tv.screen} material={tv.crt} position={[-0.12, 1.0, 0.365]} />
        <mesh material={tv.plate} position={[-0.12, 0.62, 0.362]}>
          <planeGeometry args={[0.3, 0.056]} />
        </mesh>
        {/* controls panel */}
        <mesh material={tv.grille} position={[0.43, 0.8, 0.362]}>
          <planeGeometry args={[0.18, 0.24]} />
        </mesh>
        <group ref={knob} position={[0.43, 1.2, 0.38]} onClick={powerOn} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
          <mesh material={tv.brass} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.06, 0.066, 0.05, 28]} />
          </mesh>
          <mesh material={tv.bezel} position={[0, 0, 0.026]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.045, 0.045, 0.01, 24]} />
          </mesh>
          <mesh material={tv.brass} position={[0, 0.025, 0.033]}>
            <boxGeometry args={[0.01, 0.04, 0.008]} />
          </mesh>
          {Array.from({ length: 18 }, (_, k) => {
            const a = (k / 18) * Math.PI * 2
            return (
              <mesh key={k} material={tv.brass} position={[Math.cos(a) * 0.066, Math.sin(a) * 0.066, 0]} rotation-z={a}>
                <boxGeometry args={[0.006, 0.012, 0.046]} />
              </mesh>
            )
          })}
        </group>
        <group position={[0.43, 1.04, 0.38]} rotation-z={0.6}>
          <mesh material={tv.brass} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.045, 0.05, 0.04, 24]} />
          </mesh>
          <mesh material={tv.bezel} position={[0, 0.018, 0.022]}>
            <boxGeometry args={[0.008, 0.03, 0.006]} />
          </mesh>
        </group>
        <mesh ref={lamp} material={tv.lampMat} position={[0.43, 1.31, 0.365]}>
          <sphereGeometry args={[0.012, 12, 8]} />
        </mesh>
        {/* rabbit ears */}
        <mesh material={tv.bezel} position={[0.1, 1.41, -0.05]} scale={[1, 0.6, 1]}>
          <sphereGeometry args={[0.07, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh geometry={tv.antenna} material={tv.brass} position={[0.1, 1.44, -0.05]} rotation-z={0.55} />
        <mesh geometry={tv.antenna} material={tv.brass} position={[0.1, 1.44, -0.05]} rotation-z={-0.45} />
      </group>
      <mesh visible={false} position={[0, 1, 0.5]} onClick={powerOn}>
        <boxGeometry args={[1.4, 1.2, 0.2]} />
      </mesh>
    </group>
  )
}
