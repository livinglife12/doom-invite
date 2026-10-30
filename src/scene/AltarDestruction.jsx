import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeBolt, makeEmitter } from '../lib/particles'
import { particleScale } from '../lib/quality'
import { smooth, rng } from '../lib/util'

// The defeat is an extension of each hero's power, with its own motion and material.
// rt.burn remains the director's single timeline, including when the viewer skips.
export const DEFEATS = {
  strange: { color: '#ffac43', dark: '#903a15', mode: 'portal', start: 0.12 },
  loki: { color: '#ffe29a', dark: '#4e9b54', mode: 'illusion', start: 0.19 },
  thor: { color: '#b5e8ff', dark: '#448ac0', mode: 'storm', start: 0.04 },
  ironman: { color: '#ff7352', dark: '#8fbce0', mode: 'emp', start: 0.1 },
  cap: { color: '#c6e7ff', dark: '#b74348', mode: 'fracture', start: 0.18 },
  hulk: { color: '#b5ff70', dark: '#667b3d', mode: 'impact', start: 0.09 },
  panther: { color: '#c08aff', dark: '#7134ae', mode: 'kinetic', start: 0.15 },
  spider: { color: '#edf4ff', dark: '#d4484c', mode: 'web', start: 0.22 },
  ff: { color: '#7dcfff', dark: '#41659c', mode: 'four', start: 0.08 },
}

function energyMaterial(color, shell = false) {
  const opacity = { value: 0 }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: opacity, uProgress: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main(){ vUv = uv; vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-p.xyz); gl_Position = projectionMatrix * p; }`,
    fragmentShader: shell ? `uniform vec3 uColor; uniform float uOpacity, uProgress; varying vec2 vUv; varying vec3 vNormal, vView;
      void main(){ float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
        float latitude = pow(0.5 + 0.5 * sin(vUv.y * 62.0 - uProgress * 16.0), 7.0);
        gl_FragColor = vec4(uColor * (0.7 + rim * 1.1), (rim * 0.65 + latitude * 0.055) * uOpacity); }`
      : `uniform vec3 uColor; uniform float uOpacity, uProgress; varying vec2 vUv;
      void main(){ float d = abs(vUv.y - 0.5) * 2.0;
        float edge = 1.0 - smoothstep(0.2, 1.0, d);
        float tip = smoothstep(0.0, 0.04, vUv.x) * (1.0 - smoothstep(0.96, 1.0, vUv.x));
        float flow = 0.8 + 0.2 * sin(vUv.x * 18.0 - uProgress * 12.0);
        gl_FragColor = vec4(uColor * (0.7 + pow(1.0 - d, 5.0) * 0.65), edge * tip * flow * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  })
  Object.defineProperty(mat, 'opacity', { get: () => opacity.value, set: value => { opacity.value = value }, configurable: true })
  return mat
}

