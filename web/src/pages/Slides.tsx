import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import deck from '../../content/slides.md?raw'
import links from '../../content/links.json'
import Markdown from '../components/Markdown'
import { renderFigure } from '../lib/figures'
import { fill, useContent } from '../lib/content'
import type { ContentData } from '../lib/content'

interface Slide { body: string; notes: string }
const parse = (src: string): Slide[] => src.replace(/\r\n/g, '\n').split(/\n---\n/).map((s) => {
  const [body, notes = ''] = s.split(/\nNote:\s*/)
  return { body: body.trim(), notes: notes.trim() }
})

/** #87: scales its content down (never up) so it always fits the box — no figure or text overflows a slide. */
function FitBox({ children, className = '', testid }: { children: ReactNode; className?: string; testid?: string }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ s: 1, dy: 0 })
  const s = fit.s
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current
    if (!o || !i) return
    const fit = () => {
      const h = i.offsetHeight, w = i.scrollWidth
      const k = Math.min(1, o.clientHeight / Math.max(1, h), o.clientWidth / Math.max(1, w))
      const dy = Math.max(0, Math.round((o.clientHeight - h * k) / 2)) // vertically centred
      setFit((prev) => (Math.abs(prev.s - k) > 0.005 || Math.abs(prev.dy - dy) > 1 ? { s: k, dy } : prev))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(o); ro.observe(i)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={outer} className={`relative h-full min-h-0 w-full min-w-0 overflow-hidden ${className}`} data-testid={testid} data-fit={s.toFixed(3)}>
      <div ref={inner} style={{ transform: `translateY(${fit.dy}px)${s < 1 ? ` scale(${s})` : ''}`, transformOrigin: 'top center' }} className="absolute inset-x-0 top-0">{children}</div>
    </div>
  )
}

function SlideView({ s, c, n, total }: { s: Slide; c: ContentData; n: number; total: number }) {
  const figLine = /^::figure.*$/m.exec(s.body)?.[0]
  const text = s.body.replace(/^::figure.*$/m, '')
  return (
    <div className="slide relative flex aspect-video w-full flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface p-[4%]" data-testid="slide">
      <div className="grid min-h-0 flex-1 gap-[4%]" style={{ gridTemplateColumns: figLine ? 'minmax(0,1.1fr) minmax(0,1fr)' : '1fr' }}>
        <FitBox testid="slide-text"><Markdown src={text} flags={{ reunion: c.reunion }} className="slide-md min-w-0" /></FitBox>
        {figLine && <FitBox className="slide-fig" testid="slide-fig">{(() => { const m = /^::figure\s+(\S+)(?:\s+(\S+))?/.exec(figLine)!; return renderFigure(c, m[1], m[2], true) })()}</FitBox>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
        <span className="font-mono tracking-[0.14em]">FIRE RINGS · NASA SPACE APPS 2026</span>
        <span className="num" data-testid="slide-counter">{n} / {total}</span>
      </div>
    </div>
  )
}

/** P1.8 In-browser deck: ←/→ (or click), F = fullscreen, N = presenter notes. ?print=1 lays out every slide for the PDF. */
export default function Slides() {
  const c = useContent()
  const [params, setParams] = useSearchParams()
  const print = params.get('print') === '1'
  const [i, setI] = useState(() => Math.max(0, Number(params.get('s') ?? 1) - 1))
  const [notes, setNotes] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const slides = parse(c && c !== 'error' ? fill(deck, c.values) : deck)
  const go = useCallback((d: number) => setI((x) => Math.min(slides.length - 1, Math.max(0, x + d))), [slides.length])
  useEffect(() => { document.title = 'Slides · Fire Rings' }, [])
  useEffect(() => { if (!print) setParams((p) => { const q = new URLSearchParams(p); q.set('s', String(i + 1)); return q }, { replace: true }) }, [i, print, setParams])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key.toLowerCase() === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else box.current?.requestFullscreen?.() }
      else if (e.key.toLowerCase() === 'n') setNotes((v) => !v)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go])
  if (c === 'error') return <p className="card text-warn">Could not load the published data for the slides.</p>
  if (!c) return <div className="card aspect-video animate-pulse" aria-busy="true" />
  if (print) return <div className="slides-print space-y-4" data-testid="slides-print">{slides.map((s, j) => <SlideView key={j} s={s} c={c} n={j + 1} total={slides.length} />)}</div>
  return (
    <div className="mx-auto max-w-[1200px] space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link to="/">← Fire Rings</Link>
        <span className="flex flex-wrap gap-2">
          <button onClick={() => box.current?.requestFullscreen?.()} className="rounded-sm border border-border-strong px-3 py-1.5 text-text hover:bg-surface-2">⛶ Fullscreen (F)</button>
          <button onClick={() => setNotes((v) => !v)} aria-pressed={notes} className="rounded-sm border border-border-strong px-3 py-1.5 text-text hover:bg-surface-2">Notes (N)</button>
          <a href={links.slides_pdf} download className="rounded-sm bg-accent px-3 py-1.5 font-semibold text-bg no-underline">Download PDF</a>
          <Link to={links.paper} className="rounded-sm border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-surface-2">Read the paper</Link>
        </span>
      </div>
      <div ref={box} className="slides-stage relative bg-bg" onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) return; go(e.clientX > window.innerWidth / 2 ? 1 : -1) }}>
        <SlideView s={slides[i]} c={c} n={i + 1} total={slides.length} />
      </div>
      <div className="no-print flex items-center justify-center gap-3">
        <button onClick={() => go(-1)} disabled={i === 0} className="rounded-sm border border-border-strong px-3 py-1 disabled:opacity-40" aria-label="Previous slide">←</button>
        <span className="num text-sm text-muted">{i + 1} / {slides.length}</span>
        <button onClick={() => go(1)} disabled={i === slides.length - 1} className="rounded-sm border border-border-strong px-3 py-1 disabled:opacity-40" aria-label="Next slide">→</button>
      </div>
      {notes && <aside className="card text-sm text-muted" data-testid="slide-notes"><p className="eyebrow mb-1">Presenter notes</p>{slides[i].notes || '—'}</aside>}
    </div>
  )
}
