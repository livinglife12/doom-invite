import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
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
import { createQualitySampler, QUALITY_BUDGETS } from '../lib/quality'
import { stageVisible, createVisibilityController } from '../lib/renderPolicy'

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

function Stage({ name, children }) {
  const root = useRef()
  useFrame(() => { root.current.visible = stageVisible(name, world) })
  return <group ref={root} visible={stageVisible(name, world)}>{children}</group>
}

function PageActivity() {
  const get = useThree(state => state.get)
  useEffect(() => {
    let elapsed = null
    const setLoop = mode => {
      const state = get()
      if (state.frameloop === mode) return
      if (mode === 'never') elapsed = state.clock.elapsedTime
      state.setFrameloop(mode)
      if (mode === 'always' && elapsed !== null) { state.clock.elapsedTime = elapsed; elapsed = null }
    }
    const update = createVisibilityController({ setLoop, timeline: gsap.globalTimeline, getAudio: () => audio.ctx })
    const changed = () => update(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', changed)
    changed()
    return () => { document.removeEventListener('visibilitychange', changed); update(true) }
  }, [get])
  return null
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
      <PageActivity />
      <CameraRig />
      <hemisphereLight ref={hemi} args={['#8f98a8', '#0a0908', 0.02]} />
      <Environment frames={1} resolution={128}>
        <Lightformer form="rect" intensity={2.2} color="#dfeee6" position={[0, 6, -6]} scale={[12, 2, 1]} />
        <Lightformer form="ring" intensity={1.6} color="#ffd9a8" position={[-6, 2, 4]} scale={3} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[6, 1, 6]} scale={[4, 7, 1]} />
        <Lightformer form="rect" intensity={0.35} color="#ff8a4a" position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
      <Stage name="tv"><TVIntro quality={resourceQuality} /></Stage>
      <Stage name="throne"><ThroneRoom quality={resourceQuality} /></Stage>
      <Stage name="hall"><Hall quality={resourceQuality} /></Stage>
      <Stage name="collapse"><Collapse quality={resourceQuality} /></Stage>
      <Stage name="mask"><DoomMask quality={resourceQuality} /></Stage>
      <Stage name="page"><BurnPage quality={resourceQuality} /></Stage>
      {QUALITY_BUDGETS[quality].post && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.3} radius={0.4} resolutionScale={0.4} />
          <Vignette darkness={0.48} offset={0.3} />
        </EffectComposer>
      )}
    </>
  )
}
