import { useState } from 'react'
import type { Answer } from '../lib/ask'
import { REGIONS } from '../lib/regions'

const TOOL_LABEL: Record<string, string> = {
  list_regions: 'List regions', get_month: 'Month vs typical', get_year_total: 'Year total', get_typical: 'Typical month',
  compare_years: 'Compare years', get_season: 'Seasonal cycle', get_rankings: 'Rankings', get_similar_years: 'Similar years', get_quality: 'Reliability',
}

export default function AnswerCard({ a }: { a: Answer }) {
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState(false)
  const switched = a.switched_region ? REGIONS.find((r) => r.id === a.switched_region)?.name : null
  return (
    <article className="fade-up rounded-sm border border-border bg-surface-2 p-4" data-voice={a.voice} data-source={a.source}>
      <p className="flex flex-wrap items-center gap-2 text-xs text-faint">
        <span><span className="text-muted">You asked:</span> {a.question}</span>
        <span className="rounded-full border border-border-strong px-1.5 py-px font-mono text-[10px] capitalize" data-testid="voice-badge">{a.voice}</span>
        {a.source === 'cache' && (
          <span className="relative">
            <button onClick={() => setWhy((v) => !v)} aria-expanded={why}
              className="rounded-full bg-accent-2/15 px-2 py-px text-[10px] text-accent-2">⚡ Instant answer{a.generated ? ` (saved ${new Date(a.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : ''} ⓘ</button>
            {why && <span className="absolute top-6 left-0 z-10 w-64 rounded-sm border border-border-strong bg-surface-3 p-2 text-[11px] text-muted shadow-card">
              A precomputed answer built from the same verified numbers, shown instantly because the live AI is busy. Numbers are checked the same way.</span>}
          </span>
        )}
      </p>
      {switched && <p className="mt-2 text-xs text-accent-2">Switched to {switched} — your question names it.</p>}
      <p className="mt-3 text-[15px] leading-relaxed text-text">{a.answer}</p>
      {a.caveat && <p className="mt-2 text-xs text-muted"><span className="font-semibold text-warn">Caveat:</span> {a.caveat}</p>}
      <div className="mt-3 border-t border-border pt-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs text-accent-2 hover:underline">
          {open ? '▾' : '▸'} Numbers used ({a.trace.length} {a.trace.length === 1 ? 'lookup' : 'lookups'}){a.verified ? ' · every number verified against these' : ''}
        </button>
        {open && (
          <ol className="mt-2 space-y-2">
            {a.trace.map((t, i) => (
              <li key={i} className="rounded-sm bg-bg/60 p-2 text-[11px]">
                <div className="font-mono text-text">{TOOL_LABEL[t.tool] ?? t.tool} <span className="text-faint">{t.tool}({Object.entries(t.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})</span></div>
                <div className="num mt-1 break-words text-muted">{t.result_summary}</div>
              </li>
            ))}
            {!a.trace.length && <li className="text-[11px] text-faint">No data lookups were needed.</li>}
          </ol>
        )}
      </div>
    </article>
  )
}
