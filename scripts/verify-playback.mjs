import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as THREE from 'three'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const threeURL = pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href
const qualityURL = data(read('src/lib/quality.js'))
const { QUALITY_BUDGETS, qualityForDevice, createQualitySampler } = await import(qualityURL)
const { stageVisible, createVisibilityController } = await import(data(read('src/lib/renderPolicy.js')))
const framingURL = data(read('src/config/framing.js'))
const { shrineFrame } = await import(framingURL)
const shrineURL = data(read('src/config/shrines.js'))
const { SHRINES } = await import(shrineURL)
const layoutURL = data(read('src/config/layout.js').replace("'three'", JSON.stringify(threeURL)))
const { toWorld } = await import(layoutURL)

assert.equal(qualityForDevice({ cores: 32 }), 'mid')
assert.equal(qualityForDevice({ mobile: true, cores: 4 }), 'low')
assert.equal(qualityForDevice({ search: '?q=high' }), 'high')
assert.equal(QUALITY_BUDGETS.mid.dpr, 1)
assert.equal(QUALITY_BUDGETS.mid.post, false)
assert.equal(QUALITY_BUDGETS.mid.shadows, false)
assert(!read('src/scene/World.jsx').includes('compileAsync'), 'Hidden scenes must not compile in a startup burst')
const sample = (sampler, fps, seconds, start = 0) => {
  const changes = []
  for (let frame = 0; frame < fps * seconds; frame++) {
    const next = sampler.sample(1 / fps, start + frame * 1000 / fps)
    if (next) changes.push(next)
  }
  return changes
}
assert.deepEqual(sample(createQualitySampler('mid'), 60, 30), [])
assert.deepEqual(sample(createQualitySampler('mid'), 20, 30), ['low'])
assert.deepEqual(sample(createQualitySampler('mid'), 2, 20), ['low'], 'Repeated very slow frames must not be ignored forever')
assert.deepEqual(sample(createQualitySampler('high'), 20, 40), ['mid', 'low'])
assert.deepEqual(sample(createQualitySampler('high', { locked: true }), 10, 40), [])
const suspended = createQualitySampler('mid')
assert.equal(suspended.sample(2, 0, false), null)
assert.deepEqual(sample(suspended, 60, 30, 1000), [])

let pauses = 0, resumes = 0, audioPauses = 0, audioResumes = 0, isPaused = false
const loops = []
const timeline = { paused: () => isPaused, pause: () => { isPaused = true; pauses++ }, resume: () => { isPaused = false; resumes++ } }
const audio = { state: 'running', suspend() { this.state = 'suspended'; audioPauses++; return Promise.resolve() }, resume() { this.state = 'running'; audioResumes++; return Promise.resolve() } }
const visible = createVisibilityController({ setLoop: mode => loops.push(mode), timeline, getAudio: () => audio })
visible(false); visible(false); await visible(true); visible(true)
assert.equal(pauses, 1); assert.equal(resumes, 1)
assert.equal(audioPauses, 1); assert.equal(audioResumes, 1)
assert.deepEqual(loops, ['never', 'never', 'always', 'always'])
isPaused = true; audio.state = 'suspended'
visible(false); await visible(true)
assert.equal(resumes, 1, 'Do not resume a timeline paused by something else')
assert.equal(audioResumes, 1, 'Do not autoplay previously suspended audio')
let finishSuspend, recovered = 0
const slowAudio = { state: 'running', suspend: () => new Promise(resolve => { finishSuspend = () => { slowAudio.state = 'suspended'; resolve() } }), resume: async () => { recovered++; slowAudio.state = 'running' } }
isPaused = false
const quickSwitch = createVisibilityController({ setLoop: () => {}, timeline, getAudio: () => slowAudio })
quickSwitch(false); const recovery = quickSwitch(true)
assert.equal(recovered, 0)
finishSuspend(); await recovery
assert.equal(recovered, 1, 'A fast tab switch must not leave audio suspended')

