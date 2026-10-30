import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildMaskPlate, buildMaskParts, frontZ, RIVETS } from './maskShape'

export const DOOM_SEAT = Object.freeze({ origin: [0, 0.9, -21], seatTop: 0.72, armrestTop: 1.2, soleY: 0, eye: [0, 2.377, 0.22] })
const geometries = new Map()
const merged = new Map()
const memo = (key, make) => { if (!geometries.has(key)) geometries.set(key, make()); return geometries.get(key) }
const box = () => memo('round-box', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.055))
const sphere = () => memo('sphere', () => new THREE.SphereGeometry(1, 20, 12))
const rivet = () => memo('rivet', () => new THREE.SphereGeometry(1, 8, 6))
const cylinder = () => memo('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 20))
const torus = () => memo('torus', () => new THREE.TorusGeometry(1, 0.075, 6, 24))

function loft(key, sections, segments = 32) {
  return memo(key, () => {
    const positions = [], uv = [], indices = []
    sections.forEach(([y, rx, rz, z = 0], row) => {
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2
        positions.push(Math.sin(angle) * rx, y, z + Math.cos(angle) * rz)
        uv.push(i / segments, row / (sections.length - 1))
      }
    })
    for (let row = 0; row < sections.length - 1; row++) for (let i = 0; i < segments; i++) {
      const a = row * (segments + 1) + i, b = a + segments + 1
      indices.push(a, a + 1, b, a + 1, b + 1, b)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    return geometry
  })
}

function cloth(key, fn, columns = 22, rows = 24) {
  return memo(key, () => {
    const geometry = new THREE.PlaneGeometry(1, 1, columns, rows)
    const p = geometry.attributes.position
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...fn(p.getX(i) + 0.5, 0.5 - p.getY(i)))
    geometry.computeVertexNormals()
    return geometry
  })
}

function hood() {
  return memo('tailored-hood', () => {
    const positions = [], uv = [], indices = []
    const rows = 20, columns = 40
    for (let row = 0; row <= rows; row++) {
      const theta = THREE.MathUtils.lerp(0.7, Math.PI - 0.015, row / rows)
      for (let column = 0; column <= columns; column++) {
        const phi = column / columns * Math.PI * 2
        const x = Math.sin(theta) * Math.cos(phi) * 0.32
        const top = Math.max(0, Math.sin(phi))
        const y = Math.sin(theta) * Math.sin(phi) * 0.35 + Math.pow(top, 8) * Math.exp(-x * x / 0.016) * 0.05
        const z = Math.cos(theta) * 0.265 + Math.sin(phi * 5) * 0.007 * Math.sin(theta)
        positions.push(x, y, z); uv.push(column / columns, row / rows)
      }
    }
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column, b = a + columns + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    return geometry
  })
}

function sculptor(root) {
  const add = (name, geometry, material, position = [0, 0, 0], scale = [1, 1, 1], rotation) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name; mesh.position.set(...position); mesh.scale.set(...scale)
    if (rotation) mesh.rotation.set(...rotation)
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh)
    return mesh
  }
  const block = (name, material, position, size, rotation) => add(name, box(), material, position, size, rotation)
  const bone = (name, material, from, to, radius, depth = radius) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const mesh = add(name, cylinder(), material, a.clone().add(b).multiplyScalar(0.5).toArray(), [radius, a.distanceTo(b), depth])
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize())
    return mesh
  }
  return { add, block, bone }
}

function batch(root) {
  root.updateMatrixWorld(true)
  const buckets = new Map()
  root.traverse(mesh => {
    if (!mesh.isMesh) return
    const bucket = buckets.get(mesh.material) || []
    bucket.push(mesh); buckets.set(mesh.material, bucket)
  })
  for (const [material, pieces] of buckets) {
    if (pieces.length < 2) continue
    const key = pieces.map(mesh => mesh.geometry.uuid + ':' + mesh.matrixWorld.elements.map(n => n.toFixed(6)).join(',')).join('|')
    let geometry = merged.get(key)
    if (!geometry) {
      const sources = pieces.map(mesh => {
        const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld)
        for (const attribute of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(attribute)) g.deleteAttribute(attribute)
        return g
      })
      geometry = mergeGeometries(sources, false)
      sources.forEach(g => g.dispose())
      if (geometry) merged.set(key, geometry)
    }
    if (!geometry) continue
    pieces.forEach(mesh => mesh.parent.remove(mesh))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'doom-batch-' + (material.name || material.type)
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh)
  }
}

