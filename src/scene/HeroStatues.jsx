import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildRoomStatue, ROOM_STATUES, STATUE_PLINTH_TOP } from '../lib/roomStatues'

export default function HeroStatues({ M }) {
  const sculpture = useMemo(() => {
    const surface = (name, color, roughness = 0.72, metalness = 0.06, doubleSided = false) => {
      const material = M.statue.clone()
      material.name = 'room-statue-' + name
      material.color.set(color)
      material.roughness = roughness
      material.metalness = metalness
      material.side = doubleSided ? THREE.DoubleSide : THREE.FrontSide
      return material
    }
    const materials = {
      stone: surface('limestone', '#b4beb8'),
      suit: surface('blue-slate', '#566876'),
      relief: surface('pale-stone-inlay', '#c6cec7', 0.58),
      dark: surface('cut-recess', '#3e484c', 0.82),
      metal: surface('aged-steel-inlay', '#818e91', 0.42, 0.45),
      bronze: surface('dark-bronze-inlay', '#906a4f', 0.5, 0.3),
      cape: surface('cape-stone', '#706069', 0.8, 0.03, true),
    }
    return { materials, figures: ROOM_STATUES.map(definition => ({ ...definition, figure: buildRoomStatue(definition.hero, materials) })) }
  }, [M.statue])
  useEffect(() => () => {
    sculpture.figures.forEach(item => item.figure.dispose())
    Object.values(sculpture.materials).forEach(material => material.dispose())
  }, [sculpture])

  return sculpture.figures.map(({ hero, position, yaw, scale, figure }) => (
    <group key={hero} name={hero + '-room-monument'} position={position} rotation-y={yaw}>
      <mesh material={M.pillar} position={[0, 0.08, 0]} castShadow receiveShadow><boxGeometry args={[1.95, 0.16, 1.6]} /></mesh>
      <mesh material={M.pillar} position={[0, 0.4, 0]} castShadow receiveShadow><boxGeometry args={[1.65, 0.48, 1.34]} /></mesh>
      <mesh material={M.pillar} position={[0, 0.71, 0]} castShadow receiveShadow><boxGeometry args={[1.84, 0.14, 1.5]} /></mesh>
      <group position={[0, STATUE_PLINTH_TOP, 0]} scale={scale}>
        <primitive object={figure.root} dispose={null} />
      </group>
    </group>
  ))
}
