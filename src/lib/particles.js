import * as THREE from 'three'

// Screen-space point scale, kept in sync with canvas height and FOV by CameraRig.
export const pointScale = { value: 600 }
// World-space camera position, used to face bolt ribbons at the viewer.
export const camPos = new THREE.Vector3()

const POINT_VERT = /* glsl */ `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    vColor = aColor; vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 256.0);
    gl_Position = projectionMatrix * mv;
  }`
const POINT_FRAG = /* glsl */ `
  uniform float uSoft;
  varying vec3 vColor; varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(max(0.0, 1.0 - d), uSoft);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }`

// Fixed-size CPU particle pool with per-particle size, colour-over-life and soft falloff.
// opts: color (birth), colorEnd (death), size, sizeEnd (multiplier at death), additive, soft
export function makeEmitter(count, { color = '#7dff9a', colorEnd = null, size = 0.05, sizeEnd = 1, additive = true, soft = 1.6, opacity = 1 } = {}) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const sz = new Float32Array(count)
  const al = new Float32Array(count)
  for (let i = 0; i < count; i++) pos[i * 3 + 1] = -9999
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: pointScale, uSoft: { value: soft } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  const vel = new Float32Array(count * 3)
  const life = new Float32Array(count)
  const maxLife = new Float32Array(count)
  const base = new Float32Array(count)
  const c0 = new Float32Array(count * 3)
  const birth = new THREE.Color(color)
  const death = new THREE.Color(colorEnd || color)
  let cursor = 0
  let alive = 0
  return {
    points,
    emit(n, init) {
      for (let k = 0; k < n; k++) {
        const i = cursor
        cursor = (cursor + 1) % count
        const o = init(i, k)
        const i3 = i * 3
        pos[i3] = o.p[0]
        pos[i3 + 1] = o.p[1]
        pos[i3 + 2] = o.p[2]
        vel[i3] = o.v[0]
        vel[i3 + 1] = o.v[1]
        vel[i3 + 2] = o.v[2]
        life[i] = maxLife[i] = o.life || 1
        base[i] = (o.size || 1) * size * (0.6 + Math.random() * 0.8)
        const c = o.color || birth
        c0[i3] = c.r
        c0[i3 + 1] = c.g
        c0[i3 + 2] = c.b
      }
      alive = count
    },
    update(dt, { gravity = 0, drag = 0, turbulence = 0, t = 0 } = {}) {
      if (!alive) return
      let any = 0
      const dg = Math.max(0, 1 - drag * dt)
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue
        any = 1
        life[i] -= dt
        const i3 = i * 3
        vel[i3 + 1] += gravity * dt
        if (turbulence) {
          vel[i3] += Math.sin(t * 3 + i * 1.7) * turbulence * dt
          vel[i3 + 2] += Math.cos(t * 2.6 + i * 1.3) * turbulence * dt
        }
        vel[i3] *= dg
        vel[i3 + 1] *= dg
        vel[i3 + 2] *= dg
        pos[i3] += vel[i3] * dt
        pos[i3 + 1] += vel[i3 + 1] * dt
        pos[i3 + 2] += vel[i3 + 2] * dt
        const f = Math.max(0, life[i] / maxLife[i])
        const age = 1 - f
        al[i] = Math.min(1, f * 2.5) * Math.min(1, age * 10 + 0.1)
        sz[i] = base[i] * (1 + (sizeEnd - 1) * age)
        col[i3] = c0[i3] + (death.r - c0[i3]) * age
        col[i3 + 1] = c0[i3 + 1] + (death.g - c0[i3 + 1]) * age
        col[i3 + 2] = c0[i3 + 2] + (death.b - c0[i3 + 2]) * age
        if (life[i] <= 0) {
          pos[i3 + 1] = -9999
          al[i] = 0
        }
      }
      if (!any) alive = 0
      geo.attributes.position.needsUpdate = true
      geo.attributes.aColor.needsUpdate = true
      geo.attributes.aSize.needsUpdate = true
      geo.attributes.aAlpha.needsUpdate = true
    },
  }
}

// Lightning: a camera-facing ribbon with a white-hot core and coloured glow, rebuilt each time set() is called.
const _pts = []
const _t = new THREE.Vector3()
const _s = new THREE.Vector3()
const _v = new THREE.Vector3()
const _cam = new THREE.Vector3()
export function makeBolt(color = '#8dffb0', n = 16, width = 0.05) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(n * 2 * 3)
  const uv = new Float32Array(n * 2 * 2)
  const idx = []
  for (let i = 0; i < n; i++) {
    uv[i * 4] = i / (n - 1)
    uv[i * 4 + 1] = 0
    uv[i * 4 + 2] = i / (n - 1)
    uv[i * 4 + 3] = 1
    if (i < n - 1) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  const uOpacity = { value: 1 }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){
        float x = clamp(abs(vUv.y - 0.5) * 2.0, 0.0, 1.0);
        float core = smoothstep(0.32, 0.0, x);
        float glow = pow(1.0 - x, 2.5);
        float taper = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.85, vUv.x) * 0.6 + 0.4;
        vec3 col = mix(uColor * 1.6, vec3(1.0), core);
        gl_FragColor = vec4(col * (core * 1.4 + glow * 0.9), (core + glow * 0.7) * uOpacity * taper);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  Object.defineProperty(mat, 'opacity', { get: () => uOpacity.value, set: (v) => (uOpacity.value = v), configurable: true })
  const line = new THREE.Mesh(geo, mat)
  line.frustumCulled = false
  line.visible = false
  for (let i = _pts.length; i < 64; i++) _pts.push(new THREE.Vector3())
  return {
    line,
    mat,
    set(a, b, jag = 0.05, w = width) {
      line.updateWorldMatrix(true, false)
      _cam.copy(camPos)
      line.worldToLocal(_cam)
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1)
        const k = i === 0 || i === n - 1 ? 0 : jag * (1 - Math.abs(t - 0.5))
        _pts[i].set(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * k, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * k, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * k)
      }
      for (let i = 0; i < n; i++) {
        const p = _pts[i]
        _t.copy(_pts[Math.min(n - 1, i + 1)]).sub(_pts[Math.max(0, i - 1)])
        _v.copy(_cam).sub(p)
        _s.crossVectors(_t, _v).normalize().multiplyScalar(w * 0.5)
        pos[i * 6] = p.x + _s.x
        pos[i * 6 + 1] = p.y + _s.y
        pos[i * 6 + 2] = p.z + _s.z
        pos[i * 6 + 3] = p.x - _s.x
        pos[i * 6 + 4] = p.y - _s.y
        pos[i * 6 + 5] = p.z - _s.z
      }
      geo.attributes.position.needsUpdate = true
    },
  }
}
