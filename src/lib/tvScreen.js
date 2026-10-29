import * as THREE from 'three'
import { makeCanvas, drawEmblem, wrapText } from './textures'

// Picture-tube shader: barrel curvature, power-on (dot -> line -> raster), RGB shadow mask, scanlines,
// rolling hum bar, chroma bleed, snow, vignette and phosphor bloom.
export function crtMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uTime: { value: 0 }, uPower: { value: 0 }, uStatic: { value: 1 }, uRoll: { value: 0 }, uRes: { value: new THREE.Vector2(512, 384) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uTime, uPower, uStatic, uRoll; uniform vec2 uRes;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec2 curve(vec2 uv){ uv = uv * 2.0 - 1.0; vec2 o = abs(uv.yx) / vec2(4.2, 3.4); uv += uv * o * o; return uv * 0.5 + 0.5; }
      void main(){
        vec2 uv = curve(vUv);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        vec2 c = uv - 0.5;
        float p = uPower;
        float hw = mix(0.0015, 0.52, smoothstep(0.1, 0.4, p));
        float hh = mix(0.002, 0.52, smoothstep(0.38, 0.72, p));
        float raster = step(abs(c.x), hw) * step(abs(c.y), hh) * step(0.002, p);
        float dotGlow = smoothstep(0.05, 0.0, length(c * vec2(1.3, 1.0))) * smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.12, 0.3, p));
        float warm = 1.0 - smoothstep(0.4, 0.95, p);
        vec2 tuv = uv;
        tuv.x += (h(vec2(floor(uv.y * 160.0), floor(uTime * 24.0))) - 0.5) * 0.006 * uStatic;
        tuv.y = fract(tuv.y + uRoll);
        float bleed = 0.0016 + 0.002 * uStatic;
        vec3 img = vec3(texture2D(uMap, tuv + vec2(bleed, 0.0)).r, texture2D(uMap, tuv).g, texture2D(uMap, tuv - vec2(bleed, 0.0)).b);
        float snow = h(floor(uv * uRes) + floor(uTime * 60.0));
        img = mix(img, vec3(snow), clamp(uStatic, 0.0, 1.0));
        float bar = smoothstep(0.0, 0.25, abs(fract(uv.y * 0.7 - uTime * 0.12) - 0.5)) * 0.18 + 0.82;
        float scan = 0.72 + 0.28 * sin(uv.y * uRes.y * 3.14159);
        float px = mod(gl_FragCoord.x, 3.0);
        vec3 mask = vec3(px < 1.0 ? 1.0 : 0.82, px >= 1.0 && px < 2.0 ? 1.0 : 0.82, px >= 2.0 ? 1.0 : 0.82);
        float vig = smoothstep(0.85, 0.25, length(c * vec2(1.05, 1.25)));
        float flick = 0.96 + 0.04 * sin(uTime * 120.0);
        vec3 col = img * scan * mask * bar * vig * flick;
        col *= vec3(0.96, 1.0, 1.04);
        col += vec3(0.9, 0.95, 1.0) * warm * raster * 1.4;
        col = col * raster + vec3(1.0) * dotGlow * 3.0;
        gl_FragColor = vec4(col * 1.15, 1.0);
      }`,
  })
}

// Black & white broadcast frames drawn onto the tube's canvas.
export function makeTVCanvas() {
  const [c, g] = makeCanvas(512, 384)
  return { canvas: c, g }
}

export function drawTV(g, mode, text, t = 0) {
  const W = 512
  const H = 384
  g.save()
  g.fillStyle = '#060606'
  g.fillRect(0, 0, W, H)
  g.textAlign = 'center'
  if (mode === 'testcard') {
    const bars = ['#f0f0f0', '#d0d0d0', '#a8a8a8', '#808080', '#585858', '#303030', '#101010']
    bars.forEach((b, i) => {
      g.fillStyle = b
      g.fillRect((i * W) / bars.length, 0, W / bars.length + 1, 64)
    })
    g.strokeStyle = '#cfcfcf'
    g.lineWidth = 2
    for (const r of [150, 120, 90]) {
      g.beginPath()
      g.arc(W / 2, 210, r, 0, Math.PI * 2)
      g.stroke()
    }
    g.beginPath()
    g.moveTo(W / 2 - 170, 210)
    g.lineTo(W / 2 + 170, 210)
    g.moveTo(W / 2, 70)
    g.lineTo(W / 2, 350)
    g.stroke()
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#e8e8e8' : '#1a1a1a'
      g.fillRect(W / 2 - 160 + i * 20, 330, 20, 14)
    }
    g.fillStyle = '#060606'
    g.beginPath()
    g.arc(W / 2, 210, 72, 0, Math.PI * 2)
    g.fill()
    drawEmblem(g, W / 2, 210, 62, '#e8e8e8')
    g.fillStyle = '#ececec'
    g.font = '700 22px Cinzel, Georgia, serif'
    g.fillText('LATVERIAN STATE TELEVISION', W / 2, 96)
    g.font = '600 18px Cinzel, Georgia, serif'
    if (Math.floor(t * 1.5) % 2 === 0) g.fillText('PLEASE STAND BY', W / 2, 376)
  } else if (mode === 'text') {
    g.fillStyle = '#efefef'
    let size = 46
    g.font = `700 ${size}px Cinzel, Georgia, serif`
    let lines = wrapText(g, text, W - 70)
    while (lines.length > 4 && size > 26) {
      size -= 4
      g.font = `700 ${size}px Cinzel, Georgia, serif`
      lines = wrapText(g, text, W - 70)
    }
    const y0 = H / 2 - ((lines.length - 1) * size * 1.15) / 2 + size * 0.35
    lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * size * 1.15))
    g.font = '600 12px Cinzel, Georgia, serif'
    g.textAlign = 'left'
    g.fillStyle = '#bdbdbd'
    g.fillText('LIVE · LATVERIA', 22, 30)
    if (Math.floor(t * 2) % 2 === 0) {
      g.beginPath()
      g.arc(14, 26, 4, 0, Math.PI * 2)
      g.fill()
    }
  } else if (mode === 'emblem') {
    drawEmblem(g, W / 2, H / 2 - 16, 120, '#f2f2f2')
    g.fillStyle = '#e0e0e0'
    g.font = '700 20px Cinzel, Georgia, serif'
    g.fillText('BY DECREE OF DOOM', W / 2, H - 30)
  }
  g.restore()
}
