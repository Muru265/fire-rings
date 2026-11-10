"""Long-term (harmonized) numbers must not change by accident (QA work, Nov 10).

Compares web/public/data/v1/regions/*.json months[].H/lo/hi with the frozen snapshot. A deliberate, documented fix
re-snapshots with `python pipeline/tools/snapshot_longterm.py` and records before → after in PROGRESS.md.
"""
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "pipeline" / "tests" / "fixtures" / "longterm_snapshot.json"
WEB = ROOT / "web" / "public" / "data" / "v1" / "regions"


@pytest.mark.skipif(not SNAP.exists(), reason="no snapshot")
def test_longterm_values_identical_to_snapshot():
    snap = json.loads(SNAP.read_text(encoding="utf-8"))
    for region, months in snap.items():
        d = json.loads((WEB / f"{region}.json").read_text(encoding="utf-8"))
        now = {f"{m['y']:04d}-{m['m']:02d}": [m["H"], m["lo"], m["hi"]] for m in d["months"]}
        diff = [(k, v, now.get(k)) for k, v in months.items() if now.get(k) != v]
        assert not diff, f"{region}: {len(diff)} Long-term values changed, e.g. {diff[:3]}"
