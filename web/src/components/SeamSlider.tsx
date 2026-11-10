import { useEffect, useId, useRef } from 'react'

/** Before fix (raw) ↔ After fix (harmonized). Only the two ends are real data; in-between is a colour blend shown
 *  while animating, so releasing the handle snaps to the nearest end (QA #10). "▶ Show the fix" animates raw → fixed. */
export default function SeamSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const id = useId()
  const pct = Math.round(value * 100)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const animateTo = (target: number) => {
    cancelAnimationFrame(raf.current)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) { onChange(target); return }
    const from = value === target ? 1 - target : value
    const t0 = performance.now()
    const dur = 2200
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      onChange(from + (target - from) * e)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    if (value === target) onChange(from)
    raf.current = requestAnimationFrame(step)
  }
  const snap = () => onChange(value >= 0.5 ? 1 : 0)
  const state = pct === 0 ? 'Before the fix (raw)' : pct === 100 ? 'After the fix (harmonized)' : 'Blending… (animation only — values are real only at the two ends)'

  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-40' : ''}`} data-testid="seam">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="eyebrow">Raw ↔ Fixed</label>
        <span className="text-muted" aria-live="polite">{state}</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={disabled} onClick={() => { cancelAnimationFrame(raf.current); onChange(0) }}
          className={`rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${value === 0 ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}>
          Before fix
        </button>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          disabled={disabled}
          onChange={(e) => { cancelAnimationFrame(raf.current); onChange(Number(e.target.value) / 100) }}
          onPointerUp={snap}
          onTouchEnd={snap}
          aria-valuetext={pct === 0 ? 'Before the fix: raw, MODIS before 2012 and unconverted VIIRS after' : pct === 100 ? 'After the fix: harmonized, MODIS-equivalent' : `${pct}% blended`}
          className="seam h-1.5 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--surface-3) ${pct}%)` }}
        />
        <button type="button" disabled={disabled} onClick={() => { cancelAnimationFrame(raf.current); onChange(1) }}
          className={`rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${value === 1 ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}>
          After fix
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={disabled} onClick={() => animateTo(1)} data-testid="show-fix"
          className="rounded-sm bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:brightness-110 disabled:opacity-40">▶ Show the fix</button>
        <span className="text-xs text-muted">Raw = MODIS until 2011, then the new VIIRS satellite unconverted from 2012 → a fake jump. Fixed = everything in MODIS-equivalent units.</span>
      </div>
    </div>
  )
}
