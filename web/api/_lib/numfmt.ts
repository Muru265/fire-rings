// #73 Numbers inside AI text formatted like the tables: "15,346" not "15346". Years are never comma'd: a bare 4-digit
// number from 1900 to 2100 is a year unless a count word follows it ("2016 fire-days" → "2,016 fire-days").
const COUNT_WORD = /^\s*(fire[- ]days?|fire cell-days|detections?|hotspots?|hexagons?|km²|cells?)/i

export function formatNumbersInText(text: string): string {
  return text.replace(/(?<![\d.,\w-])(\d{4,})(\.\d+)?(?!\d|,\d|\.\d)/g, (m, int: string, dec: string | undefined, off: number) => {
    const n = Number(int)
    if (int.length === 4 && n >= 1900 && n <= 2100 && !dec && !COUNT_WORD.test(text.slice(off + m.length))) return m
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ?? '')
  })
}
