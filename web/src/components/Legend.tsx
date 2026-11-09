import type { ClassScale } from '../lib/scales'

export default function Legend({ scale, unit, vertical }: { scale: ClassScale; unit: string; vertical?: boolean }) {
  const items = scale.colors.map((c, i) => ({ c, label: scale.labels[i] }))
  return (
    <figure className="text-xs" aria-label={`Colour legend, ${unit}`}>
      <figcaption className="eyebrow mb-2">{unit}</figcaption>
      <ul className={vertical ? 'flex flex-col-reverse gap-1' : 'flex flex-wrap gap-x-3 gap-y-1.5'}>
        {items.map((it) => (
          <li key={it.c} className="flex items-center gap-2">
            <span className="h-3 w-5 rounded-[3px]" style={{ background: it.c }} aria-hidden="true" />
            <span className="num text-muted">{it.label}</span>
          </li>
        ))}
      </ul>
      <ul className={`mt-3 border-t border-border pt-3 ${vertical ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-x-4 gap-y-1.5'}`}>
        <li className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-[3px] border border-border" style={{ background: 'var(--zero)' }} aria-hidden="true" />
          <span className="text-muted">Zero</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-[3px]" aria-hidden="true"
            style={{ background: 'repeating-linear-gradient(45deg, var(--border-strong) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, var(--border-strong) 0 1px, transparent 1px 4px)' }} />
          <span className="text-muted">No data / insufficient coverage</span>
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
      <p className="mt-3 text-faint">
        {scale.colors.length} quantile classes of this region's non-zero months{scale.colors.length < 7 ? ' (tied values merged)' : ''}.
      </p>
    </figure>
  )
}
