import { useCallback, useRef } from 'react'
import type { KeyboardEvent } from 'react'

export type Cell = { y: number; m: number }

/**
 * Roving-tabindex keyboard navigation over a year × month grid.
 * ←/→ month (wraps across years) · ↑/↓ year (direction configurable) · Home/End first/last month · Enter open · Esc clear.
 */
export function useCellNav(opts: {
  years: number[]
  focus: Cell
  setFocus: (c: Cell) => void
  onSelect: (c: Cell) => void
  onClear: () => void
  upIsLaterYear: boolean
  isValid: (c: Cell) => boolean
}) {
  const refs = useRef(new Map<string, SVGElement | HTMLElement>())
  const { years, focus, setFocus, onSelect, onClear, upIsLaterYear, isValid } = opts

  const move = useCallback(
    (c: Cell) => {
      if (!isValid(c)) return
      setFocus(c)
      refs.current.get(`${c.y}-${c.m}`)?.focus()
    },
    [isValid, setFocus],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const { y, m } = focus
      const y0 = years[0]
      const y1 = years[years.length - 1]
      let next: Cell | null = null
      switch (e.key) {
        case 'ArrowRight':
          next = m === 12 ? { y: Math.min(y + 1, y1), m: y < y1 ? 1 : 12 } : { y, m: m + 1 }
          break
        case 'ArrowLeft':
          next = m === 1 ? { y: Math.max(y - 1, y0), m: y > y0 ? 12 : 1 } : { y, m: m - 1 }
          break
        case 'ArrowUp':
          next = { y: Math.min(Math.max(y + (upIsLaterYear ? 1 : -1), y0), y1), m }
          break
        case 'ArrowDown':
          next = { y: Math.min(Math.max(y + (upIsLaterYear ? -1 : 1), y0), y1), m }
          break
        case 'Home':
          next = { y, m: 1 }
          break
        case 'End':
          next = { y, m: 12 }
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          onSelect(focus)
          return
        case 'Escape':
          onClear()
          return
        default:
          return
      }
      e.preventDefault()
      if (next) move(next)
    },
    [focus, years, upIsLaterYear, move, onSelect, onClear],
  )

  const register = (c: Cell) => (el: SVGElement | HTMLElement | null) => {
    const k = `${c.y}-${c.m}`
    if (el) refs.current.set(k, el)
    else refs.current.delete(k)
  }

  return { onKeyDown, register }
}