// Flat ribbons, glyph strokes and open arcs batch into one mesh for each layer.
// Unlike a torus, these remain legible as interrupted energy surfaces at distance.
function authoredBand(mode, layer, low) {
  const positions = [], uvs = [], indices = []
  function quad(ax, ay, bx, by, width) {
    const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy) || 1
    const nx = -dy / length * width, ny = dx / length * width, base = positions.length / 3
    positions.push(ax + nx, ay + ny, 0, ax - nx, ay - ny, 0, bx + nx, by + ny, 0, bx - nx, by - ny, 0)
    uvs.push(0, 0, 0, 1, 1, 0, 1, 1); indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  }
  function arc(start, sweep, radius = 1, thickness = 0.025) {
    const n = Math.max(4, Math.ceil(Math.abs(sweep) * (low ? 8 : 15))), base = positions.length / 3
    for (let k = 0; k <= n; k++) {
      const a = start + sweep * k / n
      for (const sign of [-1, 1]) { const r = radius + thickness * sign; positions.push(Math.cos(a) * r, Math.sin(a) * r, 0); uvs.push(k / n, (sign + 1) / 2) }
      if (k < n) { const q = base + k * 2; indices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2) }
    }
  }
  const tau = Math.PI * 2
  if (mode === 'portal') {
    arc(0, tau, 1, 0.014); arc(0.1, tau - 0.2, 0.88, 0.009)
    const glyphs = low ? 12 : 20
    for (let k = 0; k < glyphs; k++) {
      const a = k / glyphs * tau
      const x = Math.cos(a), y = Math.sin(a), tx = -y, ty = x
      quad(x * 1.04, y * 1.04, x * 1.15, y * 1.15, 0.009)
      quad(x * 1.15, y * 1.15, x * 1.09 + tx * 0.055, y * 1.09 + ty * 0.055, 0.008)
      if (k % 2 === layer % 2) quad(x * 1.04 - tx * 0.045, y * 1.04 - ty * 0.045, x * 1.09 + tx * 0.04, y * 1.09 + ty * 0.04, 0.008)
    }
  } else if (mode === 'illusion') {
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2
      quad(Math.cos(a), Math.sin(a), Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2), 0.012)
      quad(Math.cos(a) * 0.65, Math.sin(a) * 0.65, Math.cos(a + Math.PI / 2) * 0.65, Math.sin(a + Math.PI / 2) * 0.65, 0.008)
    }
  } else if (mode === 'emp') {
    for (let k = 0; k < 3; k++) { arc(k * tau / 3 + layer * 0.2, tau / 3 - 0.16, 1, 0.065); arc(k * tau / 3 + 0.22, tau / 3 - 0.42, 0.85, 0.009) }
  } else if (mode === 'kinetic') {
    for (let k = 0; k < 3; k++) { arc(k * tau / 3, 1.25, 1, 0.035); arc(k * tau / 3 + 0.28, 0.7, 0.9, 0.009) }
  } else if (mode === 'fracture') {
    arc(layer * 1.3, 1.8, 1, 0.025)
    for (let k = 0; k < 3; k++) { const a = layer * 1.3 + k * 0.7; quad(Math.cos(a) * 0.8, Math.sin(a) * 0.8, Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0.012) }
  } else if (mode === 'impact') {
    for (let k = 0; k < (low ? 6 : 10); k++) {
      const a = k * tau / (low ? 6 : 10), bend = a + (k % 2 ? 0.14 : -0.14)
      quad(Math.cos(a) * 0.38, Math.sin(a) * 0.38, Math.cos(bend) * 0.72, Math.sin(bend) * 0.72, 0.012)
      quad(Math.cos(bend) * 0.72, Math.sin(bend) * 0.72, Math.cos(a) * 1.13, Math.sin(a) * 1.13, 0.008)
    }
    arc(0, tau, 1, 0.018)
  } else {
    const segments = mode === 'storm' ? 7 : 4
    for (let k = 0; k < segments; k++) arc(k * tau / segments + layer * 0.17, tau / segments * 0.75, 1, mode === 'storm' ? 0.02 : 0.035)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function createFX(hero, width, quality) {
  const profile = DEFEATS[hero] || DEFEATS.strange
  const ps = particleScale(quality)
  const random = rng(817 + Object.keys(DEFEATS).indexOf(hero) * 43)
  const root = new THREE.Group()
  root.name = `${hero}-defeat`
  root.visible = false
  const shardGeo = hero === 'hulk' || hero === 'thor' ? new THREE.IcosahedronGeometry(1, 0) : hero === 'loki' ? new THREE.OctahedronGeometry(1, 0) : hero === 'panther' ? new THREE.TetrahedronGeometry(1, 0) : new THREE.BoxGeometry(1, 0.7, 0.18)
  const shardMat = new THREE.MeshStandardMaterial({ color: profile.dark, emissive: profile.color, emissiveIntensity: 0.3, roughness: hero === 'hulk' ? 0.92 : 0.3, metalness: hero === 'hulk' ? 0.06 : 0.7, transparent: true, opacity: 1, flatShading: true, side: THREE.DoubleSide })
  const count = Math.floor((hero === 'ff' ? 64 : hero === 'spider' ? 16 : 36) * ps)
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, count)
  shards.frustumCulled = false
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  root.add(shards)
  const debris = Array.from({ length: count }, (_, k) => ({
    x: (random() - 0.5) * width * 2.9,
    y: 0.3 + random() * 4,
    z: -1.05 + random() * 1.3,
    a: random() * Math.PI * 2,
    speed: 0.7 + random() * 1.8,
    size: (hero === 'hulk' ? 0.065 : 0.035) + random() * (hero === 'hulk' ? 0.16 : 0.1),
    delay: (k % 5) * 0.045,
    twist: (random() - 0.5) * 10,
  }))
  const palette = ['#80bcff', '#daf8ff', '#ff933e', '#d49a65']
  const rings = Array.from({ length: hero === 'ff' ? 4 : 3 }, (_, k) => {
    const mat = energyMaterial(hero === 'ff' ? palette[k] : profile.color)
    const mesh = new THREE.Mesh(authoredBand(profile.mode, k, quality === 'low'), mat)
    mesh.position.set(hero === 'ff' ? [-3.3, -1.1, 1.1, 3.3][k] : 0, 1.9, -0.3)
    root.add(mesh)
    return mesh
  })
  const waveMat = energyMaterial(profile.color)
  const wave = new THREE.Mesh(authoredBand('emp', 0, quality === 'low'), waveMat)
  wave.rotation.x = -Math.PI / 2
  wave.position.set(0, 0.16, -0.2)
  root.add(wave)
  const coreMat = energyMaterial(profile.color, true)
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, quality === 'low' ? 16 : 24, 12), coreMat)
  core.position.set(0, 1.9, -0.3)
  core.visible = hero === 'panther' || hero === 'ironman'
  root.add(core)
  const bolts = Array.from({ length: hero === 'thor' ? quality === 'low' ? 2 : 3 : hero === 'ironman' ? 2 : 0 }, () => makeBolt(profile.color, 18, hero === 'thor' ? 0.07 : 0.025))
  bolts.forEach(b => root.add(b.line))
  // Eight taut silk strands visibly snap at different times, rather than a colour-swapped bolt.
  const webSteps = 8
  const webPos = new Float32Array(8 * webSteps * 2 * 3), webUv = new Float32Array(8 * webSteps * 2 * 2), webIndex = []
  for (let k = 0; k < 8; k++) for (let j = 0; j < webSteps; j++) {
    const v = (k * webSteps + j) * 2
    webUv.set([j / (webSteps - 1), 0, j / (webSteps - 1), 1], v * 2)
    if (j < webSteps - 1) webIndex.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
  }
  const webGeo = new THREE.BufferGeometry()
  webGeo.setAttribute('position', new THREE.BufferAttribute(webPos, 3).setUsage(THREE.DynamicDrawUsage))
  webGeo.setAttribute('uv', new THREE.BufferAttribute(webUv, 2)); webGeo.setIndex(webIndex)
  const webMat = energyMaterial(profile.color)
  const webs = new THREE.Mesh(webGeo, webMat)
  webs.frustumCulled = false
  webs.visible = hero === 'spider'
  root.add(webs)
  const motes = makeEmitter(Math.floor(140 * ps), { color: profile.color, colorEnd: profile.dark, size: hero === 'hulk' ? 0.075 : 0.032, sizeEnd: 0.35, additive: hero !== 'hulk', soft: 1.6, opacity: 0.75 })
  root.add(motes.points)
  const dust = makeEmitter(Math.floor(24 * ps), { color: '#77776e', colorEnd: '#242721', size: 0.35, sizeEnd: 2.3, additive: false, soft: 2.2, opacity: 0.32 })
  root.add(dust.points)
  return { root, profile, shards, shardMat, debris, rings, wave, core, bolts, webs, webPos, webSteps, motes, dust, width, ps, lastBurn: 0, carry: 0, reduced: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    dummy: new THREE.Object3D(), a: new THREE.Vector3(), b: new THREE.Vector3(),
    motePhysics: { gravity: hero === 'hulk' ? -2.4 : hero === 'ironman' ? -0.8 : 0, drag: 0.5 },
    dustPhysics: { drag: 0.3, turbulence: 0.1, t: 0 },
    dispose() {
      const geos = new Set(), mats = new Set()
      root.traverse(o => { if (o.geometry) geos.add(o.geometry); if (o.material) mats.add(o.material) })
      geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose())
    },
  }
}

