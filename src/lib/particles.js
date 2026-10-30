import * as THREE from 'three'

export const pointScale = { value: 600 }
export const camPos = new THREE.Vector3()

const POINT_VERT = /* glsl */ `
  attribute float aSize, aAlpha; attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    vColor = aColor; vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 192.0);
    gl_Position = projectionMatrix * mv;
  }`
const POINT_FRAG = /* glsl */ `
  uniform float uSoft, uOpacity;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r >= 1.0) discard;
    float a = pow(1.0 - r * r, uSoft) * (1.0 - smoothstep(0.76, 1.0, r));
    gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
  }`

function upload(attribute, components) {
  attribute.clearUpdateRanges()
  if (components > 0) attribute.addUpdateRange(0, components)
  attribute.needsUpdate = true
}

// Live particles occupy a dense prefix. Expiry swaps the last live particle into
// the freed slot, so CPU work and GPU draw/upload ranges follow actual activity.
export function makeEmitter(count, { color = '#7dff9a', colorEnd = null, size = 0.05, sizeEnd = 1, additive = true, soft = 1.6, opacity = 1 } = {}) {
  count = Math.max(1, Math.floor(count) || 1)
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3)
  const sz = new Float32Array(count), al = new Float32Array(count)
  const attributes = {
    position: new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
    aColor: new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage),
    aSize: new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage),
    aAlpha: new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage),
  }
  for (const name in attributes) geo.setAttribute(name, attributes[name])
  geo.setDrawRange(0, 0)
  const alpha = { value: opacity }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: pointScale, uSoft: { value: soft }, uOpacity: alpha },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  Object.defineProperty(mat, 'opacity', { get: () => alpha.value, set: value => { alpha.value = value }, configurable: true })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.visible = false
  const vel = new Float32Array(count * 3), c0 = new Float32Array(count * 3)
  const life = new Float32Array(count), maxLife = new Float32Array(count)
  const base = new Float32Array(count), phase = new Float32Array(count)
  const birth = new THREE.Color(color), death = new THREE.Color(colorEnd || color)
  let alive = 0, replacement = 0, serial = 0
  function flush() {
    geo.setDrawRange(0, alive)
    points.visible = alive > 0
    if (!alive) return
    upload(attributes.position, alive * 3)
    upload(attributes.aColor, alive * 3)
    upload(attributes.aSize, alive)
    upload(attributes.aAlpha, alive)
  }
  function remove(i) {
    const last = --alive
    if (i === last) return
    const i3 = i * 3, l3 = last * 3
    for (let k = 0; k < 3; k++) {
      pos[i3 + k] = pos[l3 + k]; vel[i3 + k] = vel[l3 + k]
      col[i3 + k] = col[l3 + k]; c0[i3 + k] = c0[l3 + k]
    }
    life[i] = life[last]; maxLife[i] = maxLife[last]
    base[i] = base[last]; phase[i] = phase[last]
    sz[i] = sz[last]; al[i] = al[last]
  }
  function reset() { alive = 0; replacement = 0; geo.setDrawRange(0, 0); points.visible = false }
  return {
    points,
    get activeCount() { return alive },
    get capacity() { return count },
    emit(n, init) {
      n = Number.isFinite(n) ? Math.min(count, Math.max(0, Math.floor(n))) : 0
      if (!n) return
      for (let k = 0; k < n; k++) {
        const i = alive < count ? alive++ : replacement++ % count
        const o = init(i, k), i3 = i * 3
        pos[i3] = o.p[0]; pos[i3 + 1] = o.p[1]; pos[i3 + 2] = o.p[2]
        vel[i3] = o.v[0]; vel[i3 + 1] = o.v[1]; vel[i3 + 2] = o.v[2]
        life[i] = maxLife[i] = Math.max(0.001, Number.isFinite(o.life) ? o.life : 1)
        base[i] = (o.size ?? 1) * size * (0.6 + Math.random() * 0.8)
        phase[i] = (++serial % 8192) * 1.713
        const c = o.color || birth
        c0[i3] = col[i3] = c.r; c0[i3 + 1] = col[i3 + 1] = c.g; c0[i3 + 2] = col[i3 + 2] = c.b
        sz[i] = base[i]; al[i] = 0.1
      }
      flush()
    },
    update(delta, { gravity = 0, drag = 0, turbulence = 0, t = 0 } = {}) {
      if (!alive || !Number.isFinite(delta) || delta <= 0) return
      const dt = Math.min(delta, 0.1)
      const dg = Math.exp(-Math.max(0, drag) * dt)
      for (let i = 0; i < alive;) {
        life[i] -= dt
        if (life[i] <= 0) { remove(i); continue }
        const i3 = i * 3
        vel[i3 + 1] += gravity * dt
        if (turbulence) {
          vel[i3] += Math.sin(t * 3 + phase[i]) * turbulence * dt
          vel[i3 + 2] += Math.cos(t * 2.6 + phase[i] * 0.76) * turbulence * dt
        }
        vel[i3] *= dg; vel[i3 + 1] *= dg; vel[i3 + 2] *= dg
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt
        const f = Math.max(0, life[i] / maxLife[i]), age = 1 - f
        al[i] = Math.min(1, f * 2.5) * Math.min(1, age * 10 + 0.1)
        sz[i] = base[i] * (1 + (sizeEnd - 1) * age)
        col[i3] = c0[i3] + (death.r - c0[i3]) * age
        col[i3 + 1] = c0[i3 + 1] + (death.g - c0[i3 + 1]) * age
        col[i3 + 2] = c0[i3 + 2] + (death.b - c0[i3 + 2]) * age
        i++
      }
      flush()
    },
    reset,
    clear: reset,
    dispose() { geo.dispose(); mat.dispose() },
  }
}

