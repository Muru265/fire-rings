// Basemap clean-up (QA #2, #20): hide maritime boundary lines (the rings around small islands) on the OpenFreeMap
// dark style; optionally fade the remaining borders so fire stays the main visual.
import type { Map as MlMap } from 'maplibre-gl'

export function tidyBasemap(map: MlMap, opts: { borderOpacity?: number } = {}) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'line' || (layer as { 'source-layer'?: string })['source-layer'] !== 'boundary') continue
    const f = map.getFilter(layer.id)
    const noSea = ['!=', ['get', 'maritime'], 1]
    map.setFilter(layer.id, (f ? ['all', f, noSea] : noSea) as never)
    if (opts.borderOpacity != null) map.setPaintProperty(layer.id, 'line-opacity', opts.borderOpacity)
  }
}
