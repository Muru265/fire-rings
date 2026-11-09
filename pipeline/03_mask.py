"""03 — Quality filters and static-source masks (identical for MODIS and VIIRS).

Input  data/clean/{region}.parquet        (from 02_unify)
Output data/clean/{region}_filtered.parquet  rows kept for the cube
       data/clean/{region}_mask.parquet      masked H3 r9 cells with reason + diagnostics
       data/out/mask_{region}.json           rows per stream × filter step
       docs/mask_check.md                    top masked cells with map links (all regions)

Filter steps, in order (each applied to both sensors):
  1. conf      drop low confidence (MODIS 0–29, VIIRS 'l')
  2. type      drop FIRMS type 1/2/3 (volcano / other static land / offshore); archive only — NRT has no type
  3. known     drop rows in "known static" H3 r9 cells = any archive row with type 2 or 3 (pooled sensors),
               applied to ALL rows incl. NRT (Muru review item 1)
  4. persist   drop rows in persistent, non-seasonal H3 r9 cells: ≥16 detection-days in each of ≥3 years
               AND seasonality S = (max monthly share − 1/12)/(11/12) < 0.3, pooled across sensors,
               computed on rows surviving steps 1–2.
Usage: python pipeline/03_mask.py [region ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import ROOT, config, connect, path, read_json, sql_path, write_json  # noqa: E402

STEPS = ["in", "conf", "type", "known", "persist"]


def build_masks(con, min_days: int, min_years: int, max_s: float) -> None:
    """Expects table `u` (unified rows). Creates tables `known_cells` and `persist_cells`."""
    con.execute("""
        CREATE OR REPLACE TEMP TABLE known_cells AS
        SELECT h3r9, count(*) n_static_rows FROM u
        WHERE product='SP' AND type IN (2,3) GROUP BY 1""")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE cell_days AS
        SELECT DISTINCT h3r9, solar_date FROM u
        WHERE conf <> 'L' AND (type IS NULL OR type NOT IN (1,2,3))""")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE persist_cells AS
        WITH per_year AS (
            SELECT h3r9, year(solar_date) y, count(*) d FROM cell_days GROUP BY 1,2),
        yrs AS (
            SELECT h3r9, count(*) FILTER (WHERE d >= {min_days}) n_years_ge, sum(d) total_days,
                   count(*) n_years_any
            FROM per_year GROUP BY 1),
        months AS (
            SELECT h3r9, month(solar_date) m, count(*) d FROM cell_days GROUP BY 1,2),
        seas AS (
            SELECT h3r9, (max(d)::DOUBLE / sum(d) - 1.0/12) / (11.0/12) s FROM months GROUP BY 1)
        SELECT y.h3r9, y.n_years_ge, y.n_years_any, y.total_days, s.s
        FROM yrs y JOIN seas s USING (h3r9)
        WHERE y.n_years_ge >= {min_years} AND s.s < {max_s}""")


def apply_filters(con) -> dict:
    """Expects `u`, `known_cells`, `persist_cells`. Creates `kept`. Returns {stream: {step: rows_remaining}}."""
    con.execute("""
        CREATE OR REPLACE TEMP TABLE staged AS
        SELECT u.*,
          CASE WHEN conf = 'L' THEN 'conf'
               WHEN type IN (1,2,3) THEN 'type'
               WHEN k.h3r9 IS NOT NULL THEN 'known'
               WHEN p.h3r9 IS NOT NULL THEN 'persist'
               ELSE NULL END drop_step
        FROM u LEFT JOIN known_cells k USING (h3r9) LEFT JOIN persist_cells p USING (h3r9)""")
    con.execute("CREATE OR REPLACE TEMP TABLE kept AS SELECT * EXCLUDE (drop_step) FROM staged WHERE drop_step IS NULL")
    rows = con.execute("""
        SELECT stream, product, coalesce(drop_step, 'kept') s, count(*) FROM staged GROUP BY ALL""").fetchall()
    out: dict = {}
    for stream, product, step, n in rows:
        d = out.setdefault(f"{stream}/{product}", {s: 0 for s in STEPS + ["kept"]})
        d[step] += n
    # convert "dropped at step" → "remaining after step"
    res = {}
    for key, d in sorted(out.items()):
        total = sum(d[s] for s in STEPS[1:]) + d["kept"]
        rem, r = total, {"in": total}
        for s in STEPS[1:]:
            rem -= d[s]
            r[s] = rem
        res[key] = r
    return res


def top_cells(con, region: str, n: int) -> list[dict]:
    return [dict(zip(["region", "h3", "reason", "rows", "lat", "lon", "years_ge16", "total_days", "s"], r))
            for r in con.execute(f"""
        WITH m AS (
            SELECT h3r9, 'known' reason FROM known_cells
            UNION ALL SELECT h3r9, 'persist' FROM persist_cells WHERE h3r9 NOT IN (SELECT h3r9 FROM known_cells)),
        rows AS (SELECT h3r9, count(*) n FROM u WHERE conf <> 'L' GROUP BY 1)
        SELECT '{region}', h3_h3_to_string(m.h3r9), m.reason, r.n,
               round(h3_cell_to_lat(m.h3r9), 5), round(h3_cell_to_lng(m.h3r9), 5),
               p.n_years_ge, p.total_days, round(p.s, 3)
        FROM m JOIN rows r USING (h3r9) LEFT JOIN persist_cells p USING (h3r9)
        ORDER BY r.n DESC LIMIT {n}""").fetchall()]


def main(regions: list[str]) -> None:
    cfg = config()
    mc = cfg["mask"]
    clean, out = path("clean"), path("out")
    all_top = []
    for region in regions or list(cfg["regions"]):
        con = connect()
        con.execute(f"CREATE TEMP TABLE u AS SELECT * FROM '{sql_path(clean / (region + '.parquet'))}'")
        build_masks(con, mc["min_detection_days"], mc["min_years"], mc["max_seasonality"])
        counts = apply_filters(con)
        n_known, n_persist = (con.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
                              for t in ("known_cells", "persist_cells"))
        both = con.execute("SELECT count(*) FROM persist_cells WHERE h3r9 IN (SELECT h3r9 FROM known_cells)").fetchone()[0]
        con.execute(f"COPY (SELECT * FROM kept ORDER BY solar_date, stream) TO "
                    f"'{sql_path(clean / (region + '_filtered.parquet'))}' (FORMAT parquet, COMPRESSION zstd)")
        con.execute(f"""COPY (
            SELECT coalesce(k.h3r9, p.h3r9) h3r9,
                   CASE WHEN k.h3r9 IS NOT NULL AND p.h3r9 IS NOT NULL THEN 'known+persist'
                        WHEN k.h3r9 IS NOT NULL THEN 'known' ELSE 'persist' END reason,
                   k.n_static_rows, p.n_years_ge, p.total_days, p.s
            FROM known_cells k FULL JOIN persist_cells p USING (h3r9))
            TO '{sql_path(clean / (region + '_mask.parquet'))}' (FORMAT parquet)""")
        top = top_cells(con, region, 20)
        all_top += top
        summary = {"cells": {"known": n_known, "persist": n_persist, "persist_also_known": both},
                   "steps": counts}
        write_json(out / f"mask_{region}.json", summary)
        tot = {s: sum(v[s] for v in counts.values()) for s in STEPS}
        print(f"{region:<13} cells known={n_known:,} persist={n_persist:,} (overlap {both})  rows " +
              " → ".join(f"{s}:{tot[s]:,}" for s in STEPS), flush=True)
        con.close()
    write_mask_check(all_top)


def gmaps(lat: float, lon: float) -> str:
    return f"https://www.google.com/maps/@?api=1&map_action=map&center={lat},{lon}&zoom=17&basemap=satellite"


def write_mask_check(top: list[dict]) -> None:
    top20 = sorted(top, key=lambda r: -r["rows"])[:20]
    L = ["# Static-source mask check", "",
         "Generated by `python pipeline/03_mask.py`. Cells are H3 resolution 9 (~0.1 km²).",
         "`known` = FIRMS flagged type 2/3 in the archive at least once; `persist` = our persistence+seasonality rule",
         "(≥16 detection-days in each of ≥3 years and seasonality S < 0.3). Rows = detections (non-low confidence) in the cell.",
         "", "**Manual check:** open each link in satellite view. Expected: gas flares, steel/cement plants, brick kilns,",
         "refineries, volcanoes. Red flag: cropland or sugarcane (would mean we are masking real seasonal fire).", "",
         "## Top 20 masked cells (all regions, by detections removed)", "",
         "| # | region | reason | rows | years ≥16 d | total days | S | lat, lon | map |",
         "|---:|---|---|---:|---:|---:|---:|---|---|"]
    for i, r in enumerate(top20, 1):
        L.append(f"| {i} | {r['region']} | {r['reason']} | {r['rows']:,} | {r['years_ge16'] or '—'} | "
                 f"{r['total_days'] or '—'} | {r['s'] if r['s'] is not None else '—'} | {r['lat']}, {r['lon']} | "
                 f"[satellite]({gmaps(r['lat'], r['lon'])}) |")
    L += ["", "## Top 5 per region", ""]
    for region in dict.fromkeys(r["region"] for r in top):
        L += [f"### {region}", "", "| reason | rows | lat, lon | map |", "|---|---:|---|---|"]
        for r in [t for t in top if t["region"] == region][:5]:
            L.append(f"| {r['reason']} | {r['rows']:,} | {r['lat']}, {r['lon']} | [satellite]({gmaps(r['lat'], r['lon'])}) |")
        L.append("")
    (ROOT / "docs" / "mask_check.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
