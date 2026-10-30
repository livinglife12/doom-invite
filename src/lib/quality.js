export const QUALITY_BUDGETS = Object.freeze({
  low: Object.freeze({ dpr: 0.8, shadows: false, post: false }),
  mid: Object.freeze({ dpr: 1, shadows: false, post: false }),
  high: Object.freeze({ dpr: 1.25, shadows: true, post: true }),
})

export function qualityForDevice({ search = '', mobile = false, cores = 4 } = {}) {
  const forced = new URLSearchParams(search).get('q')
  if (['low', 'mid', 'high'].includes(forced)) return forced
  return mobile && cores <= 4 ? 'low' : 'mid'
}

export function detectQuality() {
  return qualityForDevice({ search: window.location.search, mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent), cores: navigator.hardwareConcurrency || 4 })
}

export const particleScale = q => q === 'low' ? 0.4 : q === 'mid' ? 0.7 : 1

// Step down again after sustained slow playback and a cooldown. Ignore isolated
// compilation stalls and suspended tabs rather than degrading on one slow frame.
export function createQualitySampler(initialQuality, { locked = false, startupMs = 2500, sampleMs = 1800, minFps = 38, cooldownMs = 6000 } = {}) {
  let current = initialQuality, eligibleAt = null, elapsed = 0, frames = 0, slowFrames = 0
  return {
    sample(dt, now, visible = true) {
      if (locked || current === 'low') return null
      if (!visible || !Number.isFinite(dt) || dt <= 0) {
        eligibleAt = now + startupMs; elapsed = 0; frames = 0; slowFrames = 0
        return null
      }
      if (eligibleAt === null) eligibleAt = now + startupMs
      if (now < eligibleAt) return null
      if (dt > 0.25) {
        elapsed = 0; frames = 0
        if (++slowFrames < 3) return null
        slowFrames = 0
        current = current === 'high' ? 'mid' : 'low'
        eligibleAt = now + cooldownMs
        return current
      }
      slowFrames = 0
      elapsed += dt * 1000; frames++
      if (elapsed < sampleMs) return null
      const fps = frames * 1000 / elapsed
      elapsed = 0; frames = 0
      if (fps >= minFps) return null
      current = current === 'high' ? 'mid' : 'low'
      eligibleAt = now + cooldownMs
      return current
    },
  }
}
