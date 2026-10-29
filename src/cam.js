import * as THREE from 'three'
import gsap from 'gsap'

// The camera is always directed: GSAP tweens pos/look, CameraRig applies them with shake and pointer parallax.
export const cam = {
  pos: new THREE.Vector3(0, 1.7, 5.5),
  look: new THREE.Vector3(0, 1.4, -12),
  shake: 0,
  parallax: 0.15,
  fovKick: 0,
}

export function camTo(pos, look, duration = 2.5, ease = 'power2.inOut') {
  const tl = gsap.timeline()
  tl.to(cam.pos, { x: pos.x, y: pos.y, z: pos.z, duration, ease }, 0)
  tl.to(cam.look, { x: look.x, y: look.y, z: look.z, duration, ease }, 0)
  return tl
}