export function buildThrone(M) {
  const root = new THREE.Group(); root.name = 'doom-throne'
  const { add, block } = sculptor(root)
  block('seat', M.throne, [0, 0.36, -0.03], [2.05, 0.72, 1.5])
  block('seat-inlay', M.cloth, [0, 0.704, -0.03], [1.81, 0.028, 1.32])
  const back = memo('throne-back', () => {
    const shape = new THREE.Shape([[-1.1,0],[1.1,0],[1.1,2.72],[.72,3.5],[0,4.42],[-.72,3.5],[-1.1,2.72]].map(point => new THREE.Vector2(...point)))
    return new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 })
  })
  add('back', back, M.throne, [0, 0.5, -0.86])
  block('back-cushion', M.cloth, [0, 1.77, -0.567], [1.72, 1.92, 0.1])
  for (const side of [-1, 1]) {
    block('armrest', M.throne, [side * 0.99, 1.04, 0.1], [0.34, 0.32, 1.6])
    block('armrest-bronze-edge', M.gold, [side * 0.99, 1.16, 0.12], [0.35, 0.028, 1.59])
    for (const z of [-0.45, 0.65]) block('armrest-support', M.throne, [side * 0.99, 0.53, z], [0.25, 0.8, 0.23])
    block('back-metal-flute', M.gold, [side * 0.98, 2.08, -0.565], [0.035, 2.45, 0.025])
    block('seat-foot', M.throne, [side * 0.8, 0.085, 0.55], [0.24, 0.17, 0.3])
  }
  add('throne-crest', buildMaskPlate(), M.gold, [0, 3.65, -0.555], [0.34, 0.34, 0.34])
  root.userData.contacts = { seatTop: DOOM_SEAT.seatTop, armrestTop: DOOM_SEAT.armrestTop }
  batch(root)
  return root
}

