// #73 Numbers inside AI text formatted like the tables: "15,346" not "15346". Years are never comma'd: a bare 4-digit
// number from 1900 to 2100 is a year unless the words around it say it is a count:
//  · a count word follows ("2016 fire-days", "2016 MODIS-equivalent fire-days" → "2,016 …"), or
//  · a count phrase comes just before ("typical 2007", "a typical value of 2007", "recorded 2007", "compared with 2007",
//    "range of 1974 to 2144", "[1974, 2144]"), or
//  · it closes a range whose first number was a count ("1,974 to 2144", "1,974–2144").
// Round 6 (item 7): the before-phrases and range rule were added — new regions' briefings showed "typical 2007".
const COUNT_WORD = /^\s*(?:(?:MODIS[- ]equivalent|VIIRS[- ]native|harmonized)\s+)?(fire[- ]days?|fire cell-days|cell-days|detections?|hotspots?|hexagons?|km²|cells?)/i
const COUNT_BEFORE = /(?:typical(?:\s+value)?(?:\s+(?:of|is|was))?|median(?:\s+(?:of|is|was))?|recorded|records|totall?ed|total of|compared\s+(?:with|to)(?:\s+(?:a|the))?(?:\s+typical)?|versus|vs\.?|range of|expected|so far|value of|\[)\s*$/i
const AFTER_COMMA_NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*(?:to|and|–|—|-|,)\s*$/
const RANGE_JOIN = /^\s*(?:to|and|–|—|-|,)\s*$/

const isYearLike = (int: string, dec: string | undefined) => int.length === 4 && !dec && Number(int) >= 1900 && Number(int) <= 2100

export function formatNumbersInText(text: string): string {
  let prevEnd = -1
  let prevWasCount = false
  return text.replace(/(?<![\d.,\w-])(\d{4,})(\.\d+)?(?!\d|,\d|\.\d)/g, (m, int: string, dec: string | undefined, off: number) => {
    const before = text.slice(Math.max(0, off - 40), off)
    const joinsPrev = prevEnd >= 0 && RANGE_JOIN.test(text.slice(prevEnd, off))
    let count = true
    if (isYearLike(int, dec)) {
      count = COUNT_WORD.test(text.slice(off + m.length)) || COUNT_BEFORE.test(before) || AFTER_COMMA_NUMBER.test(before) || (joinsPrev && prevWasCount)
    }
    prevEnd = off + m.length
    prevWasCount = count
    return count ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ?? '') : m
  })
}
