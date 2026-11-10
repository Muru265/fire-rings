import { useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'

const NAV = [
  { to: '/r/punjab', label: 'Explore', match: '/r/' },
  { to: '/proof', label: 'Proof' },
  { to: '/story', label: 'Story', match: '/story' },
  { to: '/data', label: 'Data' },
  { to: '/ask', label: 'Ask' },
  { to: '/guide', label: 'Guide' },
]

/** "Explore" opens the last-viewed region (QA #5). */
function lastRegion(): string {
  try { return localStorage.getItem('fr.lastRegion') || 'punjab' } catch { return 'punjab' }
}

export default function AppShell() {
  const { pathname } = useLocation()
  // publish the header height as --header-h so sticky bars (Guide search) sit below it at any width (QA #68)
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-surface-2 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header ref={headerRef} className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5 no-underline" aria-label="Fire Rings home">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span className="font-display text-lg font-bold tracking-[0.14em] text-text">FIRE RINGS</span>
          </Link>
          {/* QA #66: never a scroll container (it showed ▲▼ arrows on desktop); on narrow phones the items wrap instead */}
          <nav aria-label="Main" className="-mx-[7px] max-w-full sm:mx-0">
            <ul className="flex flex-wrap items-center gap-x-0 gap-y-1 text-[13px] sm:gap-x-1 sm:text-sm">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.label === 'Explore' ? `/r/${lastRegion()}` : n.to}
                    className={({ isActive }) =>
                      [
                        'rounded-sm px-[7px] py-2 whitespace-nowrap no-underline sm:px-3 transition-colors duration-[var(--dur-fast)]',
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
