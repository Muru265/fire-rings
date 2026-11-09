import { ANOM_COLORS, ANOM_LABELS, GUARD_HEX } from '../lib/colors'
import type { ClassScale } from '../lib/scales'
import type { CalMode } from '../lib/types'

const NODATA_BG = 'repeating-linear-gradient(45deg, var(--border-strong) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, var(--border-strong) 0 1px, transparent 1px 4px)'

export default function Legend({ scale, unit, mode = 'counts', vertical }: { scale: ClassScale; unit: string; mode?: CalMode; vertical?: boolean }) {
  const items = mode === 'anomaly'
    ? ANOM_COLORS.map((c, i) => ({ c, label: ANOM_LABELS[i] }))
    : scale.colors.map((c, i) => ({ c, label: scale.labels[i] }))
  return (
    <figure className="text-xs" aria-label={`Colour legend, ${mode === 'anomaly' ? 'ratio to the typical month' : unit}`}>
      <figcaption className="eyebrow mb-2">{mode === 'anomaly' ? 'Ratio to typical month' : unit}</figcaption>
      <ul className={vertical ? 'flex flex-col-reverse gap-1' : 'flex flex-wrap gap-x-3 gap-y-1.5'}>
        {items.map((it) => (
          <li key={it.c + it.label} className="flex items-center gap-2">
            <span className="h-3 w-5 rounded-[3px]" style={{ background: it.c }} aria-hidden="true" />
            <span className="num text-muted">{it.label}</span>
          </li>
        ))}
      </ul>
      <ul className={`mt-3 border-t border-border pt-3 ${vertical ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-x-4 gap-y-1.5'}`}>
        {mode === 'counts' ? (
          <li className="flex items-center gap-2">
            <span className="h-3 w-5 rounded-[3px] border border-border" style={{ background: 'var(--zero)' }} aria-hidden="true" />
            <span className="text-muted">Zero</span>
          </li>
        ) : (
          <li className="flex items-center gap-2">
            <span className="flex h-3 w-5 items-center justify-center rounded-[3px] text-[9px] text-text" style={{ background: GUARD_HEX }} aria-hidden="true">~</span>
            <span className="text-muted">Too little fire to judge</span>
          </li>
        )}
        <li className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-[3px]" aria-hidden="true" style={{ background: NODATA_BG }} />
          <span className="text-muted">No data / insufficient coverage</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-[3px]" aria-hidden="true"
            style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.4) 0 1.4px, var(--surface-3) 1.4px 5px)' }} />
          <span className="text-muted">Uncertain (wide 90% interval) or Terra only (2001 – Jun 2002)</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-[3px] bg-surface-3" style={{ outline: '1px dotted var(--text)', outlineOffset: '-1px' }} aria-hidden="true" />
          <span className="text-muted">Provisional / month to date</span>
        </li>
        <li className="flex items-center gap-2">
          <svg width="20" height="12" aria-hidden="true"><line x1="0" y1="6" x2="20" y2="6" stroke="var(--text)" strokeWidth="1.2" strokeDasharray="4 3" /></svg>
          <span className="text-muted">MODIS → VIIRS (2012)</span>
        </li>
      </ul>
      {mode === 'counts' ? (
        <p className="mt-3 text-faint">
          {scale.colors.length} quantile classes of this region's non-zero months{scale.colors.length < 7 ? ' (tied values merged)' : ''}.
        </p>
      ) : (
        <p className="mt-3 text-faint">▲ ≥ 2× typical · ▼ ≤ ½ typical. Typical = baseline median 2003–2022.</p>
      )}
    </figure>
  )
}
