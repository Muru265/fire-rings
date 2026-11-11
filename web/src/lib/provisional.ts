// #81f: the provisional (near-real-time) months, computed from the published flags — one wording for Proof, paper, slides.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface MonthLike { y: number; m: number; flags: string[] }

/** "Aug–Nov 2026" (or "Dec 2025 – Feb 2026", or "Nov 2026"); null when no month is provisional. */
export function provisionalSpan(months: MonthLike[]): string | null {
  const p = months.filter((x) => x.flags.includes('provisional')).map((x) => x.y * 12 + x.m - 1).sort((a, b) => a - b)
  if (!p.length) return null
  const [a, b] = [p[0], p[p.length - 1]]
  const lab = (k: number) => `${MON[k % 12]} ${Math.floor(k / 12)}`
  if (a === b) return lab(a)
  return Math.floor(a / 12) === Math.floor(b / 12) ? `${MON[a % 12]}–${lab(b)}` : `${lab(a)} – ${lab(b)}`
}
