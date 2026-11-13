"""Shared helpers for the agent tools: paths, region footprints, month keys, summary caches."""
from __future__ import annotations

import calendar
import datetime as dt
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "public" / "data" / "v1"
ASSETS = ROOT / "pipeline" / "assets" / "agent"          # committed: small per region-month summaries only
TMP = ROOT / "data" / "agent_tmp"                         # gitignored: downloaded raw files, deleted after summarising

# Polar overpass windows in LOCAL SOLAR time (hours, ±1.5 h around the nominal crossing) — used by the geostationary tools
POLAR_WINDOWS = [(9.0, 12.0), (12.0, 15.0), (21.0, 24.0), (0.0, 3.0)]   # Terra ~10:30/22:30, Aqua + VIIRS ~13:30/01:30


def in_polar_window(h: float) -> bool:
    return any(a <= h < b for a, b in POLAR_WINDOWS)


def mkey(y: int, m: int) -> str:
    return f"{y:04d}-{m:02d}"


def parse_key(k: str) -> tuple[int, int]:
    return int(k[:4]), int(k[5:7])


def month_range(y: int, m: int) -> tuple[dt.date, dt.date]:
    return dt.date(y, m, 1), dt.date(y, m, calendar.monthrange(y, m)[1])


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


@lru_cache(maxsize=None)
def footprint(region: str) -> dict:
    """Region footprint + static mask exactly as the record's live layer: H3 cells (res 6, Punjab res 7) and the
    known-static H3 res-9 cells (web/public/data/v1/live/{id}.json)."""
    d = json.loads((WEB / "live" / f"{region}.json").read_text(encoding="utf-8"))
    return {"bbox": d["bbox"], "res": int(d["footprint_res"]), "cells": frozenset(d["footprint"]), "static": frozenset(d["static_r9"])}


def load_cache(name: str) -> dict:
    f = ASSETS / f"{name}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def save_cache(name: str, obj: dict) -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")), encoding="utf-8")
