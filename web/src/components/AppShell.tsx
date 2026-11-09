import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'

const NAV = [
  { to: '/r/punjab', label: 'Explore', match: '/r/' },
  { to: '/proof', label: 'Proof' },
  { to: '/story/madagascar', label: 'Story', match: '/story/' },
  { to: '/data', label: 'Data' },
  { to: '/ask', label: 'Ask' },
]

export default function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-surface-2 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5 no-underline" aria-label="Fire Rings home">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span className="font-display text-lg font-bold tracking-[0.14em] text-text">FIRE RINGS</span>
          </Link>
          <nav aria-label="Main">
            <ul className="flex items-center gap-1 text-sm">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    className={({ isActive }) =>
                      [
                        'rounded-sm px-3 py-2 no-underline transition-colors duration-[var(--dur-fast)]',
                        isActive || (n.match && pathname.startsWith(n.match))
                          ? 'bg-surface-2 text-text'
                          : 'text-muted hover:text-text',
                      ].join(' ')
                    }
                  >
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1440px] px-4 py-6 text-xs text-faint sm:px-6">
          Active-fire data: NASA FIRMS (MODIS C6.1, VIIRS 375 m S-NPP / NOAA-20 / NOAA-21). NASA Space Apps 2026 · Port Louis.
        </div>
      </footer>
    </div>
  )
}
