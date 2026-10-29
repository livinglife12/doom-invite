import * as THREE from 'three'
import { rng } from './util'

// Procedural canvas textures: no external art needed, and every IP-flavoured image can be swapped here.
const cache = new Map()
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn())
  return cache.get(key)
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

export function toTexture(c, { repeat, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function wrapText(g, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (g.measureText(test).width > maxW && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

export const softDot = () =>
  memo('dot', () => {
    const [c, g] = makeCanvas(64, 64)
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
    return toTexture(c, { srgb: false })
  })

export const stoneTexture = () =>
  memo('stone', () => {
    const r = rng(7)
    const [c, g] = makeCanvas(512, 512)
    g.fillStyle = '#6d726f'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 9000; i++) {
      const v = 70 + r() * 70
      g.fillStyle = `rgba(${v},${v + 4},${v},${0.12 + r() * 0.12})`
      g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3)
    }
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(30,40,34,${0.15 + r() * 0.2})`
      g.lineWidth = 0.5 + r()
      g.beginPath()
      let x = r() * 512
      let y = r() * 512
      g.moveTo(x, y)
      for (let k = 0; k < 8; k++) {
        x += (r() - 0.5) * 70
        y += (r() - 0.5) * 70
        g.lineTo(x, y)
      }
      g.stroke()
    }
    g.strokeStyle = 'rgba(15,18,16,0.85)'
    g.lineWidth = 4
    for (let i = 0; i <= 2; i++) {
      g.beginPath()
      g.moveTo(0, i * 256)
      g.lineTo(512, i * 256)
      g.stroke()
      g.beginPath()
      g.moveTo(i * 256 + (i % 2) * 0, 0)
      g.lineTo(i * 256, 512)
      g.stroke()
    }
    return toTexture(c, { repeat: [1, 1] })
  })

export function stoneTex(repeat) {
  const t = stoneTexture().clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.needsUpdate = true
  return t
}

// --- Newspaper clipping ---
export function clippingCanvas(clip, seed = 1, w = 512, h = 720) {
  const r = rng(seed * 97 + 13)
  const [c, g] = makeCanvas(w, h)
  const grd = g.createLinearGradient(0, 0, w, h)
  grd.addColorStop(0, '#e6dcc0')
  grd.addColorStop(1, '#c9b994')
  g.fillStyle = grd
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(80,60,30,${r() * 0.07})`
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
  }
  for (let i = 0; i < 5; i++) {
    const x = r() * w
    const y = r() * h
    const rad = 30 + r() * 90
    const sg = g.createRadialGradient(x, y, 0, x, y, rad)
    sg.addColorStop(0, 'rgba(120,90,40,0.16)')
    sg.addColorStop(1, 'rgba(120,90,40,0)')
    g.fillStyle = sg
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  const ink = '#1d1813'
  g.fillStyle = ink
  g.textAlign = 'center'
  g.font = '42px "UnifrakturMaguntia", "Old English Text MT", serif'
  g.fillText(clip.masthead || 'The Multiversal Times', w / 2, 58)
  g.fillRect(24, 72, w - 48, 3)
  g.fillRect(24, 78, w - 48, 1)
  g.font = 'italic 14px "Old Standard TT", Georgia, serif'
  g.fillText(clip.date || 'EXTRA EDITION · BY ORDER OF THE THRONE · PRICE: ONE FREEDOM', w / 2, 96)
  g.fillRect(24, 104, w - 48, 1)

  let size = 60
  g.font = `700 ${size}px "Old Standard TT", Georgia, serif`
  let lines = wrapText(g, clip.headline, w - 48)
  while ((lines.length > 3 || lines.some((l) => g.measureText(l).width > w - 40)) && size > 28) {
    size -= 4
    g.font = `700 ${size}px "Old Standard TT", Georgia, serif`
    lines = wrapText(g, clip.headline, w - 48)
  }
  let y = 104 + size
  for (const l of lines) {
    g.fillText(l, w / 2, y)
    y += size * 1.02
  }
  g.font = 'italic 20px "Old Standard TT", Georgia, serif'
  for (const l of wrapText(g, clip.sub, w - 70).slice(0, 2)) {
    g.fillText(l, w / 2, y + 6)
    y += 24
  }
  y += 16

  // Halftone "photo" of a fallen silhouette lit by green fire
  const ph = 150
  g.fillStyle = '#26241f'
  g.fillRect(28, y, w - 56, ph)
  for (let gy = y + 3; gy < y + ph; gy += 6) {
    for (let gx = 31; gx < w - 28; gx += 6) {
      const dx = (gx - w / 2) / 160
      const dy = (gy - (y + ph * 0.7)) / 60
      const fig = Math.exp(-(dx * dx * 6 + dy * dy * 1.2))
      const glow = 0.4 + 0.6 * Math.max(0, 1 - Math.hypot(dx * 0.6, (gy - y) / ph - 0.2))
      const v = Math.max(0, glow * 0.7 - fig * 0.65 + (r() - 0.5) * 0.15)
      g.fillStyle = `rgba(215,230,200,${0.9})`
      g.beginPath()
      g.arc(gx, gy, v * 2.8, 0, 6.3)
      g.fill()
    }
  }
  g.fillStyle = ink
  g.font = 'italic 12px "Old Standard TT", Georgia, serif'
  g.fillText(clip.caption || 'Image recovered from the ruins. Courtesy of the Latverian State Archive.', w / 2, y + ph + 16)
  y += ph + 34

  g.textAlign = 'left'
  g.font = '13px "Old Standard TT", Georgia, serif'
  const body = (clip.body + ' ').repeat(5)
  const colW = (w - 72) / 2
  const bl = wrapText(g, body, colW)
  let col = 0
  let cy = y
  for (const l of bl) {
    g.fillText(l, 28 + col * (colW + 16), cy)
    cy += 15
    if (cy > h - 18) {
      col++
      cy = y
      if (col > 1) break
    }
  }

  // Scorch and burnt bites
  g.globalCompositeOperation = 'source-atop'
  const eg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.65)
  eg.addColorStop(0, 'rgba(0,0,0,0)')
  eg.addColorStop(1, 'rgba(45,22,6,0.8)')
  g.fillStyle = eg
  g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(r() * 4)
    const t = r()
    const x = side === 0 ? t * w : side === 1 ? w : side === 2 ? t * w : 0
    const yy = side === 0 ? 0 : side === 1 ? t * h : side === 2 ? h : t * h
    g.beginPath()
    g.arc(x, yy, 3 + r() * 15, 0, 6.3)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  return c
}

// --- Marvel-style button faces (match the supplied clips) ---
export const BUTTON_BODY = {
  gold: '#b98d3b',
  velvet: '#8e1024',
  flag: '#c3c8cf',
  purple: '#5a2380',
  four: '#1a4fa6',
  thunder: '#2a3442',
  armor: '#8e1015',
  vibranium: '#141117',
  web: '#b3141d',
}

// Buttons designed for this invite, in the same family as the supplied four (one colour story, a short
// lowercase rallying cry, one signature detail).
function drawDesignedButton(g, style, W, H, sans) {
  if (style === 'thunder') {
    const gr = g.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, '#526177')
    gr.addColorStop(1, '#1d2531')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
    g.save()
    g.shadowColor = '#8fd0ff'
    g.shadowBlur = 18
    g.strokeStyle = 'rgba(190,230,255,0.55)'
    g.lineWidth = 5
    g.beginPath()
    ;[[330, 0], [290, 58], [322, 62], [262, 164]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
    g.restore()
    for (const x of [40, W - 40])
      for (const y of [48, 116]) {
        const rg = g.createRadialGradient(x - 4, y - 4, 2, x, y, 16)
        rg.addColorStop(0, '#f2f5fa')
        rg.addColorStop(1, '#7b8696')
        g.fillStyle = rg
        g.beginPath()
        g.arc(x, y, 15, 0, Math.PI * 2)
        g.fill()
      }
    return { color: '#eef6ff', font: `700 54px ${sans}`, glow: '#8fd0ff' }
  }
  if (style === 'armor') {
    const gr = g.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, '#d2232a')
    gr.addColorStop(0.5, '#a3141a')
    gr.addColorStop(1, '#6e0a0e')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
    const gold = g.createLinearGradient(0, 40, 0, 124)
    gold.addColorStop(0, '#f6d27a')
    gold.addColorStop(1, '#b0832f')
    g.fillStyle = gold
    roundRect(g, 120, 36, W - 160, H - 72, 22)
    g.fill()
    g.strokeStyle = 'rgba(80,10,10,0.6)'
    g.lineWidth = 3
    g.stroke()
    const rg = g.createRadialGradient(68, H / 2, 4, 68, H / 2, 36)
    rg.addColorStop(0, '#ffffff')
    rg.addColorStop(0.35, '#bfefff')
    rg.addColorStop(0.7, '#3aa9e0')
    rg.addColorStop(1, '#1a2a38')
    g.fillStyle = rg
    g.beginPath()
    g.arc(68, H / 2, 34, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#2a2f36'
    g.lineWidth = 5
    g.stroke()
    return { color: '#5a0a0c', font: `700 40px ${sans}`, x: W / 2 + 46 }
  }
  if (style === 'vibranium') {
    g.fillStyle = '#141117'
    g.fillRect(0, 0, W, H)
    g.save()
    g.strokeStyle = 'rgba(150,100,255,0.32)'
    g.shadowColor = '#9a6bff'
    g.shadowBlur = 6
    g.lineWidth = 1.5
    for (let x = -40; x < W + 40; x += 34)
      for (let y = 0; y < H + 30; y += 30) {
        g.beginPath()
        g.moveTo(x + ((y / 30) % 2) * 17, y)
        g.lineTo(x + 17 + ((y / 30) % 2) * 17, y + 30)
        g.lineTo(x + 34 + ((y / 30) % 2) * 17, y)
        g.stroke()
      }
    g.restore()
    g.fillStyle = '#cfd3da'
    for (let x = 60; x < W - 50; x += 26) {
      g.beginPath()
      g.moveTo(x - 7, 10)
      g.lineTo(x + 7, 10)
      g.lineTo(x, 28)
      g.fill()
    }
    return { color: '#e4d8ff', font: `600 42px ${sans}`, glow: '#9a6bff', y: H / 2 + 26 }
  }
  if (style === 'web') {
    g.fillStyle = '#c81b25'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#1d3f9c'
    g.fillRect(0, 0, 54, H)
    g.fillRect(W - 54, 0, 54, H)
    g.strokeStyle = 'rgba(10,10,14,0.75)'
    g.lineWidth = 1.6
    const cx = W / 2
    const cy = H / 2
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      g.beginPath()
      g.moveTo(cx, cy)
      g.lineTo(cx + Math.cos(a) * 400, cy + Math.sin(a) * 400)
      g.stroke()
    }
    for (let r = 26; r < 300; r += 30) {
      g.beginPath()
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2
        const rr = r * (i % 2 ? 0.93 : 1)
        i ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.6) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.6)
      }
      g.stroke()
    }
    return { color: '#ffffff', font: `800 60px ${sans}`, stroke: '#14060a' }
  }
  return null
}

