import type { Status } from '../../api/_lib/watch'
import { STATUS_STYLE } from '../lib/watchStyle'

/** Fire Watch status: colour + icon + words (never colour-only). */
/** #75 `trigger` names the month(s) that set the status, e.g. "Unusually low (Oct)". */
export default function StatusBadge({ status, small, trigger }: { status: Status; small?: boolean; trigger?: string | null }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold ${small ? 'text-[11px]' : 'text-xs'} ${s.cls}`} data-status={status}>
      <span aria-hidden="true">{s.icon}</span>{small ? status : s.words}{trigger ? <span className="font-normal" data-testid="status-trigger"> ({trigger})</span> : null}
    </span>
  )
}
