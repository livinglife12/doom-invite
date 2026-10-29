import gsap from 'gsap'
import * as THREE from 'three'
import { world } from './world'
import { cam, camTo } from './cam'
import { setS, getS } from './state'
import { audio } from './audio'
import { SHRINES } from './config/shrines'
import { toWorld, SHRINE_POS, V_MASK, FF_MEMBER_X, TV_POS, FF_X } from './config/layout'
import { composeParchment } from './lib/parchment'

// The director owns the story: every scene is a deterministic GSAP timeline over world.js values.
let current = null
let fallbackTimer = null
const V = (x, y, z) => new THREE.Vector3(x, y, z)

export const caption = (text, kind = 'title') => setS({ caption: text ? { text, kind, id: Math.random() } : null })

function run(tl) {
  current = tl
  return new Promise((res) =>
    tl.eventCallback('onComplete', () => {
      if (current === tl) current = null
      res()
    })
  )
}

export const FF_WINDOWS = [
  [0.02, 0.22],
  [0.24, 0.44],
  [0.46, 0.66],
  [0.68, 0.88],
]

export const director = {
  // Opening: an old television in a dark parlour. Turning the dial powers the tube on.
  boot() {
    world.throneVisible = false
    world.hall.visible = false
    cam.pos.set(TV_POS.x + 0.15, 1.28, TV_POS.z + 2.55)
    cam.look.set(TV_POS.x, 0.98, TV_POS.z)
    cam.parallax = 0.12
    Object.assign(world.env, { intensity: 0.25, ambient: 0.06, fog: 0.02 })
    setS({ phase: 'tv', veil: 'clear' })
  },

  skip() {
    if (current) {
      current.progress(1)
      return
    }
    const s = getS()
    if (s.phase === 'tv') this.powerOnTV()
    else if (s.phase === 'flashlight') this.activateSwitch()
    else if (s.phase === 'hall') {
      const rt = world.shrines[s.shrineIndex]
      if (rt && rt.ready && rt.onPress) rt.onPress()
    } else if (s.phase === 'doors' && s.prompt) s.prompt.action()
  },

  async powerOnTV() {
    if (getS().phase !== 'tv') return
    audio.init()
    audio.tvClick()
    setS({ phase: 'broadcast', skip: true })
    const T = world.tv
    const lines = ['DOOM INVITES YOU TO WITNESS HIS CONQUEST.', 'THE MULTIVERSE HAS FALLEN.', 'ENTER… AND SEE WHAT BECAME OF ITS HEROES.']
    const burst = (tl, at) => {
      tl.to(T, { static: 0.75, duration: 0.08 }, at)
      tl.to(T, { roll: '+=1', duration: 0.45, ease: 'power2.out' }, at)
      tl.call(() => audio.staticOn(0.55), null, at)
      tl.to(T, { static: 0.08, duration: 0.35 }, at + 0.2)
      tl.call(() => audio.staticOn(0.1), null, at + 0.35)
    }
    const tl = gsap.timeline()
    tl.to(T, { knob: 1, duration: 0.3, ease: 'back.out(2)' }, 0)
    tl.call(() => {
      audio.crtOn()
      audio.staticOn(0.6)
      T.mode = 'testcard'
    }, null, 0.3)
    tl.to(T, { power: 1, duration: 1.4, ease: 'power2.out' }, 0.3)
    tl.to(T, { static: 0.15, duration: 1.4 }, 1.2)
    tl.call(() => {
      audio.staticOn(0.12)
      audio.drone()
    }, null, 1.6)
    tl.add(camTo(V(TV_POS.x - 0.12, 1.02, TV_POS.z + 1.45), V(TV_POS.x - 0.12, 1.0, TV_POS.z), 3.6), 2.2)
    lines.forEach((text, k) => {
      const at = 3.6 + k * 3.9
      burst(tl, at)
      tl.call(() => {
        T.mode = 'text'
        T.text = text
        if (k === 0) audio.activation()
      }, null, at + 0.1)
    })
    const E = 3.6 + 3 * 3.9
    burst(tl, E)
    tl.call(() => {
      T.mode = 'emblem'
      audio.riser(2.4)
    }, null, E + 0.1)
    // dive into the picture tube
    tl.add(camTo(V(TV_POS.x - 0.12, 1.0, TV_POS.z + 0.42), V(TV_POS.x - 0.12, 1.0, TV_POS.z - 1), 1.5, 'power3.in'), E + 1.1)
    tl.to(cam, { fovKick: -10, duration: 1.5, ease: 'power3.in' }, E + 1.1)
    tl.to(T, { static: 1, duration: 1.2, ease: 'power2.in' }, E + 1.4)
    tl.call(() => audio.staticOn(0.9), null, E + 1.6)
    tl.call(() => setS({ veil: 'flash' }), null, E + 2.55)
    tl.call(() => {
      audio.staticOn(0)
      audio.boom()
      T.visible = false
      world.throneVisible = true
      world.hall.visible = true
      cam.fovKick = 0
      cam.pos.set(0, 1.7, 5.5)
      cam.look.set(0, 1.4, -12)
      Object.assign(world.env, { intensity: 0.02, ambient: 0.02, fog: 0.045 })
      setS({ veil: 'black' })
    }, null, E + 2.7)
    tl.call(() => setS({ veil: 'clear' }), null, E + 3.3)
    tl.to({}, { duration: 0.01 }, E + 4.2)
    await run(tl)
    this.flashlight()
  },

  flashlight() {
    setS({ phase: 'flashlight' })
    world.flashlight.enabled = true
    audio.click()
    audio.clank(0.25)
    cam.parallax = 1
    const tl = gsap.timeline()
    tl.set(world.flashlight, { intensity: 0.6 }, 0)
      .set(world.flashlight, { intensity: 0 }, 0.08)
      .set(world.flashlight, { intensity: 0.9 }, 0.2)
      .set(world.flashlight, { intensity: 0.1 }, 0.27)
      .to(world.flashlight, { intensity: 1, duration: 0.3 }, 0.45)
    tl.call(() => setS({ hint: window.matchMedia('(pointer: coarse)').matches ? 'DRAG TO WIELD THE LIGHT' : 'MOVE TO WIELD THE LIGHT' }), null, 2.2)
    fallbackTimer = setTimeout(() => {
      if (!world.sw.activated) setS({ prompt: { label: 'SEIZE THE SWITCH', action: () => this.activateSwitch() } })
    }, 22000)
  },

  activateSwitch() {
    const sw = world.sw
    if (sw.activated) return
    sw.activated = true
    sw.charge = 1
    clearTimeout(fallbackTimer)
    audio.charge(0)
    setS({ prompt: null, hint: null, phase: 'switch' })
    const tl = gsap.timeline()
    tl.to(sw, { vibrate: 1, duration: 0.5 }, 0)
    tl.call(() => audio.sparks(1.2), null, 0)
    tl.to(sw, { sparks: 1, duration: 0.2 }, 0.1)
    tl.to(sw, { latch: 1, duration: 0.25, ease: 'power2.in' }, 0.9)
    tl.call(() => audio.clank(0.4), null, 1.1)
    tl.to(sw, { vibrate: 0, duration: 0.2 }, 1.2)
    tl.to(sw, { flip: 1, duration: 0.45, ease: 'back.out(2.2)' }, 1.3)
    tl.call(() => {
      audio.clank(0.9)
      audio.boom()
    }, null, 1.4)
    tl.to(cam, { shake: 0.35, duration: 0.15, yoyo: true, repeat: 1 }, 1.4)
    tl.to(sw, { sparks: 0, duration: 0.6 }, 1.6)
    tl.to(sw, { cable: 1, duration: 1.4, ease: 'power1.in' }, 1.6)
    tl.call(() => audio.riser(2), null, 1.6)
    tl.to(sw, { lights: 1, duration: 1.6, ease: 'none' }, 2.6)
    for (let i = 0; i < 6; i++) tl.call(() => audio.metalHit(), null, 2.6 + i * 0.27)
    tl.to(world.env, { intensity: 0.22, ambient: 0.22, duration: 2 }, 2.8)
    tl.to(world.flashlight, { lower: 1, intensity: 0, duration: 2.2 }, 3.6)
    tl.call(() => {
      world.flashlight.enabled = false
      cam.parallax = 0.12
    }, null, 5.8)
    tl.to(world.hall, { lights: 1, duration: 2.5 }, 3.8)
    tl.to(world.doors, { open: 1, duration: 4, ease: 'power2.inOut' }, 4.0)
    tl.call(() => {
      audio.doorGrind(4)
      audio.rumble(3)
    }, null, 4.0)
    tl.add(camTo(V(1.2, 1.75, 4.2), V(9, 2.4, 0), 3.2), 4.2)
    tl.call(() => caption('BEHOLD WHAT REMAINS OF YOUR HEROES.'), null, 6.4)
    tl.call(() => {
      audio.doomChord(5)
      setS({ phase: 'doors', prompt: { label: 'BEGIN THE PROCESSION', action: () => this.enterHall() } })
    }, null, 8.2)
    run(tl)
  },

  async enterHall() {
    setS({ prompt: null, phase: 'hall' })
    caption(null)
    const tl = gsap.timeline()
    tl.add(camTo(V(6, 1.7, 0.4), V(14, 1.7, 0), 2.4, 'power2.in'), 0)
    tl.add(camTo(V(11.5, 1.7, 0), V(20, 1.5, -3), 1.6, 'power2.out'), 2.4)
    tl.to(world.env, { intensity: 0.55, ambient: 0.95, fog: 0.032, duration: 3 }, 0)
    tl.call(() => {
      world.throneVisible = false
    }, null, 3.6)
    await run(tl)
    for (let i = 0; i < SHRINES.length; i++) {
      if (SHRINES[i].team) await this.runTeamShrine(i)
      else await this.runShrine(i)
    }
    await this.runCollapse()
  },

  focusShrine(i, color, onButton = false) {
    const s = SHRINE_POS[i]
    world.hall.keyTarget.copy(toWorld(i, onButton ? [0, 1.05, 1.0] : [0, 1.2, -0.2]))
    world.hall.keyFrom.copy(toWorld(i, onButton ? [0, 6, 3.2] : [0, 7.5, 3.5]))
    world.hall.holoColor.set(color)
    world.hall.holoPos.copy(toWorld(i, [0, 1.9, 0.9]))
    return s
  },

  // Walk up to a shrine that is still only its button, standing in a pool of light.
  async approach(i) {
    const cfg = SHRINES[i]
    const rt = world.shrines[i]
    this.focusShrine(i, cfg.color, true)
    setS({ shrineIndex: i })
    const btn = cfg.team ? [[0, 1.75, 3.1], [0, 1.0, 0.45]] : [[0, 1.8, 3.4], [0, 1.12, 1.0]]
    const tl = gsap.timeline()
    tl.add(camTo(toWorld(i, btn[0]), toWorld(i, btn[1]), 3.2), 0)
    tl.to(world.hall, { keyOn: 0, duration: 0.5 }, 0)
    tl.to(world.hall, { keyOn: 0.8, duration: 1.4 }, 1.4)
    tl.call(() => caption(cfg.title, 'shrine'), null, 1.9)
    await run(tl)
    rt.ready = true
    if (i === 0) setS({ cue: 'PRESS THE BUTTON' })
    await new Promise((r) => (rt.onPress = r))
    rt.ready = false
    rt.onPress = null
    setS({ cue: null })
    caption(null)
  },

  press(i) {
    const rt = world.shrines[i]
    if (rt && rt.ready && rt.onPress) rt.onPress()
  },

  // The button wakes the shrine: stone rises out of the floor around it while the camera pulls back.
  unfurl(tl, i, wide, look) {
    const rt = world.shrines[i]
    const cfg = SHRINES[i]
    tl.call(() => {
      audio.press()
      audio.rumble(2.6)
      audio.doorGrind(2.4)
    }, null, 0)
    tl.to(rt, { pressed: 1, duration: 0.1, yoyo: true, repeat: 1 }, 0)
    tl.to(rt, { unfurl: 1, duration: 2.8, ease: 'power2.out' }, 0.15)
    tl.to(cam, { shake: 0.12, duration: 0.4, yoyo: true, repeat: 3 }, 0.2)
    tl.add(camTo(toWorld(i, wide), toWorld(i, look), 2.9, 'power2.inOut'), 0.1)
    const kt = toWorld(i, [0, 1.4, -0.3])
    const kf = toWorld(i, cfg.team ? [0, 8, 5] : [0, 7.5, 3.5])
    tl.to(world.hall.keyTarget, { x: kt.x, y: kt.y, z: kt.z, duration: 2 }, 0.4)
    tl.to(world.hall.keyFrom, { x: kf.x, y: kf.y, z: kf.z, duration: 2 }, 0.4)
    tl.to(world.hall, { keyOn: 1, duration: 1.5 }, 0.6)
    return 3.0
  },

  destroy(tl, i, at, big = false) {
    const rt = world.shrines[i]
    const cfg = SHRINES[i]
    const back = cfg.team ? [0, 2.8, 10.5] : [0, 2.05, 5.2]
    tl.add(camTo(toWorld(i, back), toWorld(i, [0, 1.6, 0]), 1.6), at)
    tl.call(() => {
      audio.zap()
      audio.burn(big ? 4.5 : 3.2)
      audio.rumble(big ? 4 : 3)
    }, null, at + 0.3)
    tl.to(rt, { burn: 1, duration: big ? 4.5 : 3.4, ease: 'power1.in' }, at + 0.3)
    tl.to(cam, { shake: big ? 0.45 : 0.25, duration: 0.5, yoyo: true, repeat: big ? 7 : 5 }, at + 0.5)
    tl.to(world.hall, { keyOn: 0.25, holoOn: 0, duration: 2 }, at + 1.4)
    tl.to(rt, { token: 1, duration: 1.6, ease: 'power2.in' }, '>-0.6')
    tl.call(() => {
      rt.done = true
    })
  },

  async runShrine(i) {
    const cfg = SHRINES[i]
    const rt = world.shrines[i]
    await this.approach(i)
    const D = cfg.holoDuration || 6.2
    const tl = gsap.timeline()
    const U = this.unfurl(tl, i, [0, 2.1, 5.0], [0, 2.0, -0.3])
    // the reconstruction
    tl.call(() => audio.holoOn(), null, U)
    tl.to(world.hall, { holoOn: 1, duration: 0.6 }, U)
    tl.add(camTo(toWorld(i, [0.2, 2.15, 2.7]), toWorld(i, [0, 1.55, 0]), 1.8), U - 0.2)
    tl.to(rt, { holo: 1, duration: D, ease: 'none' }, U + 0.2)
    tl.call(() => caption(cfg.line, 'record'), null, U + 0.6)
    tl.call(() => audio.glitch(), null, U + 0.2 + D * 0.66)
    tl.call(() => caption(null), null, U + D - 0.2)
    // the relic performs
    const T = U + 0.2 + D
    tl.add(camTo(toWorld(i, [0.1, 2.4, 4.4]), toWorld(i, [-0.2, 2.0, -0.4]), 1.4), T - 0.3)
    tl.call(() => audio.whoosh(1.2), null, T + 0.3)
    tl.call(() => audio.metalHit(), null, T + 1.6)
    tl.to(rt, { transform: 1, duration: 3.2, ease: 'none' }, T)
    this.destroy(tl, i, T + 3.1)
    await run(tl)
  },

  async runTeamShrine(i) {
    const cfg = SHRINES[i]
    const rt = world.shrines[i]
    await this.approach(i)
    const D = cfg.holoDuration
    const tl = gsap.timeline()
    const U = this.unfurl(tl, i, [0, 2.4, 9.2], [0, 1.9, 0])
    tl.to(world.hall, { holoOn: 1, duration: 0.6 }, U)
    tl.to(rt, { holo: 1, duration: D, ease: 'none' }, U + 0.2)
    cfg.members.forEach((m, k) => {
      const [a] = FF_WINDOWS[k]
      const at = U + 0.2 + a * D
      const x = FF_MEMBER_X[k]
      tl.add(camTo(toWorld(i, [x * 0.9, 1.75, 2.6]), toWorld(i, [x, 1.45, 0.1]), 1.4), Math.max(U, at - 0.5))
      tl.call(() => {
        caption(m.name, 'shrine')
        audio.holoOn()
      }, null, at)
      tl.call(() => audio.glitch(), null, at + D * 0.12)
    })
    const M = U + 0.2 + 0.88 * D
    tl.call(() => caption(null), null, M - 0.2)
    tl.add(camTo(toWorld(i, [0, 2.2, 8.4]), toWorld(i, [0, 1.6, 0]), 1.6), M - 0.4)
    tl.call(() => {
      audio.glitch()
      audio.alarm()
    }, null, M)
    tl.to(rt, { malfunction: 1, duration: 2.4, ease: 'power1.in' }, M)
    const T = M + 2.6
    tl.call(() => audio.whoosh(1), null, T + 0.4)
    tl.to(rt, { transform: 1, duration: 3, ease: 'none' }, T)
    this.destroy(tl, i, T + 3, true)
    await run(tl)
  },

  async runCollapse() {
    setS({ phase: 'collapse', shrineIndex: -1 })
    const tl = gsap.timeline()
    const h = world.hall
    tl.call(() => {
      audio.intensity(0.6)
      audio.alarm()
      audio.rumble(5)
    }, null, 0)
    tl.add(camTo(V(FF_X - 7.5, 2.0, 0), V(FF_X + 4.5, 2.6, 0), 4.5), 0)
    tl.to(h, { collapse: 0.4, duration: 7, ease: 'none' }, 0)
    tl.to(cam, { shake: 0.3, duration: 2 }, 0.5)
    tl.call(() => caption('THERE IS NOTHING LEFT TO SAVE.'), null, 1.0)
    tl.call(() => audio.wail(), null, 2.5)
    tl.call(() => caption(null), null, 5.2)
    tl.call(() => {
      audio.intensity(1)
      audio.riser(6)
      audio.wail()
    }, null, 5.2)
    tl.add(camTo(V(FF_X + 6.5, 2.6, 0), V(V_MASK.x, V_MASK.y, 0), 7, 'power1.inOut'), 6.5)
    tl.to(h, { collapse: 1, duration: 7.5, ease: 'power1.in' }, 7)
    tl.to(cam, { shake: 0.6, duration: 3 }, 7)
    tl.to(world.env, { fog: 0.012, intensity: 0.5, ambient: 0.05, duration: 5 }, 10)
    tl.call(() => audio.boom(), null, 13.5)
    tl.to(cam, { shake: 0.05, duration: 2 }, 13.5)
    tl.call(() => {
      world.mask.visible = true
    }, null, 11)
    tl.to(world.mask, { assemble: 1, duration: 7, ease: 'power1.inOut' }, 11.2)
    for (let k = 0; k < 14; k++) tl.call(() => audio.metalHit(), null, 12 + k * 0.42)
    tl.call(() => {
      h.visible = false
    }, null, 15)
    tl.add(camTo(V(V_MASK.x - 8.5, V_MASK.y + 0.1, 0), V(V_MASK.x, V_MASK.y + 0.1, 0), 6, 'power2.out'), 14)
    tl.call(() => audio.doomChord(8), null, 17.5)
    tl.to(world.mask, { glow: 1, duration: 1.6 }, 18)
    tl.call(() => caption('RSVP.', 'final'), null, 19)
    tl.call(() => caption(null), null, 22)
    tl.call(() => caption('SIGN YOUR NAME… IF YOU DARE.'), null, 25.6)
    tl.add(camTo(V(V_MASK.x - 5.5, V_MASK.y + 0.1, 0), V(V_MASK.x, V_MASK.y + 0.1, 0), 3.5), 25.6)
    tl.call(() => caption(null), null, 29)
    tl.call(() => {
      audio.clank(0.8)
      audio.doorGrind(2.5)
    }, null, 29.2)
    tl.to(world.mask, { open: 1, duration: 2.8, ease: 'power3.inOut' }, 29.2)
    tl.add(camTo(V(V_MASK.x - 0.6, V_MASK.y + 0.1, 0), V(V_MASK.x + 2, V_MASK.y + 0.1, 0), 2.6, 'power2.in'), 31)
    tl.to(cam, { fovKick: -6, duration: 2.6 }, 31)
    tl.call(() => {
      audio.intensity(0.2)
      setS({ phase: 'rsvp', rsvp: true, rsvpStage: 'form', skip: false })
    }, null, 33.2)
    await run(tl)
  },

  async submitRsvp(data, sigCanvas) {
    const payload = {
      name: data.name.trim(),
      attending: data.attend,
      message: data.msg.trim(),
      signature: sigCanvas.toDataURL('image/png'),
    }
    try {
      localStorage.setItem('doom-rsvp', JSON.stringify({ ...payload, at: Date.now() }))
    } catch {}
    const endpoint = process.env.NEXT_PUBLIC_RSVP_ENDPOINT || '/api/rsvp'
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})

    audio.stamp()
    audio.doomChord(4)
    setS({
      rsvpStage: 'sealed',
      ack: data.attend === 'no' ? 'DOOM ACCEPTS YOUR RESPONSE. HE WILL REMEMBER IT.' : 'YOUR PRESENCE IS ACKNOWLEDGED. YOU WILL BE COUNTED AMONG THE WITNESSES.',
    })
    await new Promise((r) => setTimeout(r, 3600))

    const { canvas, sig } = composeParchment(payload, sigCanvas, data.attend)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    world.page.texture = tex
    world.page.aspect = canvas.width / canvas.height
    world.page.sig = sig
    world.page.visible = true
    world.page.burn = 0
    world.page.fade = 0
    const tl = gsap.timeline()
    tl.to(world.page, { fade: 1, duration: 0.5 }, 0)
    tl.call(() => {
      setS({ rsvp: false, phase: 'burn' })
      world.mask.visible = false
    }, null, 0.45)
    tl.to(world.env, { void: 0, duration: 4 }, 0.5)
    tl.call(() => audio.burn(7), null, 0.9)
    tl.to(world.page, { burn: 1, duration: 7, ease: 'power1.in' }, 0.9)
    tl.call(() => audio.fadeOut(5), null, 6)
    tl.call(() => caption('ALL THINGS END IN DOOM.', 'final'), null, 8.6)
    tl.call(() => setS({ ended: true, prompt: { label: 'WITNESS AGAIN', action: () => window.location.reload() } }), null, 12.5)
    await run(tl)
  },
}
