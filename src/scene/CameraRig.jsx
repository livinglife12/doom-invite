import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cam } from '../cam'
import { input } from '../world'
import { camPos, pointScale } from '../lib/particles'

const UP = new THREE.Vector3(0, 1, 0)

// Applies the directed camera with handheld drift, shake and pointer parallax.
// FOV adapts to aspect so a portrait phone keeps the same horizontal framing as desktop.
export default function CameraRig() {
  const tmp = useMemo(() => ({ look: new THREE.Vector3(), right: new THREE.Vector3(), fwd: new THREE.Vector3(), sx: 0, sy: 0, reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches }), [])
  useFrame(({ camera, clock, size, gl }, dt) => {
    const t = clock.elapsedTime
    const aspect = size.width / size.height
    const hfov = (60 * Math.PI) / 180
    let vfov = (2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180) / Math.PI
    vfov = THREE.MathUtils.clamp(vfov, 44, 84) + cam.fovKick
    if (Math.abs(camera.fov - vfov) > 0.01) {
      camera.fov = vfov
      camera.updateProjectionMatrix()
    }
    const s = tmp.reduced ? 0 : cam.shake
    camera.position.set(
      cam.pos.x + s * (Math.sin(t * 37) * 0.6 + Math.sin(t * 23) * 0.4) * 0.12,
      cam.pos.y + s * Math.sin(t * 41) * 0.1 + (tmp.reduced ? 0 : Math.sin(t * 0.7) * 0.012),
      cam.pos.z + s * Math.sin(t * 29) * 0.12 + (tmp.reduced ? 0 : Math.cos(t * 0.5) * 0.01)
    )
    const k = 1 - Math.exp(-dt * 2.2)
    tmp.sx += (input.x - tmp.sx) * k
    tmp.sy += (input.y - tmp.sy) * k
    tmp.look.copy(cam.look)
    if (cam.parallax > 0 && !tmp.reduced) {
      tmp.fwd.copy(cam.look).sub(cam.pos)
      const dist = tmp.fwd.length()
      tmp.fwd.normalize()
      tmp.right.crossVectors(tmp.fwd, UP).normalize()
      tmp.look.addScaledVector(tmp.right, tmp.sx * dist * 0.62 * cam.parallax).addScaledVector(UP, tmp.sy * dist * 0.22 * cam.parallax)
    }
    camera.lookAt(tmp.look)
    camPos.copy(camera.position)
    pointScale.value = size.height * gl.getPixelRatio() * 0.5
  })
  return null
}
