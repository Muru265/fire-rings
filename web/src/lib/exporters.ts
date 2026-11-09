import type { MonthRec } from './types'

export const CITATION = 'Fire Rings Harmonized Hotspot Record v1.0 (2026), NASA Space Apps 2026. Derived from NASA FIRMS MODIS C6.1 + VIIRS 375 m. CC BY 4.0.'

export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const cell = (v: number | null | undefined) => (v == null ? '' : String(v))

/** Calendar CSV with a header comment line (region, dates, version, citation) — opens cleanly in Excel. */
export function calendarCsv(name: string, months: MonthRec[], note: string): string {
  const first = months[0]
  const last = months[months.length - 1]
  const head = `# Fire Rings v1 · ${name} · ${first.y}-${String(first.m).padStart(2, '0')} to ${last.y}-${String(last.m).padStart(2, '0')} · ${note} · ${CITATION}`
  const cols = 'year,month,fire_days_H,H_lo90,H_hi90,raw_modis_celldays,raw_viirs_celldays,hotspots_modis,hotspots_viirs,source,flags,ratio_to_median,pct_lo,pct_hi'
  const rows = months.map((r) => [r.y, r.m, cell(r.H), cell(r.lo), cell(r.hi), cell(r.raw_modis), cell(r.raw_viirs), cell(r.hot_modis),
    cell(r.hot_viirs), r.src, r.flags.join('|'), cell(r.ratio), cell(r.pct?.[0]), cell(r.pct?.[1])].join(','))
  return [head, cols, ...rows].join('\n') + '\n'
}

export async function downloadPng(node: HTMLElement, name: string) {
  const { toPng } = await import('html-to-image')
  const url = await toPng(node, { pixelRatio: 2, backgroundColor: '#0A0E14', cacheBust: true })
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}
