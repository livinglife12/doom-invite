import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state'
import { director } from '../director'
import { EVENT } from '../config/event'
import { rng } from '../lib/util'

function Sigil({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M50.0 23.2 L59.6 24.1 L68.8 26.2 L71.2 33.8 L72.2 45.7 L70.2 56.5 L66.4 68.0 L60.8 75.9 L50.0 77.5 L39.2 75.9 L33.6 68.0 L29.8 56.5 L27.8 45.7 L28.8 33.8 L31.2 26.2 L40.4 24.1 Z" fill="currentColor" />
      <path d="M54.0 44.1 L65.0 42.3 L64.6 44.1 L54.6 46.1 Z M46.0 44.1 L35.0 42.3 L35.4 44.1 L45.4 46.1 Z" fill="var(--hole, #000)" />
      {[-0.17, -0.08, 0.01, 0.1].map((x) => (
        <rect key={x} x={50 + x * 40} y={50 + 0.22 * 36} width={0.06 * 40} height={0.225 * 36} fill="var(--hole, #000)" />
      ))}
    </svg>
  )
}

// The RSVP decree: a burnt parchment born inside the mask. Name, attendance, an optional message
// and a hand-drawn signature. Sealing it hands the signed page to the 3D burn.
export default function Rsvp() {
  const stage = useStore((s) => s.rsvpStage)
  const ack = useStore((s) => s.ack)
  const [name, setName] = useState('')
  const [attend, setAttend] = useState('yes')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const sig = useRef()
  const ink = useRef(0)

  const clip = useMemo(() => {
    const r = rng(42)
    const pts = []
    const N = 22
    for (let i = 0; i <= N; i++) pts.push(`${(i / N) * 100}% ${r() * 1.6}%`)
    for (let i = 0; i <= N; i++) pts.push(`${100 - r() * 1.6}% ${(i / N) * 100}%`)
    for (let i = N; i >= 0; i--) pts.push(`${(i / N) * 100}% ${100 - r() * 1.6}%`)
    for (let i = N; i >= 0; i--) pts.push(`${r() * 1.6}% ${(i / N) * 100}%`)
    return `polygon(${pts.join(',')})`
  }, [])

  useEffect(() => {
    const c = sig.current
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const rect = c.getBoundingClientRect()
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    const g = c.getContext('2d')
    g.scale(dpr, dpr)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = '#1e1208'
    let last = null
    let lastT = 0
    let width = 2.4
    const pos = (e) => {
      const r = c.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const down = (e) => {
      e.preventDefault()
      c.setPointerCapture(e.pointerId)
      last = pos(e)
      lastT = performance.now()
    }
    const move = (e) => {
      if (!last) return
      const p = pos(e)
      const now = performance.now()
      const d = Math.hypot(p[0] - last[0], p[1] - last[1])
      const v = d / Math.max(1, now - lastT)
      width = width * 0.7 + Math.max(1.1, 3.4 - v * 1.6) * 0.3
      g.lineWidth = width
      g.beginPath()
      g.moveTo(last[0], last[1])
      g.lineTo(p[0], p[1])
      g.stroke()
      ink.current += d
      last = p
      lastT = now
    }
    const up = () => (last = null)
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const strike = () => {
    const c = sig.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    ink.current = 0
  }

  const submit = () => {
    if (stage !== 'form') return
    if (!name.trim()) return setErr('DOOM REQUIRES YOUR NAME.')
    if (ink.current < 40) return setErr('NOW YOUR MARK. SIGN IT.')
    setErr('')
    director.submitRsvp({ name, attend, msg }, sig.current)
  }

  return (
    <div className={`rsvp ${stage}`}>
      <div className="decree" style={{ clipPath: clip }}>
        <Sigil className="decree-sigil" />
        <p className="kicker">BY DECREE OF DOOM</p>
        <h1>{EVENT.title}</h1>
        <p className="subt">{EVENT.subtitle}</p>
        <p className="details">
          {EVENT.date}
          <br />
          {EVENT.time}
          <br />
          {EVENT.venue}
          <br />
          <em>
            {EVENT.dress} · {EVENT.rsvpBy}
          </em>
        </p>
        <label className="name-row">
          <span>I,</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your name" maxLength={60} disabled={stage !== 'form'} autoComplete="name" />
        </label>
        <div className="choice" role="radiogroup">
          <button type="button" className={attend === 'yes' ? 'on' : ''} onClick={() => setAttend('yes')} disabled={stage !== 'form'}>
            SHALL BEAR WITNESS
          </button>
          <button type="button" className={attend === 'no' ? 'on' : ''} onClick={() => setAttend('no')} disabled={stage !== 'form'}>
            DARE TO DECLINE
          </button>
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Words for Doom (optional)" maxLength={140} rows={2} disabled={stage !== 'form'} />
        <div className="sigwrap">
          <canvas ref={sig} className="sig" />
          <span className="sigline">SIGN YOUR MARK</span>
          {stage === 'form' && (
            <button type="button" className="strike" onClick={strike}>
              STRIKE
            </button>
          )}
        </div>
        {err && <p className="err">{err}</p>}
        {stage === 'form' ? (
          <button type="button" className="seal-btn" onClick={submit}>
            SEAL THE PACT
          </button>
        ) : (
          <p className="ack">{ack}</p>
        )}
        {stage === 'sealed' && (
          <div className="wax">
            <Sigil />
          </div>
        )}
      </div>
    </div>
  )
}