let boltSerial = 0
// A seeded contour and two subsidiary forks share one mesh. The path follows its
// endpoints continuously; rebuilding it no longer reseeds random noise each frame.
export function makeBolt(color = '#8dffb0', n = 16, width = 0.05) {
  n = Math.max(4, Math.floor(n) || 16)
  let seed = (++boltSerial * 48271) % 2147483647
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const forkN = Math.max(4, Math.floor(n * 0.35))
  const lengths = [n, forkN, forkN], total = n + forkN * 2
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(total * 6)
  const uv = new Float32Array(total * 4), strength = new Float32Array(total * 2), idx = []
  const contour = Array.from({ length: total }, () => new THREE.Vector3())
  const noise = Array.from({ length: n }, () => [random() - 0.5, random() - 0.5])
  const forkSign = random() > 0.5 ? 1 : -1
  let offset = 0
  lengths.forEach((length, branch) => {
    for (let i = 0; i < length; i++) {
      const p = offset + i
      uv[p * 4] = i / (length - 1); uv[p * 4 + 1] = 0
      uv[p * 4 + 2] = i / (length - 1); uv[p * 4 + 3] = 1
      strength[p * 2] = strength[p * 2 + 1] = branch ? 0.42 : 1
      if (i < length - 1) { const a = p * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    }
    offset += length
  })
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setAttribute('aStrength', new THREE.BufferAttribute(strength, 1))
  geo.setIndex(idx)
  const uOpacity = { value: 1 }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity },
    vertexShader: `attribute float aStrength; varying vec2 vUv; varying float vStrength;
      void main(){ vUv = uv; vStrength = aStrength; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying float vStrength;
      void main(){
        float x = abs(vUv.y - 0.5) * 2.0;
        float aa = max(fwidth(x), 0.018);
        float core = 1.0 - smoothstep(0.075 - aa, 0.075 + aa, x);
        float halo = exp(-x * x * 5.5) * (1.0 - smoothstep(0.76, 1.0, x));
        float taper = mix(0.14, 1.0, smoothstep(0.0, 0.045, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x)));
        vec3 rgb = vec3(2.5) * core + uColor * halo * 0.8;
        float alpha = (core * 0.9 + halo * 0.27) * uOpacity * taper * vStrength;
        gl_FragColor = vec4(rgb, alpha);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  })
  Object.defineProperty(mat, 'opacity', { get: () => uOpacity.value, set: value => { uOpacity.value = value }, configurable: true })
  const line = new THREE.Mesh(geo, mat)
  line.frustumCulled = false; line.visible = false
  const axis = new THREE.Vector3(), basis = new THREE.Vector3(1, 0, 0), cross = new THREE.Vector3()
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3(), camera = new THREE.Vector3()
  const forkEnd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
  return {
    line, mat,
    set(a, b, jag = 0.05, w = width) {
      axis.subVectors(b, a)
      const distance = axis.length()
      if (!Number.isFinite(distance) || distance < 0.000001) { geo.setDrawRange(0, 0); return }
      geo.setDrawRange(0, idx.length)
      axis.divideScalar(distance)
      // Transport the previous transverse axis instead of flipping coordinate
      // systems when a moving endpoint crosses a near-vertical threshold.
      basis.addScaledVector(axis, -basis.dot(axis))
      if (basis.lengthSq() < 1e-10) basis.crossVectors(axis, Math.abs(axis.y) > 0.95 ? up.set(1, 0, 0) : up.set(0, 1, 0))
      basis.normalize()
      cross.crossVectors(axis, basis).normalize()
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), envelope = Math.sin(t * Math.PI)
        contour[i].lerpVectors(a, b, t).addScaledVector(basis, noise[i][0] * jag * envelope).addScaledVector(cross, noise[i][1] * jag * envelope)
      }
      for (let branch = 0; branch < 2; branch++) {
        const start = contour[Math.floor(n * (branch ? 0.64 : 0.32))]
        const sign = branch ? -forkSign : forkSign
        forkEnd.copy(start).addScaledVector(axis, distance * 0.2).addScaledVector(basis, Math.min(distance * 0.16, jag * 2.2) * sign).addScaledVector(cross, jag * sign * 0.45)
        for (let i = 0; i < forkN; i++) {
          const t = i / (forkN - 1)
          contour[n + branch * forkN + i].lerpVectors(start, forkEnd, t).addScaledVector(cross, Math.sin(t * Math.PI * 3) * jag * 0.1)
        }
      }
      line.updateWorldMatrix(true, false)
      camera.copy(camPos); line.worldToLocal(camera)
      let offset = 0
      lengths.forEach((length, branch) => {
        for (let i = 0; i < length; i++) {
          const p = contour[offset + i]
          tangent.subVectors(contour[offset + Math.min(length - 1, i + 1)], contour[offset + Math.max(0, i - 1)])
          view.subVectors(camera, p); side.crossVectors(tangent, view)
          if (side.lengthSq() < 1e-12) side.copy(basis)
          side.normalize().multiplyScalar(w * 1.25 * (branch ? 0.6 : 1))
          const j = (offset + i) * 6
          pos[j] = p.x + side.x; pos[j + 1] = p.y + side.y; pos[j + 2] = p.z + side.z
          pos[j + 3] = p.x - side.x; pos[j + 4] = p.y - side.y; pos[j + 5] = p.z - side.z
        }
        offset += length
      })
      upload(geo.attributes.position, pos.length)
    },
  }
}
