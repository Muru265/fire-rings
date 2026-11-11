import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { helpFor } from '../lib/glossary'
import { useFigure } from '../lib/figureCtx'

/** ⓘ next to a chart title, KPI or control: one-line explanation + "Learn more" deep link into /guide (QA #9). */
export default function Help({ id, label }: { id: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const h = helpFor(id)
  const bare = useFigure()
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  if (!h || bare) return null
  return (
    <span ref={ref} className="relative inline-flex align-middle normal-case tracking-normal" data-help={id}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }} aria-expanded={open}
        aria-label={`How to read: ${label ?? h.title}`}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong font-sans text-[10px] leading-none font-normal text-muted hover:border-accent-2 hover:text-accent-2">i</button>
      {open && (
        <span role="dialog" className="absolute top-6 left-0 z-30 w-64 rounded-sm border border-border-strong bg-surface-3 p-2.5 text-left font-sans text-[12px] leading-snug font-normal text-muted shadow-card">
          <span className="block font-semibold text-text">{h.title}</span>
          <span className="mt-1 block">{h.short}</span>
          <Link to={`/guide#${id}`} className="mt-1.5 inline-block text-accent-2" onClick={() => setOpen(false)}>Learn more in the Guide →</Link>
        </span>
      )}
    </span>
  )
}
