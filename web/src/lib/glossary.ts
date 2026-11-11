// Single source for the Guide page (/guide), its search index and every ⓘ on the site (QA #9).
// Plain words only. No scientific numbers here: worked examples are computed from the published JSON in Guide.tsx.

export type Group = 'Basics' | 'Home' | 'Explore' | 'Proof' | 'Story' | 'Data' | 'Ask' | 'Glossary'

export interface Entry {
  id: string
  title: string
  group: Group
  /** words people might type: chart names as written on the site, synonyms, old names */
  aliases: string[]
  /** one line, used by the ⓘ popovers */
  short: string
  what: string
  steps: string[]
  watch: string[]
  where: { to: string; label: string }
}

export interface Term { id: string; term: string; aliases: string[]; short: string; more?: string }

export const GROUPS: Group[] = ['Basics', 'Home', 'Explore', 'Proof', 'Story', 'Data', 'Ask', 'Glossary']

const EX = { to: '/r/punjab', label: 'Open on Explore →' }
const PR = { to: '/proof', label: 'Open on Proof →' }

export const ENTRIES: Entry[] = [
  // ---- Home ---------------------------------------------------------------------------------------------------
  { id: 'globe', title: 'Globe playback', group: 'Home', aliases: ['globe', 'timelapse', 'play', 'world', 'animation'],
    short: 'Each region’s fire hexagons glow month by month, 2001 → now. Brighter = more fire-days for that region.',
    what: 'A spinning globe where each hero region lights up with its real fire hexagons, month by month since 2001.',
    steps: ['Press ▶ to play, or drag the slider to a month.', 'Brightness and colour = fire-days in that ~1,800 km² hexagon that month, relative to the region’s own busiest months.', 'The numbers under the slider are the region totals for the month shown (MODIS-equivalent fire-days).'],
    watch: ['Each region is scaled to its own maximum, so Mauritius glowing does not mean it burns like Madagascar.', 'The LIVE line underneath is raw detections from the last 72 hours — a different unit.'],
    where: { to: '/', label: 'Open on Home →' } },
  { id: 'region-cards', title: 'Region cards', group: 'Home', aliases: ['cards', 'hero regions', 'home cards', 'much lower than usual'],
    short: 'Each card says in words how the last full month compares with a typical one, then the ratio and percentile.',
    what: 'One card per hero region: a plain verdict for the last full month, then the numbers behind it.',
    steps: ['Read the coloured chip first (e.g. “Much lower than usual”) — colour always comes with words.', 'Then the ratio (“0.1× a typical October”) and the percentile.', 'Click a card to open that region.'],
    watch: ['“Provisional” means near-real-time data that NASA may still revise.', 'A ⚑ flag means the detection-time caveat applies (Punjab Oct–Nov).'],
    where: { to: '/', label: 'Open on Home →' } },
  { id: 'live-line', title: 'LIVE line', group: 'Home', aliases: ['live', '72 h', 'near real time', 'nrt feed', 'live badge'],
    short: 'Raw satellite detections from the last 72 hours — not fire-days, never added to the record.',
    what: 'A count of raw detections in the last 72 hours per region, straight from NASA FIRMS near-real-time data.',
    steps: ['“Last satellite pass X h ago” = how fresh the newest detection is.', 'The count is raw detections (hot pixels), not fire-days.'],
    watch: ['Different unit from the rest of the page — do not compare it with fire-days.', 'If it says “feed temporarily unavailable”, the record is unaffected.'],
    where: { to: '/', label: 'Open on Home →' } },
  { id: 'satellite-timeline', title: 'Satellite timeline', group: 'Home', aliases: ['five satellites', 'sensor timeline', 'terra', 'aqua', 'noaa', 'snpp'],
    short: 'When each of the five fire satellites flew, when they drifted, and the calibration window.',
    what: 'Bars for Terra, Aqua (MODIS) and Suomi-NPP, NOAA-20, NOAA-21 (VIIRS), with the calibration window shaded.',
    steps: ['Blue = MODIS (1 km pixels), orange = VIIRS (375 m).', 'Striped ends = orbit drift (the satellite passes later in the day).', 'The shaded band = Jul 2012 – Dec 2019, the years used to find the exchange rate.'],
    watch: ['Suomi-NPP’s data ended in Nov 2026; NOAA-20 carries the record on.'],
    where: { to: '/', label: 'Open on Home →' } },

  // ---- Explore -------------------------------------------------------------------------------------------------
  { id: 'mode-toggle', title: 'Mode toggle: Long-term vs High detail', group: 'Explore', aliases: ['mode', 'long-term', 'high detail', 'detail mode', 'two views', 'native'],
    short: 'Long-term = fair 25-year comparison (MODIS-equivalent). High detail = the new satellites’ full 375 m view, 2012–now.',
    what: 'Switches every number, chart and map on the page between two views of the same data.',
    steps: ['Long-term (2001–now): the new satellite converted to old-satellite units, so every year uses the same ruler.', 'High detail (2012–now): VIIRS as seen, more small fires, finer map hexagons, baseline 2013–2022.', 'The chip in the header always says which mode a screenshot is in.'],
    watch: ['Never compare a High detail number with a Long-term number.', 'High detail has a shorter baseline, so its percentiles are coarser.'],
    where: EX },
  { id: 'header-badges', title: 'Header badges', group: 'Explore', aliases: ['badges', 'validated', 'harmonized badge', 'chip'],
    short: 'The mode, the calibration method and the out-of-sample error for this region.',
    what: 'Small chips next to the region name: LIVE count, the mode, and how well the method was validated.',
    steps: ['“Long-term · harmonized · method” says which exchange-rate method this region uses.', '“Validated: N% out-of-sample error” links to the Proof page.'],
    watch: ['Low-activity regions show “low-activity region” instead of an error, because tiny counts make percentages meaningless.'],
    where: EX },
  { id: 'headline', title: 'Headline sentence', group: 'Explore', aliases: ['headline', 'last full month', 'picked month', 'big sentence'],
    short: 'One sentence: how the month compares with a typical one — ratio, percentile or rank, return period.',
    what: 'The big sentence at the top, about the last full month (or the month you picked).',
    steps: ['The small grey label says which month: “Last full month”, “This month so far” or “Picked month”.', 'Ratio first (“0.1× a typical October”), then where it ranks.'],
    watch: ['Provisional and caveat flags are part of the sentence — read to the end.'],
    where: EX },
  { id: 'kpi-cards', title: 'KPI cards', group: 'Explore', aliases: ['kpi', 'this month so far', 'year to date', 'peak month', 'static sources removed', 'cards'],
    short: 'This month so far, year to date, peak month and static sources removed — each with plain words.',
    what: 'Four cards with the headline numbers for this region.',
    steps: ['This month so far: fire-days for days 1–N, compared with the same days in past years.', 'Year to date: this year’s complete months vs a typical year over the same months.', 'Peak month: the month that normally burns most.', 'Static sources removed: detections at always-hot places (flares, kilns) we dropped.'],
    watch: ['“This month so far” is provisional and partial.'],
    where: EX },
  { id: 'seam-slider', title: 'Raw ↔ Fixed slider (seam slider)', group: 'Explore', aliases: ['seam', 'slider', 'raw fixed', 'before after slider', 'show the fix'],
    short: 'Slide from raw (fake 2012 jump) to fixed (harmonized) to see what the conversion does.',
    what: 'A slider under the Fire Rings that blends the colours from raw counts to the harmonized record.',
    steps: ['Left end “Before fix”: MODIS until 2011, raw VIIRS after — the rings jump at 2012.', 'Right end “After fix”: everything in MODIS-equivalent units — no jump.', '▶ Show the fix animates it.'],
    watch: ['In-between positions are a visual blend, not real values.', 'Not shown in High detail mode (nothing is converted there).'],
    where: EX },
  { id: 'fire-rings', title: 'Fire Rings', group: 'Explore', aliases: ['rings', 'pie chart', 'circle', 'radial', 'clock', 'tree rings', 'donut'],
    short: 'Slice = month (Jan at top, clockwise), ring = year (2001 centre → now outside), colour = fire-days.',
    what: 'Every month since 2001 as one cell of a circle, so the rhythm of the fire season shows at a glance.',
    steps: ['① A slice is a calendar month — January at the top, then clockwise.', '② A ring is a year: 2001 in the centre, the newest year on the outside edge.', '③ The dashed ring (labelled 2012) marks when VIIRS joined.', '④ Colour = fire-days: bright yellow = many (here the Oct–Nov burning season); hatched = uncertain or Terra-only, dotted outline = provisional.', 'Hover for values, click a cell for the month drawer. “Vs typical” recolours by ratio: blue below normal, red above.'],
    watch: ['Colours are quantile classes per region — the same colour means different counts in different regions.', 'Recent outer rings may be provisional.'],
    where: EX },
  { id: 'calendar', title: 'Calendar', group: 'Explore', aliases: ['grid', 'table', 'heatmap', 'calendar grid'],
    short: 'The same data as the rings as a table: rows = years, columns = months, last column = year total.',
    what: 'A grid with one row per year and one column per month, coloured like the rings.',
    steps: ['Read across a row to see one year’s season.', 'Read down a column to compare the same month across years.', 'The Year column is the annual total; “~” = incomplete year.', 'Criss-cross = not enough satellite coverage; striped = uncertain or Terra-only; dotted = provisional.'],
    watch: ['Use View as table for exact numbers.'],
    where: EX },
  { id: 'seasonality', title: 'Seasonality', group: 'Explore', aliases: ['season', 'seasonal chart', 'normal range', 'typical month', 'p10 p90'],
    short: 'Grey bar = normal range (8 of 10 years), white tick = typical, orange dot = the selected year.',
    what: 'For each month: what is normal, and where the selected year sits.',
    steps: ['① Grey bar = normal range (P10–P90: 8 of 10 baseline years fall inside).', '② White tick = typical (median).', '③ Orange dot = the selected year, with its 90% range.', 'A clicked similar year is drawn as a dashed blue line.'],
    watch: ['The dot for the current month is partial if the month is not over.'],
    where: EX },
  { id: 'annual-totals', title: 'Annual totals', group: 'Explore', aliases: ['annual', 'bars', 'yearly', 'year totals', 'bar chart'],
    short: 'Bar = fire-days per year, whisker = 90% range; no jump at the 2012 line = the fix works.',
    what: 'One bar per year of harmonized fire-days, with uncertainty whiskers.',
    steps: ['① Bar = fire-days that year.', '② Whisker = 90% range.', '③ Dashed line at 2012: no step there means the conversion works.', 'Hatched = Terra-only months (not ranked); hollow = incomplete year.'],
    watch: ['The newest year is incomplete until December.'],
    where: EX },
  { id: 'gauge', title: '“Is this normal?” gauge', group: 'Explore', aliases: ['gauge', 'speedometer', 'dial', 'is this normal', 'needle'],
    short: 'Needle = where this month ranks against the same month in past years; white band = our uncertainty.',
    what: 'A dial showing where the month ranks among the same calendar month in the baseline years.',
    steps: ['① Needle = the month’s percentile (left = much lower, right = much higher, top = usual).', '② White band = the percentile range from our uncertainty.', '③ Big number = ratio to the typical month; below it the rank or return period.', 'Buttons switch between “this month so far”, “last full month” and the month drawer.'],
    watch: ['“Too little fire to judge” replaces the needle where counts are tiny.'],
    where: EX },
  { id: 'similar-years', title: 'Similar years', group: 'Explore', aliases: ['analogues', 'similar', 'looks like', 'shape similarity'],
    short: 'Past years whose season so far had the same shape (not size). Analogues, not a forecast.',
    what: 'The three past years whose month-by-month pattern this year most resembles.',
    steps: ['“93% similar shape” = correlation of the monthly curves so far.', 'Click a year to highlight it on the rings and overlay it on Seasonality.'],
    watch: ['Same shape, not same size.', 'Not a prediction of what comes next.'],
    where: EX },
  { id: 'ask-chips', title: 'Ask chips', group: 'Explore', aliases: ['ask', 'questions', 'chips', 'ai'],
    short: 'Quick questions for the AI analyst, answered only with numbers it looked up in the data.',
    what: 'Buttons that ask Ask Fire Rings a common question about this region.',
    steps: ['Click a chip; the answer shows the numbers it used and their source lookups.'],
    watch: ['If the live AI is busy you get a saved answer, labelled “Instant answer”.'],
    where: EX },
  { id: 'provenance', title: 'Provenance', group: 'Explore', aliases: ['provenance', 'sources', 'updated', 'unit', 'baseline'],
    short: 'Where the data comes from, the unit, calibration, baseline, mode and when it was updated.',
    what: 'A small card listing the data sources and the settings behind every number on the page.',
    steps: ['Through = last day of data; NRT months are quick-look data replaced later.', 'Calibration = how the exchange rate was found.'],
    watch: ['Times are shown in Mauritius time.'],
    where: EX },
  { id: 'adds-card', title: 'What the new satellite adds', group: 'Explore', aliases: ['adds', 'native vs modis', 'more fire-days', 'small fires'],
    short: 'How many more fire-days VIIRS sees than the old-camera equivalent — mostly small fires MODIS misses.',
    what: 'The ratio of native VIIRS fire-days to MODIS-equivalent fire-days over 2013–2022, with a small chart per year.',
    steps: ['Upper line = what VIIRS sees; lower line = the same fires in old-camera units (used in Long-term).'],
    watch: ['Both lines come from the same detections; the difference is the camera, not the fire.'],
    where: EX },
  { id: 'map', title: 'Map and box', group: 'Explore', aliases: ['map', 'hexagons', 'box', 'draw box', 'west south east north', 'w s e n', 'rectangle'],
    short: 'Hexagons coloured by fire-days for the selected month; draw a box to recompute everything for that area.',
    what: 'A map of the selected month with fire hexagons, detections when zoomed in, and a box tool.',
    steps: ['Hexagon colour = fire-days in that tile (~36 km² in Long-term, ~5 km² in High detail).', '● MODIS / ▲ VIIRS = individual detections (latest months, zoomed in).', 'Draw a box or type West/South/East/North (degrees) and Apply: rings, calendar and charts recompute for the box.', 'Dotted outline = the data area (clip box); solid = your box.'],
    watch: ['Boxes use the region’s exchange rate and have no uncertainty ranges.', 'Mauritius opens on the main island; use the Rodrigues button for the other island.'],
    where: EX },
  { id: 'month-drawer', title: 'Month drawer', group: 'Explore', aliases: ['drawer', 'month details', 'details', 'side panel'],
    short: 'Click any month: headline, three cards, daily chart, every same month in the baseline, and a mini map.',
    what: 'The panel that opens when you click a month on the rings or calendar.',
    steps: ['Headline sentence for that month.', 'Cards: fire-days with 90% range, ratio to typical, raw hotspots per satellite.', 'Downloads for that month at the bottom.'],
    watch: ['Hotspots are pixels, not fires — many hotspots can fall in one fire-day.'],
    where: EX },
  { id: 'daily-fire-days', title: 'Daily fire-days (drawer)', group: 'Explore', aliases: ['daily', 'daily chart', 'days'],
    short: 'Bars = each day this month; grey band = normal range for that day; line = typical.',
    what: 'Fire-days for each day of the month against the same day in baseline years.',
    steps: ['Bars = this month, day by day.', 'Band = P10–P90 for that day; line = median.', 'Hatched days = the satellite sent no data (not zero fire).'],
    watch: ['Single days are noisy; read the shape.'],
    where: EX },
  { id: 'baseline-strip', title: '“Every [month] in the baseline” strip', group: 'Explore', aliases: ['dot plot', 'strip', 'every month', 'baseline dots'],
    short: 'Grey dots = the same month in each baseline year; white tick = typical; orange dot = this month.',
    what: 'One dot per baseline year for this calendar month, so you see where this month falls.',
    steps: ['Hover a grey dot for its year and value.', 'The orange bar = this month’s 90% range.'],
    watch: ['Uses the baseline of the current mode.'],
    where: EX },
  { id: 'where-map', title: '“Where” mini map (drawer)', group: 'Explore', aliases: ['where', 'mini map', 'small map'],
    short: 'Hexagons with fire that month; faint grey = everywhere that ever burned; scale bar in km.',
    what: 'A small map of where the fire was that month.',
    steps: ['Colour = days with fire in each hexagon (raw count).', 'Faint grey = every hexagon that burned since 2001 — the region’s shape.'],
    watch: ['Raw counts, not converted.'],
    where: EX },
  { id: 'date-range', title: 'Date range (From / To)', group: 'Explore', aliases: ['date range', 'range', 'from', 'to', 'season total', 'period', 'between dates', 'custom period'],
    short: 'Pick a From and To month: get the total, typical, busiest month and rank; rings, calendar, bars and exports follow.',
    what: 'A From / To month selector above the Fire Rings. Default = the whole record.',
    steps: ['Total = sum of the monthly fire-days in the range.', 'Typical = sum of each month’s baseline median.', 'Rank compares the same months in every other year with complete data (ranges up to 12 months).', 'Months outside the range fade on the rings, calendar and annual bars; CSV and PNG cover only the range.', 'The link keeps the range (…?from=2019-07&to=2020-03), so you can share it.'],
    watch: ['Works in Long-term and High detail, and with a drawn box (the box has no percentiles).', 'No rank when a month in the range is incomplete or has no data.'],
    where: { to: '/r/se_australia?from=2019-07&to=2020-03', label: 'Try Black Summer →' } },
  { id: 'export', title: 'CSV and PNG export', group: 'Explore', aliases: ['csv', 'png', 'download', 'export'],
    short: 'CSV = every month with both units; PNG = the rings as an image.',
    what: 'Download buttons above the Fire Rings.',
    steps: ['CSV always has fire_days_modis_eq and fire_days_viirs_native, plus raw counts and flags.', 'PNG saves the rings with the legend and source line.'],
    watch: ['Ratio and percentile columns follow the mode you are in.'],
    where: EX },

  // ---- Proof ---------------------------------------------------------------------------------------------------
  { id: 'v1-error', title: 'Out-of-sample annual error (V1)', group: 'Proof', aliases: ['v1', 'loyo', 'leave one year out', 'error', 'mape'],
    short: 'Hide one year, predict it from the others, compare with what the old satellite saw.',
    what: 'The main accuracy test: for each year 2012–2019 we refit without it and predict it.',
    steps: ['The % is the average miss on annual totals; bias = whether we tend to over- or under-shoot.'],
    watch: ['Low-activity regions are not judged on this.'],
    where: PR },
  { id: 'v3-step', title: '2012 step test (V3)', group: 'Proof', aliases: ['v3', 'step', 'jump', 'pettitt', 'seam test'],
    short: 'Raw data jumps when VIIRS arrives; after the fix the jump should be gone.',
    what: 'Compares the average before and after 2012 for raw, harmonized and MODIS-only series.',
    steps: ['Raw +N% = the fake jump.', 'Harmonized change close to MODIS-only change = fixed.'],
    watch: ['Real trends exist too; MODIS-only is the reference.'],
    where: PR },
  { id: 'seasonal-shape', title: 'Seasonal shape', group: 'Proof', aliases: ['shape', 'correlation', 'r'],
    short: 'How well our predicted months follow the real seasonal pattern (1.00 = perfect).',
    what: 'Correlation between out-of-sample monthly predictions and what MODIS saw.',
    steps: ['Closer to 1 = the seasonal rhythm is preserved.'],
    watch: ['Informational, not a pass/fail target.'],
    where: PR },
  { id: 'v9-peaks', title: 'Famous seasons (V9)', group: 'Proof', aliases: ['v9', 'black summer', 'peaks', 'biggest seasons'],
    short: 'Do known big seasons come out on top? Scored only against a sourced event.',
    what: 'Checks the ranking of well-documented fire seasons (e.g. Black Summer 2019–20).',
    steps: ['Pass = the sourced event ranks where history says it should.'],
    watch: ['Regions without a sourced event show “info”, not pass/fail.'],
    where: PR },
  { id: 'before-after', title: 'Before / after chart', group: 'Proof', aliases: ['before after', 'show the fix', '2012 cliff', 'raw line'],
    short: 'Pink raw line jumps at 2012; ▶ Show the fix brings it down onto the harmonized line.',
    what: 'Annual totals: raw (MODIS then raw VIIRS), MODIS only, and harmonized.',
    steps: ['Pink dashed = raw; blue = MODIS only; orange = harmonized.', 'Press ▶ Show the fix to morph raw into harmonized.'],
    watch: ['2012 is skipped (VIIRS started on 20 Jan); a dotted bridge shows the cliff.'],
    where: PR },
  { id: 'orbit-drift', title: 'Orbit drift chart', group: 'Proof', aliases: ['drift', 'orbit', 'why 2019', 'ratio by year'],
    short: 'Old ÷ new satellite per year. Terra and Aqua drift after 2020, so calibration stops at 2019.',
    what: 'The yearly ratio of MODIS to VIIRS fire-days, with the calibration window shaded.',
    steps: ['Flat inside the shaded window = a stable exchange rate.', 'Dashed lines = Terra drift, Aqua drift, MODIS version change.'],
    watch: ['Small changes after 2020 are why we never fit on 2020+.'],
    where: PR },
  { id: 'calibration-ratio-by-month', title: 'Calibration ratio by month', group: 'Proof', aliases: ['k', 'exchange rate', 'calibration', 'ratio by month', 'shrinkage', 'tau'],
    short: 'The exchange rate (MODIS ÷ VIIRS fire-days) for each calendar month, fitted on Jul 2012 – Dec 2019.',
    what: 'One exchange rate per calendar month, with its 90% range and the number of fire-days behind it.',
    steps: ['Filled dot = rate we use; hollow dot = raw rate before shrinking.', 'Bar = 90% range; dashed line = region-wide rate.', 'Grey numbers = fire-days behind each rate (more = more reliable).'],
    watch: ['Months with few fires are labelled “few fires — low reliability” and pulled toward the region-wide rate.'],
    where: PR },
  { id: 'outages', title: 'Known outages', group: 'Proof', aliases: ['outages', 'gaps', 'coverage', 'missing days'],
    short: 'Days a satellite sent no data; months with ≥60% coverage are scaled up, others shown as “not enough data”.',
    what: 'A timeline and table of satellite outages found in the data.',
    steps: ['Red marks = outage periods per satellite.'],
    watch: ['We never guess a month with too little coverage.'],
    where: PR },
  { id: 'static-sources', title: 'Static sources line', group: 'Proof', aliases: ['static', 'flares', 'kilns', 'industry', 'mask'],
    short: 'Detections at always-hot places (factories, kilns, gas flares) removed so they are not counted as fires.',
    what: 'How many detections were removed as static heat sources in this region.',
    steps: ['NASA’s own flag plus our list of always-hot hexagons.'],
    watch: ['Same mask for both satellite families.'],
    where: PR },
  { id: 'detection-time', title: 'Detection-time caveat chart', group: 'Proof', aliases: ['detection time', 'overpass', 'late afternoon', 'punjab caveat', 'aqua drift'],
    short: 'Punjab burning shifted to late afternoon, after the ~13:30 overpass — recent seasons may be undercounted.',
    what: 'Shows that the later-passing (drifted) Aqua now sees relatively more fire only in Punjab Oct–Nov.',
    steps: ['Lines = how much more Aqua sees vs VIIRS, by region and season.', 'Only Punjab Oct–Nov rises — the signature of later burning.'],
    watch: ['Numbers are not changed, only flagged.'],
    where: PR },
  { id: 'limitations', title: 'Limitations', group: 'Proof', aliases: ['limits', 'problems', 'caveats'],
    short: 'What the method cannot do, and what we do about each limit.',
    what: 'Cards listing each known limit and its mitigation.',
    steps: ['“The problem” then “What we do about it”.'],
    watch: [],
    where: PR },
  { id: 'method-steps', title: 'Method in six steps', group: 'Proof', aliases: ['method', 'pipeline', 'funnel', 'steps'],
    short: 'Read → region → filter → count → calibrate → record, with the real counts for the region.',
    what: 'The data funnel from raw detections to the harmonized record.',
    steps: ['Each box shows the real count at that step.'],
    watch: [],
    where: PR },

  // ---- Fire Watch -------------------------------------------------------------------------------------------------
  { id: 'fire-watch', title: 'Fire Watch (monitoring agent + briefings)', group: 'Ask', aliases: ['fire watch', 'watch', 'agent', 'alerts', 'alert', 'monitoring', 'briefing', 'status', 'unusually low', 'run the agent'],
    short: 'An agent checks each region against fixed rules (status: Normal / Watch / Alert / Unusually low); an AI briefing explains flagged regions with verified numbers.',
    what: 'Rules decide, AI explains: a deterministic check of every region, then a short plain-words briefing for regions where a rule fired.',
    steps: ['Each card shows the status as colour, icon and words, plus “Why this alert?” — the rule that fired.', '“Numbers used” lists the month so far, the last full month and the live 72-hour count against what is typical.',
      '▶ Run the agent now shows every step live; briefings are written by Gemini using the Ask tools, and any number not found in those lookups is rejected.', '“Relevant for:” names who typically uses this kind of signal.'],
    watch: ['Situational awareness for planning — not an emergency alert service, and never a forecast.', 'Low-activity regions are never flagged (too little fire to judge).', '“⚡ saved briefing” = precomputed from the same data when the live AI is busy.'],
    where: { to: '/watch', label: 'Open Fire Watch →' } },
  { id: 'raw-vs-harmonized', title: 'Why harmonization matters (raw vs harmonized alerts)', group: 'Proof', aliases: ['false alarms', 'raw vs harmonized', 'backtest', 'why harmonization matters', 'alerts since 2012', 'satellite switch alerts'],
    short: 'The same alert rules run on raw and on harmonized data, every month since 2012: raw data raises many false alarms caused only by the satellite switch.',
    what: 'A backtest of the Fire Watch rules on the unconverted record versus the harmonized record, 2012–2025, all regions.',
    steps: ['Striped bars = alerts per year on raw data; solid bars = alerts on harmonized data.', '“Caused only by the satellite switch” = months raw data flags that the harmonized record does not.', 'Raw data also misses real drops: compare the “far below normal” counts.'],
    watch: ['Both use the same thresholds and the same 2003–2022 baseline; only the conversion differs.'],
    where: { to: '/watch', label: 'Open Fire Watch →' } },

  // ---- Story / Data / Ask --------------------------------------------------------------------------------------
  { id: 'story', title: 'Story mode', group: 'Story', aliases: ['story', 'madagascar story', 'scroll'],
    short: 'A guided scroll through Madagascar’s fire calendar.',
    what: 'A scrolling story that walks through one region’s rings step by step.',
    steps: ['Scroll; the rings update with each step.'],
    watch: ['Numbers come from the same published JSON.'],
    where: { to: '/story/madagascar', label: 'Open Story →' } },
  { id: 'open-api', title: 'Open API (for other apps)', group: 'Data', aliases: ['api', 'open api', 'endpoint', 'json', 'cors', 'developers', 'hotspots api', 'build an app'],
    short: 'Free, no-key JSON/CSV endpoints any website can call from the browser — the six example apps use only these.',
    what: 'A list of every endpoint on the Data page, with an example call for each.',
    steps: ['Static files (/data/v1/…) are the record itself: regions, series, projection backtest, NASA POWER weather, Réunion check.', '/api/hotspots fetches filtered NASA FIRMS detections for up to 31 days, cached.', 'CORS is open on read-only endpoints; Ask (AI) stays on this site.'],
    watch: ['/api/hotspots depends on NASA FIRMS being reachable; demo months are static files.'],
    where: { to: '/data#api-h', label: 'Open on Data →' } },
  { id: 'data-page', title: 'Data page', group: 'Data', aliases: ['data', 'download', 'dataset', 'dictionary', 'open data'],
    short: 'The open harmonized dataset, calibration ratios and validation results, with a column dictionary.',
    what: 'Downloads and a dictionary of every column.',
    steps: ['CSV/Parquet for all regions; one row per region × month.'],
    watch: ['V_native columns are High detail values (2012+).'],
    where: { to: '/data', label: 'Open Data →' } },
  { id: 'ask-page', title: 'Ask Fire Rings', group: 'Ask', aliases: ['ask page', 'ai analyst', 'chat', 'gemini'],
    short: 'An AI analyst that answers only with numbers it looked up in the published data.',
    what: 'Ask questions in plain words; answers come with the lookups they used.',
    steps: ['Pick a region and a style (Responder = short, Scientist = with uncertainty).', 'Open “Numbers used” to see every lookup.'],
    watch: ['It never forecasts.', 'Saved answers are labelled “Instant answer”.'],
    where: { to: '/ask', label: 'Open Ask →' } },
  { id: 'numbers-used', title: '“Numbers used”', group: 'Ask', aliases: ['trace', 'lookups', 'verified'],
    short: 'The exact lookups behind an answer; every number in the answer is checked against them.',
    what: 'A list of tool calls and their results under each answer.',
    steps: ['If a number in the answer is not in these results, the answer is withheld.'],
    watch: [],
    where: { to: '/ask', label: 'Open Ask →' } },
]

