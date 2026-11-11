"""Piton de la Fournaise (Réunion) ground-truth check (P1.7d) → web/public/data/v1/api/reunion.json + docs/reunion_check.md.

Inputs: FIRMS SP CSV chunks in data/raw/reunion/ (tools/fetch_reunion.py) and the Smithsonian Global Volcanism Program
(GVP) Holocene eruption list for volcano 233020 (data/raw/gvp_233020_eruptions.json, from the GVP WFS service).
Method:
  • detections: all FIRMS SP rows in the box, low confidence dropped (same rule as the record); FIRMS `type` kept
    (1 = presumed volcano). Day = solar date (UTC + lon/15 h), as in the record.
  • per sensor: MODIS (Terra + Aqua, 2000-11 →), VIIRS S-NPP (2012-01-20 →). Daily detections and "detection-days"
    (days with ≥1 detection = the record's presence logic, which puts both sensors on one comparable scale).
  • per GVP eruption inside the data period: detected by each sensor? first-detection lag (days after the GVP start),
    detections and detection-days during [start, end].
  • coverage: only the windows around each eruption (start − 35 d to end + 5 d) are downloaded (FIRMS key budget);
    days outside them are null, never zero.
  • pre-eruption test: detections in the 30 days before each start, excluding days inside another eruption (+3 days).
Nothing is fitted; the result is reported whatever it is. Usage: python pipeline/tools/reunion_series.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from lib.common import write_json  # noqa: E402

RAW = ROOT / "data" / "raw" / "reunion"
GVP = ROOT / "data" / "raw" / "gvp_233020_eruptions.json"
GVP_URL = "https://volcano.si.edu/volcano.cfm?vn=233020"
GVP_WFS = ("https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature"
           "&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions&outputFormat=application/json&cql_filter=Volcano_Number=233020")
BOX = [55.60, -21.36, 55.86, -21.14]
SENSORS = {"modis": ("MODIS_SP", dt.date(2000, 11, 1), dt.date(2026, 8, 31)),
           "viirs": ("VIIRS_SNPP_SP", dt.date(2012, 1, 20), dt.date(2026, 7, 31))}


def covered_days(src: str, b: dt.date) -> set[dt.date]:
    """Days covered by downloaded 5-day chunk files (fixed grid; the last chunk may be shorter)."""
    out = set()
    for f in (RAW / src).glob("*.csv"):
        d0 = dt.date.fromisoformat(f.stem)
        for i in range(5):
            d = d0 + dt.timedelta(days=i)
            if d <= b:
                out.add(d)
    return out


def load_rows(src: str) -> list[dict]:
    rows = []
    for f in sorted((RAW / src).glob("*.csv")):
        lines = f.read_text(encoding="utf-8").strip().splitlines()
        if len(lines) < 2:
            continue
        h = lines[0].split(",")
        for ln in lines[1:]:
            v = dict(zip(h, ln.split(",")))
            c = v.get("confidence", "")
            low = (int(c) < 30) if c.isdigit() else c.lower() == "l"
            if low:
                continue
            lon = float(v["longitude"])
            hh = v["acq_time"].zfill(4)
            t = dt.datetime.fromisoformat(f"{v['acq_date']}T{hh[:2]}:{hh[2:]}:00")
            solar = (t + dt.timedelta(hours=lon / 15)).date()
            rows.append({"d": solar, "type": v.get("type", ""), "frp": float(v["frp"]) if v.get("frp") else None})
    return rows


def main() -> None:
    gvp = json.loads(GVP.read_text(encoding="utf-8"))
    eruptions = []
    for f in gvp["features"]:
        p = f["properties"]
        if not p.get("StartDateYear") or p["StartDateYear"] < 2000 or not p.get("StartDateMonth") or not p.get("StartDateDay"):
            continue
        s = dt.date(p["StartDateYear"], p["StartDateMonth"], p["StartDateDay"])
        e = dt.date(p["EndDateYear"], p["EndDateMonth"], p["EndDateDay"]) if p.get("EndDateYear") and p.get("EndDateMonth") and p.get("EndDateDay") else None
        eruptions.append({"gvp_eruption_number": p["Eruption_Number"], "start": s, "end": e, "area": p.get("ActivityArea")})
    eruptions.sort(key=lambda x: x["start"])

    first = min(v[1] for v in SENSORS.values())
    last = max(v[2] for v in SENSORS.values())
    ndays = (last - first).days + 1
    series, per_sensor_rows, covs = {}, {}, {}
    for k, (src, a, b) in SENSORS.items():
        rows = load_rows(src)
        per_sensor_rows[k] = rows
        tot = [None] * ndays
        vol = [None] * ndays
        cov = covered_days(src, b)
        for i in range((a - first).days, (b - first).days + 1):
            if first + dt.timedelta(days=i) in cov:
                tot[i] = 0
                vol[i] = 0
        for r in rows:
            i = (r["d"] - first).days
            if 0 <= i < ndays and tot[i] is not None:
                tot[i] += 1
                vol[i] += r["type"] == "1"
        series[k] = {"detections": tot, "volcano_flagged": vol, "available": [str(a), str(b)], "rows": len(rows), "days_downloaded": len(cov)}
        covs[k] = cov

    def in_any(d: dt.date, skip=None, pad=3) -> bool:
        return any(x is not skip and x["start"] <= d <= (x["end"] or x["start"]) + dt.timedelta(days=pad) for x in eruptions)

    out_er = []
    pre_hits = {"modis": 0, "viirs": 0}
    pre_n = {"modis": 0, "viirs": 0}
    for x in eruptions:
        s, e = x["start"], x["end"] or x["start"]
        rec = {"gvp_eruption_number": x["gvp_eruption_number"], "start": str(s), "end": str(e), "area": x["area"],
               "source": f"Smithsonian GVP, Volcanoes of the World — Holocene eruptions, Piton de la Fournaise (233020), eruption {x['gvp_eruption_number']}",
               "url": GVP_URL, "sensors": {}}
        for k, (src, a, b) in SENSORS.items():
            win = {s + dt.timedelta(days=i) for i in range((e - s).days + 1)}
            if s < a or e > b or not win <= covs[k]:
                rec["sensors"][k] = None
                continue
            rows = [r for r in per_sensor_rows[k] if s <= r["d"] <= e]
            days = sorted({r["d"] for r in rows})
            pre = [r for r in per_sensor_rows[k] if s - dt.timedelta(days=30) <= r["d"] < s and not in_any(r["d"], skip=x)]
            pre_ok = (s - dt.timedelta(days=30)) >= a and all((s - dt.timedelta(days=i)) in covs[k] for i in range(1, 31))
            if pre_ok:
                pre_n[k] += 1
                pre_hits[k] += bool(pre)
            rec["sensors"][k] = {"detected": bool(rows), "first_detection": str(days[0]) if days else None,
                                 "lag_days": (days[0] - s).days if days else None, "detections": len(rows),
                                 "volcano_flagged": sum(r["type"] == "1" for r in rows), "detection_days": len(days),
                                 "pre30_detections": len(pre) if pre_ok else None}
        out_er.append(rec)

    # detections on downloaded days that are not inside any eruption (+3 days): mostly the 35-day pre-windows
    outside = {k: sum(1 for r in per_sensor_rows[k] if not in_any(r["d"])) for k in SENSORS}
    outside_days = {k: sum(1 for d in covs[k] if not in_any(d)) for k in SENSORS}
    covered = {k: [e for e in out_er if e["sensors"][k] is not None] for k in SENSORS}
    summary = {k: {"eruptions_in_period": len(covered[k]), "detected": sum(e["sensors"][k]["detected"] for e in covered[k]),
                   "median_lag_days": (sorted(e["sensors"][k]["lag_days"] for e in covered[k] if e["sensors"][k]["detected"]) or [None])[
                       len([e for e in covered[k] if e["sensors"][k]["detected"]]) // 2] if covered[k] else None,
                   "pre30_eruptions_tested": pre_n[k], "pre30_eruptions_with_detections": pre_hits[k],
                   "detections_outside_eruptions": outside[k], "downloaded_days_outside_eruptions": outside_days[k]} for k in SENSORS}
    both = [e for e in out_er if e["sensors"]["modis"] and e["sensors"]["viirs"]]
    summary["both"] = {"eruptions": len(both),
                       "detection_days_modis": sum(e["sensors"]["modis"]["detection_days"] for e in both),
                       "detection_days_viirs": sum(e["sensors"]["viirs"]["detection_days"] for e in both),
                       "detections_modis": sum(e["sensors"]["modis"]["detections"] for e in both),
                       "detections_viirs": sum(e["sensors"]["viirs"]["detections"] for e in both)}
    doc = {"name": "Piton de la Fournaise, Réunion", "box": BOX, "first_day": str(first), "last_day": str(last),
           "method": __doc__.split("Method:")[1].split("Nothing")[0].strip(),
           "sources": {"detections": "NASA FIRMS Area API, standard (SP) products: MODIS C6.1 (MODIS_SP), VIIRS S-NPP 375 m (VIIRS_SNPP_SP)",
                       "eruptions": "Smithsonian Institution Global Volcanism Program, Volcanoes of the World (VOTW) Holocene eruptions",
                       "eruptions_url": GVP_URL, "eruptions_service": GVP_WFS},
           "eruption_list": "sourced", "summary": summary, "eruptions": out_er, "series": series,
           "coverage": "Downloaded for the windows around each GVP eruption (start − 35 days to end + 5 days), on a fixed 5-day grid; days outside the windows are null (not downloaded), not zero.",
           "note": "Not an eruption forecast. GVP dates are eruption periods; one GVP period can contain several eruptive episodes."}
    write_json(ROOT / "web" / "public" / "data" / "v1" / "api" / "reunion.json", doc, compact=True)
    md = ["# Piton de la Fournaise ground-truth check", "", f"Generated by `pipeline/tools/reunion_series.py`. Box {BOX}. Eruptions: {GVP_URL}", ""]
    for k in SENSORS:
        s = summary[k]
        md.append(f"- **{k.upper()}**: detected {s['detected']} of {s['eruptions_in_period']} GVP eruptions in its period; median first-detection lag "
                  f"{s['median_lag_days']} days; 30-day pre-eruption test: {s['pre30_eruptions_with_detections']} of {s['pre30_eruptions_tested']} eruptions had "
                  f"detections in the 30 days before (outside other eruptions); {s['detections_outside_eruptions']} detections fell outside every eruption period (+3 days).")
    md += ["", "| GVP start | end | MODIS det. / days / lag | VIIRS det. / days / lag | MODIS pre-30 | VIIRS pre-30 |", "|---|---|---|---|---|---|"]
    f = lambda v: "—" if v is None else (f"{v['detections']} / {v['detection_days']} / {v['lag_days'] if v['lag_days'] is not None else 'not detected'}")  # noqa: E731
    for e in out_er:
        md.append(f"| {e['start']} | {e['end']} | {f(e['sensors']['modis'])} | {f(e['sensors']['viirs'])} | "
                  f"{'—' if not e['sensors']['modis'] else e['sensors']['modis']['pre30_detections']} | {'—' if not e['sensors']['viirs'] else e['sensors']['viirs']['pre30_detections']} |")
    (ROOT / "docs" / "reunion_check.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
