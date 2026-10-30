import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { burnable } from '../lib/materials'
import { bump } from '../lib/util'

// Local, licensed assets: no live third-party model requests during the invitation.
// Clone materials per exhibit so a shrine's dissolve never affects another instance.
export default function ModelAsset({ url, burnMats, size = 0.7, rotation = [0, 0, 0], energy }) {
  const { scene } = useGLTF(url)
  const asset = useMemo(() => {
    const object = scene.clone(true)
    const materials = new Map()
    object.traverse(mesh => {
      if (!mesh.isMesh) return
      const cloneMaterial = source => {
        if (materials.has(source)) return materials.get(source)
        const material = source.clone()
        material.envMapIntensity = 1.5
        if (material.metalness > 0.85) material.metalness = 0.85
        material.roughness = Math.max(0.24, material.roughness || 0)
        if (url.includes('mjolnir') && source.name === 'mat15') {
          material.metalness = 0.7
          material.roughness = 0.32
          material.emissive.set('#7fc8ff')
          material.emissiveIntensity = 0
          material.userData.charged = true
        }
        if (url.includes('arc-reactor') && source.name === 'Material_3') {
          material.emissive.set('#6edcff')
          material.color.set('#7dc8df')
          material.emissiveIntensity = 0.6
        }
        if (burnMats) { burnable(material); burnMats.push(material) }
        materials.set(source, material)
        return material
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMaterial) : cloneMaterial(mesh.material)
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    object.rotation.set(...rotation)
    object.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(object)
    const dimensions = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const scale = size / Math.max(dimensions.x, dimensions.y, dimensions.z, 0.001)
    const group = new THREE.Group()
    group.scale.setScalar(scale)
    group.add(object)
    object.position.sub(center)
    return { group, materials: [...materials.values()] }
  }, [scene, url, burnMats, size, ...rotation])

  useFrame(() => {
    if (!energy) return
    const charge = bump(energy.transform, 0.05, 0.2, 0.7, 0.8)
    for (const material of asset.materials) if (material.userData.charged) material.emissiveIntensity = charge * 1.3
  })

  useEffect(() => () => {
    asset.materials.forEach(material => {
      if (burnMats) {
        const index = burnMats.indexOf(material)
        if (index >= 0) burnMats.splice(index, 1)
      }
      material.dispose()
    })
  }, [asset, burnMats])
  return <primitive object={asset.group} dispose={null} />
}
