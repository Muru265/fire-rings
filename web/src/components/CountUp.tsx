import { useEffect, useRef, useState } from 'react'

/** Counts a number up from 0 on first view (600 ms). Instant under prefers-reduced-motion. */
export default function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [v, setV] = useState(reduced ? value : 0)
  const done = useRef(false)
  useEffect(() => {
    if (reduced || done.current) { setV(value); return }
    done.current = true
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 600)
      setV(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced])
  return <span aria-label={format(value)}><span aria-hidden="true">{format(v)}</span></span>
}
