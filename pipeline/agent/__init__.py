"""Round 7 agentic check ("rules decide, AI explains"): verification tools + deterministic verdict rules.

Tools (each returns {"signal": ..., numbers..., "source": ...}):
  timing.py        A  check_detection_times  — FIRMS acq_time/daynight in the record's own data
  burned_area.py   B  check_burned_area      — NASA MCD64A1 C6.1 monthly burned area (Earthdata login)
  goes.py          C1 check_geostationary    — NOAA GOES-R ABI L2 Fire Detection (AWS Open Data, anonymous)
  meteosat.py      C2 check_geostationary    — EUMETSAT LSA SAF FRP-PIXEL (LSA-502; login)
  verdict.py       deterministic rule table (no AI)
Orchestrated by pipeline/12_agent.py. Only per region-month summaries are stored (pipeline/assets/agent/); raw files never.
"""
