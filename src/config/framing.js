// Every shrine is shown as one complete exhibit. The camera settles here before
// activation and stays here through the hologram, relic and destruction sequence.
const frame = (position, target) => Object.freeze({ position: Object.freeze(position), target: Object.freeze(target) })
export const SHRINE_FRAMING = Object.freeze({
  single: frame([0, 2.8, 8], [0, 2.5, -0.3]),
  team: frame([0, 3, 12.5], [0, 2.6, -0.3]),
})

export const shrineFrame = team => team ? SHRINE_FRAMING.team : SHRINE_FRAMING.single
