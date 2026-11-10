// Site-wide data mode (QA #44): Long-term (harmonized MODIS-equivalent, 2001–now) vs High detail (native VIIRS, 2012–now).
// Lives in the URL (?mode=detail) so links and screenshots are unambiguous; remembered in localStorage across pages.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DataMode } from './types'

const KEY = 'fr.mode'

export function storedMode(): DataMode {
  try { return localStorage.getItem(KEY) === 'detail' ? 'detail' : 'longterm' } catch { return 'longterm' }
}

export function useMode(): [DataMode, (m: DataMode) => void] {
  const [params, setParams] = useSearchParams()
  const q = params.get('mode')
  const mode: DataMode = q === 'detail' ? 'detail' : q === 'longterm' ? 'longterm' : storedMode()
  const set = useCallback((m: DataMode) => {
    try { localStorage.setItem(KEY, m) } catch { /* private mode: URL still carries it */ }
    setParams((p) => { const n = new URLSearchParams(p); if (m === 'detail') n.set('mode', 'detail'); else n.delete('mode'); return n }, { replace: true })
  }, [setParams])
  return [mode, set]
}

export const UNIT: Record<DataMode, string> = {
  longterm: 'MODIS-equivalent fire-days',
  detail: 'VIIRS fire-days (native 375 m)',
}

/** Short unit for chart legends and readouts. */
export const unitOf = (doc: { mode?: DataMode } | null | undefined) => UNIT[doc?.mode ?? 'longterm']
