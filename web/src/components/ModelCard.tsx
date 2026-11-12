import { useJson } from '../lib/api'
import Help from './Help'

/** Round 5B: "Prediction model, tested" (Proof) + Model history (Proof and Data). Every number from
 *  api/model_card.json and api/model_history.json (pipeline/11_model.py, pipeline/retrain.py). */
type M = { roc_auc: number; pr_auc: number; capture10: number; capture20: number; brier?: number; precision?: number; recall?: number; f1?: number }
type CI = Record<string, [number, number]>
export interface ModelCardDoc {
  version: number; trained_at: string; data_end: string; next_month: string[]; regions: string[]; training_years: [number, number]
  evaluation: { pooled: { model: M; climatology: M; persistence: M }; intervals: Record<string, CI> & { model_minus: Record<string, CI> }
    per_region: Record<string, { model: M; climatology: M; persistence: M }> }
  leave_one_region_out: Record<string, { model?: M; climatology?: M; skipped?: string }>
  ablation: { harmonized: M; raw: M; difference_harmonized_minus_raw: M }
  gate: { passed: boolean; rule: string }
  model_selection: { chosen: string }
}
export interface HistoryDoc { runs: { date: string; data_end: string; trigger: string; version: number; decision: string
  champion: { pr_auc: number; capture10: number } | null; challenger: { pr_auc: number; capture10: number; recipe?: string } | null
  climatology: { pr_auc: number; capture10: number } }[]; note?: string }

