import { useJson } from '../lib/api'
import { COMPANION } from '../lib/companion'
import { fmtInt } from '../lib/format'

interface S { eruptions_in_period: number; detected: number; median_lag_days: number | null; pre30_eruptions_tested: number; pre30_eruptions_with_detections: number }
interface R { eruption_list: string; eruptions: unknown[]; sources: { eruptions_url: string }; summary: { modis: S; viirs: S; both: { eruptions: number; detection_days_modis: number; detection_days_viirs: number } } }

/** Proof card: Piton de la Fournaise ground-truth test. Shown only when the sourced eruption list is published (P2.2). */
export default function VolcanoCard() {
  const r = useJson<R>('api/reunion.json')
  if (r.status !== 'ready' || r.data.eruption_list !== 'sourced') return null
  const s = r.data.summary
  return (
    <section className="card" aria-labelledby="volc-h" data-testid="volcano-card">
      <h2 id="volc-h" className="font-display text-lg font-semibold">Ground-truth test: Piton de la Fournaise</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">Réunion’s volcano erupts often and every eruption is listed, with dates, by the Smithsonian Global Volcanism Program. Do the fire satellites see them?</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm bg-surface-2 p-3"><dt className="text-[11px] text-faint">MODIS detected</dt><dd className="num text-xl text-text">{s.modis.detected} / {s.modis.eruptions_in_period}</dd><dd className="text-[11px] text-muted">eruptions in its downloaded windows</dd></div>
        <div className="rounded-sm bg-surface-2 p-3"><dt className="text-[11px] text-faint">VIIRS detected</dt><dd className="num text-xl text-text">{s.viirs.detected} / {s.viirs.eruptions_in_period}</dd><dd className="text-[11px] text-muted">eruptions since 2012</dd></div>
        <div className="rounded-sm bg-surface-2 p-3"><dt className="text-[11px] text-faint">Median first-detection lag</dt><dd className="num text-xl text-text">{s.modis.median_lag_days ?? '—'} d · {s.viirs.median_lag_days ?? '—'} d</dd><dd className="text-[11px] text-muted">MODIS · VIIRS</dd></div>
        <div className="rounded-sm bg-surface-2 p-3"><dt className="text-[11px] text-faint">Same eruptions, detection-days</dt><dd className="num text-xl text-text">{fmtInt(s.both.detection_days_modis)} · {fmtInt(s.both.detection_days_viirs)}</dd><dd className="text-[11px] text-muted">MODIS · VIIRS ({s.both.eruptions} eruptions)</dd></div>
      </dl>
      <p className="mt-3 text-sm text-muted">Heat in the 30 days before an eruption (outside other eruptions): MODIS {s.modis.pre30_eruptions_with_detections} of {s.modis.pre30_eruptions_tested}, VIIRS {s.viirs.pre30_eruptions_with_detections} of {s.viirs.pre30_eruptions_tested} eruptions. Reported as found — not an eruption forecast.</p>
      <p className="mt-2 text-xs text-faint">Eruption dates: <a href={r.data.sources.eruptions_url} target="_blank" rel="noreferrer">Smithsonian GVP, Volcanoes of the World</a> ({r.data.eruptions.length} periods since 2000). Detections: NASA FIRMS standard products, windows around each eruption. <a href={`${COMPANION}/volcano`} target="_blank" rel="noreferrer">Every eruption, with its source →</a></p>
    </section>
  )
}
