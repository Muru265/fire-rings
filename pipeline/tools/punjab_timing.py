"""Punjab satellite-evasion check: has crop burning shifted to late afternoon, after the ~13:30 overpasses?

Idea: VIIRS (S-NPP, NOAA-20) cross the equator at ~13:30 local time on stable orbits. Aqua MODIS also crossed at ~13:30
but has drifted to a LATER afternoon overpass since Dec 2021 (Terra: earlier morning, drifting since 2020). If fires are
increasingly lit after ~15:00, a later-passing Aqua should catch relatively more of them than VIIRS, so Aqua÷VIIRS
(daytime) should rise sharply in Punjab's Oct–Nov burning season after 2021, but not in Punjab's Apr–May season nor in
other regions (Madagascar Sep–Oct, SE Australia Dec–Feb).

Metrics per region × season × year, daytime detections only (daynight = 'D'), cell-days = distinct (H3 r6, solar day):
  aqua_snpp   = Aqua ÷ S-NPP day cell-days        terra_snpp = Terra ÷ S-NPP day cell-days
  night_share = S-NPP night ÷ (day + night) cell-days
Each ratio is also expressed relative to its own 2013–2019 mean (pre-drift) so regions are comparable.
Writes data/out/punjab_timing.json and docs/punjab_timing.md. Does NOT change any harmonized value.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.common import ROOT, connect, path, sql_path, write_json  # noqa: E402

# Independent reports of the shift (QA #48). Only sources whose pages were checked on 2026-11-10 are listed.
SOURCES = [
    {"name": "NASA Earth Observatory — “New Timing for Stubble Burning in India” (H. Jethva, NASA Goddard)",
     "url": "https://science.nasa.gov/earth/earth-observatory/new-timing-for-stubble-burning-in-india/"},
    {"name": "ISRO Space Applications Centre study, Current Science (Nov 2025) — as reported by ThePrint",
     "url": "https://theprint.in/environment/are-farm-fires-going-uncounted-isro-study-suggests-farmers-have-figured-out-a-way-to-evade-satellites/2797583"},
    {"name": "iFOREST Stubble Burning Status Report 2025 (Dec 2025) — as reported by The Tribune",
     "url": "https://www.tribuneindia.com/news/delhi/satellites-miss-majority-of-stubble-fires-delhi-air-pollution-underestimated-report"},
]

SEASONS = {
    ("punjab", "Oct–Nov (rice residue)"): [10, 11],
    ("punjab", "Apr–May (wheat residue)"): [4, 5],
    ("madagascar", "Sep–Oct"): [9, 10],
    ("se_australia", "Oct–Dec"): [10, 11, 12],
}
YEARS = list(range(2012, 2027))


def main() -> None:
    con = connect()
    res: dict = {}
    for (region, label), months in SEASONS.items():
        src = sql_path(path("clean") / f"{region}_filtered.parquet")
        rows = con.execute(f"""
            SELECT year(solar_date) y, stream, daynight, count(DISTINCT (h3r6, solar_date)) n
            FROM '{src}' WHERE month(solar_date) IN ({','.join(map(str, months))}) AND year(solar_date) >= 2012
              AND stream IN ('TERRA','AQUA','SNPP','N20')
              AND solar_date <= DATE '2026-11-01'   -- S-NPP's last full day: every stream compared on the same days
            GROUP BY ALL""").fetchall()
        t = {(y, s, d): n for y, s, d, n in rows}
        series = []
        for y in YEARS:
            sd, sn = t.get((y, "SNPP", "D"), 0), t.get((y, "SNPP", "N"), 0)
            ad, td, nd = t.get((y, "AQUA", "D"), 0), t.get((y, "TERRA", "D"), 0), t.get((y, "N20", "D"), 0)
            if sd < 30:   # too little to form a ratio
                series.append({"y": y, "snpp_day": sd, "aqua_snpp": None, "terra_snpp": None, "night_share": None, "aqua_n20": None})
                continue
            series.append({"y": y, "snpp_day": sd, "aqua_snpp": round(ad / sd, 4), "terra_snpp": round(td / sd, 4),
                           "night_share": round(sn / (sd + sn), 4) if sd + sn else None,
                           "aqua_n20": round(ad / nd, 4) if nd >= 30 else None})
        base = {k: np.mean([s[k] for s in series if 2013 <= s["y"] <= 2019 and s[k] is not None]) for k in ("aqua_snpp", "terra_snpp", "night_share")}
        # NOAA-20 starts Apr 2018: its baseline is 2018–2019 (pre-drift)
        base["aqua_n20"] = np.mean([s["aqua_n20"] for s in series if 2018 <= s["y"] <= 2019 and s["aqua_n20"] is not None] or [np.nan])
        for s in series:
            for k in ("aqua_snpp", "terra_snpp", "night_share", "aqua_n20"):
                s[f"{k}_rel"] = None if s[k] is None or not base[k] else round(s[k] / base[k], 3)

        def mean_rel(k, y0, y1):
            v = [s[f"{k}_rel"] for s in series if y0 <= s["y"] <= y1 and s[f"{k}_rel"] is not None]
            return round(float(np.mean(v)), 3) if v else None

        res[f"{region}|{label}"] = {"region": region, "season": label, "months": months, "series": series,
                                    "base_2013_2019": {k: round(float(v), 4) for k, v in base.items()},
                                    "aqua_rel_2022_2026": mean_rel("aqua_snpp", 2022, 2026),
                                    "terra_rel_2022_2026": mean_rel("terra_snpp", 2022, 2026),
                                    "night_rel_2022_2026": mean_rel("night_share", 2022, 2026),
                                    "aqua_n20_rel_2022_2026": mean_rel("aqua_n20", 2022, 2026),
                                    "aqua_rel_2022_2025": mean_rel("aqua_snpp", 2022, 2025)}
    res["_sources"] = SOURCES
    write_json(path("out") / "punjab_timing.json", res)
    write_md(res)
    for k, v in res.items():
        if k.startswith("_"):
            continue
        print(f"{k:<40} Aqua/S-NPP 2022–26 vs 2013–19: ×{v['aqua_rel_2022_2026']}  Terra: ×{v['terra_rel_2022_2026']}  night share: ×{v['night_rel_2022_2026']}")


def write_md(res: dict) -> None:
    L = ["# Punjab detection-time check (satellite evasion)", "",
         "Generated by `python pipeline/tools/punjab_timing.py`. Daytime cell-days (H3 r6 × solar day) after all filters.",
         "Aqua's afternoon overpass has drifted later since Dec 2021; VIIRS S-NPP stayed at ~13:30. Terra (morning) drifted from 2020.",
         "Ratios relative to their own 2013–2019 mean (1.00 = unchanged).", "",
         "## Summary: mean of 2022–2026 relative to 2013–2019", "",
         "| region · season | Aqua ÷ S-NPP (day) | same, 2022–2025 only | Aqua ÷ NOAA-20 (day, vs 2018–19) | Terra ÷ S-NPP (day) | S-NPP night share |",
         "|---|---:|---:|---:|---:|---:|"]
    for v in [x for k, x in res.items() if not k.startswith("_")]:
        L.append(f"| {v['region']} · {v['season']} | ×{v['aqua_rel_2022_2026']} | ×{v['aqua_rel_2022_2025']} | ×{v['aqua_n20_rel_2022_2026']} | "
                 f"×{v['terra_rel_2022_2026']} | ×{v['night_rel_2022_2026']} |")
    for v in [x for k, x in res.items() if not k.startswith("_")]:
        L += ["", f"## {v['region']} · {v['season']}", "",
              "| year | S-NPP day cell-days | Aqua÷S-NPP | rel | Aqua÷NOAA-20 | rel | Terra÷S-NPP | rel | night share | rel |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
        for s in v["series"]:
            f = lambda x: "—" if x is None else f"{x:.3f}"  # noqa: E731
            L.append(f"| {s['y']} | {s['snpp_day']:,} | {f(s['aqua_snpp'])} | {f(s['aqua_snpp_rel'])} | {f(s['aqua_n20'])} | {f(s.get('aqua_n20_rel'))} | "
                     f"{f(s['terra_snpp'])} | {f(s['terra_snpp_rel'])} | {f(s['night_share'])} | {f(s['night_share_rel'])} |")
    p = res["punjab|Oct–Nov (rice residue)"]
    q = res["punjab|Apr–May (wheat residue)"]
    m = res["madagascar|Sep–Oct"]
    a = res["se_australia|Oct–Dec"]
    yr = {s["y"]: s for s in p["series"]}
    L += ["", "## Conclusion", "",
          f"**The data support a shift of Punjab's Oct–Nov burning to late afternoon.** Relative to 2013–2019, the daytime "
          f"Aqua÷S-NPP ratio in Punjab Oct–Nov rose year by year: 2022 ×{yr[2022]['aqua_snpp_rel']}, 2023 ×{yr[2023]['aqua_snpp_rel']}, "
          f"2024 ×{yr[2024]['aqua_snpp_rel']}, 2025 ×{yr[2025]['aqua_snpp_rel']}, 2026 ×{yr[2026]['aqua_snpp_rel']}. "
          f"Against NOAA-20 (independent VIIRS at the same ~13:30 time) the rise is the same (2025 ×{yr[2025]['aqua_n20_rel']}, 2026 ×{yr[2026]['aqua_n20_rel']}). "
          f"Over the same years the ratio stays flat or falls elsewhere: Punjab Apr–May ×{q['aqua_rel_2022_2026']}, Madagascar ×{m['aqua_rel_2022_2026']}, "
          f"SE Australia ×{a['aqua_rel_2022_2026']}. Aqua's overpass has drifted later since Dec 2021, so the signal says that more of Punjab's "
          f"autumn fires are now burning after the VIIRS overpass but before Aqua's later one. Consistent with this, morning Terra sees far fewer "
          f"(×{p['terra_rel_2022_2026']}) and the share of VIIRS night detections (~01:30) rose ×{p['night_rel_2022_2026']}.", "",
          "A change in fire *size* would push the ratio the other way (coarser MODIS misses small fires), so it does not explain the rise.", "",
          f"**Caveats.** The 2025 and 2026 ratios rest on few fires (S-NPP day cell-days {yr[2025]['snpp_day']:,} and {yr[2026]['snpp_day']:,}); "
          "2026 is near-real-time and compared only up to S-NPP's last day (1 Nov). We cannot measure how much burning happens between overpasses, "
          "so we do not correct the numbers.", "",
          "**What Fire Rings does.** Harmonized values are unchanged (documented limitation, not a correction). Punjab Oct–Nov months from 2022 "
          "carry the caveat: *“Detected at satellite overpass times; burning has reportedly shifted to late afternoon, so recent seasons may be "
          "undercounted.”* This shows on headlines, the month drawer, the Proof page and in the AI tools.", "",
          "## Independent reports of the shift (sources checked 2026-11-10)", ""] + [f"- [{s['name']}]({s['url']})" for s in SOURCES] + [""]
    (ROOT / "docs" / "punjab_timing.md").write_text("\n".join(L), encoding="utf-8")


if __name__ == "__main__":
    main()
