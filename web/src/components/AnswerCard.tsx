import { useState } from 'react'
import type { Answer } from '../lib/ask'

const TOOL_LABEL: Record<string, string> = {
  list_regions: 'List regions', get_month: 'Month vs baseline', get_season: 'Seasonal cycle', get_rankings: 'Rankings',
  get_similar_years: 'Similar years', get_quality: 'Reliability',
}

export default function AnswerCard({ a }: { a: Answer }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="fade-up rounded-sm border border-border bg-surface-2 p-4" aria-live="polite">
      <p className="text-xs text-faint">
        <span className="text-muted">You asked:</span> {a.question}
        <span className="ml-2 rounded-full border border-border-strong px-1.5 py-px font-mono text-[10px]">{a.voice}</span>
      </p>
      {a.source === 'cache' && (
        <p className="mt-2 rounded-sm border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn">
          Live AI unavailable — showing a precomputed answer{a.generated ? ` (${a.generated.slice(0, 10)})` : ''}.
        </p>
      )}
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
      {a.model && <p className="mt-2 text-[10px] text-faint">Model: {a.model} (Google Gemini, function calling over Fire Rings data)</p>}
    </article>
  )
}
