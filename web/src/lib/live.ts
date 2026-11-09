import { useEffect, useState } from 'react'

export interface LiveData {
  ok: boolean
  region: string
  fetched_at: string
  count: number
  last_acq_utc: string | null
  detections: [number, number, string, string, string, number | null, string][]
  note: string
  error?: string
}

const cache = new Map<string, Promise<LiveData>>()

export function fetchLive(region: string): Promise<LiveData> {
  if (!cache.has(region)) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 12_000)
    const p = fetch(`/api/live?region=${region}`, { signal: ac.signal })
      .then((r) => r.json() as Promise<LiveData>)
      .catch((): LiveData => ({ ok: false, region, fetched_at: new Date().toISOString(), count: 0, last_acq_utc: null, detections: [], note: '', error: 'unavailable' }))
      .finally(() => clearTimeout(timer))
    cache.set(region, p)
  }
  return cache.get(region)!
}

export function useLive(region: string | null): LiveData | null {
  const [d, setD] = useState<{ region: string; data: LiveData } | null>(null)
  useEffect(() => {
    if (!region) return
    let alive = true
    fetchLive(region).then((data) => alive && setD({ region, data }))
    return () => { alive = false }
  }, [region])
  return d && d.region === region ? d.data : null
}

export function hoursAgo(iso: string | null): number | null {
  if (!iso) return null
  return Math.max(0, (Date.now() - Date.parse(iso)) / 3_600_000)
}

export function agoText(iso: string | null): string {
  const h = hoursAgo(iso)
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)} min ago`
  return h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`
}
