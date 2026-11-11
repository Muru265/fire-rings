// #81 unit tests for the shared number formatters: never "-0", parity % with 2 significant figures; #79 twinkle timing.
// Usage: npx tsx scripts/format_test.ts   (npm run test:format)
import assert from 'node:assert/strict'
import { fmt1, fmtCompact, fmtInt, fmtRatio, noNegZero, pctDiff2sig } from '../src/lib/format'
import { TWINKLE, twinkle, twinkleShare } from '../src/lib/twinkle'

const cases: [string, () => void][] = [
  ['noNegZero turns -0 and tiny negatives into 0', () => {
    assert.ok(Object.is(noNegZero(-0), 0)); assert.ok(Object.is(noNegZero(-0.04, 1), 0)); assert.ok(Object.is(noNegZero(-0.4), 0))
    assert.equal(noNegZero(-0.06, 1), -0.1)
  }],
  ['fmt1 never prints "-0"', () => {
    for (const v of [-0, -0.0, -0.04, -0.049]) assert.equal(fmt1(v), '0')
    assert.equal(fmt1(-0.06), '-0.1'); assert.equal(fmt1(3.44), '3.4'); assert.equal(fmt1(null), '—')
  }],
  ['fmtInt / fmtRatio / fmtCompact never print "-0"', () => {
    assert.equal(fmtInt(-0.3), '0'); assert.equal(fmtRatio(-0.01), '0×'); assert.equal(fmtCompact(-0.2), '0')
    assert.equal(fmtInt(15346), '15,346')
  }],
  ['pctDiff2sig: 2 significant figures', () => {
    assert.equal(pctDiff2sig(48666, 48595), '0.15')
    assert.equal(pctDiff2sig(110, 100), '10'); assert.equal(pctDiff2sig(1123, 1000), '12'); assert.equal(pctDiff2sig(100, 100), '0')
    assert.equal(pctDiff2sig(1, 0), '—')
  }],
  ['#79 twinkle: 1.5–3 s events, a few % of stars at a time, full fade out, brighter peak', () => {
    assert.equal(TWINKLE.durMin, 1500); assert.equal(TWINKLE.durMax, 3000)
    const share = twinkleShare(); assert.ok(share >= 0.02 && share <= 0.06, `share ${share}`)
    const ps = Array.from({ length: 1001 }, (_, i) => twinkle(i / 1000))
    assert.ok(Math.abs(ps[0] - 1) < 1e-9 && Math.abs(ps[1000] - 1) < 1e-9, 'starts and ends at full brightness')
    assert.ok(Math.min(...ps) < 1e-6, 'fades fully out'); assert.ok(Math.max(...ps) > 1.35 && Math.max(...ps) <= 1.4 + 1e-9, 'slightly brighter peak')
  }],
]
let failed = 0
for (const [name, fn] of cases) {
  try { fn(); console.log(`PASS  ${name}`) } catch (e) { failed++; console.log(`FAIL  ${name}: ${(e as Error).message}`) }
}
console.log(failed ? `\n${failed} FAILED` : '\nformat tests passed')
process.exit(failed ? 1 : 0)
