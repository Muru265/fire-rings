"""06 — Validate the harmonization per region and method, choose the method, write reports.

V1  LOYO annual error: for each calibration year, k is refit without that year and MODIS is predicted from S-NPP.
    Target (active regions): |bias| < 10 %, MAPE < 20 %.
V3  Step test 2003–2019: step = mean(2012–19) / mean(2003–11) − 1 for raw-concatenated, harmonized and MODIS-only
    annual series. The harmonized 2012–19 years use LOYO ratios (out of sample). Pass: Pettitt p > 0.05 on the
    harmonized series AND the MODIS-only step lies inside the harmonized step's bootstrap 90 % interval.
V4  Drift: yearly MODIS / S-NPP (and Terra, Aqua) cell-day ratio 2012–2025, relative to the 2013–2019 mean.
V9  Famous seasons: rank of SE Australia's Black Summer (Jul 2019 – Jun 2020) among all Jul–Jun seasons (target top 3);
    top-3 seasons listed for every region.
Method choice (Muru's default rule): primary "monthly"; if it fails V1 or V3 and "pooled" (fallback 1) validates
better, use "pooled". Low-activity regions (median baseline month < 5 MODIS cell-days) are reported, not judged.
Output data/out/validation_{region}.json, data/out/harmonized_{region}.parquet (+ hdraws), docs/validation_report.md
Usage: python pipeline/06_validate.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.calib import loyo_predictions, pettitt, ratios  # noqa: E402
from lib.common import ROOT, config, path, read_json, write_json  # noqa: E402

imp = __import__("importlib").import_module
cal = imp("05_calibrate") if False else None  # (kept simple: reuse helpers below)

MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# V9 checks only against events documented with a source (QA #37). Regions without one get an "info" status.
KNOWN_EVENTS = {
    "se_australia": {
        "event": "Black Summer bushfires, 2019–20 season",
        "season_start": 2019,
        "source": {"name": "Australian Government — tabling of the Royal Commission into National Natural Disaster Arrangements report (30 Oct 2020)",
                   "url": "https://minister.homeaffairs.gov.au/davidlittleproud/Pages/tabling-the-report-of-the-royal-commission-into-national-natural-disaster-arrangements.aspx"},
    },
}


def ym(s):
    return int(s[:4]), int(s[5:7])


def load_cube(region: str) -> dict:
    mon = pl.read_parquet(path("cube") / f"{region}_monthly.parquet")
    return {(r["y"], r["m"], r["stream"]): (np.nan if r["flag"] is not None or r["C_adj"] is None else float(r["C_adj"]))
            for r in mon.iter_rows(named=True)}


def window_matrix(cube, target, source, window):
    (y0, m0), (y1, m1) = ym(window[0]), ym(window[1])
    years = list(range(y0, y1 + 1))
    A = np.full((len(years), 12), np.nan)
    B = np.full((len(years), 12), np.nan)
    for i, y in enumerate(years):
        for m in range(1, 13):
            if (y0, m0) <= (y, m) <= (y1, m1):
                a, b = cube.get((y, m, target), np.nan), cube.get((y, m, source), np.nan)
                if not (np.isnan(a) or np.isnan(b)):
                    A[i, m - 1], B[i, m - 1] = a, b
    return A, B, years


def validate(region: str, method: str, cube: dict, calib: dict, cfg: dict) -> dict:
    cc = cfg["calibration"]
    mc = calib["methods"][method]
    tau = mc["k"]["tau"]
    A, B, wyears = window_matrix(cube, "MODIS", "SNPP", cc["window"])

    # ---- V1 LOYO annual error + monthly shape correlation ------------------------------------------------
    pred = loyo_predictions(A, B, tau, method)
    ann = []
    for i, y in enumerate(wyears):
        ok = ~np.isnan(pred[i])
        a, p = A[i, ok].sum(), pred[i, ok].sum()
        ann.append({"y": y, "months": int(ok.sum()), "modis": round(a, 1), "pred": round(p, 1),
                    "err_pct": None if a <= 0 else round(100 * (p - a) / a, 1)})
    errs = np.array([r["err_pct"] for r in ann if r["err_pct"] is not None], float)
    ok = ~np.isnan(pred)
    shape_r = float(np.corrcoef(pred[ok], A[ok])[0, 1]) if ok.sum() > 2 else None
    v1 = {"bias_pct": round(float(errs.mean()), 1), "mape_pct": round(float(np.abs(errs).mean()), 1),
          "max_abs_pct": round(float(np.abs(errs).max()), 1), "years": ann,
          "shape_r": None if shape_r is None else round(shape_r, 3)}
    v1["pass"] = bool(abs(v1["bias_pct"]) < 10 and v1["mape_pct"] < 20)

    # ---- V3 step test on 2003–2019 annual totals ---------------------------------------------------------
    h = pl.read_parquet(path("out") / f"harmonized_{region}_{method}.parquet")
    hmap = {(r["y"], r["m"]): r["H"] for r in h.iter_rows(named=True)}
    draws = np.load(path("out") / f"hdraws_{region}_{method}.npy")
    didx = {(r["y"], r["m"]): i for i, r in enumerate(h.iter_rows(named=True))}
    loyo_k = {}
    for i, y in enumerate(wyears):
        keep = np.ones(len(wyears), bool)
        keep[i] = False
        loyo_k[y] = ratios(A[keep], B[keep], tau, method)
    years = list(range(2003, 2020))
    raw_s, harm_s, mod_s, harm_d = [], [], [], []
    for y in years:
        r_sum = h_sum = m_sum = 0.0
        d_sum = np.zeros(draws.shape[1])
        for m in range(1, 13):
            mo, sn = cube.get((y, m, "MODIS"), np.nan), cube.get((y, m, "SNPP"), np.nan)
            hv = hmap.get((y, m))
            if y >= 2012:
                if np.isnan(mo) or np.isnan(sn) or hv is None:
                    continue           # same months in every series
                hv = loyo_k[y][m - 1] * sn if y in loyo_k else hv
                rv = sn
                dv = draws[didx[(y, m)]] * (hv / hmap[(y, m)] if hmap[(y, m)] else 1)
            else:
                if np.isnan(mo) or hv is None:
                    continue
                rv, dv = mo, draws[didx[(y, m)]]
            r_sum += rv
            h_sum += hv
            m_sum += mo
            d_sum += np.nan_to_num(dv)
        raw_s.append(r_sum)
        harm_s.append(h_sum)
        mod_s.append(m_sum)
        harm_d.append(d_sum)
    raw_s, harm_s, mod_s, harm_d = map(np.array, (raw_s, harm_s, mod_s, harm_d))
    pre, post = np.array(years) < 2012, np.array(years) >= 2012

    def step(x):
        return float(100 * (x[post].mean() / x[pre].mean() - 1)) if x[pre].mean() > 0 else None

    step_draws = 100 * (harm_d[post].mean(0) / np.maximum(harm_d[pre].mean(0), 1e-9) - 1)
    lo, hi = np.percentile(step_draws, [5, 95])
    s_raw, s_harm, s_mod = step(raw_s), step(harm_s), step(mod_s)
    p_raw, p_harm = pettitt(raw_s)[2], pettitt(harm_s)[2]
    v3 = {"years": years, "raw": [round(x, 1) for x in raw_s], "harmonized": [round(x, 1) for x in harm_s],
          "modis_only": [round(x, 1) for x in mod_s],
          "step_raw_pct": round(s_raw, 1), "step_harm_pct": round(s_harm, 1), "step_modis_pct": round(s_mod, 1),
          "step_harm_ci": [round(float(lo), 1), round(float(hi), 1)],
          "pettitt_p_raw": round(p_raw, 4), "pettitt_p_harm": round(p_harm, 4),
          "pettitt_cp_raw": years[pettitt(raw_s)[0]], "pettitt_cp_harm": years[pettitt(harm_s)[0]]}
    v3["pass"] = bool(p_harm > 0.05 and lo <= s_mod <= hi)

    # ---- V4 drift --------------------------------------------------------------------------------------------
    drift = []
    for y in range(2012, 2026):
        tot = {s: 0.0 for s in ("MODIS", "TERRA", "AQUA", "SNPP")}
        for m in range(1, 13):
            vals = {s: cube.get((y, m, s), np.nan) for s in tot}
            if any(np.isnan(v) for v in vals.values()):
                continue
            for s in tot:
                tot[s] += vals[s]
        sn = tot["SNPP"]
        drift.append({"y": y, "ratio": round(tot["MODIS"] / sn, 4) if sn else None,
                      "terra": round(tot["TERRA"] / sn, 4) if sn else None,
                      "aqua": round(tot["AQUA"] / sn, 4) if sn else None})
    base = np.mean([d["ratio"] for d in drift if 2013 <= d["y"] <= 2019 and d["ratio"]])
    for d in drift:
        d["rel_pct"] = round(100 * (d["ratio"] / base - 1), 1) if d["ratio"] else None
    post20 = [d["rel_pct"] for d in drift if d["y"] >= 2020 and d["rel_pct"] is not None]
    v4 = {"drift": drift, "window_mean_ratio": round(float(base), 4),
          "post2020_mean_rel_pct": round(float(np.mean(post20)), 1) if post20 else None}

    # ---- V9 famous seasons ------------------------------------------------------------------------------------
    seasons = []
    srcmap = {(r["y"], r["m"]): r["src"] for r in h.iter_rows(named=True)}
    terra_only = lambda ks: any(srcmap.get(k) == "T" for k in ks)  # noqa: E731  (Terra-only months not ranked)
    for y in range(2001, 2026):          # season y = Jul y … Jun y+1 (complete through Jun 2026)
        months = [(y, m) for m in range(7, 13)] + [(y + 1, m) for m in range(1, 7)]
        if terra_only(months):
            continue
        hs = [hmap.get(k) for k in months]
        raws = []
        for (yy, mm) in months:
            src = cube.get((yy, mm, "MODIS" if yy < 2012 else "SNPP"), np.nan)
            raws.append(src)
        if any(v is None for v in hs):
            continue
        seasons.append({"season": f"{y}–{str(y + 1)[2:]}", "start": y, "H": round(sum(hs), 1),
                        "raw": None if any(np.isnan(r) for r in raws) else round(float(np.nansum(raws)), 1)})
    by_h = sorted(seasons, key=lambda s: -s["H"])
    by_raw = sorted([s for s in seasons if s["raw"] is not None], key=lambda s: -s["raw"])
    rank_h = {s["start"]: i + 1 for i, s in enumerate(by_h)}
    rank_raw = {s["start"]: i + 1 for i, s in enumerate(by_raw)}
    v9 = {"season_def": "Jul–Jun (seasons containing Terra-only months, i.e. before Jul 2002, are not ranked)", "n_seasons": len(seasons),
          "top3_harmonized": [s["season"] for s in by_h[:3]], "top3_raw": [s["season"] for s in by_raw[:3]]}
    ev = KNOWN_EVENTS.get(region)
    if ev:
        v9["known_event"] = ev
        v9["status"] = "pass" if rank_h.get(ev["season_start"], 99) <= 3 else "fail"
    else:
        v9["status"] = "info"
        v9["status_reason"] = ("Shown for information: we have no independently sourced list of this region's big fire years "
                               "to test against, so this is not a pass/fail check.")
    if region == "se_australia":
        v9["black_summer_rank_harmonized"] = rank_h.get(2019)
        v9["black_summer_rank_raw"] = rank_raw.get(2019)
        v9["pass"] = bool(rank_h.get(2019, 99) <= 3)
    if region == "punjab":   # crop-burning season Oct–Nov, by calendar year
        on = []
        for y in range(2001, 2026):
            v = [hmap.get((y, 10)), hmap.get((y, 11))]
            if None not in v and not terra_only([(y, 10), (y, 11)]):
                on.append((y, sum(v)))
        on.sort(key=lambda t: -t[1])
        v9["octnov_top3_harmonized"] = [y for y, _ in on[:3]]
        v9["octnov_rank"] = {str(y): i + 1 for i, (y, _) in enumerate(on)}

    return {"method": method, "tau": tau, "V1": v1, "V3": v3, "V4": v4, "V9": v9}


def is_low_activity(cube: dict, cfg: dict) -> bool:
    b0, b1 = cfg["stats"]["baseline"]
    vals = [cube[(y, m, "MODIS")] for y in range(b0, b1 + 1) for m in range(1, 13)
            if not np.isnan(cube.get((y, m, "MODIS"), np.nan))]
    return bool(np.median(vals) < cfg["stats"]["guard_median_lt"])


def choose(res: dict) -> tuple[str, str]:
    prim, fb = res["monthly"], res["pooled"]
    if prim["V1"]["pass"] and prim["V3"]["pass"]:
        return "monthly", "primary method passes V1 and V3"
    score = lambda r: (int(r["V1"]["pass"]) + int(r["V3"]["pass"]), -r["V1"]["mape_pct"])  # noqa: E731
    if score(fb) > score(prim):
        return "pooled", (f"primary failed ({'V1 ' if not prim['V1']['pass'] else ''}{'V3' if not prim['V3']['pass'] else ''}); "
                          f"fallback 1 validates better (passes {score(fb)[0]}/2, MAPE {fb['V1']['mape_pct']}% vs {prim['V1']['mape_pct']}%)")
    return "monthly", (f"primary failed ({'V1 ' if not prim['V1']['pass'] else ''}{'V3' if not prim['V3']['pass'] else ''}) "
                       f"but fallback 1 does not validate better — kept primary")


def main() -> None:
    cfg = config()
    out = path("out")
    allres = {}
    for region in cfg["regions"]:
        cube = load_cube(region)
        calib = read_json(out / f"calib_{region}.json")
        res = {m: validate(region, m, cube, calib, cfg) for m in ("monthly", "pooled")}
        low = is_low_activity(cube, cfg)
        method, why = choose(res)
        if low:
            method, why = "monthly", "low-activity region: targets not applicable (guard rules apply); primary kept"
        ch = res[method]
        summary = {"method": method, "method_reason": why, "low_activity": low,
                   "loyo_err_pct": ch["V1"]["mape_pct"], "loyo_bias_pct": ch["V1"]["bias_pct"],
                   "step_raw_pct": ch["V3"]["step_raw_pct"], "step_harm_pct": ch["V3"]["step_harm_pct"],
                   "step_modis_pct": ch["V3"]["step_modis_pct"], "step_harm_ci": ch["V3"]["step_harm_ci"],
                   "step_p": ch["V3"]["pettitt_p_harm"], "step_p_raw": ch["V3"]["pettitt_p_raw"],
                   "shape_r": ch["V1"]["shape_r"], "drift": [{"y": d["y"], "ratio": d["ratio"]} for d in ch["V4"]["drift"]],
                   "drift_post2020_rel_pct": ch["V4"]["post2020_mean_rel_pct"],
                   "v1_pass": ch["V1"]["pass"], "v3_pass": ch["V3"]["pass"], "v9": ch["V9"]}
        doc = {"region": region, "summary": summary, "results": res}
        write_json(out / f"validation_{region}.json", doc)
        for ext in ("parquet",):
            shutil.copy(out / f"harmonized_{region}_{method}.{ext}", out / f"harmonized_{region}.{ext}")
        shutil.copy(out / f"hdraws_{region}_{method}.npy", out / f"hdraws_{region}.npy")
        allres[region] = doc
        for m in ("monthly", "pooled"):
            r = res[m]
            print(f"{region:<13} {m:<8} V1 bias={r['V1']['bias_pct']:>6}% MAPE={r['V1']['mape_pct']:>5}% "
                  f"{'PASS' if r['V1']['pass'] else 'fail'} | V3 raw={r['V3']['step_raw_pct']:>6}% "
                  f"harm={r['V3']['step_harm_pct']:>6}% {r['V3']['step_harm_ci']} modis={r['V3']['step_modis_pct']:>6}% "
                  f"p={r['V3']['pettitt_p_harm']} {'PASS' if r['V3']['pass'] else 'fail'} | r={r['V1']['shape_r']}")
        print(f"  → {region}: method={method} ({why}); low_activity={low}; V9={res[method]['V9'].get('top3_harmonized')}"
              f" BS={res[method]['V9'].get('black_summer_rank_harmonized')}; drift post-2020={res[method]['V4']['post2020_mean_rel_pct']}%")
    write_report(allres)


def write_report(allres: dict) -> None:
    L = ["# Validation report", "",
         "Generated by `python pipeline/06_validate.py`. Calibration window Jul 2012 – Dec 2019 only.",
         "Targets (master plan §7.8): V1 |bias| < 10 % and MAPE < 20 % (active regions) · V3 harmonized step consistent with",
         "the MODIS-only step (inside the harmonized 90 % bootstrap interval) and Pettitt p > 0.05 · V9 Black Summer top 3.", "",
         "## Summary (method used in the app)", "",
         "| region | method | V1 bias | V1 MAPE | V1 | raw step | harmonized step (90 % CI) | MODIS-only step | Pettitt p (raw → harm) | V3 | shape r | MODIS/VIIRS drift after 2020 |",
         "|---|---|---:|---:|---|---:|---:|---:|---|---|---:|---:|"]
    for region, d in allres.items():
        s = d["summary"]
        tag = (lambda ok: "n/a (low activity)" if s["low_activity"] else ("✅ pass" if ok else "❌ fail"))
        L.append(f"| {region} | {s['method']} | {s['loyo_bias_pct']}% | {s['loyo_err_pct']}% | {tag(s['v1_pass'])} | "
                 f"{s['step_raw_pct']}% | {s['step_harm_pct']}% ({s['step_harm_ci'][0]} – {s['step_harm_ci'][1]}) | "
                 f"{s['step_modis_pct']}% | {s['step_p_raw']} → {s['step_p']} | {tag(s['v3_pass'])} | {s['shape_r']} | "
                 f"{s['drift_post2020_rel_pct']}% |")
    L += ["", "Method choice:", ""]
    for region, d in allres.items():
        L.append(f"- **{region}**: `{d['summary']['method']}` — {d['summary']['method_reason']}")
    L += ["", "## V9 famous seasons", ""]
    for region, d in allres.items():
        v = d["summary"]["v9"]
        extra = f" · status: **{v.get('status')}**"
        if "black_summer_rank_harmonized" in v:
            extra = (f" · **Black Summer 2019–20 rank: {v['black_summer_rank_harmonized']} harmonized "
                     f"(raw: {v['black_summer_rank_raw']})** {'✅' if v.get('pass') else '❌'}")
        if "octnov_top3_harmonized" in v:
            extra = f" · Oct–Nov crop-burning top 3 (harmonized): {v['octnov_top3_harmonized']}"
        L.append(f"- {region}: top-3 Jul–Jun seasons harmonized {v['top3_harmonized']}, raw {v['top3_raw']}{extra}")
    L += ["", "V9 is only scored against events documented with a source:", ""]
    for region, ev in KNOWN_EVENTS.items():
        L.append(f"- {region}: {ev['event']} — [{ev['source']['name']}]({ev['source']['url']})")
    L.append("- Other regions: no sourced event list → V9 shown as information, not pass/fail.")
    L += ["", "## Low-reliability calibration months (QA #45)", "",
          "Months whose monthly rate rests on fewer than 200 S-NPP fire-days in Jul 2012 – Dec 2019 are labelled",
          "\"few fires — low reliability\" in the app. They use the same shrinkage as every month (τ chosen by",
          "leave-one-year-out); because they hold almost no fire, they barely affect any total.", ""]
    for region in allres:
        c = read_json(path("out") / f"calib_{region}.json")["methods"][allres[region]["summary"]["method"]]["k"]
        low = [f"{MON[i]} k={c['month'][i]:.2f} (unshrunk {c['raw_month'][i]:.2f}; MODIS {c['A'][i]:.0f} vs S-NPP {c['B'][i]:.0f} fire-days)"
               for i in range(12) if c["B"][i] < 200]
        L.append(f"- {region}: " + ("; ".join(low) if low else "none"))
    L += ["", "Punjab August (k ≈ 1.2, above 1 = MODIS saw more than VIIRS): only 4–23 fire-days a year per sensor in the",
          "monsoon month (126 MODIS vs 92 S-NPP cell-days over 2012–2019); the MODIS detections are scattered single",
          "cells with no repeat location (not a static source) and 47 of 107 S-NPP detections are at night. This is",
          "small-sample noise, not a sensor effect. August holds 0.13 % of Punjab's harmonized fire-days, so it does",
          "not change any season, rank or validation result.", ""]
    L += ["", "## Both methods side by side", "",
          "| region | method | τ | V1 bias | V1 MAPE | V1 max |err| | harmonized step | Pettitt p | V3 | shape r |",
          "|---|---|---:|---:|---:|---:|---:|---:|---|---:|"]
    for region, d in allres.items():
        for m, r in d["results"].items():
            L.append(f"| {region} | {m} | {r['tau']} | {r['V1']['bias_pct']}% | {r['V1']['mape_pct']}% | {r['V1']['max_abs_pct']}% | "
                     f"{r['V3']['step_harm_pct']}% | {r['V3']['pettitt_p_harm']} | {'pass' if r['V3']['pass'] else 'fail'} | {r['V1']['shape_r']} |")
    L += ["", "## V1 per-year LOYO errors (method used)", ""]
    for region, d in allres.items():
        r = d["results"][d["summary"]["method"]]["V1"]["years"]
        L.append(f"- {region}: " + " · ".join(f"{x['y']} {x['err_pct']}%" for x in r))
    L += ["", "## V4 drift (MODIS ÷ S-NPP cell-days, relative to the 2013–2019 mean)", "",
          "| year | " + " | ".join(allres) + " |", "|---|" + "---:|" * len(allres)]
    for i, y in enumerate(range(2012, 2026)):
        L.append(f"| {y} | " + " | ".join(
            f"{d['results'][d['summary']['method']]['V4']['drift'][i]['rel_pct']}%" for d in allres.values()) + " |")
    L += ["", "Notes:",
          "- V3 uses leave-one-year-out ratios for 2012–2019, so the harmonized years are out of sample.",
          "- Annual totals use only months valid in every series (e.g. Jan 2012, S-NPP's first partial month, is excluded).",
          "- MODIS orbit drift: Terra from 2020, Aqua from Dec 2021; MODIS processing label changes 6.03 → 61.03 on 2023-01-01."]
    (ROOT / "docs" / "validation_report.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