function topple(g, k, b, mode, reduced) {
  if (!g) return
  const base = g.userData.defeatBase || (g.userData.defeatBase = { p: g.position.clone(), r: g.rotation.clone() })
  g.position.copy(base.p)
  g.rotation.copy(base.r)
  g.scale.set(1, 1, 1)
  if (b <= 0) return
  const sign = k % 2 ? -1 : 1
  const f = smooth(0.12 + (k % 4) * 0.04, 0.96, b)
  if (reduced) { g.position.y -= f * 0.45; return }
  if (mode === 'portal') {
    g.position.y -= f * f * 3.4
    g.position.x = base.p.x * (1 - f * 0.8)
    g.rotation.y += sign * f * 1.5
    g.scale.setScalar(1 - f * 0.65)
  } else if (mode === 'illusion') {
    g.position.x += Math.sin(f * Math.PI) * sign * 0.9
    g.position.y += f * 1.7
    g.rotation.y += sign * f * 2.8
    g.scale.x = 1 - f * 0.92
  } else if (mode === 'storm') {
    g.position.x += sign * f * f * 1.6
    g.position.y -= f * f * 2.3
    g.rotation.z += sign * f * 0.85
    g.rotation.x -= f * 0.3
  } else if (mode === 'emp') {
    const drop = smooth(0.27 + k * 0.025, 0.85, b)
    g.position.y -= drop * drop * (2.1 + k * 0.15)
    g.rotation.x += sign * drop * 0.35
    g.rotation.z += Math.sin(b * 55 + k) * (1 - f) * f * 0.06
  } else if (mode === 'fracture') {
    g.position.x += sign * f * 2.1
    g.position.y -= f * f * 1.4
    g.rotation.z += sign * f * 0.55
  } else if (mode === 'impact') {
    const rebound = Math.sin(smooth(0.1, 0.6, b) * Math.PI)
    g.position.y += rebound * 0.8 - f * f * 3
    g.position.x += sign * f * 1.4
    g.rotation.z += sign * f * 0.8
  } else if (mode === 'kinetic') {
    const burst = smooth(0.16, 0.42, b)
    const pull = smooth(0.55, 1, b)
    g.position.x += sign * burst * (1 - pull) * 2
    g.position.y += burst * 0.7 - pull * 3
    g.rotation.y += sign * f * 0.8
    g.rotation.z += sign * burst * 0.35
  } else if (mode === 'web') {
    const snap = smooth(0.23 + k * 0.065, 0.5 + k * 0.065, b)
    g.position.z -= snap * 2
    g.position.y -= snap * snap * 2
    g.rotation.x += snap * 0.85
    g.rotation.z += sign * snap * 0.4
  } else {
    const f4 = smooth(0.1 + (k % 4) * 0.13, 0.85 + (k % 4) * 0.04, b)
    g.position.x += sign * Math.sin(f4 * Math.PI) * 1.4
    g.position.y -= f4 * f4 * 3
    g.rotation.z += sign * f4 * 0.75
    g.rotation.y += f4 * sign * 0.5
  }
}

