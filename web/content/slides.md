# Fire Rings

**25 years of fire. One honest record.**

Harmonizing NASA MODIS and VIIRS hotspots into one monthly record — with proof, an open API and apps on top.

Muru · NASA Space Apps 2026 · Port Louis

::figure rings se_australia

Note: Hi, I'm Muru. Fire Rings answers one question for anyone who plans for fire: is this month normal? To answer it honestly you need 25 years of data on one ruler — and the two NASA satellite generations don't share a ruler.

---

# Impact

- Planners ask **“is this month normal?”** — that needs a long, consistent baseline.
- A naive MODIS → VIIRS record jumps **{{punjab.step_raw}}%** in 2012 in Punjab — the sensor, not the fire.
- Same alert rules on raw data: **{{watch.raw_alerts}}** alerts {{watch.period}}, **{{watch.raw_only}}** caused only by the satellite switch. Harmonized: **{{watch.harm_alerts}}**.

::figure watchproof

Note: The impact is avoiding false alarms and missed drops. Here the same rules on raw data give {{watch.raw_alerts}} alerts, {{watch.raw_only}} of them caused only by the switch, and they hide real low months.

---

# Creativity

- **Fire-days** on ~36 km² hexagons: count presence, not pixels — old and new sensors become comparable.
- **Fire Rings**: a radial calendar — every month since 2001 at a glance.
- **Fire Watch**: rules decide, AI explains — every number in a briefing is checked against the data.
- **Open API + six apps** built by calling it only, live in a control room.

::figure rings punjab

Note: The creative bit is the unit — presence on a hexagon per day — and then making the record usable: rings, a monitoring agent, an analyst that cannot invent numbers, and outside apps.

---

# Validity

- Ratios fitted on **Jul 2012 – Dec 2019 only** (MODIS orbits drift after 2020); VIIRS scaled **down**, never MODIS up.
- Out-of-sample annual error: **{{punjab.v1}}%** Punjab · **{{madagascar.v1}}%** Madagascar · **{{se_australia.v1}}%** SE Australia.
- 2012 step: raw **{{punjab.step_raw}}%** → harmonized **{{punjab.step_harm}}%** (MODIS alone {{punjab.step_modis}}%).
- Black Summer 2019–20 ranks **#{{bs.rank}} of {{bs.n}}** seasons (Royal Commission-documented).
?reunion - Piton de la Fournaise: MODIS saw **{{reunion.modis_detected}}/{{reunion.modis_n}}**, VIIRS **{{reunion.viirs_detected}}/{{reunion.viirs_n}}** Smithsonian-listed eruptions.

::figure annual punjab

Note: Validity: every year 2012–2019 is held out and predicted. Errors are single-digit percent. The 2012 jump disappears. Mauritius has too little fire to validate and the app says so.

---

# Relevance

- **Land managers & firefighters** — what to expect this month, tested against 20 years.
- **Air-quality & health** — Punjab's Oct–Nov burning season vs the past 25.
- **Insurers** — an index that doesn't pay out for a satellite switch.
- **Journalists & scientists** — fact-check “worst season ever” in one click.
- **Banks & supply chains** — fire history of any box.

Note: Relevance: each audience gets the same record through a tool for their decision. All six apps are real and live.

---

# Results

- {{n_regions}} regions · {{region_months}} region-months · data through {{data_end}}.
- {{rows_read}} detections read → {{rows_kept}} kept after identical filters.
- Hotspot downloads for any ≤31 days: API vs record **{{parity.diff}}%** apart.
- Projection from the month so far beats “typical” in **{{proj.wins}} of {{proj.cells}}** tested checkpoints.

::figure seasonality punjab

Note: Results in numbers — all live from the published JSON, the same files anyone can download.

---

# Vision

- **Automation** — scheduled pipeline runs so the record and Fire Watch update themselves.
- **Worldwide** — the pipeline is configuration-driven; add regions without code.
- **Alerts** — opt-in notifications from Fire Watch's fixed rules.
- Keep it honest: planning tool, not an emergency service; no forecasts beyond the tested projection.

Note: Next: automate the runs, go worldwide region by region, and add opt-in alerts — keeping the same honesty rules.

---

# Try it

- **fire-rings.vercel.app** — explore, proof, data, Fire Watch, Ask
- **fire-rings-apps.vercel.app** — six apps on the open API
- Paper, slides and code: links on the home page

::figure qr

Note: Scan the code and try any month in any region. Thank you.
