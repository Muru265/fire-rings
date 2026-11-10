"""Freeze the published Long-term (harmonized) values as a test fixture.

pipeline/tests/fixtures/longterm_snapshot.json = {region: {"YYYY-MM": [H, lo, hi]}} from web/public/data/v1/regions.
test_longterm_unchanged.py fails if any value changes. Re-snapshot ONLY for a documented fix (note it in PROGRESS.md).
Usage: python pipeline/tools/snapshot_longterm.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web" / "public" / "data" / "v1" / "regions"
OUT = ROOT / "pipeline" / "tests" / "fixtures" / "longterm_snapshot.json"

snap = {}
for f in sorted(WEB.glob("*.json")):
    d = json.loads(f.read_text(encoding="utf-8"))
    snap[d["id"]] = {f"{m['y']:04d}-{m['m']:02d}": [m["H"], m["lo"], m["hi"]] for m in d["months"]}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(snap, separators=(",", ":")), encoding="utf-8")
print("wrote", OUT, {k: len(v) for k, v in snap.items()})
