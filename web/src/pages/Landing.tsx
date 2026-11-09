import { Link } from 'react-router-dom'
import { REGIONS } from '../lib/regions'

export default function Landing() {
  return (
    <div className="space-y-12">
      <section className="max-w-3xl pt-8">
        <p className="eyebrow">MODIS + VIIRS · harmonized active-fire record</p>
        <h1 className="mt-4 text-[40px] leading-[1.05] font-bold sm:text-[64px]">
          25 years of fire.
          <br />
          <span className="text-muted">One honest record.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-muted">
          Two generations of satellites see fire differently. Fire Rings converts the new one into the old one's
          units, so every month since 2001 is measured with the same ruler.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/r/punjab"
            className="rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-bg no-underline hover:brightness-110"
          >
            Explore a region
          </Link>
          <Link
            to="/proof"
            className="rounded-sm border border-border-strong px-5 py-2.5 text-sm font-semibold text-text no-underline hover:bg-surface-2"
          >
            How we know it works
          </Link>
        </div>
      </section>

      <section aria-labelledby="regions-h">
        <h2 id="regions-h" className="eyebrow">
          Hero regions
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REGIONS.map((r) => (
            <li key={r.id}>
              <Link
                to={`/r/${r.id}`}
                className="card block no-underline transition-colors duration-[var(--dur-fast)] hover:border-border-strong hover:bg-surface-2"
              >
                <span className="font-display text-xl font-semibold text-text">{r.name}</span>
                <span className="mt-1 block text-sm text-muted">{r.country}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
