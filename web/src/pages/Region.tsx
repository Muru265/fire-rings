import { Link, useParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import { REGIONS, findRegion } from '../lib/regions'

export default function Region() {
  const { regionId } = useParams()
  const region = findRegion(regionId)

  if (!region) {
    return (
      <EmptyState title="Region not found">
        Available regions:{' '}
        {REGIONS.map((r, i) => (
          <span key={r.id}>
            {i > 0 && ' · '}
            <Link to={`/r/${r.id}`}>{r.name}</Link>
          </span>
        ))}
      </EmptyState>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{region.country}</p>
        <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">{region.name}</h1>
      </header>
      <EmptyState title="Fire calendar coming in Phase 2">
        The radial Fire Rings and grid calendar will load from the pipeline output for this region.
      </EmptyState>
    </div>
  )
}
