// 'high' = shadows, bloom, reflective floor; 'mid' = bloom only; 'low' = no post, fewer particles.
// Override with ?q=low|mid|high.
export function detectQuality() {
  const q = new URLSearchParams(window.location.search).get('q')
  if (q === 'low' || q === 'mid' || q === 'high') return q
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency || 4
  if (mobile && cores <= 4) return 'low'
  if (mobile) return 'mid'
  return 'high'
}

export const particleScale = (q) => (q === 'low' ? 0.4 : q === 'mid' ? 0.7 : 1)

// Ignore loading, hidden tabs and isolated compilation pauses. Adapt once per visit,
// with a stable floor; changing quality must not repeatedly rebuild scene resources.
export function createQualitySampler(initialQuality, { locked = false, startupMs = 8000, sampleMs = 4500, minFps = 28 } = {}) {
  let started = null
  let elapsed = 0
  let frames = 0
  let settled = locked || initialQuality === 'low'
  const floor = initialQuality === 'high' ? 'mid' : 'low'
  return {
    sample(dt, now, visible = true) {
      if (settled) return null
      if (started === null) started = now
      if (!visible || !Number.isFinite(dt) || dt <= 0 || dt > 0.25) {
        // Resume with a fresh grace period after a tab suspension or compile stall.
        started = now
        elapsed = 0
        frames = 0
        return null
      }
      if (now - started < startupMs) return null
      elapsed += dt * 1000
      frames++
      if (elapsed < sampleMs) return null
      const fps = frames * 1000 / elapsed
      elapsed = 0
      frames = 0
      if (fps >= minFps) return null
      settled = true
      return floor
    },
  }
}
