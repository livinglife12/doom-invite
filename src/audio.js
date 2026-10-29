// Fully procedural WebAudio sound design: drone score, metallic ambience and every SFX cue.
// No audio files to license or load. Replace individual methods with sampled sounds if desired.
class DoomAudio {
  ctx = null
  enabled = true
  timers = []

  // Build the graph and buffers ahead of time (a context may be created suspended without a gesture),
  // so the first click only has to resume it.
  prepare() {
    if (this.ctx) return
    this.build()
  }

  init() {
    if (!this.ctx) this.build()
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  }

  build() {
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return
    this.ctx = new C()
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.enabled ? 0.9 : 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.master.connect(comp)
    comp.connect(ctx.destination)
    this.verb = ctx.createConvolver()
    this.verb.buffer = this.impulse(2.4)
    const vg = ctx.createGain()
    vg.gain.value = 0.55
    this.verb.connect(vg)
    vg.connect(this.master)
    this.noiseBuf = this.makeNoise(4)
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0
  }

  impulse(sec) {
    const ctx = this.ctx
    const len = ctx.sampleRate * sec
    const b = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    return b
  }

  makeNoise(sec) {
    const ctx = this.ctx
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return b
  }

  out(node, wet = 0.3, dry = 1) {
    if (dry) {
      const g = this.ctx.createGain()
      g.gain.value = dry
      node.connect(g)
      g.connect(this.master)
    }
    if (wet) {
      const g = this.ctx.createGain()
      g.gain.value = wet
      node.connect(g)
      g.connect(this.verb)
    }
  }

