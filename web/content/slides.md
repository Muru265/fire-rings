# Fire Rings

**25 years of fire. One honest record.**

NASA MODIS + VIIRS hotspots harmonized into one monthly fire record — with proof, an open API and apps on top.

Murugun Sharma Roma Rishi (Muru) · NASA Space Apps 2026 · Port Louis

**fire-rings.vercel.app** · **fire-rings-apps.vercel.app**

::figure qr

Note: Hi, I'm Muru. Fire Rings answers one question for anyone who plans for fire: is this month normal? To answer it honestly you need twenty-five years of data on one ruler — and NASA's two generations of fire satellites don't share a ruler. Fire Rings fixes that, proves it, and opens it up.

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
- The unit that makes old and new comparable: **fire-days** on ~36 km² hexagons, shown as **Fire Rings**.

::figure timing

Note: The creative part is what the harmonized record let us see. Aqua drifted to a later overpass, and only in Punjab's rice-residue season did it start seeing far more fire than VIIRS. That matches three independent reports that farmers now burn after the satellites pass. So part of the recent drop is a timing effect, and we flag it on every affected month rather than hide it.

---

# Validity

- Ratios fitted on **Jul 2012 – Dec 2019 only**; VIIRS scaled **down**, never MODIS up. Out-of-sample annual error: **{{punjab.v1}}%** Punjab · **{{madagascar.v1}}%** Madagascar · **{{se_australia.v1}}%** SE Australia.

| 2012 step | Raw | Harmonized | MODIS alone |
|---|---|---|---|
| Punjab | {{punjab.step_raw}}% | {{punjab.step_harm}}% | {{punjab.step_modis}}% |
| Madagascar | {{madagascar.step_raw}}% | {{madagascar.step_harm}}% | {{madagascar.step_modis}}% |
| SE Australia | {{se_australia.step_raw}}% | {{se_australia.step_harm}}% | {{se_australia.step_modis}}% |

- Black Summer 2019–20 ranks **#{{bs.rank}} of {{bs.n}}** seasons (Royal Commission-documented).
?reunion - Piton de la Fournaise vs the Smithsonian eruption list: MODIS **{{reunion.modis_detected}}/{{reunion.modis_n}}** · VIIRS **{{reunion.viirs_detected}}/{{reunion.viirs_n}}** eruptions seen.

::figure volcano

Note: Is it right? Every year from 2012 to 2019 is held out and predicted: single-digit errors. The 2012 step drops to what MODIS alone shows. The documented Black Summer comes out number {{bs.rank}}. And against an independent ground truth, the volcano on Réunion, MODIS saw {{reunion.modis_detected}} of {{reunion.modis_n}} eruptions and VIIRS {{reunion.viirs_detected}} of {{reunion.viirs_n}}.

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

Note: Relevance, line by line against the challenge text. A web application: yes. A harmonized burning-activity calendar: the rings and calendar. Early warning: Fire Watch, where fixed rules decide and the AI only explains. Plain language for responders, scientists and land managers. History, unusual conditions and critical periods. And any area you draw on the map.

---

# Results — open data in use

- {{n_regions}} regions · {{region_months}} region-months · {{rows_read}} detections read → {{rows_kept}} kept.
- Hotspot API vs the record: **{{parity.diff}}%** apart (Punjab, Oct 2016).
- Projection from the month so far beats “typical” in **{{proj.wins}} of {{proj.cells}}** tested checkpoints.
- Open API + six apps on a separate site that only calls it.

::figure img /slides/control-room.png

Note: Results. Four regions, every month since 2001, millions of detections filtered the same way. The live hotspot API agrees with the record to {{parity.diff}} percent. The projection tool is tested, and beats a typical month in {{proj.wins}} of {{proj.cells}} checkpoints. And six apps on a separate site use only the open API — live in the control room.

---

# Vision — and try it

- **Next (not built yet):** automatic runs every 3 h · worldwide, config-driven, each country validated before it goes public · opt-in alerts.
- Planning tool, not an emergency service. No forecasts beyond the tested projection.
- **fire-rings.vercel.app** · **fire-rings-apps.vercel.app**

::figure qr

Note: Next: automate the runs every three hours, go worldwide country by country, each one validated before it goes public, and add opt-in alerts from Fire Watch's rules. It stays a planning tool, never an emergency service. Scan the code and try any month in any region. Thank you.
