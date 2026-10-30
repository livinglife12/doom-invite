import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import * as THREE from 'three'

// Exercise the shipping implementations without a renderer or an extra test
// dependency. Only React's hook lifecycle is substituted; Three.js is real.
const root = fileURLToPath(new URL('../', import.meta.url))
const source = relative => readFileSync(path.join(root, relative), 'utf8')
const dataModule = value => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`
const threeURL = pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href
const particlesURL = dataModule(source('src/lib/particles.js').replace("'three'", JSON.stringify(threeURL)))
const { makeEmitter, makeBolt, camPos } = await import(particlesURL)

const pool = makeEmitter(420, { opacity: 0.4, color: '#ff0000', colorEnd: '#0000ff' })
const position = pool.points.geometry.attributes.position
assert.equal(pool.activeCount, 0)
assert.equal(pool.points.visible, false)
assert.equal(pool.points.geometry.drawRange.count, 0)
const idleVersion = position.version
for (let k = 0; k < 50; k++) pool.update(0.016)
assert.equal(position.version, idleVersion, 'idle particle buffers should not upload')

pool.emit(12, (_, k) => ({ p: [k, 0, 0], v: [1, 1, 0], life: k % 2 ? 0.3 : 0.05 }))
assert.equal(pool.activeCount, 12)
assert.equal(pool.points.geometry.drawRange.count, 12, 'dead capacity should not be drawn')
assert.equal(position.updateRanges[0].count, 36, 'upload should cover the live prefix')
assert.equal(position.usage, THREE.DynamicDrawUsage)
pool.update(0.1)
assert.equal(pool.activeCount, 6, 'expired particles should leave the live prefix')
assert.equal(pool.points.geometry.drawRange.count, 6)
assert.equal(position.updateRanges[0].count, 18)
const survivors = Array.from({ length: 6 }, (_, i) => Math.round(position.array[i * 3] - 0.1)).sort((a, b) => a - b)
assert.deepEqual(survivors, [1, 3, 5, 7, 9, 11], 'compaction must preserve every surviving particle')
assert.equal(pool.points.material.uniforms.uOpacity.value, 0.4, 'emitter opacity must affect its shader')
pool.points.material.opacity = 0.7
assert.equal(pool.points.material.uniforms.uOpacity.value, 0.7)

const beforeInvalidDelta = Array.from(position.array)
for (const delta of [NaN, Infinity, -1, 0]) pool.update(delta)
assert.deepEqual(Array.from(position.array), beforeInvalidDelta, 'invalid dt must not corrupt particle state')
pool.clear()
assert.equal(pool.activeCount, 0)
assert.equal(pool.points.visible, false)
assert.equal(pool.points.geometry.drawRange.count, 0)
let initialized = 0
pool.emit(1000, () => { initialized++; return { p: [0, 0, 0], v: [0, 0, 0], life: 1 } })
assert.equal(initialized, pool.capacity, 'an oversized emission should remain bounded by capacity')
assert.equal(pool.activeCount, 420)
pool.reset()
pool.emit(1, () => ({ p: [0, 0, 0], v: [1, 0, 0], life: 2 }))
pool.update(1000)
assert(Math.abs(position.array[0] - 0.1) < 0.000001, 'a suspended tab must not cause an unbounded simulation step')
for (let k = 0; k < 25; k++) pool.update(0.1)
assert.equal(pool.activeCount, 0)
assert.equal(pool.points.visible, false)
const drainedVersion = position.version
pool.update(0.016)
assert.equal(position.version, drainedVersion, 'a drained pool should stop uploading')
pool.dispose()

camPos.set(0, 2, 8)
for (const segments of [4, 18, 72]) {
  const bolt = makeBolt('#aaffcc', segments, 0.05)
  const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0.3, 5, 0.1)
  bolt.set(a, b, 0.3)
  const first = Array.from(bolt.line.geometry.attributes.position.array)
  bolt.set(a, b, 0.3)
  assert.deepEqual(Array.from(bolt.line.geometry.attributes.position.array), first, 'static endpoints must not randomly reshuffle lightning')
  for (let k = 0; k < 24; k++) {
    b.x = 0.3 + k * 0.001
    bolt.set(a, b, 0.3)
    assert(bolt.line.geometry.attributes.position.array.every(Number.isFinite), 'moving lightning must have finite vertices')
  }
  const p = bolt.line.geometry.attributes.position.array
  const start = new THREE.Vector3((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2)
  const o = (segments - 1) * 6
  const end = new THREE.Vector3((p[o] + p[o + 3]) / 2, (p[o + 1] + p[o + 4]) / 2, (p[o + 2] + p[o + 5]) / 2)
  assert(start.distanceTo(a) < 0.00001 && end.distanceTo(b) < 0.00001, 'the visible bolt must stay attached to its endpoints')
  assert.equal(bolt.line.children.length, 0, 'branches should batch into the same mesh')
  bolt.set(a, a, 0.3)
  assert.equal(bolt.line.geometry.drawRange.count, 0, 'a zero-length bolt should not draw invalid ribbons')
  bolt.set(a, b, 0.3)
  assert(bolt.line.geometry.drawRange.count > 0, 'a bolt should recover after a zero-length frame')
  bolt.line.geometry.dispose(); bolt.mat.dispose()
}

const hooksURL = dataModule(`
  let frame;
  export const useMemo = fn => fn();
  export const useEffect = () => {};
  export const useFrame = fn => { frame = fn; };
  export const readFrame = () => frame;
