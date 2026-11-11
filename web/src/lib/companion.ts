// P2.2 The companion site (separate repo Muru265/fire-rings-apps) and its six example apps.
// Change the base URL here if the companion moves.
export const COMPANION = 'https://fire-rings-apps.vercel.app'

// #92 colour + question per app = the companion's own theme (fire-rings-apps/src/components/Shell.tsx APPS)
export interface CompanionApp { n: number; page: string; path: string; title: string; who: string; shot: string; color: string; bg: string; fg: string; q: string }
export const COMPANION_APPS: CompanionApp[] = [
  { n: 1, page: 'expect', path: '/expect', title: 'What to expect', who: 'land managers, firefighters', color: '#2F6B3A', bg: '#F3EFE0', fg: '#1F2A1C', q: 'Will this month be quieter or busier than usual?' },
  { n: 2, page: 'factcheck', path: '/factcheck', title: 'Fact-check a season', who: 'journalists, scientists', color: '#A8231B', bg: '#F4F1EA', fg: '#111111', q: 'Was that really the worst fire season on record?' },
  { n: 3, page: 'insurance', path: '/insurance', title: 'Fire index for insurance', who: 'insurers, disaster funds', color: '#1F3F8F', bg: '#F4F6FA', fg: '#0F1E3D', q: 'Would a satellite switch have triggered false payouts?' },
  { n: 4, page: 'smoke', path: '/smoke', title: 'Smoke-season tracker', who: 'air-quality and health teams', color: '#9A3C0D', bg: '#E6E1DA', fg: '#202125', q: 'How big is Punjab’s crop-burning season this year?' },
  { n: 5, page: 'volcano', path: '/volcano', title: 'Volcano ground-truth check', who: 'observatories, scientists', color: '#FF7A2E', bg: '#1C1A1F', fg: '#F3EDE7', q: 'Do fire satellites see every eruption of Réunion’s volcano?' },
  { n: 6, page: 'land', path: '/land', title: 'Land & loan screening', who: 'banks, buyers, supply chains', color: '#2C5A86', bg: '#FFFFFF', fg: '#1C2632', q: 'Has this area had more fire than normal lately?' },
].map((a) => ({ ...a, shot: `/use-cases/${a.page}.png` }))
