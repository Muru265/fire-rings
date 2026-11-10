import type { Status } from '../../api/_lib/watch'

/** Status badges: colour + icon + words (never colour-only). */
export const STATUS_STYLE: Record<Status, { icon: string; cls: string; words: string }> = {
  Alert: { icon: '▲▲', cls: 'border-danger/60 bg-danger/15 text-[#f3a3ad]', words: 'Alert — above every baseline year' },
  Watch: { icon: '▲', cls: 'border-warn/60 bg-warn/15 text-warn', words: 'Watch — far above normal' },
  'Unusually low': { icon: '▼', cls: 'border-[#67A9CF]/60 bg-[#67A9CF]/15 text-[#a9d3ec]', words: 'Unusually low — far below normal' },
  Normal: { icon: '●', cls: 'border-border-strong bg-surface-3 text-text', words: 'Normal' },
}