export const TERMS: Term[] = [
  { id: 'fire-day', term: 'Fire-day', aliases: ['fire cell-day', 'cell-day', 'fire day'], short: 'One ~36 km² (≈6×6 km) tile with at least one fire on one day.', more: 'One fire burning 3 days in one tile = 3 fire-days. Ten fires in the same tile on the same day = 1 fire-day. Counting places, not dots, makes old and new satellites comparable.' },
  { id: 'hotspot', term: 'Hotspot / detection', aliases: ['detection', 'hot pixel', 'hotspots'], short: 'One satellite pixel flagged as hot — not the same as one fire.' },
  { id: 'modis-equivalent', term: 'MODIS-equivalent', aliases: ['modis eq', 'old camera units'], short: 'Numbers expressed in the old MODIS camera’s units, so 2001 and today use the same ruler.' },
  { id: 'viirs-native', term: 'VIIRS native', aliases: ['native', '375 m', 'high detail values'], short: 'Fire-days as the new VIIRS camera sees them (375 m pixels), not converted. Used in High detail mode.' },
  { id: 'typical', term: 'Typical', aliases: ['median', 'normal'], short: 'The median of that calendar month over the baseline years (2003–2022 in Long-term, 2013–2022 in High detail).' },
  { id: 'normal-range', term: 'Normal range (P10–P90)', aliases: ['p10', 'p90', 'range', 'band'], short: '8 of 10 baseline years fall inside it.' },
  { id: 'ratio', term: 'Ratio “0.1×”', aliases: ['times', 'x typical', 'ratio to typical'], short: 'This value divided by the typical value: 0.1× = a tenth of normal, 2× = twice normal.' },
  { id: 'percentile', term: 'Percentile', aliases: ['pct', '5th percentile', 'rank'], short: '“5th percentile” = lower than about 95% of past same months. Shown as a range because of uncertainty.' },
  { id: 'interval-90', term: '90% range / whiskers', aliases: ['ci', 'interval', 'uncertainty', 'whisker', 'confidence'], short: 'We are 90% sure the true value lies in this range (from 500 re-runs of the calibration).' },
  { id: 'return-period', term: 'Return period', aliases: ['1-in-n', 'once in', 'return'], short: '“About 1-in-N years” = a month this high happens on average once every N years, from the percentile.' },
  { id: 'provisional', term: 'Provisional', aliases: ['quick look', 'preliminary'], short: 'Near-real-time data that may change when NASA reprocesses it about 5 months later.' },
  { id: 'nrt', term: 'NRT', aliases: ['near real time', 'near-real-time'], short: 'NASA’s quick-look data, available about 3 hours after the satellite pass.' },
  { id: 'uncertain', term: 'Uncertain (hatched)', aliases: ['hatched', 'striped', 'wide range'], short: 'The 90% range is wider than half the value.' },
  { id: 'insufficient-coverage', term: 'Insufficient coverage (criss-cross)', aliases: ['criss-cross', 'no data', 'outage'], short: 'The satellite sent data on too few days that month, so no value is given.' },
  { id: 'low-activity', term: 'Low activity / “too little fire to judge”', aliases: ['too little fire', 'guard', 'low activity'], short: 'When typical counts are tiny (median under 5 and value under 10), percentages mean little, so we don’t judge.' },
  { id: 'harmonized-vs-raw', term: 'Harmonized vs raw', aliases: ['harmonized', 'raw', 'fixed'], short: 'Raw = each satellite in its own units (fake 2012 jump). Harmonized = all converted to MODIS-equivalent.' },
  { id: 'calibration-window', term: 'Calibration window', aliases: ['window', 'jul 2012 dec 2019'], short: 'Jul 2012 – Dec 2019: both satellite families flew stable orbits, so the exchange rate is fitted only here.' },
  { id: 'exchange-rate', term: 'Calibration ratio / exchange rate (k)', aliases: ['k', 'exchange rate', 'calibration ratio', 'kprime', 'q'], short: 'MODIS fire-days ÷ VIIRS fire-days in the same months: multiply VIIRS by k to get MODIS-equivalent.' },
  { id: 'orbit-drift', term: 'Orbit drift', aliases: ['drift'], short: 'Terra (2020) and Aqua (Dec 2021) slowly pass later in the day, so they see fires at a different time.' },
  { id: 'loyo', term: 'Leave-one-year-out test', aliases: ['loyo', 'cross validation', 'out of sample'], short: 'Hide a year, fit on the rest, predict the hidden year, compare.' },
  { id: 'bias', term: 'Bias', aliases: ['over', 'under'], short: 'Whether predictions tend to be too high (+) or too low (−) on average.' },
  { id: 'jump-test', term: 'Jump test (Pettitt p)', aliases: ['pettitt', 'p value', 'step test'], short: 'A statistical test for a sudden step; a small p means a real jump.' },
  { id: 'correlation-r', term: 'Correlation r', aliases: ['r', 'correlation', 'similar shape'], short: 'How closely two curves move together: 1 = same shape, 0 = unrelated.' },
  { id: 'collection-version', term: 'MODIS collection version (6.03 → 61.03)', aliases: ['collection', '6.03', '61.03', 'version'], short: 'NASA changed the MODIS processing label on 1 Jan 2023 — same product, new version number.' },
  { id: 'static-sources-term', term: 'Static sources removed', aliases: ['flares', 'kilns', 'industry'], short: 'Always-hot places (gas flares, brick kilns, factories) removed so they don’t count as fires.' },
  { id: 'low-confidence', term: 'Low-confidence dropped', aliases: ['confidence', 'low conf'], short: 'Detections NASA marks as low confidence are removed, the same way for both satellite families.' },
  { id: 'month-to-date', term: 'Month to date', aliases: ['so far', 'mtd', 'this month so far'], short: 'Days 1–N of the current month, compared with the same days of baseline years.' },
  { id: 'box-edges', term: 'West / South / East / North (box)', aliases: ['w s e n', 'box', 'degrees', 'lat lon'], short: 'The edges of your box in decimal degrees (longitude for West/East, latitude for South/North).' },
]

