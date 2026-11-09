import type { CellText } from '../lib/describe'

/** Positioned in % of the parent (which must be position:relative). */
export default function Tooltip({ text, x, y, flip, transform }: { text: CellText; x: number; y: number; flip?: boolean; transform?: string }) {
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-20 w-max max-w-[260px] rounded-sm border border-border-strong bg-surface-3/95 px-3 py-2 text-xs shadow-card backdrop-blur"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: transform ?? (flip ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))'),
      }}
    >
      <div className="font-display text-sm font-semibold text-text">{text.title}</div>
      <div className="mt-0.5">
        <span className="num text-base text-text">{text.value}</span>{' '}
        <span className="text-muted">{text.unit}</span>
      </div>
      {text.lines.map((l) => (
        <div key={l} className="mt-0.5 text-muted">
          {l}
        </div>
      ))}
    </div>
  )
}
