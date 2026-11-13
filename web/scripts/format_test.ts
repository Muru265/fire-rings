// #81 unit tests for the shared number formatters: never "-0", parity % with 2 significant figures; #79 twinkle timing.
// Usage: npx tsx scripts/format_test.ts   (npm run test:format)
import assert from 'node:assert/strict'
import { fmt1, fmtCompact, fmtInt, fmtRatio, noNegZero, pctDiff2sig } from '../src/lib/format'
import { formatNumbersInText as F } from '../api/_lib/numfmt'
import { STAR, TWINKLE, twinkle, twinkleShare } from '../src/lib/twinkle'

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
  ['Round 6 #7: counts ≥1000 in AI text get commas, years never do', () => {
    assert.equal(F('compared with a typical 7760, which is 0.7×'), 'compared with a typical 7,760, which is 0.7×')
    assert.equal(F('recorded 2007 fire-days in October 2026'), 'recorded 2,007 fire-days in October 2026')
    assert.equal(F('a typical 2007 and a ratio'), 'a typical 2,007 and a ratio')
    assert.equal(F('recorded 2057 MODIS-equivalent fire-days'), 'recorded 2,057 MODIS-equivalent fire-days')
    assert.equal(F('a 90% range of 1974 to 2144'), 'a 90% range of 1,974 to 2,144')
    assert.equal(F('a 90% range of [1974, 2144]'), 'a 90% range of [1,974, 2,144]')
    assert.equal(F('range 1,974–2144 fire-days'), 'range 1,974–2,144 fire-days')
    assert.equal(F('below every year in the 2003–2022 baseline'), 'below every year in the 2003–2022 baseline')
    assert.equal(F('between 2003 and 2022, the 2019 season'), 'between 2003 and 2022, the 2019 season')
    assert.equal(F('Black Summer 2019–20 had 15346 fire-days; in 2012'), 'Black Summer 2019–20 had 15,346 fire-days; in 2012')
    assert.equal(F('1.37× typical, 0.2×'), '1.37× typical, 0.2×')
  }],
  ['pctDiff2sig: 2 significant figures', () => {
    assert.equal(pctDiff2sig(48666, 48595), '0.15')
    assert.equal(pctDiff2sig(110, 100), '10'); assert.equal(pctDiff2sig(1123, 1000), '12'); assert.equal(pctDiff2sig(100, 100), '0')
    assert.equal(pctDiff2sig(1, 0), '—')
  }],
  ['#93 twinkle: 0.8–2 s events, ~8–10% of stars at a time, peak pure 1.0, some fade fully out', () => {
    assert.equal(TWINKLE.durMin, 800); assert.equal(TWINKLE.durMax, 2000)
    const share = twinkleShare(); assert.ok(share >= 0.08 && share <= 0.10, `share ${share}`)
    for (const base of [STAR.aMin, STAR.aMax]) {
      const full = Array.from({ length: 1001 }, (_, i) => twinkle(i / 1000, base, true))
      const soft = Array.from({ length: 1001 }, (_, i) => twinkle(i / 1000, base, false))
      assert.ok(Math.abs(full[0] - base) < 1e-9 && Math.abs(full[1000] - base) < 1e-9, 'starts and ends at the base alpha')
      assert.ok(Math.abs(Math.max(...full) - 1) < 1e-3, 'peaks at pure 1.0'); assert.ok(Math.min(...full) < 1e-6, 'full fade reaches 0')
      assert.ok(Math.min(...soft) > 0.1, 'soft dip stays visible'); assert.ok(Math.max(...full) <= 1 + 1e-9)
    }
  }],
  ['#93 star look: 1.5–3 px, base opacity 0.6–0.85, ~5% bright', () => {
    assert.equal(STAR.dMin, 1.5); assert.equal(STAR.dMax, 2); assert.equal(STAR.dBright, 3)
    assert.equal(STAR.aMin, 0.6); assert.equal(STAR.aMax, 0.85); assert.equal(STAR.brightShare, 0.05)
  }],
]
let failed = 0
for (const [name, fn] of cases) {
  try { fn(); console.log(`PASS  ${name}`) } catch (e) { failed++; console.log(`FAIL  ${name}: ${(e as Error).message}`) }
}
console.log(failed ? `\n${failed} FAILED` : '\nformat tests passed')
process.exit(failed ? 1 : 0)
