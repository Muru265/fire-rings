# Fire Rings — PROGRESS

Resume any session with: **"Continue from PROGRESS.md"** (read this file + CLAUDE.md first).
Status keys: `todo` · `doing` · `done` · `blocked` · ⏸ = needs user

## Phase 0 — Foundations
| Task | Status | Notes |
|---|---|---|
| 0.1 Toolchain check | done | Python 3.11.0, Node v20.20.2, npm 10.8.2, git 2.50.1 |
| 0.2 ⏸ GitHub username → git init, pull `fire-rings`, verify clean staging | blocked | waiting for GitHub username |
| 0.3 .venv + pipeline/requirements.txt, verify imports | todo | |
| 0.4 Inspect raw CSVs with DuckDB → docs/data_inventory.md | todo | |
| 0.5 pipeline/config.yaml (regions + clip boxes) | todo | |
| 0.6 Scaffold web/ (Vite+React+TS+Tailwind v4, tokens, AppShell, routes) | todo | |
| 0.7 ⏸ Push + Vercel import steps; user confirms live URL | todo | |

## Phase 1 — Data in
| Task | Status | Notes |
|---|---|---|
| 1.1 02_unify.py + tests | todo | |
| 1.2 03_mask.py + docs/mask_check.md | todo | |
| 1.3 docs/pipeline_report.md | todo | |

## Phase 2 — Raw calendar on screen
| 2.1 04_cube.py | todo | |
|---|---|---|
| 2.2 interim 08_export.py (raw) | todo | |
| 2.3 FireRings + GridCalendar + Legend on real JSON | todo | |
| 2.4 Playwright screenshots + review | todo | |

## Phase 3 — Harmonization + validation
| 3.1 05_calibrate.py | todo | |
|---|---|---|
| 3.2 06_validate.py | todo | |
| 3.3 07_stats.py | todo | |
| 3.4 full 08_export.py + run_all.py | todo | |
| 3.5 ⏸ validation review with user | todo | |

## Phase 4 — Region dashboard · Phase 5 — Proof + Data · Phase 6 — Ask AI · Phase 7 — Wow + polish (v0.9) · Phase 8 — Ship (v1.0)
todo

## Log
- 2026-11-09 — Read CLAUDE.md + master plan. Toolchain checked (0.1). Note: Python 3.11 installed vs 3.12 in CLAUDE.md — all pipeline libs support 3.11, so proceeding with 3.11 unless told otherwise. Waiting on GitHub username (0.2).

## Decisions / open questions
- Python 3.11 used instead of 3.12 (no functional impact expected).
