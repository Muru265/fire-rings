import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import paper from '../../content/paper.md?raw'
import links from '../../content/links.json'
import Markdown from '../components/Markdown'
import { renderFigure } from '../lib/figures'
import { fill, useContent } from '../lib/content'

/** P1.8 Research-paper page. Text from web/content/paper.md; every {{number}} is filled live from the published JSON. */
export default function Paper() {
  const c = useContent()
  useEffect(() => { document.title = 'Paper · Fire Rings' }, [])
  if (c === 'error') return <p className="card text-warn">Could not load the published data for the paper.</p>
  if (!c) return <div className="card h-[60vh] animate-pulse" aria-busy="true" />
  const [title, ...rest] = fill(paper, c.values).split('\n')
  return (
    <article className="paper mx-auto max-w-[820px]" data-testid="paper">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/">← Fire Rings</Link>
        <span className="flex flex-wrap gap-2">
          <a href={links.paper_pdf} download className="rounded-sm bg-accent px-3 py-1.5 font-semibold text-bg no-underline" data-testid="paper-pdf">Download PDF</a>
          <Link to={links.slides} className="rounded-sm border border-border-strong px-3 py-1.5 text-text no-underline hover:bg-surface-2">View the slides</Link>
        </span>
      </div>
      <header className="card mb-8">
        <p className="eyebrow">Research paper · first draft</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[36px]">{title.replace(/^#\s*/, '')}</h1>
        <p className="mt-3 text-muted">Muru · NASA Space Apps 2026 · Port Louis</p>
        <p className="mt-1 text-xs text-faint">Every number in this paper is read live from the published Fire Rings data (data through {c.values.data_end}).</p>
      </header>
      <Markdown src={rest.join('\n')} flags={{ reunion: c.reunion }} figure={(name, arg) => renderFigure(c, name, arg)} className="card" />
    </article>
  )
}
