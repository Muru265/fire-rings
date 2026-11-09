// WCAG contrast of text tokens on surface tokens. Usage: node scripts/contrast.mjs
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const text = { text: '#E8EEF5', muted: '#93A1B3', faint: '#5D6B7E', faintAA: process.argv[2] ?? '#8492A6', accent: '#FF7A45', accent2: '#5AC8FA', warn: '#FFC145', ok: '#3DDC97', danger: '#FF5C6C' }
const bgs = { bg: '#0A0E14', surface: '#111822', surface2: '#18212E', surface3: '#202B3A' }
for (const [tn, tc] of Object.entries(text)) {
  console.log(tn.padEnd(8), Object.entries(bgs).map(([bn, bc]) => `${bn} ${ratio(tc, bc).toFixed(2)}${ratio(tc, bc) >= 4.5 ? '' : ' ✗'}`).join('  '))
}
console.log('bg text on accent button:', ratio('#0A0E14', '#FF7A45').toFixed(2))