export function buildSeatedDoom(M) {
  const root = new THREE.Group(); root.name = 'doom-seated'
  const { add, block, bone } = sculptor(root)
  block('pelvis-on-seat', M.green, [0, 0.91, -0.06], [0.88, 0.38, 0.57])
  add('fitted-tunic', loft('tunic-torso', [[.97,.37,.2,-.045],[1.18,.36,.19,-.04],[1.5,.46,.235,-.06],[1.78,.56,.245,-.08],[1.91,.53,.22,-.1],[2.02,.19,.16,-.07]]), M.green)
  add('belt', loft('doom-belt', [[1.035,.386,.218,-.04],[1.12,.386,.218,-.04]]), M.leather)
  block('belt-buckle', M.gold, [0, 1.078, 0.192], [0.18, 0.13, 0.044])
  block('buckle-inset', M.dark, [0, 1.078, 0.218], [0.10, 0.066, 0.012])
  for (const side of [-1, 1]) {
    const x = side * 0.39
    bone('seated-thigh', M.dark, [side * .31, .91, .08], [x, .8, .84], .17, .17)
    add('knee-plate', sphere(), M.steel, [x,.81,.86], [.174,.18,.15])
    bone('greave', M.steel, [x,.76,.86], [x,.24,.99], .143, .13)
    block('greave-ridge', M.dark, [x,.5,1.09], [.055,.42,.018], [-.18,0,0])
    block('boot-sole', M.dark, [x,.04,1.105], [.34,.08,.52])
    block('armored-boot', M.steel, [x,.14,1.105], [.315,.2,.48])
    block('toe-plate', M.steel, [x,.13,1.318], [.32,.13,.085])
    bone('boot-ankle', M.steel, [x,.16,.98], [x,.36,.98], .145, .135)
    for (let band = 0; band < 3; band++) block('boot-segment', M.dark, [x,.19+band*.045,1.13], [.27,.013,.028])

    // Cloth lies over the horizontal thighs and breaks into a split short tunic at the knees.
    add('tunic-skirt', cloth('lap:' + side, (u,v) => {
      const spread = .05 + u * (.41 + v*.02)
      const y = v < .7 ? 1.035 - v*.04 : 1.007 - (v-.7)*1.02
      return [side * spread, y + Math.sin(u*Math.PI*4)*.012*v, -.015 + v*.93]
    }), M.green)
    add('cape-side', cloth('cape:' + side, (u,v) => [side * (.43 + v*.6 + u*(.23+v*.08)), 1.95-v*1.9, -.22-v*.34+Math.sin(u*Math.PI*6)*.026*v]), M.cape)

    const shoulder = [side*.615,1.88,-.06], elbow = [side*.92,1.335,.15], wrist = [side*.92,1.325,.65]
    bone('upper-arm', M.dark, shoulder, elbow, .137, .13)
    add('pauldron', sphere(), M.steel, shoulder, [.28,.21,.25])
    for (let band = 0; band < 3; band++) {
      add('shoulder-lame', sphere(), band % 2 ? M.dark : M.steel, [side*(.66+band*.048),1.81-band*.055,-.045], [.223-band*.025,.10,.227-band*.012])
    }
    add('elbow', sphere(), M.dark, elbow, [.15,.135,.15])
    bone('forearm-on-armrest', M.steel, elbow, wrist, .125, .128)
    for (let band = 0; band < 4; band++) block('gauntlet-lame', M.steel, [side*.92,1.407,.26+band*.085], [.235,.055,.073])
    block('cuff', M.dark, [side*.92,1.325,.6], [.255,.23,.064])
    block('palm-on-armrest', M.steel, [side*.92,1.26,.734], [.20,.12,.23])
    for (let finger = 0; finger < 4; finger++) {
      block('finger', M.steel, [side*.92+(finger-1.5)*.047,1.235,.87], [.038,.07,.135], [.16,0,0])
      block('finger-joint', M.dark, [side*.92+(finger-1.5)*.047,1.273,.84], [.037,.013,.014])
    }
    bone('thumb', M.steel, [side*.82,1.26,.716], [side*.79,1.225,.815], .036, .035)
    add('cape-clasp', cylinder(), M.gold, [side*.405,1.874,.217], [.088,.028,.088], [Math.PI/2,0,0])
    add('clasp-ring', torus(), M.dark, [side*.405,1.874,.235], [.062,.062,.062])
  }
  const chain = memo('cape-chain', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length:17},(_,i) => {
    const x = (i/16-.5)*.81
    return new THREE.Vector3(x,1.87-.18*(1-(x/.405)**2),.255)
  })), 32, .015, 6))
  add('cape-chain', chain, M.gold)
  bone('neck', M.dark, [0,1.94,-.065], [0,2.14,-.065], .16, .13)
  add('hood', hood(), M.cape, [0,2.33,-.035])
  const head = new THREE.Group(); head.position.set(0,2.33,.188); head.scale.setScalar(.29); head.name = 'doom-mask'; root.add(head)
  const face = sculptor(head)
  face.add('mask-plate', buildMaskPlate(), M.steel)
  for (const side of [-1,1]) {
    const parts = buildMaskParts(side)
    for (const name of ['brow','nose','cheek','jaw']) face.add('mask-' + name, parts[name], name === 'nose' ? M.steel : M.dark)
    face.add('eye-aperture', parts.eye, M.eye)
    for (const x of [.05,.1,.15]) face.block('mouth-grille', M.dark, [side*x,-.333,frontZ(side*x,-.33)-.035], [.022,.235,.02])
    for (const [x,y] of RIVETS) face.add('mask-rivet', rivet(), M.steel, [side*x,y,frontZ(side*x,y)+.004], [.013,.013,.013])
  }
  face.block('mouth-cavity', M.black, [0,-.333,frontZ(0,-.333)-.055], [.35,.24,.01])

  root.updateMatrixWorld(true)
  const bottoms = name => root.children.filter(object => object.name === name).map(object => new THREE.Box3().setFromObject(object).min.y)
  root.userData.contacts = { seatTop: DOOM_SEAT.seatTop, pelvisBottom: bottoms('pelvis-on-seat')[0], armrestTop: DOOM_SEAT.armrestTop, palmBottoms: bottoms('palm-on-armrest'), soleBottoms: bottoms('boot-sole') }
  root.userData.landmarks = { maskCenter: [0,2.33,.188], knees: [[-.39,.81,.86],[.39,.81,.86]], hands: [[-.92,1.26,.734],[.92,1.26,.734]] }
  batch(root)
  return { root, eye: M.eye, contacts: root.userData.contacts }
}
