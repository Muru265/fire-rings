// Plain-language wording for ratios (QA #3, #8). Words always come first, numbers after; colour is never the only cue.

export type Tone = 'much-lower' | 'lower' | 'usual' | 'higher' | 'much-higher' | 'unknown'

export function plainLevel(r: number | null | undefined, guard = false): { text: string; tone: Tone } {
  if (guard) return { text: 'Too little fire to judge', tone: 'unknown' }
  if (r == null) return { text: 'No value', tone: 'unknown' }
  if (r < 0.4) return { text: 'Much lower than usual', tone: 'much-lower' }
  if (r < 0.8) return { text: 'Lower than usual', tone: 'lower' }
  if (r <= 1.25) return { text: 'About usual', tone: 'usual' }
  if (r <= 2) return { text: 'Higher than usual', tone: 'higher' }
  return { text: 'Much higher than usual', tone: 'much-higher' }
}

export const TONE_CLASS: Record<Tone, string> = {
  'much-lower': 'border-[#2166AC]/60 bg-[#2166AC]/20 text-[#9cc6f0]',
  lower: 'border-[#67A9CF]/50 bg-[#67A9CF]/15 text-[#a9d3ec]',
  usual: 'border-border-strong bg-surface-3 text-text',
  higher: 'border-[#EF8A62]/50 bg-[#EF8A62]/15 text-[#f6b89c]',
  'much-higher': 'border-[#B2182B]/60 bg-[#B2182B]/20 text-[#f3a3ad]',
  unknown: 'border-border bg-surface-2 text-muted',
}

/** "about half of normal (0.5×)" — nearest simple fraction/multiple in words, then the exact ratio. */
export function ratioWords(r: number | null | undefined): string {
  if (r == null) return '—'
  const words: [number, string][] = [
    [0.1, 'about a tenth of'], [0.2, 'about a fifth of'], [0.25, 'about a quarter of'], [0.33, 'about a third of'],
    [0.5, 'about half of'], [0.67, 'about two-thirds of'], [0.75, 'about three-quarters of'], [1, 'about'],
    [1.5, 'about one and a half times'], [2, 'about twice'], [3, 'about three times'], [4, 'about four times'],
  ]
  const exact = `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(r)}×`
  if (r > 4.5) return `${exact} normal`
  if (r < 0.06) return `far below normal (${exact})`
  const [, w] = words.reduce((a, b) => (Math.abs(Math.log(b[0] / r)) < Math.abs(Math.log(a[0] / r)) ? b : a))
  return `${w} normal (${exact})`
}
