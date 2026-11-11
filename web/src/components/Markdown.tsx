// Minimal Markdown for the paper and slides (P1.8): headings, paragraphs, lists, tables, quotes, **bold**, *italic*,
// [links](url), `code`, plus directives:  ::figure <name> [region]   and   ?<flag> <line>  (line shown only when flag is set).
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type FigureRenderer = (name: string, arg: string | undefined, key: number) => ReactNode

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={k} className="text-text">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k} className="num text-[0.92em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!
      out.push(mm[2].startsWith('/') ? <Link key={k} to={mm[2]}>{mm[1]}</Link> : <a key={k} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>)
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function Markdown({ src, figure, flags = {}, className = '' }: { src: string; figure?: FigureRenderer; flags?: Record<string, boolean>; className?: string }) {
  const lines = src.replace(/\r\n/g, '\n').split('\n').filter((l) => {
    const f = /^\?(!?)(\w+)\s/.exec(l)
    return !f || (f[1] ? !flags[f[2]] : !!flags[f[2]])
  }).map((l) => l.replace(/^\?!?\w+\s/, ''))
  const blocks: ReactNode[] = []
  let i = 0, k = 0
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    const h = /^(#{1,3})\s+(.*)$/.exec(l)
    if (h) {
      const lvl = h[1].length
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      blocks.push(lvl === 1 ? <h1 key={k++} id={id}>{inline(h[2])}</h1> : lvl === 2 ? <h2 key={k++} id={id}>{inline(h[2])}</h2> : <h3 key={k++} id={id}>{inline(h[2])}</h3>)
      i++; continue
    }
    const fig = /^::figure\s+(\S+)(?:\s+(\S+))?/.exec(l)
    if (fig) { blocks.push(<div key={k++} className="md-figure">{figure?.(fig[1], fig[2], k)}</div>); i++; continue }
    if (/^\|/.test(l)) {
      const rows: string[][] = []
      while (i < lines.length && /^\|/.test(lines[i])) { if (!/^\|[\s:|-]+\|$/.test(lines[i])) rows.push(lines[i].slice(1, -1).split('|').map((c) => c.trim())); i++ }
      blocks.push(
        <div key={k++} className="overflow-x-auto"><table className="md-table">
          <thead><tr>{rows[0].map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>)
      continue
    }
    if (/^(-|\d+\.)\s/.test(l)) {
      const ordered = /^\d+\./.test(l)
      const items: string[] = []
      while (i < lines.length && /^(-|\d+\.)\s/.test(lines[i])) { items.push(lines[i].replace(/^(-|\d+\.)\s/, '')); i++ }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(<Tag key={k++}>{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</Tag>)
      continue
    }
    if (l.startsWith('> ')) {
      const q: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) { q.push(lines[i].slice(2)); i++ }
      blocks.push(<blockquote key={k++}>{inline(q.join(' '))}</blockquote>)
      continue
    }
    const p: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|::figure|\||-\s|\d+\.\s|> )/.test(lines[i])) { p.push(lines[i]); i++ }
    blocks.push(<p key={k++}>{inline(p.join(' '))}</p>)
  }
  return <div className={`md ${className}`}>{blocks}</div>
}