export function useDestruction(rt, burnMats, fallers, width, quality, hero) {
  const fx = useMemo(() => createFX(hero, width, quality), [hero, width, quality])
  useEffect(() => () => fx.dispose(), [fx])
  useFrame((state, rawDt) => {
    const b = Number.isFinite(rt.burn) ? Math.max(0, Math.min(1, rt.burn)) : 0
    if (b === fx.lastBurn && (b === 0 || b >= 0.999)) return
    const dt = Number.isFinite(rawDt) ? Math.max(0, Math.min(rawDt, 0.05)) : 0
    const changed = b !== fx.lastBurn
    if (b < fx.lastBurn || b - fx.lastBurn > 0.2) { fx.motes.clear(); fx.dust.clear(); fx.carry = 0 }
    fx.lastBurn = b
    fx.root.visible = b > 0 && b < 0.999 && !rt.done
    fx.dustPhysics.t = state.clock.elapsedTime
    if (!changed) {
      fx.motes.update(dt, fx.motePhysics); fx.dust.update(dt, fx.dustPhysics)
      return
    }
    const { mode, start, color } = fx.profile
    for (let k = 0; k < burnMats.length; k++) {
      const mat = burnMats[k]
      if (mat.userData.uBurn) {
        // Let the defining event land before the material disappears.
        const offset = mode === 'four' ? (k % 4) * 0.06 : (k % 5) * 0.018
        mat.userData.uBurn.value = b === 1 ? 1 : smooth(start + offset, 0.96 + offset * 0.25, b)
        mat.userData.uBurnEdge?.value.set(color)
      }
    }
    fallers.forEach((r, k) => topple(r.current, k, b, mode, fx.reduced))
    if (!fx.root.visible) { fx.motes.clear(); fx.dust.clear(); return }
    const p = smooth(start, 0.9, b)
    const fade = 1 - smooth(0.7, 0.99, b)
    const movement = fx.reduced ? 0.28 : 1
    fx.rings.forEach((ring, k) => {
      const pulse = smooth(mode === 'four' ? 0.05 + k * 0.13 : 0.02 + k * 0.065, mode === 'four' ? 0.32 + k * 0.13 : 0.55 + k * 0.08, b)
      ring.material.uniforms.uProgress.value = b
      ring.material.opacity = Math.sin(pulse * Math.PI) * fade * (fx.reduced ? 0.3 : mode === 'portal' ? 0.8 : 0.62)
      ring.visible = ring.material.opacity > 0.002 && mode !== 'web'
      ring.rotation.set(0, 0, 0)
      ring.position.y = mode === 'illusion' ? 0.5 + pulse * 4 : 1.9
      if (mode === 'portal') { ring.rotation.z = b * (k % 2 ? -3 : 2) * movement; ring.scale.setScalar(0.4 + (1 - pulse) * (1.15 + k * 0.32)); ring.rotation.y = (k - 1) * 0.14 }
      else if (mode === 'storm' || mode === 'impact') { ring.rotation.x = Math.PI / 2; ring.position.y = 0.22 + k * 0.04; ring.scale.setScalar(0.1 + pulse * (2.8 + k * 0.7) * movement) }
      else if (mode === 'emp') { ring.rotation.x = (k - 1) * 0.65; ring.rotation.y = k * 0.4; ring.rotation.z = k * 1.8; ring.scale.setScalar(0.1 + pulse * 2.1 * movement) }
      else if (mode === 'kinetic') { ring.rotation.x = k * Math.PI / 3; ring.rotation.y = b * 1.4 * movement + k; ring.rotation.z = k * 1.7; ring.scale.setScalar(0.12 + Math.sin(pulse * Math.PI / 2) * 2.3 * movement) }
      else if (mode === 'fracture') { ring.scale.setScalar(0.2 + pulse * 3 * movement); ring.rotation.z = k * 0.5 }
      else if (mode === 'web') { ring.material.opacity = 0 }
      else { ring.rotation.y = b * 3 + k * 0.3; ring.scale.setScalar(0.3 + Math.sin(pulse * Math.PI) * (mode === 'four' ? 0.85 : 1.6) * movement) }
    })
    const waveP = smooth(mode === 'impact' ? 0.1 : 0.15, 0.72, b)
    fx.wave.scale.setScalar(0.2 + waveP * width * (mode === 'impact' ? 4.2 : 2.5) * movement)
    fx.wave.material.uniforms.uProgress.value = b
    fx.wave.material.opacity = Math.sin(waveP * Math.PI) * fade * (mode === 'web' || mode === 'illusion' || mode === 'portal' ? 0 : mode === 'impact' ? 0.42 : 0.22)
    fx.wave.visible = fx.wave.material.opacity > 0.002
    fx.core.scale.setScalar(mode === 'portal' ? 1.5 * (1 - p) + 0.02 : 0.03 + Math.sin(p * Math.PI) * (mode === 'emp' ? 0.27 : 1.5))
    fx.core.material.opacity = Math.sin(p * Math.PI) * fade * (mode === 'emp' ? 0.85 : 0.22)
    fx.core.material.uniforms.uProgress.value = b
    fx.core.rotation.set(p * 2, p * 3, p)
    fx.shardMat.opacity = fade
    fx.shardMat.emissiveIntensity = (mode === 'impact' ? 0.05 : 0.35) * (1 - p * 0.8)
    fx.debris.forEach((d, k) => {
      const age = smooth(start + d.delay, 0.92, b)
      const angle = d.a + age * (mode === 'illusion' ? 8 : mode === 'portal' ? -5 : 0)
      const outward = age * d.speed * movement
      const obj = fx.dummy
      obj.position.set(d.x, d.y, d.z)
      if (mode === 'portal') { obj.position.multiplyScalar(1 - age); obj.position.y += 1.9 * age; obj.position.x += Math.cos(angle) * Math.sin(age * Math.PI) * 0.8; obj.position.z += Math.sin(angle) * Math.sin(age * Math.PI) * 0.8 }
      else if (mode === 'illusion') { obj.position.x += Math.cos(angle) * outward; obj.position.y += outward * 2; obj.position.z += Math.sin(angle) * outward }
      else if (mode === 'emp') { obj.position.x += Math.cos(angle) * outward * 1.6; obj.position.y -= age * age * 4; obj.position.z += Math.sin(angle) * outward }
      else if (mode === 'web') { obj.position.x += Math.cos(angle) * outward * 0.7; obj.position.y -= age * age * 2.8; obj.position.z -= outward * 2 }
      else { const recoil = mode === 'kinetic' ? (1 - smooth(0.5, 1, age)) : 1; obj.position.x += Math.cos(angle) * outward * 2 * recoil; obj.position.z += Math.sin(angle) * outward * recoil; obj.position.y += Math.sin(age * Math.PI) * (mode === 'impact' ? 2.8 : 1.2) * movement - age * age * 3 }
      if (mode !== 'portal' && mode !== 'illusion' && mode !== 'kinetic') obj.position.y = Math.max(0.16 + d.size * 0.3, obj.position.y)
      obj.rotation.set(d.a + age * d.twist * movement, age * d.twist * 0.7 * movement, d.a + age * 4 * movement)
      const visible = age > 0 && age < 0.99 ? d.size * (1 - age * 0.7) : 0.00001
      obj.scale.set(visible * (mode === 'web' ? 0.15 : mode === 'emp' ? 1.6 : 1), visible * (mode === 'illusion' ? 3 : mode === 'impact' ? 1.1 : 1.8), visible * (mode === 'impact' ? 0.8 : 0.5))
      obj.updateMatrix(); fx.shards.setMatrixAt(k, obj.matrix)
    })
    fx.shards.instanceMatrix.needsUpdate = true
    fx.bolts.forEach((bolt, k) => {
      // Stable duty cycle avoids 60 Hz flashes. All bolts are confined to the shrine.
      const strike = b > 0.025 + k * 0.035 && b < 0.5 + k * 0.03
      bolt.line.visible = strike && !fx.reduced
      if (!strike || fx.reduced) return
      if (mode === 'storm') { const offset = k - (fx.bolts.length - 1) / 2; fx.a.set(offset * 0.6, 6.5, -0.6); fx.b.set(offset * 0.7, 0.15 + (k % 2) * 1.4, 0.3) }
      else { const a = b * 14 + k * Math.PI; fx.a.set(Math.cos(a) * 0.15, 1.9, -0.3); fx.b.set(Math.cos(a) * 2.2, 1.9 + Math.sin(a) * 1.8, -0.4) }
      bolt.mat.opacity = fade * (0.65 + Math.sin(smooth(0.025 + k * 0.035, 0.5 + k * 0.03, b) * Math.PI) * 0.3)
      bolt.set(fx.a, fx.b, mode === 'storm' ? 0.65 : 0.18)
    })
    if (mode === 'web') {
      fx.webs.material.opacity = fade * 0.7
      fx.webs.material.uniforms.uProgress.value = b
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4
        const snap = smooth(0.18 + k * 0.055, 0.3 + k * 0.055, b)
        const x = Math.cos(a) * 1.75, y = 2.2 + Math.sin(a) * 1.8
        for (let j = 0; j < fx.webSteps; j++) {
          const u = j / (fx.webSteps - 1), along = snap + u * (1 - snap)
          const bow = Math.sin(u * Math.PI) * Math.sin(snap * Math.PI) * 0.35 * movement
          const cx = x * along + Math.sin(a) * bow, cy = 1.9 + (y - 1.9) * along - bow * 0.6, cz = -0.2 - along
          const w = (0.007 + Math.sin(snap * Math.PI) * 0.003) * Math.sqrt(1 - snap) * (1 - u * 0.3)
          const o = (k * fx.webSteps + j) * 6
          fx.webPos[o] = cx - Math.sin(a) * w; fx.webPos[o + 1] = cy + Math.cos(a) * w; fx.webPos[o + 2] = cz
          fx.webPos[o + 3] = cx + Math.sin(a) * w; fx.webPos[o + 4] = cy - Math.cos(a) * w; fx.webPos[o + 5] = cz
        }
      }
      fx.webs.geometry.attributes.position.needsUpdate = true
    }
    const heat = Math.sin(p * Math.PI) * fade
    fx.carry += dt * (mode === 'storm' ? 95 : 52) * heat * fx.ps * (fx.reduced ? 0.2 : 1)
    const n = Math.floor(fx.carry); fx.carry -= n
    if (n > 0) fx.motes.emit(n, () => {
      const a = Math.random() * Math.PI * 2, radius = 0.5 + Math.random() * width
      if (mode === 'portal') return { p: [Math.cos(a) * radius, 1.9 + Math.sin(a) * radius, -0.3], v: [-Math.cos(a) * 1.6, -Math.sin(a) * 1.6, -0.15], life: 0.4 + Math.random() * 0.4 }
      if (mode === 'illusion') return { p: [Math.cos(a) * radius, 0.5, Math.sin(a) * 0.4 - 0.6], v: [Math.cos(a + 1.5) * 0.8, 2.2, Math.sin(a + 1.5) * 0.8], life: 1.1 }
      return { p: [Math.cos(a) * radius * 0.5, mode === 'impact' ? 0.2 : 1.8, -0.3 + Math.sin(a) * 0.3], v: [Math.cos(a) * (mode === 'impact' ? 3 : 1.8), mode === 'impact' ? 1.5 + Math.random() : (Math.random() - 0.3) * 2, Math.sin(a) * 1.3], life: 0.5 + Math.random() * 0.8 }
    })
    if (heat > 0.3 && Math.random() < dt * (mode === 'impact' ? 12 : 6) * heat && mode !== 'illusion' && mode !== 'web') fx.dust.emit(1, () => ({ p: [(Math.random() - 0.5) * width * 2.5, 0.15, -0.2], v: [(Math.random() - 0.5) * 0.45, 0.12, (Math.random() - 0.5) * 0.3], life: 1.2 }))
    fx.motes.update(dt, fx.motePhysics)
    fx.dust.update(dt, fx.dustPhysics)
  })
  return fx
}

export function DestructionFX({ fx }) {
  return <primitive object={fx.root} />
}
