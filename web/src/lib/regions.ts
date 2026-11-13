// Region ids and display names only. All numbers come from web/public/data/v1/ (hard rule 1).
export const REGIONS = [
  { id: 'punjab', name: 'Punjab–Haryana', country: 'India' },
  { id: 'madagascar', name: 'Madagascar', country: 'Madagascar' },
  { id: 'se_australia', name: 'SE Australia', country: 'Australia' },
  { id: 'mauritius', name: 'Mauritius', country: 'Mauritius' },
  { id: 'nt_savanna', name: 'Northern Australia savanna', country: 'Australia', area: 'the Northern Territory (state border)' },
  { id: 'ne_india', name: 'Northeast India', country: 'India', area: '7 northeastern states (state borders)' },
  { id: 'tanzania', name: 'Tanzania', country: 'Tanzania', area: 'the whole country (incl. Zanzibar)' },
  // Round 8: published under validation gate v1.2 (METHODS §7, docs/validation_report.md → Gate history)
  { id: 'sudan', name: 'Sudan', country: 'Sudan', area: 'today’s Sudan border, used for all years' },
  { id: 'mato_grosso', name: 'Mato Grosso, Brazil', country: 'Brazil', area: 'Mato Grosso state (state border)' },
] as const

export type RegionId = (typeof REGIONS)[number]['id']

export function findRegion(id: string | undefined) {
  return REGIONS.find((r) => r.id === id)
}
