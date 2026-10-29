export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const seg = (p, a, b) => clamp((p - a) / (b - a))
export const smooth = (a, b, x) => {
  const t = seg(x, a, b)
  return t * t * (3 - 2 * t)
}
export const lerp = (a, b, t) => a + (b - a) * t
export const bump = (p, a, b, c, d) => smooth(a, b, p) * (1 - smooth(c, d, p))
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function rng(seed = 1) {
  let s = Math.floor(seed) % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