const pct = (v: number) => `${Math.round(v)}%`
const f2 = (v: number) => v.toFixed(2)
const sgn = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const mon = (k: string) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`

export function ModelHistory({ compact = false }: { compact?: boolean }) {
  const h = useJson<HistoryDoc>('api/model_history.json')
  if (h.status !== 'ready') return null
  const runs = [...h.data.runs].reverse().slice(0, compact ? 4 : 8)
  return (
    <div data-testid="model-history">
      <p className="eyebrow !text-[11px]">Model history<Help id="model-updates" /></p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-faint"><tr><th className="py-1 pr-3 font-normal">Run</th><th className="pr-3 font-normal">Data to</th><th className="pr-3 font-normal">Current model</th><th className="pr-3 font-normal">Challenger</th><th className="pr-3 font-normal">Usual season</th><th className="font-normal">Decision</th></tr></thead>
          <tbody className="num text-muted">
            {runs.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1 pr-3">{day(r.date)} · v{r.version}</td><td className="pr-3">{r.data_end}</td>
                <td className="pr-3">{r.champion ? `PR-AUC ${f2(r.champion.pr_auc)} · top 10% ${pct(r.champion.capture10)}` : '—'}</td>
                <td className="pr-3">{r.challenger ? `PR-AUC ${f2(r.challenger.pr_auc)} · top 10% ${pct(r.challenger.capture10)}` : '—'}</td>
                <td className="pr-3">PR-AUC {f2(r.climatology.pr_auc)} · top 10% {pct(r.climatology.capture10)}</td>
                <td className="font-sans text-text">{r.decision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {h.data.note && <p className="mt-1 text-[11px] text-faint">{h.data.note}</p>}
    </div>
  )
}

export default function ModelCard() {
  const c = useJson<ModelCardDoc>('api/model_card.json')
  if (c.status === 'loading') return <div className="card h-[260px] animate-pulse" />
  if (c.status === 'error') return null
  const d = c.data, e = d.evaluation, P = e.pooled, I = e.intervals, ab = d.ablation
  const ci = (k: string, m: string, fmt: (v: number) => string) => I[k]?.[m] ? ` (90% range ${fmt(I[k][m][0])}–${fmt(I[k][m][1])})` : ''
  const loro = Object.entries(d.leave_one_region_out).filter(([, v]) => v.model && v.climatology)
  const loroWins = loro.filter(([, v]) => v.model!.pr_auc > v.climatology!.pr_auc).length
  return (
    <section id="model" className="card scroll-mt-24" aria-labelledby="model-h" data-testid="model-card">
      <p className="eyebrow">Prediction model, tested<Help id="model-card" /></p>
      <h2 id="model-h" className="mt-1 font-display text-xl font-semibold">Where fire is more likely next month</h2>
      {d.gate.passed ? (
        <p className="mt-2 text-base text-text" data-testid="model-plain">
          Watching the top 10% of hexagons would have covered <strong data-claim="m-cap10">{pct(P.model.capture10)}</strong> of next month’s fires,
          vs <strong data-claim="c-cap10">{pct(P.climatology.capture10)}</strong> using the usual season alone.
        </p>
      ) : (
        <p className="mt-2 text-base text-warn" data-testid="model-plain">Does not beat the seasonal baseline yet — so no likelihood layer is shown. Watching the top 10% of hexagons would have covered {pct(P.model.capture10)} of next month’s fires, vs {pct(P.climatology.capture10)} using the usual season alone.</p>
      )}
      <p className="mt-1 text-xs text-muted">Tested on years it never saw (each year 2018–2025 predicted by a model trained only on earlier years), {d.regions.length} regions, H3 hexagons of ~36 km². A planning aid, not a forecast of individual fires.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Top 10% capture', pct(P.model.capture10), `usual season ${pct(P.climatology.capture10)} · last month’s fire ${pct(P.persistence.capture10)}${ci('model', 'capture10', pct)}`, 'cap10'],
          ['PR-AUC', f2(P.model.pr_auc), `usual season ${f2(P.climatology.pr_auc)} · last month ${f2(P.persistence.pr_auc)}${ci('model', 'pr_auc', f2)}`, 'prauc'],
          ['ROC-AUC', f2(P.model.roc_auc), `usual season ${f2(P.climatology.roc_auc)} · last month ${f2(P.persistence.roc_auc)}`, 'rocauc'],
          ['F1', P.model.f1 != null ? f2(P.model.f1) : '—', `precision ${P.model.precision != null ? f2(P.model.precision) : '—'} · recall ${P.model.recall != null ? f2(P.model.recall) : '—'} · threshold set on training years`, 'f1'],
        ].map(([l, v, s, id]) => (
          <div key={l} className="rounded-sm border border-border bg-surface-2 p-3" data-claim={`model-${id}`}>
            <p className="eyebrow !text-[10px]">{l}</p><p className="num mt-1 text-2xl font-semibold text-text">{v}</p><p className="mt-1 text-[11px] text-muted">{s}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-muted">
        <li data-testid="model-ablation"><strong className="text-text">Harmonized vs raw history:</strong> the same model fed raw, unconverted satellite counts scores PR-AUC {f2(ab.raw.pr_auc)} and top-10% capture {pct(ab.raw.capture10)};
          with harmonized history {f2(ab.harmonized.pr_auc)} and {pct(ab.harmonized.capture10)} — a difference of {sgn(ab.difference_harmonized_minus_raw.pr_auc)} PR-AUC and {sgn(ab.difference_harmonized_minus_raw.capture10, 1)} percentage points.
          {ab.difference_harmonized_minus_raw.pr_auc <= 0
            ? ' So harmonization does not improve this ranking task: the model ranks hexagons within one region and month, where a fixed exchange rate changes little, and raw VIIRS counts keep small-fire detail. Harmonization matters for comparing amounts across years — the record itself.'
            : ' Harmonized history helps the model rank hexagons.'}</li>
        <li data-testid="model-loro"><strong className="text-text">Leave one region out:</strong> trained on the other regions only, the model beat the usual season on PR-AUC in {loroWins} of {loro.length} held-out regions
          ({loro.map(([id, v]) => `${id.replace('_', ' ')} ${f2(v.model!.pr_auc)} vs ${f2(v.climatology!.pr_auc)}`).join(' · ')}).</li>
        <li><strong className="text-text">Per region (rolling origin, top-10% capture):</strong> {Object.entries(e.per_region).map(([id, v]) => `${id.replace('_', ' ')} ${pct(v.model.capture10)} vs ${pct(v.climatology.capture10)}`).join(' · ')}.</li>
      </ul>
      <p className="mt-3 text-xs text-faint" data-testid="model-version">
        Last retrained {day(d.trained_at)} · version {d.version} · data to {d.data_end} · next month scored: {d.next_month.map(mon).join(', ')} ·{' '}
        <a href="/data/v1/api/model_card.json" target="_blank" rel="noreferrer">model card (JSON)</a>
      </p>
      <div className="mt-4"><ModelHistory /></div>
    </section>
  )
}
