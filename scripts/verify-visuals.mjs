import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const url = relative => pathToFileURL(path.join(root, relative)).href
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const threeURL = url('node_modules/three/build/three.module.js')
const utilURL = dataModule(readFileSync(path.join(root, 'src/lib/util.js'), 'utf8'))
const figureURL = dataModule(readFileSync(path.join(root, 'src/lib/figure.js'), 'utf8')
  .replace("'three'", JSON.stringify(threeURL)).replace("'./util'", JSON.stringify(utilURL)))
const headURL = dataModule(readFileSync(path.join(root, 'src/lib/heroHeadGeometry.js'), 'utf8')
  .replace("'three'", JSON.stringify(threeURL)).replace("'./figure'", JSON.stringify(figureURL))
  .replace("'three/examples/jsm/utils/BufferGeometryUtils.js'", JSON.stringify(url('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'))))
const heroURL = dataModule(readFileSync(path.join(root, 'src/lib/heroes.js'), 'utf8')
  .replace("'three'", JSON.stringify(threeURL)).replace("'./figure'", JSON.stringify(figureURL))
  .replace("'./heroHeadGeometry'", JSON.stringify(headURL))
  .replace("'three/examples/jsm/utils/BufferGeometryUtils.js'", JSON.stringify(url('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'))))
const { buildHero } = await import(heroURL)
const { buildHeroHead } = await import(headURL)
const { setPose, POSES } = await import(figureURL)
const heroes = ['strange', 'loki', 'thor', 'ironman', 'cap', 'hulk', 'panther', 'spider', 'reed', 'sue', 'johnny', 'ben']

for (const hero of heroes) for (const surface of ['hologram', 'stone']) {
  const material = surface === 'stone' ? new THREE.MeshStandardMaterial() : new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('orange') }, uTime: { value: 0 }, uDissolve: { value: 0 }, uBuild: { value: 10 } },
  })
  const figure = buildHero(hero, material)
  for (const pose of Object.keys(POSES)) {
    setPose(figure.j, pose)
    figure.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(figure.root)
    assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), `${hero}/${pose}: invalid bounds`)
    assert(!bounds.isEmpty(), `${hero}/${pose}: empty figure`)
  }
  for (const mesh of figure.meshes) {
    assert(mesh.parent, `${hero}: detached mesh`)
    assert(mesh.geometry.attributes.position.array.every(Number.isFinite), `${hero}: non-finite vertices`)
    if (surface === 'hologram') for (const uniform of ['uTime', 'uDissolve', 'uBuild']) {
      assert.equal(mesh.material.uniforms[uniform], material.uniforms[uniform], `${hero}: disconnected ${uniform}`)
    }
  }
  if (hero === 'cap') assert(figure.parts.shield.parent)
  if (hero === 'thor') assert(figure.parts.hammer.parent && figure.parts.hammerHead.parent)
  if (hero === 'spider') assert(figure.parts.webHand.parent)
}

const palette = Object.fromEntries(['primary', 'secondary', 'skin', 'hair', 'metal', 'eye'].map(key => [key, new THREE.MeshStandardMaterial()]))
for (const hero of heroes) {
  const head = buildHeroHead(hero, palette), repeated = buildHeroHead(hero, palette)
  assert(head.meshes.length > 0)
  assert(head.meshes.some((mesh, index) => mesh.geometry === repeated.meshes[index]?.geometry), `${hero}: repeated head buffers should be shared`)
  for (const mesh of head.meshes) assert(mesh.geometry.attributes.normal.array.every(Number.isFinite), `${hero}: invalid head normals`)
  if (hero === 'ironman') {
    assert(head.faceplate?.userData.restPosition && head.faceplate.userData.restRotation)
    head.root.updateMatrixWorld(true)
    const point = new THREE.Vector3(0, -0.055, 0.056)
    const closed = head.faceplate.localToWorld(point.clone())
    head.faceplate.rotation.x -= 1.08
    head.root.updateMatrixWorld(true)
    assert(head.faceplate.localToWorld(point.clone()).z > closed.z + 0.01, 'Faceplate should hinge forwards')
  }
}
const helmet = buildHeroHead('loki', palette, { maskOnly: true })
assert(helmet.meshes.every(mesh => [palette.primary, palette.secondary, palette.metal].includes(mesh.material)), 'Loki relic must contain helmet hardware only')
const { buildMaskPlate, buildMaskParts } = await import(url('src/lib/maskShape.js'))
const doom = [buildMaskPlate(0), buildMaskPlate(1), buildMaskPlate(-1), ...Object.values(buildMaskParts(1)), ...Object.values(buildMaskParts(-1))]
assert(doom.reduce((total, geometry) => total + (geometry.index?.count || geometry.attributes.position.count) / 3, 0) < 18000, 'Doom mask tessellation budget exceeded')
assert.equal(buildMaskPlate(0), buildMaskPlate(0), 'Doom plate buffers must be cached')
for (const geometry of doom) {
  assert(geometry.attributes.position.array.every(Number.isFinite))
  assert(geometry.attributes.normal.array.every(Number.isFinite))
}

for (const name of ['mjolnir', 'arc-reactor']) {
  const buffer = readFileSync(path.join(root, `public/models/${name}.glb`))
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString())
  assert(!json.buffers.some(buffer => buffer.uri), `${name}: external buffer dependency`)
  assert(!json.images?.length, `${name}: unexpected texture dependency`)
  assert.equal(json.asset.extras.license, 'CC BY 3.0')
  assert(json.asset.extras.author && json.asset.extras.source, `${name}: missing attribution`)
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
  const bounds = new THREE.Box3().setFromObject(gltf.scene)
  assert(bounds.getCenter(new THREE.Vector3()).length() < 0.0001, `${name}: off-center pivot`)
  assert(Math.abs(Math.max(...bounds.getSize(new THREE.Vector3()).toArray()) - 1) < 0.0001)
  let draws = 0
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh) return
    draws++
    assert(mesh.geometry.attributes.normal, `${name}: missing normals`)
    assert(mesh.geometry.attributes.position.array.every(Number.isFinite))
  })
  assert(draws <= 4, `${name}: material batching regression`)
  console.log(`${name}: valid local GLB, ${draws} material primitives`)
}
console.log(`PASS: ${heroes.length} heroes in both materials, every pose, shared head buffers/uniforms, helmet hinge, Doom geometry budget, and both licensed models`)
