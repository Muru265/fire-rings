import { useEffect, useRef, useState } from 'react'

/** Observe an element's content width (for responsive SVG charts). Ignores zero widths (element hidden), so a chart
 *  that is hidden and shown again keeps / regains its full width instead of shrinking (QA #12). */
export function useWidth<T extends HTMLElement>(initial = 320) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const cw = Math.round(e.contentRect.width)
      if (cw > 0) setW(Math.max(240, cw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
