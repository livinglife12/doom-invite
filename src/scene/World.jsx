import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing'
import { world } from '../world'
import { director } from '../director'
import { audio } from '../audio'
import { setS } from '../state'
import CameraRig from './CameraRig'
import ThroneRoom from './ThroneRoom'
import TVIntro from './TVIntro'
import Hall from './Hall'
import Collapse from './Collapse'
import DoomMask from './DoomMask'
import BurnPage from './BurnPage'

// Seamless playback: behind the black loading veil, briefly make the whole world visible and render it
// off-screen from each key camera position. That compiles every shader (shadow passes, holograms,
// lightning, rifts, debris, the burning page) before the show starts, instead of stalling mid-scene.
const WARM_POSES = [
  [[0, 1.2, 42.5], [0, 1, 40]],
  [[0, 1.7, 5.5], [0, 1.4, -12]],
  [[1.2, 1.75, 4.2], [9, 2.4, 0]],
  [[12, 1.8, 0], [30, 1.6, 0]],
  [[34, 1.9, 0], [50, 1.6, 0]],
  [[58, 1.9, 0], [74, 1.6, 0]],
  [[84.5, 2.4, 0], [93.5, 1.8, 0]],
  [[109, 3.3, 0], [117, 3.3, 0]],
]
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

async function warmUp(gl, scene, camera, cancelled) {
  const target = new THREE.WebGLRenderTarget(160, 160)
  const cam = camera.clone()
  cam.aspect = 1
  cam.fov = 70
  cam.updateProjectionMatrix()
  await nextFrame()
  for (const [p, l] of WARM_POSES) {
    if (cancelled()) break
    const prev = []
    scene.traverse((o) => {
      prev.push(o, o.visible)
      o.visible = true
    })
    cam.position.set(...p)
    cam.lookAt(...l)
    cam.updateMatrixWorld()
    gl.shadowMap.needsUpdate = true
    gl.setRenderTarget(target)
    gl.render(scene, cam)
    gl.setRenderTarget(null)
    for (let k = 0; k < prev.length; k += 2) prev[k].visible = prev[k + 1]
    await nextFrame()
  }
  target.dispose()
}

export default function World({ quality }) {
  const { gl, scene, camera, get } = useThree()
  const hemi = useRef()
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    if (window.__doom) window.__doom.three = { gl, scene, camera, get }
    let cancelled = false
    warmUp(gl, scene, camera, () => cancelled).then(async () => {
      if (cancelled) return
      audio.prepare()
      await nextFrame()
      director.boot()
      setBooted(true)
    })
    return () => (cancelled = true)
  }, [])

  useFrame(() => {
    scene.environmentIntensity = world.env.intensity
    if (scene.fog) scene.fog.density = world.env.fog
    hemi.current.intensity = world.env.ambient
  })

  return (
    <>
      {booted && <PerformanceMonitor onDecline={() => setS({ quality: quality === 'high' ? 'mid' : 'low' })} />}
      <CameraRig />
      <hemisphereLight ref={hemi} args={['#8f98a8', '#0a0908', 0.02]} />
      <Environment frames={1} resolution={128}>
        <Lightformer form="rect" intensity={2.2} color="#dfeee6" position={[0, 6, -6]} scale={[12, 2, 1]} />
        <Lightformer form="ring" intensity={1.6} color="#ffd9a8" position={[-6, 2, 4]} scale={3} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[6, 1, 6]} scale={[4, 7, 1]} />
        <Lightformer form="rect" intensity={0.35} color="#ff8a4a" position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
      <TVIntro quality={quality} />
      <ThroneRoom quality={quality} />
      <Hall quality={quality} />
      <Collapse quality={quality} />
      <DoomMask quality={quality} />
      <BurnPage quality={quality} />
      {quality !== 'low' && (
        <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
          <Bloom mipmapBlur luminanceThreshold={0.72} luminanceSmoothing={0.15} intensity={0.9} radius={0.68} resolutionScale={quality === 'high' ? 0.75 : 0.5} />
          <Noise opacity={0.045} premultiply />
          <Vignette darkness={0.78} offset={0.22} />
        </EffectComposer>
      )}
    </>
  )
}