`)
const hooks = await import(hooksURL)
const utilURL = dataModule(source('src/lib/util.js'))
const qualityURL = dataModule(source('src/lib/quality.js'))
const altarSource = source('src/scene/AltarDestruction.jsx')
const componentOffset = altarSource.indexOf('\nexport function DestructionFX')
assert(componentOffset > 0, 'the effect hook should remain separate from its JSX adapter')
const altarURL = dataModule(altarSource.slice(0, componentOffset)
  .replace("'react'", JSON.stringify(hooksURL))
  .replace("'@react-three/fiber'", JSON.stringify(hooksURL))
  .replace("'three'", JSON.stringify(threeURL))
  .replace("'../lib/particles'", JSON.stringify(particlesURL))
  .replace("'../lib/quality'", JSON.stringify(qualityURL))
  .replace("'../lib/util'", JSON.stringify(utilURL)))
const { DEFEATS, useDestruction } = await import(altarURL)
assert.equal(Object.keys(DEFEATS).length, 9)
assert.equal(new Set(Object.values(DEFEATS).map(profile => profile.mode)).size, 9, 'hero defeats should keep distinct motion families')
let samples = 0
for (const hero of Object.keys(DEFEATS)) for (const quality of ['low', 'mid', 'high']) {
  const rt = { burn: 0, done: false }
  const materials = [{ userData: { uBurn: { value: 0 }, uBurnEdge: { value: new THREE.Color() } } }]
  const parts = Array.from({ length: hero === 'ff' ? 6 : 4 }, () => ({ current: new THREE.Group() }))
  const fx = useDestruction(rt, materials, parts, hero === 'ff' ? 2.6 : 1, quality, hero)
  const frame = hooks.readFrame()
  fx.root.traverse(object => {
    if (!object.geometry) return
    const vertices = object.geometry.attributes.position
    assert(vertices.array.every(Number.isFinite), `${hero}: invalid energy geometry`)
    if (object.geometry.index) assert(object.geometry.index.array.every(i => i < vertices.count), `${hero}: out-of-range triangle indices`)
  })
  for (const burn of [0, 0.01, 0.08, 0.15, 0.23, 0.35, 0.48, 0.6, 0.75, 0.9, 1, 0.5, 0.2, 0]) {
    rt.burn = burn
    frame({ clock: { elapsedTime: samples / 60 } }, 0.016)
    samples++
    for (const part of parts) assert([...part.current.position.toArray(), ...part.current.scale.toArray(), ...part.current.rotation.toArray().slice(0, 3)].every(Number.isFinite), `${hero}: invalid architecture transform`)
    assert(fx.shards.instanceMatrix.array.every(Number.isFinite), `${hero}: invalid debris transforms`)
    assert(fx.webPos.every(Number.isFinite), `${hero}: invalid silk vertices`)
    assert(materials[0].userData.uBurn.value >= 0 && materials[0].userData.uBurn.value <= 1)
    if (burn === 0 || burn === 1) {
      assert.equal(fx.root.visible, false, `${hero}: endpoint effects should be hidden`)
      assert.equal(fx.motes.activeCount, 0, `${hero}: endpoint motes should be cleared`)
      assert.equal(fx.dust.activeCount, 0, `${hero}: endpoint dust should be cleared`)
    }
  }
  rt.burn = 0.4
  frame({ clock: { elapsedTime: 4 } }, 0.016)
  const frozenVersion = fx.shards.instanceMatrix.version
  for (let k = 0; k < 100; k++) frame({ clock: { elapsedTime: 4 + k / 60 } }, 0.016)
  assert.equal(fx.shards.instanceMatrix.version, frozenVersion, `${hero}: paused transforms should stop uploading`)
  assert.equal(fx.motes.activeCount, 0, `${hero}: paused effects should stop emitting new motes`)
  fx.reduced = true
  rt.burn = 0.45
  frame({ clock: { elapsedTime: 6 } }, 0.016)
  assert(fx.bolts.every(bolt => !bolt.line.visible), `${hero}: reduced motion should suppress lightning`)
  fx.dispose()
}
console.log(`PASS: live particle packing/draw/upload ranges, idle/opacity/reset/dt safety, stable branched bolts, and ${samples} seek/reset samples across nine altar profiles at three quality tiers.`)
