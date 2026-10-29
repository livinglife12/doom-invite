import { useEffect, useState } from 'react'
import { useStore, setS } from '../state'
import { director } from '../director'
import { audio } from '../audio'
import { input } from '../world'
import Rsvp from './Rsvp'

// Typography and controls layered over the canvas. Kept minimal: captions are "projected" text,
// prompts are ceremonial, and everything else stays out of the way.
export default function Overlay({ ready }) {
  const s = useStore()
  const [gateVisible, setGateVisible] = useState(false)
  const [hintOn, setHintOn] = useState(false)

  useEffect(() => {
    if (s.phase !== 'tv') return setGateVisible(false)
    const t = setTimeout(() => setGateVisible(true), 2600)
    return () => clearTimeout(t)
  }, [s.phase])

  useEffect(() => {
    if (!s.hint) return setHintOn(false)
    setHintOn(true)
    const start = performance.now()
    const id = setInterval(() => {
      if (input.last > start + 400 || performance.now() - start > 7000) {
        setHintOn(false)
        clearInterval(id)
      }
    }, 200)
    return () => clearInterval(id)
  }, [s.hint])

  const started = !['loading', 'tv'].includes(s.phase)

  return (
    <div className="overlay">
      <div className={`veil veil-${s.veil}`} />
      {!ready && <div className="loading">· · ·</div>}

      {s.phase === 'tv' && (
        <button className={`gate ${gateVisible ? 'in' : ''}`} onClick={() => director.powerOnTV()} aria-label="Turn on the television">
          <span className="gate-line">TURN THE DIAL</span>
        </button>
      )}

      {s.caption && (
        <div key={s.caption.id} className={`caption ${s.caption.kind}`}>
          {(() => {
            let n = 0
            return s.caption.text.split(' ').flatMap((word, w) => [
              <span key={w} className="word">
                {word.split('').map((ch) => (
                  <span key={n} style={{ animationDelay: `${n++ * 0.028}s` }}>
                    {ch}
                  </span>
                ))}
              </span>,
              ' ',
            ])
          })()}
          {s.sub && s.caption.kind === 'shrine' && (
            <div key={s.sub} className="subline">
              {s.sub}
            </div>
          )}
        </div>
      )}

      {hintOn && <div className="hint">{s.hint}</div>}

      {s.prompt && (
        <button key={s.prompt.label} className="prompt" onClick={s.prompt.action}>
          <span>{s.prompt.label}</span>
        </button>
      )}

      {s.cue && <div className="cue">{s.cue}</div>}

      {s.inspect && (
        <div className="inspect" onClick={() => setS({ inspect: null })}>
          <img src={s.inspect.src} alt={s.inspect.headline} />
          <span className="inspect-close">TAP TO RETURN</span>
        </div>
      )}

      {s.rsvp && <Rsvp />}

      {started && !s.ended && (
        <div className="controls">
          <button
            className="ctl"
            onClick={() => {
              audio.setEnabled(!s.sound)
              setS({ sound: !s.sound })
            }}
            aria-label={s.sound ? 'Mute sound' : 'Enable sound'}
          >
            {s.sound ? 'SOUND ◉' : 'SOUND ○'}
          </button>
          {s.skip && !s.rsvp && (
            <button className="ctl" onClick={() => director.skip()}>
              SKIP ›
            </button>
          )}
        </div>
      )}
    </div>
  )
}
