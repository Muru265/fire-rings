// #79 star twinkle timing (shared by the main app's Stars and its unit test).
/** each event lasts 1.5–3 s; gaps of 20–90 s between a star's events → ~4% of stars twinkle at any moment */
export const TWINKLE = { durMin: 1500, durMax: 3000, gapMin: 20000, gapMax: 90000 }
/** share of stars inside an event at a random moment (mean duration ÷ mean cycle) */
export const twinkleShare = () => {
  const d = (TWINKLE.durMin + TWINKLE.durMax) / 2, g = (TWINKLE.gapMin + TWINKLE.gapMax) / 2
  return d / (d + g)
}
/** alpha multiplier through one twinkle event, p ∈ [0, 1]: brighten to 1.4× first, then fade fully out and back in */
export const twinkle = (p: number) => (p < 0.2 ? 1 + 0.4 * Math.sin((Math.PI * p) / 0.2) : 0.5 + 0.5 * Math.cos((2 * Math.PI * (p - 0.2)) / 0.8))