  setEnabled(on) {
    this.enabled = on
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.t, 0.15)
  }

  env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d)
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = null, wet = 0.3, attack = 0.005, delay = 0, dry = 1 } = {}) {
    if (!this.ctx) return
    const t0 = this.t + delay
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur)
    const g = this.ctx.createGain()
    this.env(g, t0, attack, vol, dur)
    o.connect(g)
    this.out(g, wet, dry)
    o.start(t0)
    o.stop(t0 + attack + dur + 0.05)
  }

  noise(dur, { type = 'bandpass', freq = 1000, q = 1, vol = 0.3, sweep = null, wet = 0.3, attack = 0.005, delay = 0, dry = 1 } = {}) {
    if (!this.ctx) return
    const t0 = this.t + delay
    const s = this.ctx.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t0)
    f.Q.value = q
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur)
    const g = this.ctx.createGain()
    this.env(g, t0, attack, vol, dur)
    s.connect(f)
    f.connect(g)
    this.out(g, wet, dry)
    s.start(t0, Math.random() * 3)
    s.stop(t0 + attack + dur + 0.05)
  }

  // --- score ---
  drone() {
    if (!this.ctx || this.droneGain) return
    const ctx = this.ctx
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.0001
    this.droneGain.gain.exponentialRampToValueAtTime(0.16, this.t + 7)
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = 180
    this.droneFilter.Q.value = 3
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.06
    const lg = ctx.createGain()
    lg.gain.value = 90
    lfo.connect(lg)
    lg.connect(this.droneFilter.frequency)
    lfo.start()
    for (const [f, type, v] of [[55, 'sawtooth', 0.5], [55.35, 'sawtooth', 0.5], [27.5, 'sine', 0.9], [82.4, 'triangle', 0.15]]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.value = v
      o.connect(g)
      g.connect(this.droneFilter)
      o.start()
    }
    // electrical hum with tremolo
    const hum = ctx.createOscillator()
    hum.frequency.value = 100
    const hg = ctx.createGain()
    hg.gain.value = 0.025
    const trem = ctx.createOscillator()
    trem.frequency.value = 7
    const tg = ctx.createGain()
    tg.gain.value = 0.015
    trem.connect(tg)
    tg.connect(hg.gain)
    hum.connect(hg)
    hg.connect(this.droneFilter)
    hum.start()
    trem.start()
    this.droneFilter.connect(this.droneGain)
    this.out(this.droneGain, 0.4)
    this.ambience()
  }

  intensity(x) {
    if (!this.droneGain) return
    this.droneFilter.frequency.setTargetAtTime(180 + x * 1100, this.t, 0.8)
    this.droneGain.gain.setTargetAtTime(0.16 + x * 0.16, this.t, 0.8)
  }

  fadeOut(sec = 4) {
    if (!this.droneGain) return
    this.droneGain.gain.setTargetAtTime(0.0001, this.t, sec / 4)
    this.stopAmbience()
  }

  ambience() {
    const loop = () => {
      if (!this.ctx) return
      const r = Math.random()
      if (r < 0.4) this.distantClang()
      else if (r < 0.7) this.interference()
      else this.noise(2.5, { type: 'lowpass', freq: 200, vol: 0.12, attack: 1, wet: 0.8, dry: 0.2 })
      this.ambTimer = setTimeout(loop, 2500 + Math.random() * 4500)
    }
    this.ambTimer = setTimeout(loop, 2500)
  }

  stopAmbience() {
    clearTimeout(this.ambTimer)
  }

  distantClang() {
    const f = 300 + Math.random() * 500
    for (const m of [1, 2.76, 5.4]) this.tone(f * m, 1.6, { vol: 0.03 / m, wet: 1, dry: 0.05 })
    this.noise(0.2, { freq: 1500, q: 4, vol: 0.05, wet: 1, dry: 0.05 })
  }

  interference() {
    for (let i = 0; i < 6; i++) this.noise(0.03 + Math.random() * 0.05, { type: 'highpass', freq: 3000, vol: 0.05, delay: i * 0.07 + Math.random() * 0.05, wet: 0.2 })
  }

  // --- cues ---
  activation() {
    this.tone(40, 2.5, { type: 'sawtooth', vol: 0.12, slide: 90, attack: 1.5, wet: 0.6 })
    this.clank(0.6, 1.8)
  }

  click() {
    this.noise(0.03, { type: 'highpass', freq: 2500, vol: 0.4, wet: 0.1 })
    this.tone(1800, 0.04, { type: 'square', vol: 0.05, wet: 0.1 })
  }

  clank(vol = 0.6, delay = 0) {
    this.noise(0.35, { freq: 1800, q: 6, vol: vol * 0.7, delay })
    this.tone(95, 0.45, { vol, slide: 45, delay })
    for (const f of [340, 789, 1213]) this.tone(f, 0.8, { vol: vol * 0.05, delay, wet: 0.6 })
  }

  metalHit() {
    const f = 180 + Math.random() * 240
    for (const m of [1, 2.3, 3.9]) this.tone(f * m, 0.9, { vol: 0.07 / m, wet: 0.6 })
    this.noise(0.08, { freq: 2500, q: 3, vol: 0.12 })
  }

  sparks(dur = 1) {
    for (let i = 0; i < dur * 6; i++)
      this.noise(0.02 + Math.random() * 0.04, { type: 'highpass', freq: 4000 + Math.random() * 3000, vol: 0.12 + Math.random() * 0.15, delay: Math.random() * dur, wet: 0.2 })
  }

  startCharge() {
    if (!this.ctx || this.chargeOsc) return
    this.chargeOsc = this.ctx.createOscillator()
    this.chargeOsc.type = 'sawtooth'
    this.chargeGain = this.ctx.createGain()
    this.chargeGain.gain.value = 0
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    f.Q.value = 2
    this.chargeOsc.connect(f)
    f.connect(this.chargeGain)
    this.out(this.chargeGain, 0.3)
    this.chargeOsc.start()
  }

  charge(level) {
    if (!this.chargeOsc) this.startCharge()
    if (!this.chargeOsc) return
    this.chargeOsc.frequency.setTargetAtTime(90 + level * 420, this.t, 0.05)
    this.chargeGain.gain.setTargetAtTime(level * 0.09, this.t, 0.05)
  }

  boom() {
    this.tone(70, 2.2, { vol: 0.9, slide: 28, wet: 0.6 })
    this.noise(1.6, { type: 'lowpass', freq: 400, sweep: 60, vol: 0.6, wet: 0.6 })
  }

  rumble(dur = 3) {
    this.noise(dur, { type: 'lowpass', freq: 140, vol: 0.55, attack: 0.4, wet: 0.5 })
    this.tone(38, dur, { vol: 0.3, attack: 0.5, wet: 0.3 })
  }

  doorGrind(dur = 3) {
    this.noise(dur, { freq: 220, q: 5, sweep: 160, vol: 0.25, attack: 0.3, wet: 0.6 })
    this.tone(48, dur, { type: 'sawtooth', vol: 0.08, slide: 40, attack: 0.3, wet: 0.5 })
  }

  whoosh(dur = 1) {
    this.noise(dur, { freq: 300, q: 1.2, sweep: 3000, vol: 0.3, attack: dur * 0.5, wet: 0.4 })
  }

  press() {
    this.click()
    this.tone(660, 0.25, { type: 'triangle', vol: 0.12 })
    this.tone(990, 0.4, { type: 'sine', vol: 0.06, delay: 0.05 })
  }

  btnDown() {
    this.noise(0.025, { type: 'bandpass', freq: 1800, q: 2, vol: 0.35, wet: 0.05 })
    this.tone(140, 0.08, { type: 'sine', vol: 0.25, slide: 90, wet: 0.05 })
  }

  btnUp() {
    this.noise(0.02, { type: 'highpass', freq: 3500, vol: 0.25, wet: 0.05 })
    this.tone(880, 0.3, { type: 'triangle', vol: 0.08, wet: 0.3 })
    this.tone(1320, 0.45, { type: 'sine', vol: 0.05, delay: 0.06, wet: 0.5 })
  }

  // --- old television ---
  tvClick() {
    this.noise(0.05, { type: 'bandpass', freq: 900, q: 3, vol: 0.6, wet: 0.1 })
    this.tone(70, 0.18, { type: 'square', vol: 0.12, slide: 40, wet: 0.05 })
  }

  crtOn() {
    // degauss "bwong" and the picture-tube whine
    this.tone(55, 1.2, { type: 'sine', vol: 0.45, slide: 38, wet: 0.3 })
    this.noise(0.6, { type: 'lowpass', freq: 300, vol: 0.25, wet: 0.2 })
    this.tone(7800, 6, { type: 'sine', vol: 0.006, attack: 0.4, wet: 0 })
  }

  staticOn(level = 0.3) {
    if (!this.ctx) return
    if (!this.staticGain) {
      const s = this.ctx.createBufferSource()
      s.buffer = this.noiseBuf
      s.loop = true
      const f = this.ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 2400
      f.Q.value = 0.4
      this.staticGain = this.ctx.createGain()
      this.staticGain.gain.value = 0
      s.connect(f)
      f.connect(this.staticGain)
      this.out(this.staticGain, 0.15)
      s.start()
    }
    this.staticGain.gain.setTargetAtTime(level * 0.35, this.t, 0.05)
  }

  holoOn() {
    this.tone(180, 0.7, { type: 'sawtooth', vol: 0.05, slide: 900, wet: 0.4 })
    for (let i = 0; i < 4; i++) this.tone(1200 + i * 330, 0.6, { vol: 0.025, delay: 0.25 + i * 0.06, wet: 0.6 })
  }

  glitch() {
    for (let i = 0; i < 5; i++) this.tone(200 + Math.random() * 1600, 0.04, { type: 'square', vol: 0.04, delay: i * 0.05, wet: 0.1 })
  }

  zap() {
    this.noise(0.25, { type: 'highpass', freq: 1800, sweep: 600, vol: 0.25, wet: 0.4 })
    this.tone(1400, 0.25, { type: 'sawtooth', vol: 0.05, slide: 200 })
  }

  shatter() {
    for (let i = 0; i < 10; i++) this.tone(2000 + Math.random() * 4000, 0.3, { vol: 0.03, delay: Math.random() * 0.25, wet: 0.6 })
    this.noise(0.4, { type: 'highpass', freq: 3000, vol: 0.2 })
  }

  burn(dur = 3) {
    this.noise(dur, { freq: 900, q: 0.5, vol: 0.25, attack: 0.5, wet: 0.4 })
    this.noise(dur, { type: 'lowpass', freq: 220, vol: 0.35, attack: 0.6, wet: 0.4 })
    for (let i = 0; i < dur * 4; i++) this.noise(0.015, { type: 'highpass', freq: 2500, vol: 0.18 * Math.random(), delay: Math.random() * dur, wet: 0.1 })
  }

  riser(dur = 4) {
    this.tone(60, dur, { type: 'sawtooth', vol: 0.1, slide: 240, attack: dur * 0.8, wet: 0.5 })
    this.noise(dur, { freq: 200, q: 2, sweep: 4000, vol: 0.15, attack: dur * 0.9, wet: 0.5 })
  }

  alarm() {
    for (let i = 0; i < 4; i++) {
      this.tone(620, 0.35, { vol: 0.04, delay: i * 0.8, wet: 0.9, dry: 0.15 })
      this.tone(470, 0.35, { vol: 0.04, delay: i * 0.8 + 0.4, wet: 0.9, dry: 0.15 })
    }
  }

  wail() {
    this.noise(2.4, { freq: 700, q: 9, sweep: 380, vol: 0.12, attack: 0.5, wet: 1, dry: 0.05 })
  }

  doomChord(dur = 6) {
    for (const f of [55, 65.4, 82.4, 110, 130.8]) this.tone(f, dur, { type: 'sawtooth', vol: 0.05, attack: 1.8, wet: 0.7 })
  }

  stamp() {
    this.tone(80, 0.5, { vol: 0.8, slide: 40 })
    this.noise(0.12, { type: 'lowpass', freq: 900, vol: 0.5 })
  }
}

export const audio = new DoomAudio()
