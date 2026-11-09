/** Shared SVG pattern defs: cross-hatch = no data, diagonal hatch = uncertain. Render once per <svg>. */
export default function Patterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-nodata`} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="var(--bg)" />
        <path d="M0 0L6 6M6 0L0 6" stroke="var(--border-strong)" strokeWidth="0.8" />
      </pattern>
      <pattern id={`${id}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,.35)" strokeWidth="1.4" />
      </pattern>
    </defs>
  )
}
