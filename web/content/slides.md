# Fire Rings

**25 years of fire. One honest record.**

NASA MODIS + VIIRS hotspots harmonized into one monthly fire record — with proof, an open API and apps on top.

NASA data used: FIRMS MODIS C6.1 · VIIRS 375 m S-NPP / NOAA-20 / NOAA-21 · NASA POWER · NASA GIBS / Worldview · **{{n_regions}} validated regions**

Murugun Sharma Roma Rishi (Muru) · NASA Space Apps 2026 · Port Louis

**fire-rings.vercel.app** · **fire-rings-apps.vercel.app**

::figure qr

Note: Hi, I'm Muru. Fire Rings answers one question for anyone who plans for fire: is this month normal? To answer it honestly you need twenty-five years of data on one ruler — and NASA's two generations of fire satellites don't share a ruler. Fire Rings fixes that, proves it, and opens it up — built entirely on NASA data: FIRMS MODIS and VIIRS fire detections, NASA POWER weather and NASA GIBS imagery, across {{n_regions}} validated regions.

---

# Impact — the problem

- Joining MODIS and VIIRS naively, Punjab's fire record jumps **{{punjab.step_raw}}%** in 2012. Harmonized: **{{punjab.step_harm}}%**. The jump was the satellite, not the fire.
- Same alert rules on raw data: **{{watch.raw_alerts}}** alerts {{watch.period}}, **{{watch.raw_only}}** caused only by the satellite switch.
- An insurance index on raw data (Punjab, {{ins.p}}th percentile, from the open API): **{{ins.raw_only}}** raw-only payouts after 2012.

::figure beforeafter punjab

Note: Here is the problem. The pink raw line jumps in 2012 when the new satellite arrives. Fires didn't triple; the camera changed. On raw data the same alert rules fire {{watch.raw_alerts}} times, {{watch.raw_only}} of them only because of the switch, and an insurance index would pay out {{ins.raw_only}} times for nothing. Harmonized, the step is {{punjab.step_harm}}%.

---

# Creativity — the discovery

- Aqua's orbit drifted to a later afternoon pass. Since then it sees **×{{timing.aqua_rel}}** as much Punjab Oct–Nov fire relative to VIIRS as in 2013–19 — and only there.
- This supports independent reports that burning moved to late afternoon: {{timing.sources}}.
- So part of Punjab's recent drop is fires lit after the satellites pass.
- Tanzania: a 2015 study reported declining fire in its miombo woodlands. Our whole-country record: **{{tz.harm}}** ({{tz.years}}), MODIS alone **{{tz.modis}}**; a raw join would show **{{tz.raw}}** at 2012.
- The unit that makes old and new comparable: **fire-days** on ~36 km² hexagons, shown as **Fire Rings**.

::figure timing

Note: The creative part is what the harmonized record let us see. Aqua drifted to a later overpass, and only in Punjab's rice-residue season did it start seeing far more fire than VIIRS. That matches three independent reports that farmers now burn after the satellites pass. So part of the recent drop is a timing effect, and we flag it on every affected month rather than hide it. And a check against published science: a 2015 study found declining fire in Tanzania's miombo woodlands; our harmonized whole-country record shows {{tz.harm}}, close to MODIS alone at {{tz.modis}}, while a naive raw join would invent a {{tz.raw}} jump. Different areas, so a consistency check, not a replication.

---

# Validity

- Ratios fitted on **Jul 2012 – Dec 2019 only**; VIIRS scaled **down**, never MODIS up. Out-of-sample annual error: **{{punjab.v1}}%** Punjab · **{{madagascar.v1}}%** Madagascar · **{{se_australia.v1}}%** SE Australia.

| 2012 step | Raw | Harmonized | MODIS alone |
|---|---|---|---|
| Punjab | {{punjab.step_raw}}% | {{punjab.step_harm}}% | {{punjab.step_modis}}% |
| Madagascar | {{madagascar.step_raw}}% | {{madagascar.step_harm}}% | {{madagascar.step_modis}}% |
| SE Australia | {{se_australia.step_raw}}% | {{se_australia.step_harm}}% | {{se_australia.step_modis}}% |

- Black Summer 2019–20 ranks **#{{bs.rank}} of {{bs.n}}** seasons (Royal Commission-documented).
- New regions pass the same gate: N. Australia savanna **{{nt_savanna.v1}}%** · NE India **{{ne_india.v1}}%** · Tanzania **{{tanzania.v1}}%** error. Sudan failed the jump test — not shown.
?reunion - Piton de la Fournaise vs the Smithsonian eruption list: MODIS **{{reunion.modis_detected}}/{{reunion.modis_n}}** · VIIRS **{{reunion.viirs_detected}}/{{reunion.viirs_n}}** eruptions seen.

