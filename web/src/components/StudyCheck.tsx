import type { RegionDoc } from '../lib/types'

/** Round 5B: compares the record with a published study (only Tanzania so far). Every number from regions/{id}.json
 *  `study_check` (pipeline/08_export.py). The areas differ and the card says so; it reports whatever the data show. */
export interface StudyCheckDoc {
  study: string; periods: [number, number][]; years_a: [number, number, number]; years_b: [number, number, number]; dropped: number[]
  harmonized: { mean_a: number; mean_b: number; change_pct: number }; modis_only: { mean_a: number; mean_b: number; change_pct: number }
  raw_step_2012_pct: number | null; note: string
}
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v) >= 10 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)}%`

export default function StudyCheck({ doc }: { doc: RegionDoc }) {
  const sc = (doc as RegionDoc & { study_check?: StudyCheckDoc }).study_check
  if (!sc) return null
  const span = (y: [number, number, number]) => `${y[0]}–${y[1]}`
  return (
    <section className="card border-accent-2/30" aria-labelledby="study-check-h" data-testid="study-check">
      <p className="eyebrow">Study check</p>
      <h2 id="study-check-h" className="mt-1 font-display text-lg font-semibold">Does our record agree with a published study?</h2>
      <p className="mt-2 text-sm text-text">A 2015 study of Tanzania’s miombo woodlands reported declining fire (MODIS, 2001–2013). Our harmonized record for the whole country:{' '}
        <strong data-claim="sc-harm">{pct(sc.harmonized.change_pct)}</strong> ({span(sc.years_a)} vs {span(sc.years_b)}, average fire-days per year); MODIS-only over the same years:{' '}
        <strong data-claim="sc-modis">{pct(sc.modis_only.change_pct)}</strong>
        {sc.raw_step_2012_pct != null && <>; a naive raw MODIS→VIIRS join would show <strong data-claim="sc-raw">{pct(sc.raw_step_2012_pct)}</strong> at 2012</>}.</p>
      <p className="mt-2 text-xs text-muted">The areas differ: the study covers the miombo woodlands, this record the whole country, so this is a consistency check, not a replication.
        {sc.dropped.length > 0 && <> {sc.dropped.join(', ')} is left out because January 2012 has no satellite data.</>} MODIS-only after 2020 is affected by Terra/Aqua orbit drift.</p>
      <p className="mt-2 text-xs text-faint">Source: Tarimo B., Dick Ø.B., Gobakken T., Totland Ø. (2015) “Spatial distribution of temporal dynamics in anthropogenic fires in miombo savanna woodlands of Tanzania”, <em>Carbon Balance and Management</em> 10:18,{' '}
        <a href="https://doi.org/10.1186/s13021-015-0029-2" target="_blank" rel="noreferrer">doi:10.1186/s13021-015-0029-2</a> (CC BY 4.0).</p>
    </section>
  )
}
