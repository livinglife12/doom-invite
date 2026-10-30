import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { buildSeatedDoom, buildThrone, DOOM_SEAT } from '../lib/doomFigure'
import { world, litAmount } from '../world'

export function Throne({ M }) {
  const throne = useMemo(() => buildThrone(M), [M])
  return <primitive object={throne} position={DOOM_SEAT.origin} dispose={null} />
}

export function DoomPresence() {
  const materials = useMemo(() => {
    const metal = (name, color, roughness, metalness = .68) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 1.25 })
      material.name = name
      return material
    }
    return {
      steel: metal('latverian-steel', '#a6afb2', .37),
      dark: metal('armor-recesses', '#535f66', .48, .62),
      green: new THREE.MeshStandardMaterial({ color: '#245137', roughness: .86, side: THREE.DoubleSide }),
      cape: new THREE.MeshStandardMaterial({ color: '#173d28', roughness: .95, side: THREE.DoubleSide }),
      gold: metal('cape-brass', '#b79a57', .43, .72),
      leather: new THREE.MeshStandardMaterial({ color: '#453320', roughness: .9 }),
      eye: new THREE.MeshStandardMaterial({ color: '#3a4c40', emissive: '#a9d5b2', emissiveIntensity: .32, roughness: .5 }),
      black: new THREE.MeshBasicMaterial({ color: '#060909' }),
    }
  }, [])
  const figure = useMemo(() => buildSeatedDoom(materials), [materials])
  const state = useMemo(() => ({ flare: 0, lit: false, point: new THREE.Vector3(DOOM_SEAT.origin[0] + DOOM_SEAT.eye[0], DOOM_SEAT.origin[1] + DOOM_SEAT.eye[1], DOOM_SEAT.origin[2] + DOOM_SEAT.eye[2]) }), [])
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials])
  useFrame((s, dt) => {
    if (!world.throneVisible) return
    const light = litAmount(state.point, 1.1)
    if (light > .45 && !state.lit) state.flare = 1
    state.lit = light > .45
    state.flare = Math.max(0, state.flare - Math.min(dt,.05)*.6)
    materials.eye.emissiveIntensity = .32 + state.flare*1.05 + Math.sin(s.clock.elapsedTime*.9)*.035
  })
  return <primitive object={figure.root} position={DOOM_SEAT.origin} dispose={null} />
}
