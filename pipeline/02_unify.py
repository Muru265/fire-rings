"""02 — Unify raw FIRMS CSVs into one schema per region.

raw CSV (archive + NRT, 4 sensors) → clip to region box → unified columns → dedupe → data/clean/{region}.parquet

Unified columns:
  lat, lon (DOUBLE) · t_utc (TIMESTAMP) · solar_date (DATE = UTC + lon/15 h) · stream (TERRA|AQUA|SNPP|N20|N21)
  conf (L|N|H) · frp (DOUBLE) · daynight (D|N) · type (TINYINT, NULL for NRT) · product (SP|NRT)
  region · h3r9, h3r6 (UBIGINT)

No quality filters are applied here (that is 03_mask.py); this step only standardises, clips and dedupes.
Fails loudly on unknown satellite codes or confidence values.
Usage: python pipeline/02_unify.py [region ...]
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.common import ROOT, api_files, config, connect, path, sql_path, write_json  # noqa: E402

STREAMS = {"Terra": "TERRA", "Aqua": "AQUA", "SNPP": "SNPP", "N20": "N20", "N21": "N21"}


class UnifyError(RuntimeError):
    pass


def source_files(raw: Path, source: str) -> list[tuple[Path, str, str]]:
    """[(csv_path, sensor_folder, product)] for one source folder."""
    out = []
    for sensor in config()["sensors"]:
        for prod, pattern in (("SP", "fire_archive_*.csv"), ("NRT", "fire_nrt_*.csv")):
            files = sorted((raw / source / sensor).glob(pattern))
            if len(files) > 1:
                raise UnifyError(f"expected one {pattern} in {raw / source / sensor}, found {len(files)}")
            out += [(f, sensor, prod) for f in files]
    if not out:
        raise UnifyError(f"no raw CSVs found for source '{source}' in {raw}")
    return out


def raw_union_sql(files: list[tuple[Path, str, str]]) -> str:
    parts = []
    for f, sensor, prod in files:
        header = f.open(encoding="utf-8").readline().strip().split(",")
        type_col = "type" if "type" in header else "NULL::VARCHAR"
        parts.append(
            f"SELECT latitude, longitude, acq_date, acq_time, satellite, confidence, frp, daynight, "
            f"{type_col} AS type, '{sensor}' AS sensor, '{prod}' AS product "
            f"FROM read_csv('{sql_path(f)}', all_varchar=true, header=true)"
        )
    return "\nUNION ALL\n".join(parts)


def unify(con, files: list[tuple[Path, str, str]], region: str, bbox: list[float] | None,
          sensor_streams: dict[str, list[str]]) -> dict:
    """Build table `unified` in `con`. Returns step counts. Raises UnifyError on bad codes."""
    con.execute(f"CREATE OR REPLACE TEMP TABLE raw AS {raw_union_sql(files)}")
    counts: dict = {"read": dict(con.execute(
        "SELECT sensor||'/'||product, count(*) FROM raw GROUP BY 1 ORDER BY 1").fetchall())}

    # --- loud checks on codes -------------------------------------------------------------
    bad_sat = con.execute(
        f"SELECT DISTINCT satellite FROM raw WHERE satellite NOT IN ({','.join(repr(s) for s in STREAMS)}) "
        f"OR satellite IS NULL").fetchall()
    if bad_sat:
        raise UnifyError(f"unknown satellite codes in {region}: {[b[0] for b in bad_sat]}")
    for sensor, allowed in sensor_streams.items():
        wrong = con.execute(
            f"SELECT DISTINCT satellite FROM raw WHERE sensor='{sensor}' "
            f"AND satellite NOT IN ({','.join(repr(a) for a in allowed)})").fetchall()
        if wrong:
            raise UnifyError(f"{region}/{sensor} contains unexpected satellites {[w[0] for w in wrong]}")
    bad_conf = con.execute("""
        SELECT DISTINCT satellite, confidence FROM raw
        WHERE (satellite IN ('Terra','Aqua') AND (TRY_CAST(confidence AS INT) IS NULL
                OR TRY_CAST(confidence AS INT) NOT BETWEEN 0 AND 100))
           OR (satellite NOT IN ('Terra','Aqua') AND lower(confidence) NOT IN ('l','n','h'))
        LIMIT 10""").fetchall()
    if bad_conf:
        raise UnifyError(f"unknown confidence values in {region}: {bad_conf}")

    lo, hi = config()["filters"]["modis_conf_bins"]
    clip = ""
    if bbox:
        w, s, e, n = bbox
        clip = f"WHERE lon BETWEEN {w} AND {e} AND lat BETWEEN {s} AND {n}"
    stream_case = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in STREAMS.items())
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE typed AS
        SELECT * FROM (
          SELECT CAST(latitude AS DOUBLE) lat, CAST(longitude AS DOUBLE) lon,
                 strptime(acq_date || ' ' || lpad(acq_time, 4, '0'), '%Y-%m-%d %H%M') t_utc,
                 CASE satellite {stream_case} END stream,
                 CASE WHEN satellite IN ('Terra','Aqua') THEN
                        CASE WHEN CAST(confidence AS INT) < {lo} THEN 'L'
                             WHEN CAST(confidence AS INT) < {hi} THEN 'N' ELSE 'H' END
                      ELSE upper(confidence) END conf,
                 TRY_CAST(frp AS DOUBLE) frp, daynight,
                 TRY_CAST(type AS TINYINT) type,
                 CASE WHEN product = 'API' THEN 'NRT' ELSE product END product, product = 'API' AS is_api, sensor
          FROM raw) {clip}""")
    counts["in_box"] = con.execute("SELECT count(*) FROM typed").fetchone()[0]

    # FIRMS API rows come from a plain bounding box, while the archive download is clipped to the country.
    # Keep API rows only inside the region's historical footprint (H3 res-7 cells with detections in the downloaded
    # files), so e.g. Pakistani Punjab inside the Punjab box is not added to an India-only record.
    n_api = con.execute("SELECT count(*) FROM typed WHERE is_api").fetchone()[0]
    if n_api:
        con.execute("""
            CREATE OR REPLACE TEMP TABLE typed AS
            WITH fp AS (SELECT DISTINCT h3_latlng_to_cell(lat, lon, 7) c FROM typed WHERE NOT is_api)
            SELECT t.* FROM typed t
            WHERE NOT t.is_api OR h3_latlng_to_cell(t.lat, t.lon, 7) IN (SELECT c FROM fp)""")
        kept = con.execute("SELECT count(*) FROM typed WHERE is_api").fetchone()[0]
        counts["api_rows"] = n_api
        counts["api_outside_footprint_dropped"] = n_api - kept

    # --- dedupe: (1) NRT rows on dates the archive already covers for that stream; (2) exact duplicates
    con.execute("""
        CREATE OR REPLACE TEMP TABLE sp_end AS
        SELECT stream, max(CAST(t_utc AS DATE)) d FROM typed WHERE product='SP' GROUP BY 1""")
    counts["nrt_overlap_dropped"] = con.execute("""
        SELECT count(*) FROM typed t JOIN sp_end s USING (stream)
        WHERE t.product='NRT' AND CAST(t.t_utc AS DATE) <= s.d""").fetchone()[0]
    con.execute("""
        CREATE OR REPLACE TEMP TABLE nodup AS
        SELECT t.* FROM typed t LEFT JOIN sp_end s USING (stream)
        WHERE NOT (t.product='NRT' AND s.d IS NOT NULL AND CAST(t.t_utc AS DATE) <= s.d)""")
    before = con.execute("SELECT count(*) FROM nodup").fetchone()[0]
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE unified AS
        SELECT lat, lon, t_utc,
               CAST(t_utc + to_microseconds(CAST(round(lon / 15.0 * 3600e6) AS BIGINT)) AS DATE) solar_date,
               stream, conf, frp, daynight, type, product, '{region}' AS region, is_api,
               h3_latlng_to_cell(lat, lon, 9) h3r9, h3_latlng_to_cell(lat, lon, 6) h3r6
        FROM nodup
        QUALIFY row_number() OVER (PARTITION BY stream, lat, lon, t_utc ORDER BY product) = 1""")
    counts["exact_dup_dropped"] = before - con.execute("SELECT count(*) FROM unified").fetchone()[0]
    counts["out"] = dict(con.execute(
        "SELECT stream||'/'||product, count(*) FROM unified GROUP BY 1 ORDER BY 1").fetchall())
    counts["out_total"] = sum(counts["out"].values())
    counts["date_range"] = [str(x) for x in con.execute(
        "SELECT min(solar_date), max(solar_date) FROM unified").fetchone()]
    return counts


def sensor_stream_map() -> dict[str, list[str]]:
    return {s: list(v["satellites"]) for s, v in config()["sensors"].items()}


def main(regions: list[str]) -> None:
    cfg = config()
    raw, clean, out = path("raw"), path("clean"), path("out")
    for region in regions or list(cfg["regions"]):
        rc = cfg["regions"][region]
        t0 = time.time()
        con = connect()
        files = source_files(raw, rc["source"]) + api_files(region)
        counts = unify(con, files, region, rc.get("bbox"), sensor_stream_map())
        counts["api_files"] = [str(f[0].relative_to(ROOT)) for f in api_files(region)]
        dest = clean / f"{region}.parquet"
        con.execute(f"COPY (SELECT * FROM unified ORDER BY solar_date, stream) TO '{sql_path(dest)}' "
                    f"(FORMAT parquet, COMPRESSION zstd)")
        counts["seconds"] = round(time.time() - t0, 1)
        write_json(out / f"unify_{region}.json", counts)
        print(f"{region:<13} in_box={counts['in_box']:>10,}  nrt_overlap={counts['nrt_overlap_dropped']:,}  "
              f"exact_dups={counts['exact_dup_dropped']:,}  out={counts['out_total']:>10,}  "
              f"{counts['date_range'][0]}→{counts['date_range'][1]}  ({counts['seconds']}s)", flush=True)
        con.close()


if __name__ == "__main__":
    main(sys.argv[1:])