const state = { tv: { visible: true }, throneVisible: false, hall: { visible: false, lights: 0, keyOn: 0, collapse: 0 }, env: { void: 1 }, mask: { visible: false }, page: { visible: false } }
const scene = new THREE.Scene(), groups = {}
for (const name of ['tv', 'throne', 'hall', 'collapse', 'mask', 'page']) {
  const group = new THREE.Group(), light = new THREE.PointLight('white', 0)
  light.name = name; group.add(light); groups[name] = group; scene.add(group)
}
const activeLights = () => {
  for (const [name, group] of Object.entries(groups)) group.visible = stageVisible(name, state)
  const lights = []; scene.traverseVisible(object => { if (object.isLight) lights.push(object.name) }); return lights.sort()
}
assert.deepEqual(activeLights(), ['tv'])
state.tv.visible = false; state.throneVisible = true; state.hall.visible = true
assert.deepEqual(activeLights(), ['throne'], 'Unlit hall lights must not affect the throne room')
state.throneVisible = false; state.hall.lights = 1
assert.deepEqual(activeLights(), ['hall'])
state.hall.visible = false; state.hall.collapse = 1; state.mask.visible = true
assert.deepEqual(activeLights(), ['collapse', 'mask'], 'Collapse and mask overlap remains visible')
state.env.void = 0; state.mask.visible = false; state.page.visible = true
assert.deepEqual(activeLights(), ['page'])

// Exercise the shipping director with an inert timeline. It records camera moves
// while keeping sound/DOM callbacks dormant; all timing and shrine methods stay real.
const worldURL = data(read('src/world.js').replace("'three'", JSON.stringify(threeURL)).replace("'./config/shrines'", JSON.stringify(shrineURL)))
const { world } = await import(worldURL)
const cameraURL = data(`import * as THREE from ${JSON.stringify(threeURL)}; export const moves=[]; export const cam={pos:new THREE.Vector3(),look:new THREE.Vector3(),shake:0,parallax:0,fovKick:0}; export function camTo(pos,look){moves.push({position:pos.toArray(),target:look.toArray()});return {}}`)
const { moves } = await import(cameraURL)
const preamble = `
import * as THREE from ${JSON.stringify(threeURL)};
import { world } from ${JSON.stringify(worldURL)};
import { cam, camTo } from ${JSON.stringify(cameraURL)};
import { SHRINES } from ${JSON.stringify(shrineURL)};
import { toWorld, SHRINE_POS, V_MASK, FF_MEMBER_X, TV_POS, FF_X } from ${JSON.stringify(layoutURL)};
import { shrineFrame } from ${JSON.stringify(framingURL)};
const gsap={timeline:()=>({to(){return this},set(){return this},call(){return this},add(){return this},eventCallback(_,fn){queueMicrotask(fn);return this}})};
const ui={}; const setS=p=>Object.assign(ui,p); const getS=()=>ui;
const audio={}; const EVENT={}; const composeParchment=()=>{};
`
globalThis.window = { matchMedia: () => ({ matches: false }) }
const { director } = await import(data(preamble + read('src/director.js').replace(/^import .*$/gm, '')))
for (let i = 0; i < SHRINES.length; i++) {
  moves.length = 0
  const approaching = director.approach(i)
  for (let tick = 0; tick < 8 && !world.shrines[i].onPress; tick++) await Promise.resolve()
  assert(world.shrines[i].onPress, 'Approach must still wait for activation')
  director.press(i); await approaching
  const frame = shrineFrame(SHRINES[i].team)
  assert.equal(moves.length, 1)
  assert.deepEqual(moves[0].position, toWorld(i, frame.position).toArray())
  assert.deepEqual(moves[0].target, toWorld(i, frame.target).toArray())
}
director.approach = async () => {}
moves.length = 0
for (let i = 0; i < SHRINES.length; i++) await (SHRINES[i].team ? director.runTeamShrine(i) : director.runShrine(i))
assert.equal(moves.length, 0, 'No camera push-ins may occur after a shrine is framed')

// Verify full-exhibit corners remain inside the same desktop/phone camera frustum.
for (const team of [false, true]) for (const [width, height] of [[1280, 720], [390, 844]]) {
  const frame = shrineFrame(team), aspect = width / height
  const vertical = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.PI / 6) / aspect)), 44, 84)
  const camera = new THREE.PerspectiveCamera(vertical, aspect, .05, 220)
  camera.position.set(...frame.position); camera.lookAt(...frame.target); camera.updateMatrixWorld(true)
  const corners = team ? [[-4.7, 0, 1.2], [4.7, 0, 1.2], [-4.7, 6.4, -1.8], [4.7, 6.4, -1.8]] : [[-2.2, 0, 1.2], [2.2, 0, 1.2], [-1.5, 5.8, -1.2], [1.5, 5.8, -1.2]]
  for (const point of corners) {
    const projected = new THREE.Vector3(...point).project(camera)
    assert(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, 'Wide view clipped exhibit architecture')
  }
}
console.log('PASS: balanced GPU budgets, staged quality adaptation, hidden-page pause ownership, inactive light exclusion, all nine real director timelines without shrine zoom, and desktop/phone framing.')
