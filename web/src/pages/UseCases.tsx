import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Help from '../components/Help'
import { COMPANION, COMPANION_APPS } from '../lib/companion'
import { APP_ANSWERS } from '../lib/appAnswers'
import { CalendarFlame, HazeCloud, Magnifier, Shield, TrafficLight, Volcano } from '../components/AppIcons'
import type { CompanionApp } from '../lib/companion'
import { useWidth } from '../lib/useWidth'

interface Ping { lastCallAt: string; ok: boolean }
const VW = 900, VH = 620 // virtual size each window renders at, then scaled to fit

/** P2.2 Control room: six live windows onto the separate companion site (iframes, ?embed=1). */
export default function UseCases() {
  const [pings, setPings] = useState<Record<string, Ping>>({})
  const [open, setOpen] = useState<CompanionApp | null>(null)
  const [w, setW] = useState(typeof window === 'undefined' ? 1440 : window.innerWidth)
  useEffect(() => { document.title = 'Use Cases · Fire Rings' }, [])
  useEffect(() => {
    const origin = new URL(COMPANION).origin
    const on = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== 'fire-rings-apps' || typeof e.data.page !== 'string') return
      setPings((p) => ({ ...p, [e.data.page]: { lastCallAt: String(e.data.lastCallAt), ok: !!e.data.ok } }))
    }
    window.addEventListener('message', on)
    const r = () => setW(window.innerWidth)
    window.addEventListener('resize', r)
    return () => { window.removeEventListener('message', on); window.removeEventListener('resize', r) }
  }, [])
  const phone = w <= 640
  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <p className="eyebrow">Open data in use<Help id="use-cases" /></p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[40px]">Use Cases</h1>
        <p className="mt-3 text-base text-muted">Example apps anyone can build on Fire Rings open data — we built six on a separate site. <strong className="text-text">These windows are live</strong>: each one calls the Fire Rings API right now, and shows its last call.</p>
        <p className="mt-2 text-sm text-muted">Live alerts → see <Link to="/watch">Fire Watch</Link> · Endpoints → <Link to="/data#api-h">Data page</Link> · <a href={COMPANION} target="_blank" rel="noreferrer">Open the apps site ↗</a></p>
      </header>
      {phone ? (
        <ul className="space-y-4" data-testid="usecase-list">
          {COMPANION_APPS.map((a) => <PhoneCard key={a.page} app={a} />)}
        </ul>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="usecase-grid">
          {COMPANION_APPS.map((a) => <Cam key={a.page} app={a} ping={pings[a.page]} onExpand={() => setOpen(a)} />)}
        </div>
      )}
      <p className="text-xs text-faint">The apps site imports no Fire Rings code: it only makes HTTP calls to fire-rings.vercel.app and public NASA services (each page has an API inspector). Windows load when they scroll into view; if one cannot load, a recent screenshot is shown instead.</p>
      {open && <Modal app={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

const ICON: Record<string, () => React.ReactElement> = {
  expect: CalendarFlame, factcheck: Magnifier, insurance: Shield, smoke: HazeCloud, volcano: Volcano, land: () => <TrafficLight level={null} />,
}

/** #92 phone card: the app's own colours + icon + the answer it shows for its default region (from the published JSON). */
function PhoneCard({ app: a }: { app: CompanionApp }) {
  const [ans, setAns] = useState<string | null>(null)
  const page = a.page
  useEffect(() => { let alive = true; APP_ANSWERS[page]?.().then((t) => alive && setAns(t)).catch(() => alive && setAns(null)); return () => { alive = false } }, [page])
  const Icon = ICON[a.page]
  return (
    <li className="rounded-[var(--radius)] border-2 p-4" style={{ background: a.bg, borderColor: a.color, color: a.fg }} data-testid="usecase-card" data-page={a.page}>
      <div className="flex items-start gap-3">
        <span className="h-14 w-14 shrink-0"><Icon /></span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase opacity-90">CAM {a.n} · {a.title}</p>
          <p className="mt-1 text-sm opacity-90">{a.q}</p>
        </div>
      </div>
      <p className="mt-3 font-display text-lg leading-snug font-bold" data-testid="usecase-answer">{ans ?? 'Loading the answer from Fire Rings…'}</p>
      <a href={`${COMPANION}${a.path}`} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-sm px-3 py-1.5 text-sm font-semibold no-underline" style={{ background: a.color, color: a.page === 'volcano' ? '#140C08' : '#FFFFFF' }}>Open app ↗</a>
    </li>
  )
}

function Cam({ app, ping, onExpand }: { app: CompanionApp; ping?: Ping; onExpand: () => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const box = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [fallback, setFallback] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  // no message from the window within 25 s → show the screenshot (blocked frame, offline, …)
  useEffect(() => {
    if (!visible || ping) return
    const t = setTimeout(() => setFallback(true), 25_000)
    return () => clearTimeout(t)
  }, [visible, ping, nonce])
  const scale = width ? width / VW : 0.4
  const t = ping ? new Date(ping.lastCallAt) : null
  return (
    <section className="card !p-0 overflow-hidden" data-testid="cam" data-page={app.page} data-live={ping ? 'yes' : 'no'}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="truncate font-mono text-[11px] tracking-wider text-muted uppercase">CAM {app.n} · {app.title}</span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
          <span className={`h-2 w-2 rounded-full ${ping ? (ping.ok ? 'bg-ok' : 'bg-danger') : 'bg-faint'} ${ping ? 'animate-pulse' : ''}`} aria-hidden="true" />
          <span className={ping ? 'text-ok' : 'text-faint'}>{ping ? 'LIVE' : fallback ? 'SCREENSHOT' : 'CONNECTING'}</span>
        </span>
      </div>
      <div ref={box}>
        <div ref={ref} className="relative overflow-hidden bg-bg" style={{ height: VH * scale }}>
          {fallback && !ping ? (
            <img src={app.shot} alt={`Screenshot of ${app.title}`} className="h-full w-full object-cover object-top" />
          ) : visible ? (
            <iframe key={nonce} title={`${app.title} (live, from the Fire Rings Apps site)`} src={`${COMPANION}${app.path}?embed=1`} loading="lazy"
              style={{ width: VW, height: VH, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }} className="pointer-events-none absolute top-0 left-0" />
          ) : null}
          <button onClick={onExpand} className="absolute inset-0 cursor-zoom-in" aria-label={`Expand ${app.title}`} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted">
        <span data-testid="cam-last">{t ? <>last API call <span className="num text-text">{t.toLocaleTimeString('en-GB')}</span> {ping!.ok ? <span className="text-ok">✓</span> : <span className="text-danger">✕</span>}</> : 'waiting for the first call…'}</span>
        <span className="flex gap-1.5">
          <button onClick={() => { setNonce((n) => n + 1); setFallback(false) }} className="rounded-sm border border-border-strong px-2 py-0.5 hover:bg-surface-2" aria-label={`Refresh ${app.title}`}>↻</button>
          <button onClick={onExpand} className="rounded-sm border border-border-strong px-2 py-0.5 hover:bg-surface-2">Expand</button>
          <a href={`${COMPANION}${app.path}`} target="_blank" rel="noreferrer" className="rounded-sm border border-border-strong px-2 py-0.5 no-underline hover:bg-surface-2">Open ↗</a>
        </span>
      </div>
    </section>
  )
}

function Modal({ app, onClose }: { app: CompanionApp; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cam-modal-h">
      <button className="absolute inset-0 bg-black/70" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div className="relative flex h-[88vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-[var(--radius)] border border-border-strong bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 id="cam-modal-h" className="font-display text-base font-semibold">CAM {app.n} · {app.title} <span className="ml-2 text-xs font-normal text-muted">{app.who}</span></h2>
          <span className="flex gap-2 text-sm">
            <a href={`${COMPANION}${app.path}`} target="_blank" rel="noreferrer" className="rounded-sm bg-accent px-3 py-1 font-semibold text-bg no-underline">Open full app ↗</a>
            <button ref={close} onClick={onClose} className="rounded-sm border border-border-strong px-2.5 py-1 text-muted hover:text-text" aria-label="Close (Esc)">✕</button>
          </span>
        </div>
        <iframe title={`${app.title} (live)`} src={`${COMPANION}${app.path}?embed=1`} className="w-full flex-1 border-0 bg-bg" />
      </div>
    </div>
  )
}
