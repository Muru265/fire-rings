"""Shared helpers: config, paths, DuckDB connection (with the H3 community extension)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import duckdb
import yaml

ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def config() -> dict:
    return yaml.safe_load((ROOT / "pipeline" / "config.yaml").read_text(encoding="utf-8"))


def path(key: str) -> Path:
    p = ROOT / config()["paths"][key]
    p.mkdir(parents=True, exist_ok=True)
    return p


def connect(threads: int = 8) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute(f"SET threads TO {threads}")
    con.execute("INSTALL h3 FROM community")
    con.execute("LOAD h3")
    return con


def write_json(p: Path, obj, compact: bool = False) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    text = (json.dumps(obj, separators=(",", ":"), default=str, ensure_ascii=False) if compact
            else json.dumps(obj, indent=1, default=str, ensure_ascii=False))
    p.write_text(text, encoding="utf-8")


def read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def sql_path(p: Path) -> str:
    return p.as_posix().replace("'", "''")