export type HelpId = string

/** One-line help for an ⓘ: guide entry or glossary term. */
export function helpFor(id: HelpId): { title: string; short: string } | null {
  const e = ENTRIES.find((x) => x.id === id)
  if (e) return { title: e.title, short: e.short }
  const t = TERMS.find((x) => x.id === id)
  return t ? { title: t.term, short: t.short } : null
}

// ---- search ----------------------------------------------------------------------------------------------------

export interface Hit { id: string; title: string; kind: 'entry' | 'term' | 'section'; group: Group; score: number }

export const SECTIONS: { id: string; title: string; aliases: string[] }[] = [
  { id: 'problem', title: 'The problem in 30 seconds', aliases: ['why', 'problem', 'two cameras', 'jump', 'modis viirs'] },
  { id: 'fix', title: 'How we fix it (3 ideas)', aliases: ['fix', 'method', 'how', 'convert'] },
  { id: 'two-views', title: 'Two views of the same data', aliases: ['long-term', 'high detail', 'modes', 'blurry photo'] },
  { id: 'live-vs-record', title: 'LIVE vs record', aliases: ['live', 'record', '72 h'] },
  { id: 'punjab-caveat', title: 'The Punjab detection-time caveat, simply', aliases: ['speed camera', 'punjab', 'overpass', 'afternoon'] },
  { id: 'satellites-do', title: 'What satellites do and don’t do', aliases: ['alarm', 'emergency', 'planning'] },
  { id: 'five-satellites', title: 'The 5 satellites', aliases: ['terra', 'aqua', 'suomi', 'snpp', 'noaa-20', 'noaa-21'] },
]

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  const d = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return d[b.length]
}

