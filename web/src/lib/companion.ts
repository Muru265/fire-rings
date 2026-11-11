// P2.2 The companion site (separate repo Muru265/fire-rings-apps) and its six example apps.
// Change the base URL here if the companion moves.
export const COMPANION = 'https://fire-rings-apps.vercel.app'

export interface CompanionApp { n: number; page: string; path: string; title: string; who: string; shot: string }
export const COMPANION_APPS: CompanionApp[] = [
  { n: 1, page: 'expect', path: '/expect', title: 'What to expect', who: 'land managers, firefighters' },
  { n: 2, page: 'factcheck', path: '/factcheck', title: 'Fact-check a season', who: 'journalists, scientists' },
  { n: 3, page: 'insurance', path: '/insurance', title: 'Fire index for insurance', who: 'insurers, disaster funds' },
  { n: 4, page: 'smoke', path: '/smoke', title: 'Smoke-season tracker', who: 'air-quality and health teams' },
  { n: 5, page: 'volcano', path: '/volcano', title: 'Volcano ground-truth check', who: 'observatories, scientists' },
  { n: 6, page: 'land', path: '/land', title: 'Land & loan screening', who: 'banks, buyers, supply chains' },
].map((a) => ({ ...a, shot: `/use-cases/${a.page}.png` }))
