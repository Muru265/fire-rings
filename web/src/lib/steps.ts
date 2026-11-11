// #74 Live traces never repeat a line: identical steps (same text, kind and region) are shown once, at their first
// position, with a ×N count (e.g. the same lookup retried by the model).
export function collapseSteps<T extends { text: string; kind: string; region?: string }>(steps: T[]): (T & { times: number })[] {
  const out: (T & { times: number })[] = []
  const seen = new Map<string, T & { times: number }>()
  for (const s of steps) {
    const k = `${s.kind}|${s.region ?? ''}|${s.text}`
    const prev = seen.get(k)
    if (prev) prev.times++
    else { const n = { ...s, times: 1 }; seen.set(k, n); out.push(n) }
  }
  return out
}
