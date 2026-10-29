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