::figure volcano

Note: Is it right? Every year from 2012 to 2019 is held out and predicted: single-digit errors. The 2012 step drops to what MODIS alone shows. The documented Black Summer comes out number {{bs.rank}}. Three new regions from NASA's world archive passed the same tests; Sudan did not, so it is not shown. And against an independent ground truth, the volcano on Réunion, MODIS saw {{reunion.modis_detected}} of {{reunion.modis_n}} eruptions and VIIRS {{reunion.viirs_detected}} of {{reunion.viirs_n}}.

---

# Relevance — the challenge, line by line

| The challenge asks for… | Fire Rings |
|---|---|
| “a web application” | **fire-rings.vercel.app** |
| “harmonizes the records into a burning activity calendar” | Fire Rings + Calendar (Long-term) |
| “early warning” | Fire Watch — rules decide, AI explains |
| “responders, scientists, land managers” | plain-language Guide + Ask, Responder / Scientist styles |
| “historical patterns, unusual conditions, critical periods” | seasonality, “Is this normal?” gauge, “What to expect” |
| “within a selected area of interest” | draw a box on the map (+ date range) |

**Built for:**
- **Fire service** — watch the top 10% of hexagons → **{{model.cap10}}%** of the following month’s fire hexagons.
- **Air-quality officer** — Punjab Oct–Nov carries the satellite-timing caveat (×{{timing.aqua_rel}}).
- **Insurer** — raw data alone would trigger **{{ins.raw_only}}** payouts from the satellite switch.

Note: Relevance, line by line against the challenge text. A web application: yes. A harmonized burning-activity calendar: the rings and calendar. Early warning: Fire Watch, where fixed rules decide and the AI only explains. Plain language for responders, scientists and land managers. History, unusual conditions and critical periods. And any area you draw on the map. Who it is built for: a fire service planning next month, which would have caught {{model.cap10}} percent of the following month's fire hexagons by watching the top ten percent; an air-quality officer, who sees Punjab's timing caveat; and an insurer, who sees that raw data would have paid out {{ins.raw_only}} times for the satellite switch alone.

---

# Results — open data in use

- {{n_regions}} regions · {{region_months}} region-months · {{rows_read}} detections read → {{rows_kept}} kept.
- Hotspot API vs the record: **{{parity.diff}}%** apart (Punjab, Oct 2016).
- Fire-likelihood model, tested on unseen years 2018–2025: top 10% of hexagons caught **{{model.cap10}}%** of the following month’s fire hexagons vs **{{model.clim_cap10}}%** for the usual season · PR-AUC **{{model.pr_auc}}** vs {{model.clim_pr_auc}} · harmonized vs raw history: **{{model.abl_pr}}** PR-AUC.
- Retrains itself monthly, published only if it beats the current model — next to the open API, six apps and the control room.

::figure img /slides/control-room.png

Note: Results. {{n_regions}} regions, every month since 2001, millions of detections filtered the same way. The live hotspot API agrees with the record to {{parity.diff}} percent. New this round: a fire-likelihood model, which scores the month after the last complete month of data. Tested on years it never saw, watching its top ten percent of hexagons would have caught {{model.cap10}} percent of the following month's fire hexagons, against {{model.clim_cap10}} percent using the usual season. Fed raw instead of harmonized history, its PR-AUC changes by {{model.abl_pr}}. It retrains itself every month and a new version goes live only if it beats the current one. Six apps on a separate site use only the open API — live in the control room.

---

# Vision — and try it

- The complete NASA FIRMS world archive (2000–2026, 4 satellites) is **already downloaded**.
- **Next:** harmonize and validate every country; train the model on the whole record so every country gets its own tested predictions through the open API — updated every 3 h on Oracle, retrained monthly, published only if it beats the current model.
- Planning tool, not an emergency service: “where fire is more likely”, never individual fires.
- **fire-rings.vercel.app** · **fire-rings-apps.vercel.app**

::figure qr

Note: The complete NASA FIRMS world archive, 2000 to 2026, four satellites, is already on disk — that's where today's three new regions came from. Next: harmonize and validate every country, train the model on the whole record so every country gets its own tested predictions through the open API, updated every three hours on Oracle and retrained monthly, going live only when it beats the current model. It stays a planning tool, never an emergency service. Scan the code and try any month in any region. Thank you.
