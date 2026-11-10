import type { Status } from '../../api/_lib/watch'
import { STATUS_STYLE } from '../lib/watchStyle'

/** Fire Watch status: colour + icon + words (never colour-only). */
export default function StatusBadge({ status, small }: { status: Status; small?: boolean }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold ${small ? 'text-[11px]' : 'text-xs'} ${s.cls}`} data-status={status}>
      <span aria-hidden="true">{s.icon}</span>{small ? status : s.words}
    </span>
  )
}
