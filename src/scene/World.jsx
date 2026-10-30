import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
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
import { createQualitySampler } from '../lib/quality'

// Show the opening first. The rest of the shaders compile during the introduction,
// without holding the loading veil until every hidden exhibit is ready.
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

async function warmUp(gl, scene, camera, cancelled) {
  const target = new THREE.WebGLRenderTarget(96, 96, { depthBuffer: true })
  const cam = camera.clone()
  cam.aspect = 1
  cam.fov = 70
  cam.updateProjectionMatrix()
  const previousTarget = gl.getRenderTarget()
  const previousFace = gl.getActiveCubeFace()
  const previousLevel = gl.getActiveMipmapLevel()
  try {
    await nextFrame()
    if (cancelled()) return
    cam.position.set(0, 1.2, 42.5)
    cam.lookAt(0, 1, 40)
    cam.updateMatrixWorld()
    gl.setRenderTarget(target)
    gl.render(scene, cam)
  } finally {
    gl.setRenderTarget(previousTarget, previousFace, previousLevel)
    target.dispose()
  }
}

function QualityMonitor({ initialQuality }) {
  const sampler = useRef(null)
  if (!sampler.current) {
    const q = new URLSearchParams(window.location.search).get('q')
    sampler.current = createQualitySampler(initialQuality, { locked: ['low', 'mid', 'high'].includes(q) })
  }
  useFrame((_, dt) => {
    const quality = sampler.current.sample(dt, performance.now(), document.visibilityState !== 'hidden')
    if (quality) setS({ quality })
  })
  return null
}

export default function World({ quality }) {
  const { gl, scene, camera, get } = useThree()
  const hemi = useRef()
  const [booted, setBooted] = useState(false)
  const resourceQuality = useRef(quality).current

  useEffect(() => {
    if (window.__doom) window.__doom.three = { gl, scene, camera, get }
    let cancelled = false
    const prepare = async () => {
      try {
        await warmUp(gl, scene, camera, () => cancelled)
      } catch (error) {
        // A failed optional warm-up must not leave the invitation behind its veil.
        console.warn('Scene preparation deferred to playback.', error)
      }
      if (cancelled) return
      try { audio.prepare() } catch (error) { console.warn('Audio preparation deferred until interaction.', error) }
      await nextFrame()
      if (cancelled) return
      director.boot()
      const params = new URLSearchParams(window.location.search)
      if (params.has('debug') && params.has('scene')) {
        try {
          const { setupReview, seekReview } = await import('../review')
          if (cancelled) return
          const hero = params.get('scene')
          const mode = params.get('mode') || 'holo'
          setupReview(hero, mode)
          if (params.has('p')) seekReview(hero, mode, Number(params.get('p')))
        } catch (error) { console.warn('Debug scene unavailable; the invitation is ready.', error) }
      }
      setBooted(true)
      if (!params.has('debug')) {
        nextFrame().then(nextFrame).then(() => {
          if (!cancelled) return gl.compileAsync(scene, camera)
        }).catch(error => {
          if (!cancelled) console.warn('Remaining shaders will compile during playback.', error)
        })
      }
    }
    prepare()
    return () => (cancelled = true)
  }, [])

  useFrame(() => {
    scene.environmentIntensity = world.env.intensity
    if (scene.fog) scene.fog.density = world.env.fog
    hemi.current.intensity = world.env.ambient
  })

  return (
    <>
      {booted && <QualityMonitor initialQuality={resourceQuality} />}
      <CameraRig />
      <hemisphereLight ref={hemi} args={['#8f98a8', '#0a0908', 0.02]} />
      <Environment frames={1} resolution={128}>
        <Lightformer form="rect" intensity={2.2} color="#dfeee6" position={[0, 6, -6]} scale={[12, 2, 1]} />
        <Lightformer form="ring" intensity={1.6} color="#ffd9a8" position={[-6, 2, 4]} scale={3} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[6, 1, 6]} scale={[4, 7, 1]} />
        <Lightformer form="rect" intensity={0.35} color="#ff8a4a" position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
      <TVIntro quality={resourceQuality} />
      <ThroneRoom quality={resourceQuality} />
      <Hall quality={resourceQuality} />
      <Collapse quality={resourceQuality} />
      <DoomMask quality={resourceQuality} />
      <BurnPage quality={resourceQuality} />
      {quality !== 'low' && (
        <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
          <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.45} radius={0.45} resolutionScale={quality === 'high' ? 0.75 : 0.5} />
          <Noise opacity={0.018} premultiply />
          <Vignette darkness={0.48} offset={0.3} />
        </EffectComposer>
      )}
    </>
  )
}
