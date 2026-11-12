"""11 — Prediction model: "where fire is more likely next month", per H3 res-6 cell (Round 5B, Part B).

Unit: cell × month, all validated regions together (region is a feature). Built only from committed files
(lib/model_data.py), so the monthly GitHub Actions job can rerun it.
Target: the cell has ≥ 1 VIIRS fire-day (High detail: S-NPP, NOAA-20 after S-NPP ended) in month m+1; target years 2013–2025.
Features (known at the end of month m): harmonized MODIS-equivalent history of the same calendar month 2001 → year
before the target (fraction of years with ≥ 1 MODIS-equivalent fire-day, mean fire-days), activity in m, m−1, m−2,
ring-1/ring-2 neighbour activity last month and neighbour climatology, target month, region, NASA POWER rain and
temperature anomalies for month m (vs the same calendar month in all earlier years).
Models: logistic regression and HistGradientBoosting; picked once by validation on training years only (train 2013–2016,
validate 2017 — before the first test year). Baselines: b1 climatology (harmonized fraction of years with fire, this
calendar month), b2 persistence (fire in month m).
Evaluation (test data only): PRIMARY rolling origin — for each test year Y in 2018–2025 train on target years < Y;
SECONDARY leave-one-region-out. ROC-AUC, PR-AUC, precision/recall/F1 at a threshold chosen on training data, Brier,
capture of next month's fire cells by the top 10 % / 20 % of cells (per region and month), year-bootstrap 90 % intervals.
Ablation: identical model with RAW history features (MODIS ≤ 2011 + unconverted VIIRS).
Publish gate: likelihood maps only if the model beats b1 on pooled rolling-origin PR-AUC AND top-10 % capture.

Usage: python pipeline/11_model.py [--quick]            (full evaluation + publish; --quick = fewer bootstrap reps)
       imported by pipeline/retrain.py for the monthly job.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, precision_recall_curve, roc_auc_score
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import model_data as md  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
API = md.WEB / "api"
ASSETS = ROOT / "pipeline" / "assets" / "model"
SEED = 20261114
TRAIN_YEARS = (2013, 2025)
TEST_YEARS = list(range(2018, 2026))
MAX_TRAIN = 1_500_000
VERSION_FILE = ASSETS / "champion.json"
RECIPES = {   # the recipe grid; champion/challenger are picked from here by validation on training years only
    "logit": {"kind": "logit", "C": 1.0},
    "hgb": {"kind": "hgb", "lr": 0.1, "leaves": 63, "iters": 250},
    "hgb_small": {"kind": "hgb", "lr": 0.05, "leaves": 31, "iters": 400},
}


# ---------------------------------------------------------------- models
def make_model(rc: dict):
    if rc["kind"] == "hgb":
        return HistGradientBoostingClassifier(learning_rate=rc["lr"], max_leaf_nodes=rc["leaves"], max_iter=rc["iters"],
                                              min_samples_leaf=200, l2_regularization=1.0, categorical_features=md.CAT,
                                              early_stopping=False, random_state=SEED)
    num = [i for i in range(len(md.FEATURES)) if i not in md.CAT]
    cnt = num[:9]   # count-like features → log1p
    env = num[9:]
    pre = ColumnTransformer([
        ("cnt", make_pipeline(SimpleImputer(strategy="constant", fill_value=0), FunctionTransformer(np.log1p), StandardScaler()), cnt),
        ("env", make_pipeline(SimpleImputer(strategy="constant", fill_value=0), StandardScaler()), env),
        ("cat", make_pipeline(SimpleImputer(strategy="constant", fill_value=-1), OneHotEncoder(handle_unknown="ignore")), md.CAT),
    ])
    return Pipeline([("pre", pre), ("lr", LogisticRegression(C=rc["C"], max_iter=400))])


def subsample(idx: np.ndarray, seed: int, n: int = MAX_TRAIN) -> np.ndarray:
    if len(idx) <= n:
        return idx
    return np.sort(np.random.default_rng(seed).choice(idx, size=n, replace=False))


def fit(rc: dict, X: np.ndarray, y: np.ndarray, seed: int):
    m = make_model(rc)
    m.fit(X, y)
    p = m.predict_proba(X)[:, 1]
    pr, rcl, th = precision_recall_curve(y, p)
    f1 = 2 * pr * rcl / np.maximum(pr + rcl, 1e-12)
    thr = float(th[int(np.argmax(f1[:-1]))]) if len(th) else 0.5   # threshold chosen on TRAINING data only
    return m, thr


# ---------------------------------------------------------------- metrics
def capture_parts(group: np.ndarray, score: np.ndarray, y: np.ndarray, frac: float, seed: int):
    """Per group (region × target month): rank cells by score (random tie-break, seeded), top ceil(frac·n) cells.
    Returns (group ids, captured fire cells, all fire cells) per group."""
    jit = np.random.default_rng(seed).random(len(score))
    order = np.lexsort((jit, -score, group))
    g, yy = group[order], y[order]
    starts = np.r_[0, np.flatnonzero(g[1:] != g[:-1]) + 1]
    sizes = np.diff(np.r_[starts, len(g)])
    rank = np.arange(len(g)) - np.repeat(starts, sizes)
    top = rank < np.repeat(np.ceil(frac * sizes).astype(int), sizes)
    cap = np.add.reduceat(yy * top, starts)
    tot = np.add.reduceat(yy, starts)
    return g[starts], cap, tot


def metrics(y: np.ndarray, score: np.ndarray, group: np.ndarray, thr: float | None = None) -> dict:
    out = {"n": int(len(y)), "positives": int(y.sum()),
           "roc_auc": round(float(roc_auc_score(y, score)), 4), "pr_auc": round(float(average_precision_score(y, score)), 4)}
    if np.all((score >= 0) & (score <= 1)):
        out["brier"] = round(float(brier_score_loss(y, score)), 4)
    for f in (0.1, 0.2):
        _, cap, tot = capture_parts(group, score, y, f, SEED)
        out[f"capture{int(f * 100)}"] = round(100 * float(cap.sum() / max(tot.sum(), 1)), 1)
    if thr is not None:
        pred = score >= thr
        tp = float((pred & (y == 1)).sum())
        p_, r_ = tp / max(pred.sum(), 1), tp / max(y.sum(), 1)
        out.update({"threshold": round(thr, 4), "precision": round(p_, 3), "recall": round(r_, 3),
                    "f1": round(2 * p_ * r_ / max(p_ + r_, 1e-12), 3)})
    return out


def year_bootstrap(T: dict, keys: list[str], reps: int, seed: int) -> dict:
    """90 % intervals over test years (resample years with replacement). Capture uses exact per-year counts; AUCs use a
    fixed 4 % row subsample per year for speed."""
    rng = np.random.default_rng(seed)
    years = sorted(set(T["year"].tolist()))
    per = {}
    for yv in years:
        ii = np.flatnonzero(T["year"] == yv)
        sub = np.sort(rng.choice(ii, size=max(2000, len(ii) // 25), replace=False)) if len(ii) > 2000 else ii
        per[yv] = {"sub": sub}
        for k in keys:
            for f in (0.1, 0.2):
                _, cap, tot = capture_parts(T["group"][ii], T[k][ii], T["y"][ii], f, SEED)
                per[yv][(k, f)] = (cap.sum(), tot.sum())
    out = {k: {"pr_auc": [], "roc_auc": [], "capture10": [], "capture20": []} for k in keys}
    diffs = {k: {"pr_auc": [], "capture10": []} for k in keys if k != "model"}
    for _ in range(reps):
        pick = rng.choice(years, size=len(years), replace=True)
        rows = np.concatenate([per[yv]["sub"] for yv in pick])
        yy = T["y"][rows]
        vals = {}
        for k in keys:
            pa = average_precision_score(yy, T[k][rows])
            out[k]["pr_auc"].append(pa)
            out[k]["roc_auc"].append(roc_auc_score(yy, T[k][rows]))
            for f in (0.1, 0.2):
                c = sum(per[yv][(k, f)][0] for yv in pick); t = sum(per[yv][(k, f)][1] for yv in pick)
                out[k][f"capture{int(f * 100)}"].append(100 * c / max(t, 1))
            vals[k] = (pa, out[k]["capture10"][-1])
        for k in diffs:
            diffs[k]["pr_auc"].append(vals["model"][0] - vals[k][0])
            diffs[k]["capture10"].append(vals["model"][1] - vals[k][1])
    ci = lambda a: [round(float(np.percentile(a, 5)), 4 if max(map(abs, a)) <= 1 else 1), round(float(np.percentile(a, 95)), 4 if max(map(abs, a)) <= 1 else 1)]  # noqa: E731
    res = {k: {m: ci(v) for m, v in d.items()} for k, d in out.items()}
    res["model_minus"] = {k: {m: ci(v) for m, v in d.items()} for k, d in diffs.items()}
    return res


# ---------------------------------------------------------------- data
def targets_between(y0: int, y1: int):
    return lambda r: [s for s in range(md.midx(y0, 1), md.midx(y1, 12) + 1) if s <= r.last_full]


def load(variant: str = "harm", regions=None):
    regions = regions or md.load_all()
    D = md.stack(regions, targets_between(*TRAIN_YEARS), variant)
    D["year"] = (md.Y0 + D["s"] // 12).astype(np.int16)
    D["group"] = D["region"].astype(np.int64) * 10_000 + D["s"]
    return regions, D


def choose_recipe(D: dict, candidates: list[str], last_train_year: int) -> tuple[str, dict]:
    """Validation on training years only: train on target years ≤ last_train_year−1, validate on last_train_year."""
    tr = subsample(np.flatnonzero(D["year"] < last_train_year), SEED)
    va = np.flatnonzero(D["year"] == last_train_year)
    scores = {}
    for name in candidates:
        m, _ = fit(RECIPES[name], D["X"][tr], D["y"][tr], SEED)
        scores[name] = round(float(average_precision_score(D["y"][va], m.predict_proba(D["X"][va])[:, 1])), 4)
        print(f"   selection {name:<10} validation {last_train_year} PR-AUC {scores[name]}", flush=True)
    return max(scores, key=scores.get), scores


def rolling_origin(D: dict, recipe: dict, test_years: list[int], tag: str) -> dict:
    keep = {k: [] for k in ("y", "model", "b1", "b2", "group", "year", "region", "pred")}
    thrs = {}
    for Y in test_years:
        t0 = time.time()
        tr = subsample(np.flatnonzero(D["year"] < Y), SEED + Y)
        te = np.flatnonzero(D["year"] == Y)
        assert not np.intersect1d(tr, te).size and D["year"][tr].max() < Y   # no leakage: test-year rows never in training
        m, thr = fit(recipe, D["X"][tr], D["y"][tr], SEED + Y)
        p = m.predict_proba(D["X"][te])[:, 1]
        thrs[Y] = thr
        for k, v in (("y", D["y"][te]), ("model", p), ("b1", D["b1"][te]), ("b2", D["b2"][te]), ("group", D["group"][te]),
                     ("year", D["year"][te]), ("region", D["region"][te]), ("pred", (p >= thr).astype(np.float32))):
            keep[k].append(v)
        print(f"   {tag} test {Y}: train {len(tr):,} rows → PR-AUC {average_precision_score(D['y'][te], p):.3f} "
              f"(clim {average_precision_score(D['y'][te], D['b1'][te]):.3f})  {time.time() - t0:.0f}s", flush=True)
    T = {k: np.concatenate(v) for k, v in keep.items()}
    T["thr"] = thrs
    return T


def summarize(T: dict, regions: list, reps: int) -> dict:
    # thresholds differ per fold: P/R/F1 from the per-fold thresholded predictions
    tp = float(((T["pred"] == 1) & (T["y"] == 1)).sum())
    p_, r_ = tp / max(T["pred"].sum(), 1), tp / max(T["y"].sum(), 1)
    out = {"pooled": {"model": {**metrics(T["y"], T["model"], T["group"]), "precision": round(p_, 3), "recall": round(r_, 3),
                                "f1": round(2 * p_ * r_ / max(p_ + r_, 1e-12), 3),
                                "thresholds": {str(k): round(v, 4) for k, v in T["thr"].items()}},
                      "climatology": metrics(T["y"], T["b1"], T["group"]),
                      "persistence": metrics(T["y"], T["b2"], T["group"])}}
    # baseline P/R/F1 at their natural thresholds (persistence: fire last month; climatology: fire in ≥ half of past years)
    for k, thr in (("persistence", 0.5), ("climatology", 0.5)):
        pred = T["b1" if k == "climatology" else "b2"] >= thr
        tpb = float((pred & (T["y"] == 1)).sum()); pb, rb = tpb / max(pred.sum(), 1), tpb / max(T["y"].sum(), 1)
        out["pooled"][k].update({"precision": round(pb, 3), "recall": round(rb, 3), "f1": round(2 * pb * rb / max(pb + rb, 1e-12), 3)})
    out["intervals"] = year_bootstrap(T, ["model", "b1", "b2"], reps, SEED)
    out["per_region"] = {}
    for r in regions:
        ii = np.flatnonzero(T["region"] == r.code)
        if not len(ii) or T["y"][ii].sum() == 0:
            continue
        out["per_region"][r.id] = {k: {m: v for m, v in metrics(T["y"][ii], T[c][ii], T["group"][ii]).items()
                                       if m in ("pr_auc", "roc_auc", "capture10", "capture20", "positives")}
                                   for k, c in (("model", "model"), ("climatology", "b1"), ("persistence", "b2"))}
    out["per_year"] = {str(Y): {k: metrics(T["y"][T["year"] == Y], T[c][T["year"] == Y], T["group"][T["year"] == Y])["capture10"]
                                for k, c in (("model", "model"), ("climatology", "b1"))} for Y in sorted(set(T["year"].tolist()))}
    return out


def leave_one_region_out(D: dict, recipe: dict, regions: list) -> dict:
    out = {}
    X = D["X"].copy()
    X[:, md.FEATURES.index("region")] = np.nan   # an unseen region has no region code
    for r in regions:
        tr = subsample(np.flatnonzero(D["region"] != r.code), SEED + r.code)
        te = np.flatnonzero((D["region"] == r.code) & (D["year"] >= TEST_YEARS[0]))
        if not len(te) or D["y"][te].sum() < 20:
            out[r.id] = {"skipped": "too few fire cells in the test years"}
            continue
        m, _ = fit(recipe, X[tr], D["y"][tr], SEED + r.code)
        p = m.predict_proba(X[te])[:, 1]
        out[r.id] = {"model": {k: v for k, v in metrics(D["y"][te], p, D["group"][te]).items() if k in ("pr_auc", "roc_auc", "capture10")},
                     "climatology": {k: v for k, v in metrics(D["y"][te], D["b1"][te], D["group"][te]).items() if k in ("pr_auc", "roc_auc", "capture10")}}
        print(f"   LORO {r.id:<13} PR-AUC {out[r.id]['model']['pr_auc']} vs clim {out[r.id]['climatology']['pr_auc']}", flush=True)
    return out


# ---------------------------------------------------------------- publish
def predict_next(model, regions: list, variant: str = "harm") -> dict:
    out = {}
    for r in regions:
        s = r.last_full + 1
        B = md.build(r, [s], variant)
        p = model.predict_proba(B["X"])[:, 1]
        dec = np.ceil(10 * (np.argsort(np.argsort(p, kind="stable"), kind="stable") + 1) / len(p)).astype(int)   # per-region decile 1–10
        out[r.id] = {"region": r.id, "name": r.name, "target_month": md.key(s), "features_through": md.key(r.last_full),
                     "fields": ["cell", "score", "decile", "climatology"],
                     "cells": [[c, round(float(sc), 4), int(d), round(float(b), 3)] for c, sc, d, b in zip(r.cells, p, dec, B["b1"])]}
    return out


def _np(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return round(float(o), 6)   # float32 → no rounding noise in the JSON
    raise TypeError(type(o).__name__)


def write_json(p: Path, obj, compact=False):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False, default=_np) if compact
                 else json.dumps(obj, indent=1, ensure_ascii=False, default=_np), encoding="utf-8")


def gate(ev: dict) -> dict:
    m, c = ev["pooled"]["model"], ev["pooled"]["climatology"]
    ok = m["pr_auc"] > c["pr_auc"] and m["capture10"] > c["capture10"]
    return {"passed": bool(ok), "rule": "publish only if the model beats climatology (b1) on pooled rolling-origin PR-AUC AND top-10% capture",
            "model_pr_auc": m["pr_auc"], "climatology_pr_auc": c["pr_auc"], "model_capture10": m["capture10"], "climatology_capture10": c["capture10"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    reps = 60 if a.quick else 300
    t_all = time.time()
    regions, D = load("harm")
    print(f"rows {len(D['y']):,} · positives {D['y'].mean():.3f} · regions {[r.id for r in regions]}", flush=True)
    best, sel = choose_recipe(D, list(RECIPES), TEST_YEARS[0] - 1)
    recipe = RECIPES[best]
    print(f"chosen recipe: {best}", flush=True)
    T = rolling_origin(D, recipe, TEST_YEARS, "harm")
    ev = summarize(T, regions, reps)
    loro = leave_one_region_out(D, recipe, regions)
    # harmonization ablation: identical model + folds, RAW history features
    _, DR = load("raw", regions)
    TR = rolling_origin(DR, recipe, TEST_YEARS, "raw ")
    evr = {"pooled": {"model": metrics(TR["y"], TR["model"], TR["group"])}}
    ab = {"harmonized": {k: ev["pooled"]["model"][k] for k in ("pr_auc", "roc_auc", "capture10", "capture20")},
          "raw": {k: evr["pooled"]["model"][k] for k in ("pr_auc", "roc_auc", "capture10", "capture20")}}
    ab["difference_harmonized_minus_raw"] = {k: round(ab["harmonized"][k] - ab["raw"][k], 4 if "auc" in k else 1) for k in ab["raw"]}
    g = gate(ev)
    # final model: all target years 2013–2025, for next month's map
    tr = subsample(np.arange(len(D["y"])), SEED)
    final, thr = fit(recipe, D["X"][tr], D["y"][tr], SEED)
    ASSETS.mkdir(parents=True, exist_ok=True)
    joblib.dump(final, ASSETS / "champion.joblib", compress=3)
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    prev = json.loads(VERSION_FILE.read_text(encoding="utf-8")) if VERSION_FILE.exists() else {"version": 0}
    version = int(prev.get("version", 0)) + 1
    card = model_card(regions, D, best, sel, recipe, ev, loro, ab, g, thr, version, now)
    write_json(API / "model_card.json", card)
    train_end = md.key(int(D["s"].max()))
    card["train_end"] = train_end
    write_json(API / "model_card.json", card)
    write_json(VERSION_FILE, {"version": version, "recipe": best, "trained_at": now, "data_end": card["data_end"], "train_end": train_end,
                              "pr_auc": ev["pooled"]["model"]["pr_auc"], "capture10": ev["pooled"]["model"]["capture10"],
                              "clim_pr_auc": ev["pooled"]["climatology"]["pr_auc"], "clim_capture10": ev["pooled"]["climatology"]["capture10"]})
    publish_maps(final, regions, g["passed"])
    append_history({"date": now, "data_end": card["data_end"], "trigger": "pipeline (11_model.py)", "version": version,
                    "champion": None, "challenger": {"recipe": best, "pr_auc": ev["pooled"]["model"]["pr_auc"], "capture10": ev["pooled"]["model"]["capture10"]},
                    "climatology": {"pr_auc": ev["pooled"]["climatology"]["pr_auc"], "capture10": ev["pooled"]["climatology"]["capture10"]},
                    "decision": "published (first model)" if g["passed"] else "not published (does not beat the seasonal baseline)"}, reset=True)
    print(json.dumps({"gate": g, "ablation": ab["difference_harmonized_minus_raw"]}, indent=1))
    print(f"done in {time.time() - t_all:.0f}s")


def publish_maps(model, regions: list, passed: bool) -> None:
    d = API / "likelihood"
    for f in d.glob("*.json") if d.exists() else []:
        f.unlink()
    if not passed:
        return
    for rid, doc in predict_next(model, regions).items():
        write_json(d / f"{rid}.json", doc, compact=True)


def append_history(row: dict, reset: bool = False) -> None:
    p = API / "model_history.json"
    h = {"runs": []} if reset or not p.exists() else json.loads(p.read_text(encoding="utf-8"))
    h["runs"].append(row)
    h["note"] = ("Automatic monthly retraining (GitHub Actions, 2nd of each month): a challenger is published only if it beats "
                 "BOTH the current model and the seasonal baseline on rolling-origin PR-AUC and top-10% capture.")
    write_json(p, h)


def model_card(regions, D, best, sel, recipe, ev, loro, ab, g, thr, version, now) -> dict:
    meta = json.loads((md.WEB / "meta.json").read_text(encoding="utf-8"))
    nxt = {r.id: md.key(r.last_full + 1) for r in regions}
    return {
        "name": "Fire Rings — fire likelihood next month (per H3 res-6 hexagon)", "version": version, "trained_at": now,
        "data_end": meta["data_end"], "next_month": sorted(set(nxt.values())), "features_through": md.key(regions[0].last_full),
        "what_it_is": "Where fire is more likely next month, from 25 years of harmonized history. A planning aid — not a forecast of individual fires, damage or causes.",
        "unit": "H3 res-6 cell (~36 km²) × month, all validated regions together (region is a feature)",
        "target": "the cell has ≥ 1 VIIRS fire-day (High detail record: S-NPP; NOAA-20 after S-NPP data ended) in month m+1",
        "training_years": list(TRAIN_YEARS), "regions": [r.id for r in regions],
        "rows": int(len(D["y"])), "positive_rate": round(float(D["y"].mean()), 4), "max_training_rows_per_fit": MAX_TRAIN,
        "features": {
            "clim_frac": "share of years 2001 → year before the target with ≥ 1 MODIS-equivalent fire-day in this cell, same calendar month (harmonized)",
            "clim_mean": "mean MODIS-equivalent fire-days in this cell, same calendar month, same years",
            "h_m, h_m1, h_m2": "MODIS-equivalent fire-days in this cell in months m, m−1, m−2",
            "ring1_last, ring2_last": "mean MODIS-equivalent fire-days of the ring-1 (6) and ring-2 (12) neighbours in month m",
            "ring1_clim, ring2_clim": "neighbours' clim_frac",
            "rain_anom, t2m_anom": "NASA POWER region rain and 2 m temperature in month m minus the same calendar month's median in all earlier years",
            "month": "target calendar month (categorical)", "region": "region (categorical)"},
        "harmonization": "cell value = raw primary-stream fire-days × frozen published ratio (q·Terra | MODIS | k·S-NPP | k·k′·NOAA-20)",
        "model_selection": {"rule": "logistic regression vs gradient boosting (sklearn HistGradientBoosting); chosen by validation PR-AUC on training years only (train targets 2013–2016, validate 2017)",
                            "validation_pr_auc": sel, "chosen": best, "recipe": recipe},
        "baselines": {"climatology": "b1: the cell's harmonized share of past years with fire in that calendar month",
                      "persistence": "b2: fire in the cell in month m"},
        "evaluation": {"primary": "rolling origin: for each test year 2018–2025 train only on earlier target years, predict that year",
                       "secondary": "leave-one-region-out: train on the other regions, test on the held-out one (2018–2025), region feature removed",
                       "threshold": "precision/recall/F1 at the threshold that maximised F1 on each fold's training data (never test data)",
                       "capture": "rank the cells of each region and month by score; share of next month's fire cells inside the top 10 % (20 %)",
                       "intervals": "90 % year-bootstrap intervals (test years resampled with replacement)",
                       **ev},
        "leave_one_region_out": loro,
        "ablation": {"what": "same model, same folds, history features from RAW counts (MODIS ≤ 2011 mixed with unconverted VIIRS ≥ 2012) instead of harmonized", **ab},
        "gate": g, "final_threshold": round(thr, 4),
        "limitations": [
            "Says where fire is more likely, not when, how big, or why; satellites detect heat, not causes.",
            "A planning aid, not an emergency or early-warning service.",
            "Target is ≥ 1 VIIRS fire-day: small fires count the same as large ones.",
            "Cells are the hexagons with at least one detection in the record; never-burning land is not scored.",
            "Recent months are provisional (near-real-time data); NOAA-20 replaces S-NPP after Oct 2026.",
            "Punjab Oct–Nov: satellites pass at ~13:30 while burning has reportedly shifted later, so fire there may be undercounted.",
            "Trained on 7 regions; other places need their own validation first."],
        "licence": "CC BY 4.0 (outputs) · code MIT", "code": "pipeline/11_model.py, pipeline/lib/model_data.py",
    }


if __name__ == "__main__":
    main()
