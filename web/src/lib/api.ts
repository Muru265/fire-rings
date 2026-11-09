import { useEffect, useState } from 'react'
import type { MetaDoc, RegionDoc } from './types'

const BASE = '/data/v1'
const cache = new Map<string, Promise<unknown>>()

export function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE}/${path}`
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`)
      return r.json()
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return cache.get(url) as Promise<T>
}

export type Loadable<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T }

export function useJson<T>(path: string | null): Loadable<T> & { retry: () => void } {
  const [state, setState] = useState<{ key: string; value: Loadable<T> } | null>(null)
  const [nonce, setNonce] = useState(0)
  const reqKey = `${path}#${nonce}`
  useEffect(() => {
    if (!path) return
    let alive = true
    fetchJson<T>(path)
      .then((data) => alive && setState({ key: reqKey, value: { status: 'ready', data } }))
      .catch((e: Error) => alive && setState({ key: reqKey, value: { status: 'error', error: e.message } }))
    return () => {
      alive = false
    }
  }, [path, reqKey])
  const value: Loadable<T> = state && state.key === reqKey ? state.value : { status: 'loading' }
  return { ...value, retry: () => setNonce((n) => n + 1) }
}

export const useRegion = (id: string | null) => useJson<RegionDoc>(id ? `regions/${id}.json` : null)
export const useMeta = () => useJson<MetaDoc>('meta.json')
