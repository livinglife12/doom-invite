import * as THREE from 'three'

// World layout. Throne room spans x[-9,9] z[-23,8]; doors on the right wall at x=9 open onto the hall,
// which runs along +x down z=0. Single shrines alternate sides every 8 units; the team memorial closes the
// hall; the mask forms in the void beyond the end wall. Everything downstream derives from these numbers.
const SINGLE_X = [20, 28, 36, 44, 52, 60, 68, 76]
export const SHRINE_POS = [
  ...SINGLE_X.map((x, k) => (k % 2 === 0 ? { x, z: -5.2, ry: 0 } : { x, z: 5.2, ry: Math.PI })),
  { x: 93.5, z: 0, ry: -Math.PI / 2 },
]

export const FF_X = SHRINE_POS[SHRINE_POS.length - 1].x
export const HALL_END = 101
export const V_MASK = new THREE.Vector3(117, 3.2, 0)
// Pillars, ceiling beams and torches sit between the shrines.
export const PILLAR_X = Array.from({ length: 10 }, (_, k) => 16 + k * 8)
// The old television sits in its own parlour, well clear of the throne room.
export const TV_POS = new THREE.Vector3(0, 0, 40)
export const FF_MEMBER_X = [-3.3, -1.1, 1.1, 3.3]

export function toWorld(i, [lx, ly, lz]) {
  const s = SHRINE_POS[i]
  const c = Math.cos(s.ry)
  const n = Math.sin(s.ry)
  return new THREE.Vector3(s.x + lx * c + lz * n, ly, s.z - lx * n + lz * c)
}