export function buttonCanvas(style, label) {
  const W = 512
  const H = 164
  const [c, g] = makeCanvas(W, H)
  roundRect(g, 3, 3, W - 6, H - 6, 42)
  g.save()
  g.clip()
  const sans = '"Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif'
  let textColor = '#fff'
  let font = `600 52px ${sans}`
  let ty = H / 2 + 18
  let designed = null
  if (style === 'gold') {
    const gr = g.createLinearGradient(0, 0, W, H)
    gr.addColorStop(0, '#f2de92')
    gr.addColorStop(0.45, '#d4ae57')
    gr.addColorStop(1, '#9d752a')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,255,255,0.22)'
    g.beginPath()
    g.moveTo(120, 0)
    g.lineTo(200, 0)
    g.lineTo(120, H)
    g.lineTo(40, H)
    g.fill()
    g.strokeStyle = '#7a5a1c'
    g.lineWidth = 3
    roundRect(g, 24, 20, W - 48, H - 40, 26)
    g.stroke()
    textColor = '#4c7b3c'
  } else if (style === 'velvet') {
    const gr = g.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, '#b3172f')
    gr.addColorStop(1, '#8a0d22')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
    const r = rng(3)
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.12})`
      g.fillRect(r() * W, r() * H, 1, 2)
    }
    g.strokeStyle = '#d7a85a'
    g.lineWidth = 2
    g.setLineDash([7, 6])
    for (const x of [26, W - 26]) {
      g.beginPath()
      g.moveTo(x, 12)
      g.lineTo(x, H - 12)
      g.stroke()
    }
    g.setLineDash([])
    textColor = '#e7bf69'
    font = `700 54px ${sans}`
  } else if (style === 'flag') {
    g.fillStyle = '#3f62d8'
    g.fillRect(0, 0, W, 54)
    g.fillStyle = '#d8262b'
    g.fillRect(0, 54, W, 14)
    const gr = g.createLinearGradient(0, 68, 0, 142)
    gr.addColorStop(0, '#e2e5ea')
    gr.addColorStop(1, '#a9afb8')
    g.fillStyle = gr
    g.fillRect(0, 68, W, 74)
    g.fillStyle = '#d8262b'
    g.fillRect(0, 142, W, 22)
    g.fillStyle = '#fff'
    star(g, W / 2, 28, 15, 6.5)
    g.strokeStyle = 'rgba(80,80,90,0.35)'
    g.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      g.beginPath()
      g.moveTo(40 + i * 70, 75)
      g.lineTo(60 + i * 70, 135)
      g.stroke()
    }
    textColor = '#2d4cb4'
    font = `700 48px ${sans}`
    ty = 122
  } else if (style === 'purple') {
    const gr = g.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, '#7432a0')
    gr.addColorStop(1, '#55207a')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
    textColor = '#f3eaff'
    font = `700 50px ${sans}`
  } else if ((designed = drawDesignedButton(g, style, W, H, sans))) {
    textColor = designed.color
    font = designed.font
    if (designed.y) ty = designed.y
  } else {
    // Fantastic Four: blue suit fabric, black side stripes, the "4" emblem on the chest
    const gr = g.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, '#3b86ee')
    gr.addColorStop(0.55, '#2462cc')
    gr.addColorStop(1, '#173f93')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(255,255,255,0.05)'
    g.lineWidth = 1
    for (let x = -H; x < W; x += 6) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + H, H)
      g.stroke()
    }
    for (const x of [0, W - 34]) {
      g.fillStyle = '#0f1218'
      g.fillRect(x, 0, 34, H)
      g.fillStyle = 'rgba(255,255,255,0.75)'
      g.fillRect(x === 0 ? 34 : x - 3, 0, 3, H)
    }
    const cx = 98
    const cy = H / 2
    g.fillStyle = '#0f1218'
    g.beginPath()
    g.arc(cx, cy, 46, 0, 6.3)
    g.fill()
    g.fillStyle = '#f4f6fa'
    g.beginPath()
    g.arc(cx, cy, 40, 0, 6.3)
    g.fill()
    // the "4": a bold slanted numeral built from strokes so it renders the same everywhere
    g.save()
    g.translate(cx + 2, cy + 2)
    g.transform(1, 0, -0.18, 1, 0, 0)
    g.fillStyle = '#2462cc'
    g.strokeStyle = '#0f1218'
    g.lineWidth = 3
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(4, -30)
    g.lineTo(16, -30)
    g.lineTo(16, 4)
    g.lineTo(24, 4)
    g.lineTo(24, 14)
    g.lineTo(16, 14)
    g.lineTo(16, 28)
    g.lineTo(4, 28)
    g.lineTo(4, 14)
    g.lineTo(-24, 14)
    g.lineTo(-24, 4)
    g.closePath()
    g.moveTo(4, -12)
    g.lineTo(-11, 4)
    g.lineTo(4, 4)
    g.closePath()
    g.fill('evenodd')
    g.stroke()
    g.restore()
    const sheen = g.createLinearGradient(0, 0, 0, H * 0.5)
    sheen.addColorStop(0, 'rgba(255,255,255,0.22)')
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = sheen
    g.fillRect(0, 0, W, H * 0.5)
    textColor = '#ffffff'
    font = `700 50px ${sans}`
  }
  g.restore()
  g.textAlign = 'center'
  g.font = font
  const tx = style === 'four' ? W / 2 + 46 : designed?.x ?? W / 2
  if (style === 'four') {
    g.fillStyle = 'rgba(8,20,50,0.45)'
    g.fillText(label, tx + 2, ty + 3)
  }
  if (designed?.stroke) {
    g.strokeStyle = designed.stroke
    g.lineWidth = 6
    g.lineJoin = 'round'
    g.strokeText(label, tx, ty)
  }
  if (designed?.glow) {
    g.shadowColor = designed.glow
    g.shadowBlur = 16
  }
  g.fillStyle = textColor
  g.fillText(label, tx, ty)
  g.shadowBlur = 0
  return c
}

function star(g, cx, cy, R, r) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? r : R
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  g.closePath()
  g.fill()
}

export function plaqueCanvas(title, line) {
  const [c, g] = makeCanvas(512, 170)
  const gr = g.createLinearGradient(0, 0, 0, 170)
  gr.addColorStop(0, '#2a2b26')
  gr.addColorStop(1, '#141512')
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 170)
  g.strokeStyle = '#8f7a42'
  g.lineWidth = 4
  g.strokeRect(10, 10, 492, 150)
  g.textAlign = 'center'
  g.fillStyle = '#f0d494'
  g.shadowColor = '#ffb45a'
  g.shadowBlur = 12
  g.font = '700 38px Cinzel, serif'
  g.fillText(title, 256, 72, 470)
  g.shadowBlur = 0
  g.fillStyle = '#c7b98a'
  g.font = 'italic 22px "IM Fell English", Georgia, serif'
  g.fillText(line, 256, 118, 470)
  return c
}

export const crackTexture = (seed = 1) =>
  memo('crack' + seed, () => {
    const r = rng(seed * 31)
    const [c, g] = makeCanvas(512, 512)
    const branch = (x, y, a, len, wdt, depth) => {
      g.lineWidth = wdt
      g.beginPath()
      g.moveTo(x, y)
      for (let i = 0; i < len; i++) {
        a += (r() - 0.5) * 0.9
        x += Math.cos(a) * 14
        y += Math.sin(a) * 14
        g.lineTo(x, y)
        if (depth < 3 && r() < 0.12) {
          g.stroke()
          branch(x, y, a + (r() - 0.5) * 1.8, len * 0.5, wdt * 0.6, depth + 1)
          g.lineWidth = wdt
          g.beginPath()
          g.moveTo(x, y)
        }
      }
      g.stroke()
    }
    g.lineCap = 'round'
    g.strokeStyle = 'rgba(80,255,130,0.9)'
    g.shadowColor = '#3dff7a'
    g.shadowBlur = 18
    branch(256, 20, Math.PI / 2, 34, 7, 0)
    g.shadowBlur = 0
    g.strokeStyle = 'rgba(230,255,235,0.95)'
    branch(256, 20, Math.PI / 2, 0, 2, 0)
    return toTexture(c)
  })

export const mandalaTexture = () =>
  memo('mandala', () => {
    const [c, g] = makeCanvas(512, 512)
    g.translate(256, 256)
    g.strokeStyle = '#ffb35a'
    g.fillStyle = '#ffb35a'
    g.shadowColor = '#ff8a1a'
    g.shadowBlur = 10
    for (const [rad, w] of [[240, 6], [214, 3], [150, 4], [120, 2], [60, 3]]) {
      g.lineWidth = w
      g.beginPath()
      g.arc(0, 0, rad, 0, 6.3)
      g.stroke()
    }
    g.font = '22px serif'
    g.textAlign = 'center'
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'
    for (let i = 0; i < 36; i++) {
      g.save()
      g.rotate((i / 36) * Math.PI * 2)
      g.fillText(glyphs[i % glyphs.length], 0, -222)
      g.restore()
    }
    g.lineWidth = 3
    for (let k = 0; k < 2; k++) {
      g.beginPath()
      for (let i = 0; i <= 4; i++) {
        const a = (i / 4) * Math.PI * 2 + k * (Math.PI / 4)
        g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150)
      }
      g.stroke()
    }
    for (let i = 0; i < 12; i++) {
      g.save()
      g.rotate((i / 12) * Math.PI * 2)
      g.beginPath()
      g.moveTo(0, -60)
      g.lineTo(0, -120)
      g.stroke()
      g.restore()
    }
    return toTexture(c)
  })

export const shieldTexture = () =>
  memo('shield', () => {
    const [c, g] = makeCanvas(512, 512)
    const rings = [
      [256, '#a11d22'],
      [205, '#c9ccd1'],
      [160, '#a11d22'],
      [112, '#1f3f8f'],
    ]
    for (const [rad, col] of rings) {
      g.fillStyle = col
      g.beginPath()
      g.arc(256, 256, rad, 0, 6.3)
      g.fill()
    }
    g.fillStyle = '#d8dbe0'
    star(g, 256, 256, 100, 40)
    const r = rng(5)
    for (let i = 0; i < 40; i++) {
      const x = r() * 512
      const y = r() * 512
      const rad = 20 + r() * 60
      const sg = g.createRadialGradient(x, y, 0, x, y, rad)
      sg.addColorStop(0, 'rgba(10,8,5,0.5)')
      sg.addColorStop(1, 'rgba(10,8,5,0)')
      g.fillStyle = sg
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
    g.strokeStyle = '#090909'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(150, 30)
    let x = 150
    for (let y = 30; y < 490; y += 30) {
      x += (r() - 0.4) * 30
      g.lineTo(x, y)
    }
    g.stroke()
    g.strokeStyle = 'rgba(80,255,130,0.8)'
    g.lineWidth = 1.5
    g.stroke()
    return toTexture(c)
  })

// Doom emblem: ringed sigil with a mask silhouette
export function drawEmblem(g, cx, cy, R, color = '#4dff7a') {
  g.save()
  g.strokeStyle = color
  g.fillStyle = color
  g.lineWidth = R * 0.06
  g.beginPath()
  g.arc(cx, cy, R, 0, 6.3)
  g.stroke()
  g.lineWidth = R * 0.02
  g.beginPath()
  g.arc(cx, cy, R * 0.86, 0, 6.3)
  g.stroke()
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86)
    g.lineTo(cx + Math.cos(a) * R * (i % 2 ? 0.92 : 0.98), cy + Math.sin(a) * R * (i % 2 ? 0.92 : 0.98))
    g.stroke()
  }
  // mask silhouette: the same armoured faceplate as the 3D mask (lib/maskShape.js outline)
  const s = R * 0.62
  const P = (x, y) => [cx + x * s, cy - y * s]
  const right = [[0.0, 0.745], [0.24, 0.72], [0.47, 0.66], [0.53, 0.45], [0.555, 0.12], [0.505, -0.18], [0.41, -0.5], [0.27, -0.72], [0.0, -0.765]]
  const outline = [...right, ...right.slice(1, -1).reverse().map(([x, y]) => [-x, y])]
  g.beginPath()
  outline.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))))
  g.closePath()
  g.fill()
  const hole = (pts) => {
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))))
    g.closePath()
    g.fill()
  }
  g.globalCompositeOperation = 'destination-out'
  for (const sx of [1, -1]) hole([[0.1 * sx, 0.165], [0.375 * sx, 0.215], [0.365 * sx, 0.165], [0.115 * sx, 0.108]])
  for (let i = 0; i < 4; i++) {
    const x0 = -0.17 + i * 0.09
    hole([[x0, -0.22], [x0 + 0.06, -0.22], [x0 + 0.06, -0.445], [x0, -0.445]])
  }
  // brow and nose ridge as fine engraved lines
  g.lineWidth = Math.max(1, R * 0.018)
  g.beginPath()
  g.moveTo(...P(-0.48, 0.34))
  g.lineTo(...P(0, 0.26))
  g.lineTo(...P(0.48, 0.34))
  g.moveTo(...P(0, 0.26))
  g.lineTo(...P(0, -0.14))
  g.stroke()
  g.globalCompositeOperation = 'source-over'
  g.restore()
}

export const emblemTexture = () =>
  memo('emblem', () => {
    const [c, g] = makeCanvas(512, 512)
    g.shadowColor = '#ffc46a'
    g.shadowBlur = 20
    drawEmblem(g, 256, 256, 220, '#e6c983')
    return toTexture(c)
  })

export const bannerTexture = () =>
  memo('banner', () => {
    const [c, g] = makeCanvas(256, 640)
    const gr = g.createLinearGradient(0, 0, 0, 640)
    gr.addColorStop(0, '#0d2b16')
    gr.addColorStop(1, '#071a0d')
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 640)
    g.fillStyle = '#b39a55'
    g.fillRect(0, 0, 256, 14)
    g.fillRect(14, 0, 6, 640)
    g.fillRect(236, 0, 6, 640)
    drawEmblem(g, 128, 230, 90, '#c8b067')
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    g.moveTo(0, 640)
    g.lineTo(128, 560)
    g.lineTo(256, 640)
    g.fill()
    g.globalCompositeOperation = 'source-over'
    return toTexture(c)
  })

// Alpha map for the mask: eye slits and mouth grille punched out (uv space of lib/maskShape.js)
export const maskAlphaTexture = () =>
  memo('maskAlpha', () => {
    const [c, g] = makeCanvas(512, 512)
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 512, 512)
    g.fillStyle = '#000'
    for (const s of [-1, 1]) {
      g.beginPath()
      const x0 = 256 + s * 44
      const x1 = 256 + s * 140
      g.moveTo(x0, 203)
      g.lineTo(x1, 196)
      g.lineTo(x1 - s * 6, 214)
      g.lineTo(x0, 222)
      g.closePath()
      g.fill()
    }
    for (let i = -3; i <= 3; i++) g.fillRect(256 + i * 21 - 5, 336, 10, 58)
    return toTexture(c, { srgb: false })
  })