function score(q: string, names: string[]): number {
  const nq = norm(q)
  if (!nq) return 0
  let best = 0
  for (const n0 of names) {
    const n = norm(n0)
    if (n === nq) best = Math.max(best, 100)
    else if (n.startsWith(nq)) best = Math.max(best, 80)
    else if (n.includes(nq)) best = Math.max(best, 60)
    // word-level: every query word matches a name word by prefix or a small typo
    const qw = nq.split(' ')
    const nw = n.split(' ')
    let ok = 0
    for (const w of qw) {
      if (nw.some((x) => x.startsWith(w) || (w.length >= 4 && lev(w, x.slice(0, w.length + 1)) <= (w.length >= 7 ? 2 : 1)))) ok++
    }
    if (ok === qw.length) best = Math.max(best, 40 + Math.min(15, nq.length))
    else if (ok > 0) best = Math.max(best, 10 * ok)
  }
  return best
}

export function search(q: string, limit = 8): Hit[] {
  const hits: Hit[] = []
  for (const e of ENTRIES) {
    const s = score(q, [e.title, ...e.aliases])
    if (s >= 20) hits.push({ id: e.id, title: e.title, kind: 'entry', group: e.group, score: s + 2 })
  }
  for (const t of TERMS) {
    const s = score(q, [t.term, ...t.aliases])
    if (s >= 20) hits.push({ id: t.id, title: t.term, kind: 'term', group: 'Glossary', score: s })
  }
  for (const x of SECTIONS) {
    const s = score(q, [x.title, ...x.aliases])
    if (s >= 20) hits.push({ id: x.id, title: x.title, kind: 'section', group: 'Basics', score: s + 1 })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
