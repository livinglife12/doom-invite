import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import * as THREE from 'three'

const root = fileURLToPath(new URL('../', import.meta.url))
const url = relative => pathToFileURL(path.join(root, relative)).href
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const imports = {
  three: url('node_modules/three/build/three.module.js'),
  'three/examples/jsm/utils/BufferGeometryUtils.js': url('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),
  'three/examples/jsm/geometries/RoundedBoxGeometry.js': url('node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js'),
  'three/examples/jsm/modifiers/TessellateModifier.js': url('node_modules/three/examples/jsm/modifiers/TessellateModifier.js'),
}
const moduleURL = (relative, dependencies = {}) => {
  let source = readFileSync(path.join(root, relative), 'utf8')
  for (const [name, target] of Object.entries({ ...imports, ...dependencies })) source = source.replaceAll(`'${name}'`, JSON.stringify(target))
  return data(source)
}
const util = moduleURL('src/lib/util.js')
const figure = moduleURL('src/lib/figure.js', { './util': util })
const head = moduleURL('src/lib/heroHeadGeometry.js', { './figure': figure })
const heroes = moduleURL('src/lib/heroes.js', { './figure': figure, './heroHeadGeometry': head })
const masks = moduleURL('src/lib/maskShape.js')
const doomURL = moduleURL('src/lib/doomFigure.js', { './maskShape': masks })
const statueURL = moduleURL('src/lib/roomStatues.js', { './heroes': heroes, './figure': figure })
const shrineURL = moduleURL('src/config/shrines.js')
const worldURL = moduleURL('src/world.js', { './config/shrines': shrineURL })

function verifyGeometry(object, label) {
  let draws = 0
  object.updateMatrixWorld(true)
  object.traverse(mesh => {
    if (!mesh.isMesh) return
    draws++
    assert(mesh.geometry.attributes.position.count > 0, `${label}: empty mesh`)
    assert(mesh.geometry.attributes.position.array.every(Number.isFinite), `${label}: invalid vertex`)
    assert(mesh.geometry.attributes.normal.array.every(Number.isFinite), `${label}: invalid normal`)
  })
  const bounds = new THREE.Box3().setFromObject(object)
  assert(!bounds.isEmpty(), `${label}: empty bounds`)
  assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), `${label}: invalid bounds`)
  return { draws, bounds }
}

const { buildThrone, buildSeatedDoom } = await import(doomURL)
const doomMaterials = Object.fromEntries(['throne', 'cloth', 'gold', 'steel', 'dark', 'green', 'leather', 'cape', 'black', 'eye'].map(name => [name, new THREE.MeshStandardMaterial()]))
const throne = buildThrone(doomMaterials), doom = buildSeatedDoom(doomMaterials)
verifyGeometry(throne, 'throne')
const { bounds: doomBounds } = verifyGeometry(doom.root, 'Doom')
assert(Math.abs(doom.contacts.pelvisBottom - throne.userData.contacts.seatTop) < 1e-6, 'Doom must sit on the seat')
for (const y of doom.contacts.soleBottoms) assert(Math.abs(y) < 1e-6, 'Doom boots must rest on the dais')
for (const y of doom.contacts.palmBottoms) assert(Math.abs(y - throne.userData.contacts.armrestTop) < 1e-6, 'Doom palms must rest on both armrests')
assert(Math.abs(doomBounds.min.y) < 0.01, 'Seated figure must not sink into the dais')
const repeated = buildSeatedDoom(doomMaterials)
assert(doom.root.children.some((mesh, index) => mesh.isMesh && mesh.geometry === repeated.root.children[index]?.geometry), 'Repeated Doom figures should share rigid geometry')

const { buildRoomStatue, ROOM_STATUES, STATUE_PLINTH_TOP } = await import(statueURL)
const materials = Object.fromEntries(['stone', 'suit', 'relief', 'dark', 'metal', 'bronze', 'cape'].map(name => [name, new THREE.MeshStandardMaterial()]))
const entry = new THREE.Vector3(0, 1.7, 5.5)
for (const definition of ROOM_STATUES) {
  const statue = buildRoomStatue(definition.hero, materials)
  const holder = new THREE.Group()
  holder.position.set(...definition.position)
  holder.position.y += STATUE_PLINTH_TOP
  holder.rotation.y = definition.yaw
  holder.scale.setScalar(definition.scale)
  holder.add(statue.root)
  const { draws, bounds } = verifyGeometry(holder, definition.hero)
  assert(Math.abs(bounds.min.y - STATUE_PLINTH_TOP) < 1e-6, `${definition.hero}: feet must touch plinth`)
  assert(bounds.max.y > 3.8 && bounds.max.y < 5.4, `${definition.hero}: monumental scale`)
  assert(draws <= 24, `${definition.hero}: static sculpture batching regressed`)
  holder.traverse(mesh => { if (mesh.isMesh) assert.equal(mesh.material.emissive.getHex(), 0, 'Stone faces must not have neon eye bars') })
  if (definition.hero === 'cap') {
    assert.equal(statue.parts.shield.parent, statue.j.lElbow, 'Shield must attach to the forearm')
    const shieldPosition = statue.parts.shield.getWorldPosition(new THREE.Vector3())
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(statue.parts.shield.getWorldQuaternion(new THREE.Quaternion()))
    assert(front.dot(entry.clone().sub(shieldPosition).normalize()) > 0.85, 'Shield star must face the incoming viewer')
  } else {
    assert.equal(statue.parts.hammer.parent, statue.j.rHand, 'Mjolnir must attach to the hand')
    const hammerPosition = statue.parts.hammerHead.getWorldPosition(new THREE.Vector3())
    assert(hammerPosition.y > STATUE_PLINTH_TOP + 0.15 && hammerPosition.y < 2.5, 'Mjolnir should be carried down without hitting the plinth')
  }
  statue.dispose()
}

const { beam, litAmount } = await import(worldURL)
beam.origin.set(0, 0, 0)
beam.dir.set(0, 0, -1)
beam.angle = 0.34
beam.on = 1
assert(litAmount(new THREE.Vector3(0, 0, -26)) > 0.45, 'Distant throne-room discoveries must reach their activation threshold')
assert.equal(litAmount(new THREE.Vector3(20, 0, -10)), 0, 'Points outside the cone must remain unlit')
assert.equal(litAmount(new THREE.Vector3(0, 0, -42.1)), 0, 'Coverage must end beyond the room')
const fade = litAmount(new THREE.Vector3(0, 0, -35))
assert(fade > 0 && fade < 1, 'Long-distance interaction coverage must fade')
beam.on = 0
assert.equal(litAmount(new THREE.Vector3(0, 0, -26)), 0, 'Disabled flashlight must not discover objects')

console.log('PASS: seated Doom contacts/cached geometry; grounded, correctly facing Cap/Thor sculptures and attached props; finite normals; distant flashlight coverage and cone/range limits.')
