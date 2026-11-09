import { useId } from 'react'

/** Raw ↔ Harmonized morph. 0 = raw concatenation, 1 = harmonized (MODIS-equivalent). */
export default function SeamSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const id = useId()
  const pct = Math.round(value * 100)
  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="eyebrow">Seam</label>
        <span className="num text-muted" aria-hidden="true">{pct === 0 ? 'Raw' : pct === 100 ? 'Harmonized' : `${pct}%`}</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={disabled} onClick={() => onChange(0)}
          className={`rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${value === 0 ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}>
          Raw
        </button>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-valuetext={pct === 0 ? 'Raw: MODIS before 2012, VIIRS after' : pct === 100 ? 'Harmonized: MODIS-equivalent' : `${pct}% harmonized`}
          className="seam h-1.5 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--surface-3) ${pct}%)` }}
        />
        <button type="button" disabled={disabled} onClick={() => onChange(1)}
          className={`rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${value === 1 ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}>
          Harmonized
        </button>
      </div>
    </div>
  )
}
