import gsap from 'gsap'
import { world } from './world'
import { cam } from './cam'
import { setS } from './state'
import { SHRINES } from './config/shrines'
import { toWorld } from './config/layout'
import { clamp } from './lib/util'

// Internal scene setup used by development verification. No controls are rendered.
let reviewTween = null
let selected = -1
let selectedMode = 'holo'
const fields = { holo: 'holo', artifact: 'transform', destruction: 'burn' }
const aliases = { reconstruction: 'holo', relic: 'artifact', destroy: 'destruction' }
const normalizeMode = mode => fields[mode] ? mode : aliases[mode] || 'holo'
const indexOf = value => {
  const found = typeof value === 'string' ? SHRINES.findIndex(s => s.id === value) : Number(value)
  return Number.isInteger(found) && found >= 0 && found < SHRINES.length ? found : 0
}

const roomViews = {
  throne: [[0.8, 2.7, -14.7], [0, 2.7, -20.75]],
  room: [[0, 3.1, -3.8], [0, 2.8, -20.8]],
  'cap-statue': [[-3.5, 2.5, -5.9], [-7.1, 2.5, -10.6]],
  'thor-statue': [[3.2, 2.7, -10.5], [7, 2.5, -16.2]],
  'strange-statue': [[-2.6, 2.5, -12], [-5.8, 2.3, -16.2]],
}

function setupRoomReview(view) {
  world.tv.visible = false
  world.throneVisible = true
  world.hall.visible = false
  world.mask.visible = false
  world.page.visible = false
  world.flashlight.enabled = false
  world.flashlight.intensity = 0
  Object.assign(world.sw, { activated: true, flip: 1, lights: 1, cable: 1 })
  Object.assign(world.env, { intensity: 0.45, ambient: 0.38, fog: 0.012 })
  cam.pos.set(...roomViews[view][0])
  cam.look.set(...roomViews[view][1])
  cam.parallax = 0
  cam.shake = 0
  cam.fovKick = 0
  selected = -1
  setS({ phase: 'review', veil: 'clear', shrineIndex: -1, caption: null, sub: null, prompt: null, cue: null, hint: null, inspect: null, skip: false, rsvp: false, ended: false })
  return -1
}

export function setupReview(value, mode = 'holo') {
  reviewTween?.kill()
  reviewTween = null
  if (roomViews[value]) return setupRoomReview(value)
  const i = indexOf(value)
  mode = normalizeMode(mode)
  selected = i
  selectedMode = mode
  world.tv.visible = false
  world.throneVisible = false
  world.flashlight.enabled = false
  world.flashlight.intensity = 0
  world.mask.visible = false
  world.page.visible = false
  world.doors.open = 1
  Object.assign(world.hall, { visible: true, lights: 1, collapse: 0, keyOn: 1, holoOn: mode === 'artifact' ? 0 : 1 })
  Object.assign(world.env, { intensity: 0.7, ambient: 0.95, fog: 0.018, void: 0 })
  world.shrines.forEach((rt, k) => Object.assign(rt, {
    unfurl: k === i ? 1 : 0, ready: false, pressed: 0,
    holo: k === i && mode !== 'artifact' ? 0.3 : 0,
    transform: k === i && mode !== 'holo' ? 0.45 : 0,
    burn: 0, token: 0, malfunction: 0, done: k !== i, onPress: null,
  }))
  const wide = SHRINES[i].team
  const position = wide ? [0, 2.8, 10.5] : mode === 'holo' ? [0.15, 2.15, 3.1] : mode === 'artifact' ? [-1.0, 2.35, 2.2] : [0, 2.7, 6.8]
  const look = wide ? [0, 2.1, -0.2] : mode === 'holo' ? [0, 1.95, 0] : mode === 'artifact' ? [-1.1, 2.1, -0.35] : [0, 2.3, -0.2]
  cam.pos.copy(toWorld(i, position))
  cam.look.copy(toWorld(i, look))
  cam.shake = 0
  cam.parallax = 0
  cam.fovKick = 0
  world.hall.keyTarget.copy(toWorld(i, [0, 1.75, -0.2]))
  world.hall.keyFrom.copy(toWorld(i, wide ? [0, 7, 4] : [0, 6, 3.5]))
  world.hall.holoColor.set(SHRINES[i].color)
  world.hall.holoPos.copy(toWorld(i, [0, 1.95, 0.5]))
  setS({ phase: 'review', veil: 'clear', shrineIndex: i, caption: null, sub: null, prompt: null, cue: null, hint: null, inspect: null, skip: false, rsvp: false, ended: false })
  return i
}

export function playReview(value, mode = 'holo') {
  const i = setupReview(value, mode)
  mode = normalizeMode(mode)
  const rt = world.shrines[i]
  const field = fields[mode]
  rt[field] = 0
  const duration = mode === 'holo' ? SHRINES[i].holoDuration || 6.2 : mode === 'artifact' ? 3.2 : SHRINES[i].team ? 5 : 4
  reviewTween = gsap.to(rt, { [field]: 1, duration, ease: 'none' })
  return reviewTween
}

export function seekReview(value, mode = 'holo', progress = 0.3) {
  const i = indexOf(value)
  mode = normalizeMode(mode)
  if (selected !== i || selectedMode !== mode) setupReview(i, mode)
  reviewTween?.pause()
  const rt = world.shrines[i]
  rt[fields[mode]] = clamp(Number(progress) || 0)
  rt.done = false
  return rt[fields[mode]]
}
