// Region ids and display names only. All numbers come from web/public/data/v1/ (hard rule 1).
export const REGIONS = [
  { id: 'punjab', name: 'Punjab–Haryana', country: 'India' },
  { id: 'madagascar', name: 'Madagascar', country: 'Madagascar' },
  { id: 'se_australia', name: 'SE Australia', country: 'Australia' },
  { id: 'mauritius', name: 'Mauritius', country: 'Mauritius' },
] as const

export type RegionId = (typeof REGIONS)[number]['id']

export function findRegion(id: string | undefined) {
  return REGIONS.find((r) => r.id === id)
}
