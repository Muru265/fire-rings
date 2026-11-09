import { Link } from 'react-router-dom'
import { REGIONS } from '../lib/regions'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <svg width="88" height="88" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="11" fill="none" stroke="#fcb519" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx="16" cy="16" r="6.5" fill="none" stroke="#e55c30" strokeWidth="2" />
        <circle cx="16" cy="16" r="2.2" fill="#8a226a" />
      </svg>
      <p className="eyebrow mt-6">404</p>
      <h1 className="mt-2 text-[28px] font-bold sm:text-[40px]">Page not found</h1>
      <p className="mt-3 text-muted">This page isn't in the record. Try a region, or go back to the start.</p>
      <ul className="mt-6 flex flex-wrap justify-center gap-2">
        {REGIONS.map((r) => (
          <li key={r.id}><Link to={`/r/${r.id}`} className="rounded-full border border-border-strong px-3 py-1.5 text-sm text-text no-underline hover:bg-surface-2">{r.name}</Link></li>
        ))}
      </ul>
      <Link to="/" className="mt-6 text-sm">Back to Fire Rings</Link>
    </div>
  )
}
