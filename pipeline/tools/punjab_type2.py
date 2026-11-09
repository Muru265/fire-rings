"""Review item 2: does FIRMS type 2 ('other static land source') in Punjab peak in the Oct–Nov crop season?

Rule (from Muru): if Oct+Nov share of type-2 > 2 × Oct+Nov share of type-0 → keep type-2 rows for Punjab
(rely on our persistence+seasonality mask); otherwise drop type 1/2/3 as planned.
Writes data/out/punjab_type2.json and prints a markdown table.
"""
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "india"
BOX = (73.8, 27.6, 77.6, 32.6)


def main() -> dict:
    con = duckdb.connect()
    out = {}
    for sensor in ["modis", "snpp"]:
        src = f"read_csv('{(RAW / sensor).as_posix()}/fire_archive_*.csv', all_varchar=true)"
        rows = con.execute(f"""
            SELECT type, CAST(substr(acq_date,6,2) AS INT) m, count(*) n FROM {src}
            WHERE CAST(longitude AS DOUBLE) BETWEEN {BOX[0]} AND {BOX[2]}
              AND CAST(latitude AS DOUBLE) BETWEEN {BOX[1]} AND {BOX[3]}
              AND type IN ('0','2') GROUP BY 1,2 ORDER BY 1,2""").fetchall()
        by = {"0": [0] * 12, "2": [0] * 12}
        for t, m, n in rows:
            by[t][m - 1] = n
        tot0, tot2 = sum(by["0"]), sum(by["2"])
        on0 = (by["0"][9] + by["0"][10]) / tot0 if tot0 else 0
        on2 = (by["2"][9] + by["2"][10]) / tot2 if tot2 else 0
        out[sensor] = {"type0_by_month": by["0"], "type2_by_month": by["2"], "type0_total": tot0,
                       "type2_total": tot2, "octnov_share_type0": round(on0, 4),
                       "octnov_share_type2": round(on2, 4),
                       "ratio": round(on2 / on0, 3) if on0 else None}
    peak = all(v["ratio"] is not None and v["ratio"] > 2 for v in out.values())
    out["decision"] = "keep_type2_punjab" if peak else "drop_type123"
    (ROOT / "data" / "out").mkdir(parents=True, exist_ok=True)
    (ROOT / "data" / "out" / "punjab_type2.json").write_text(json.dumps(out, indent=1))
    for s in ["modis", "snpp"]:
        v = out[s]
        print(f"{s}: type0={v['type0_total']:,} type2={v['type2_total']:,} "
              f"Oct+Nov share type0={v['octnov_share_type0']:.3f} type2={v['octnov_share_type2']:.3f} ratio={v['ratio']}")
        print("  type2 by month:", v["type2_by_month"])
        print("  type0 by month:", v["type0_by_month"])
    print("DECISION:", out["decision"])
    return out


if __name__ == "__main__":
    main()
