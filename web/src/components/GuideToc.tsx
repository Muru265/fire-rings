import { useEffect, useMemo, useRef, useState } from 'react'

/** #94 Guide table of contents. Desktop: sticky sidebar below the site header + search bar, clear collapsible section
 *  headings (state remembered per visitor), one line per item (full title in a tooltip), scroll-spy highlight that is
 *  kept visible inside the sidebar, thin scrollbar. Phones: a "Contents ▾" dropdown instead of the sidebar. */
export type TocGroup = { name: string; items: { id: string; title: string }[] }

const KEY = 'guide-toc-collapsed'
const readCollapsed = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export default function GuideToc({ groups, onGo }: { groups: TocGroup[]; onGo: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed)
  const [active, setActive] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const ids = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.id)), [groups])

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(collapsed)) } catch { /* private mode */ } }, [collapsed])

  // scroll-spy: the last entry whose top has passed the reading line (just under the sticky header + search)
  useEffect(() => {
    let raf = 0
    const spy = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 56) + 90
        let cur: string | null = null
        for (const id of ids) {
          const el = document.getElementById(id)
          if (!el) continue
          if (el.getBoundingClientRect().top - line <= 0) cur = id
          else break
        }
        setActive(cur ?? ids[0] ?? null)
      })
    }
    spy()
    window.addEventListener('scroll', spy, { passive: true })
    window.addEventListener('resize', spy)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', spy); window.removeEventListener('resize', spy) }
  }, [ids])

  // keep the active entry visible inside the sidebar (scrolls the sidebar only, never the page)
  useEffect(() => {
    const c = box.current
    const el = active ? c?.querySelector<HTMLElement>(`[data-toc="${CSS.escape(active)}"]`) : null
    if (!c || !el) return
    const cr = c.getBoundingClientRect(), er = el.getBoundingClientRect()
    if (er.top < cr.top + 24) c.scrollTop -= cr.top + 60 - er.top
    else if (er.bottom > cr.bottom - 24) c.scrollTop += er.bottom - (cr.bottom - 60)
  }, [active, collapsed])

  const activeGroup = groups.find((g) => g.items.some((i) => i.id === active))?.name
  const activeTitle = groups.flatMap((g) => g.items).find((i) => i.id === active)?.title
  const go = (id: string) => { setMenu(false); onGo(id) }

  const list = (mobile: boolean) => groups.map((g) => {
    const shut = !mobile && collapsed[g.name]
    return (
      <div key={g.name} className="mb-3">
        {mobile ? <p className="px-2 pt-2 pb-1 text-[12px] font-semibold tracking-wide text-faint uppercase">{g.name}</p> : (
          <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.name]: !c[g.name] }))} aria-expanded={!shut}
            className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[13px] font-semibold tracking-wide uppercase hover:text-text ${g.name === activeGroup ? 'text-text' : 'text-faint'}`}>
            <span>{g.name}</span>
            <span aria-hidden="true" className={`text-[10px] transition-transform duration-200 ${shut ? '-rotate-90' : ''}`}>▾</span>
          </button>
        )}
        {!shut && (
          <ul className="mt-0.5">
            {g.items.map((i) => {
              const on = i.id === active
              return (
                <li key={i.id}>
                  <a href={`#${i.id}`} data-toc={i.id} title={i.title} aria-current={on ? 'location' : undefined}
                    onClick={(e) => { e.preventDefault(); go(i.id) }}
                    className={`block truncate rounded-sm border-l-2 py-1 pr-2 pl-3 text-[13.5px] leading-6 no-underline transition-colors ${on ? 'border-accent bg-surface-2 font-medium text-text' : 'border-transparent text-muted hover:bg-surface-2/60 hover:text-text'}`}>
                    {i.title}
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  })

  return (
    <>
      {/* phones / tablets: dropdown */}
      <div className="relative lg:hidden" data-testid="guide-toc-mobile">
        <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-controls="guide-toc-menu"
          className="flex w-full items-center justify-between gap-2 rounded-sm border border-border-strong bg-surface-2 px-3 py-2 text-left text-sm text-text">
          <span className="truncate"><span className="font-semibold">Contents</span>{activeTitle ? <span className="text-muted"> · {activeTitle}</span> : null}</span>
          <span aria-hidden="true" className={`transition-transform duration-200 ${menu ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {menu && (
          <div id="guide-toc-menu" className="thin-scroll absolute top-full right-0 left-0 z-30 mt-1 max-h-[65vh] overflow-auto rounded-sm border border-border-strong bg-surface-3 py-1 shadow-card">
            {list(true)}
          </div>
        )}
      </div>
      {/* desktop: sticky sidebar */}
      <div ref={box} data-testid="guide-toc" className="thin-scroll hidden pr-1 lg:sticky lg:top-[calc(var(--header-h,56px)+4.25rem)] lg:block lg:max-h-[calc(100vh-var(--header-h,56px)-5.5rem)] lg:self-start lg:overflow-y-auto">
        {list(false)}
      </div>
    </>
  )
}
