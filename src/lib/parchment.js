import { EVENT } from '../config/event'
import { makeCanvas, drawEmblem, wrapText } from './textures'
import { rng } from './util'

// Re-draws the signed decree onto a canvas so the 3D burn shader can consume it.
// Returns the signature's uv so the fire reaches it last.
export function composeParchment(data, sigCanvas, attend) {
  const W = 900
  const H = 1300
  const [c, g] = makeCanvas(W, H)
  const r = rng(11)
  const bg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 820)
  bg.addColorStop(0, '#e2cf9f')
  bg.addColorStop(0.7, '#c9ab70')
  bg.addColorStop(1, '#6b4a22')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(70,45,15,${r() * 0.08})`
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3)
  }
  g.strokeStyle = 'rgba(60,35,10,0.6)'
  g.lineWidth = 3
  g.strokeRect(46, 46, W - 92, H - 92)
  g.lineWidth = 1
  g.strokeRect(58, 58, W - 116, H - 116)

  const ink = '#2a1a0c'
  g.textAlign = 'center'
  drawEmblem(g, W / 2, 175, 82, '#1f5a2c')
  g.fillStyle = ink
  g.font = '600 28px Cinzel, serif'
  g.fillText('BY DECREE OF DOOM', W / 2, 310)
  g.font = '900 86px "Cinzel Decorative", Cinzel, serif'
  g.fillText(EVENT.title, W / 2, 400)
  g.font = '600 26px Cinzel, serif'
  g.fillText(EVENT.subtitle, W / 2, 445)
  g.font = 'italic 26px "IM Fell English", Georgia, serif'
  g.fillText(EVENT.date, W / 2, 505)
  g.fillText(EVENT.time, W / 2, 542)
  g.fillText(EVENT.venue, W / 2, 579)

  g.font = '34px "IM Fell English", Georgia, serif'
  g.fillText(`I, ${data.name},`, W / 2, 670)
  g.font = '600 30px Cinzel, serif'
  g.fillText(attend === 'no' ? 'DARE TO DECLINE THE SUMMONS.' : 'SHALL BEAR WITNESS TO THE END.', W / 2, 720)
  if (data.message) {
    g.font = 'italic 26px "IM Fell English", Georgia, serif'
    wrapText(g, `“${data.message}”`, W - 220)
      .slice(0, 3)
      .forEach((l, i) => g.fillText(l, W / 2, 790 + i * 34))
  }

  const sx = 170
  const sy = 900
  const sw = W - 340
  const sh = sw * (sigCanvas.height / sigCanvas.width)
  g.drawImage(sigCanvas, sx, sy, sw, sh)
  g.fillStyle = 'rgba(42,26,12,0.7)'
  g.fillRect(sx, sy + sh - 18, sw, 2)
  g.font = '600 18px Cinzel, serif'
  g.fillStyle = ink
  g.fillText('THE MARK OF THE WITNESS', W / 2, sy + sh + 14)

  // wax seal
  const cx = W - 190
  const cy = H - 190
  g.fillStyle = '#1d6b33'
  g.beginPath()
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    const rad = 82 + (i % 2 ? 8 : 0) + r() * 6
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  g.fill()
  drawEmblem(g, cx, cy, 58, '#0b3517')

  return { canvas: c, sig: [(sx + sw / 2) / W, 1 - (sy + sh / 2) / H] }
}
