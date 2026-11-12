"""Run the whole Fire Rings pipeline from raw CSVs to web/public/data/v1/.

Usage: python pipeline/run_all.py [--from STEP] [--skip-tests]
Steps: 02_unify 03_mask report 04_cube 05_calibrate 06_validate 07_stats 07b_detail 08_export 08b_demo_hotspots 09_watch 10_api 11_model
(world-archive regions: python pipeline/tools/clip_world.py bbox && ... clip, before 02_unify; monthly job: pipeline/retrain.py)  (network tools, run by hand: tools/fetch_power.py, tools/fetch_reunion.py + tools/reunion_series.py)
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

PIPE = Path(__file__).resolve().parent
STEPS = [
    ("02_unify", [PIPE / "02_unify.py"]),
    ("03_mask", [PIPE / "03_mask.py"]),
    ("report", [PIPE / "tools" / "pipeline_report.py"]),
    ("04_cube", [PIPE / "04_cube.py"]),
    ("05_calibrate", [PIPE / "05_calibrate.py"]),
    ("06_validate", [PIPE / "06_validate.py"]),
    ("snpp_check", [PIPE / "tools" / "snpp_endcheck.py"]),
    ("timing_check", [PIPE / "tools" / "punjab_timing.py"]),
    ("07_stats", [PIPE / "07_stats.py"]),
    ("07b_detail", [PIPE / "07b_detail.py"]),
    ("08_export", [PIPE / "08_export.py"]),
    ("08b_demo_hotspots", [PIPE / "08b_demo_hotspots.py"]),
    ("09_watch", [PIPE / "09_watch.py"]),
    ("10_api", [PIPE / "10_api.py"]),
    ("11_model", [PIPE / "11_model.py"]),   # Round 5B prediction model (deterministic; ~10 min)
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", default=STEPS[0][0], choices=[s for s, _ in STEPS])
    ap.add_argument("--skip-tests", action="store_true")
    a = ap.parse_args()
    names = [s for s, _ in STEPS]
    t_all = time.time()
    for name, cmd in STEPS[names.index(a.start):]:
        t0 = time.time()
        print(f"\n=== {name} ===", flush=True)
        r = subprocess.run([sys.executable, *map(str, cmd)], cwd=PIPE.parent)
        if r.returncode != 0:
            sys.exit(f"step {name} failed with exit code {r.returncode}")
        print(f"--- {name} done in {time.time() - t0:.0f}s", flush=True)
    if not a.skip_tests:
        print("\n=== pytest ===", flush=True)
        r = subprocess.run([sys.executable, "-m", "pytest", "pipeline/tests", "-q"], cwd=PIPE.parent)
        if r.returncode != 0:
            sys.exit("tests failed")
    print(f"\nPipeline complete in {time.time() - t_all:.0f}s")


if __name__ == "__main__":
    main()
