'use client'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useStore, setS } from './state'
import { input, world } from './world'
import { director } from './director'
import { cam } from './cam'
import { audio } from './audio'
import gsap from 'gsap'
import { detectQuality } from './lib/quality'
import World from './scene/World'
import Overlay from './ui/Overlay'
import { setupReview, playReview, seekReview } from './review'

export default function Experience() {
  const [ready, setReady] = useState(false)
  const quality = useStore((s) => s.quality)
  // Shadows are decided once: toggling them later recompiles every material mid-show.
  const [shadows, setShadows] = useState(null)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || new URLSearchParams(location.search).has('debug')) window.__doom = { useStore, world, director, cam, input, audio, gsap, review: { setupReview, playReview, seekReview } }
    const q = detectQuality()
    setS({ quality: q })
    setShadows(q === 'high')
    // Canvas textures draw text, so wait (briefly) for the web fonts.
    const fonts = ['700 40px "Old Standard TT"', '40px "UnifrakturMaguntia"', '600 40px Cinzel', '900 40px "Cinzel Decorative"', '20px "IM Fell English"'].map((f) =>
      document.fonts.load(f).catch(() => {})
    )
    Promise.race([Promise.all(fonts), new Promise((r) => setTimeout(r, 3500))]).then(() => setReady(true))

    const move = (e) => {
      input.x = (e.clientX / window.innerWidth) * 2 - 1
      input.y = -(e.clientY / window.innerHeight) * 2 + 1
      input.moved = true
      input.last = performance.now()
    }
    // keyboard: Enter / Space presses whatever button is waiting
    const key = (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return
      if (ev.target && /INPUT|TEXTAREA|BUTTON/.test(ev.target.tagName)) return
      const s = useStore.getState()
      if (s.phase === 'tv') director.powerOnTV()
      else if (s.phase === 'hall' && s.shrineIndex >= 0) director.press(s.shrineIndex)
      else if (s.prompt) s.prompt.action()
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', move, { passive: true })
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', move)
    }
  }, [])

  return (
    <main className="stage">
      {ready && shadows !== null && (
        <Canvas
          className="gl"
          shadows={shadows}
          dpr={quality === 'high' ? [1, 1.5] : quality === 'mid' ? [1, 1.25] : [0.8, 1]}
          gl={{ antialias: quality === 'low', powerPreference: 'high-performance' }}
          camera={{ fov: 60, near: 0.05, far: 220, position: [0, 1.7, 5.5] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.15
          }}
        >
          <color attach="background" args={['#000000']} />
          <fogExp2 attach="fog" args={['#040404', 0.045]} />
          <Suspense fallback={null}>
            <World quality={quality} />
          </Suspense>
        </Canvas>
      )}
      <Overlay ready={ready} />
    </main>
  )
}
