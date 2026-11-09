# Fire Rings — PROGRESS

Resume any session with: **"Continue from PROGRESS.md"** (read this file + CLAUDE.md first).
Status keys: `todo` · `doing` · `done` · `blocked` · ⏸ = needs user

## Phase 0 — Foundations
| Task | Status | Notes |
|---|---|---|
| 0.1 Toolchain check | done | Python 3.11.0, Node v20.20.2, npm 10.8.2, git 2.50.1 |
| 0.2 ⏸ GitHub username → git init, pull `fire-rings`, verify clean staging | done | Muru265/fire-rings, main; pulled README+LICENSE; staged set verified (4 files, no .env/data/zips); claude.md→CLAUDE.md |
| 0.3 .venv + pipeline/requirements.txt, verify imports | done | pinned versions; all imports OK; h3 v4 latlng_to_cell works |
| 0.4 Inspect raw CSVs with DuckDB → docs/data_inventory.md | done | 32 files via pipeline/00_inventory.py; 11 flags recorded (no NRT type col, no archive/NRT overlap, Rodrigues, S-NPP Jul-2022 gap…) |
| 0.5 pipeline/config.yaml (regions + clip boxes) | done | YAML loads; 4 regions; thresholds/windows from CLAUDE.md |
| 0.6 Scaffold web/ (Vite+React+TS+Tailwind v4, tokens, AppShell, routes) | done | Vite 8 / React 19 / TS 7 / Tailwind 4.3; build OK (JS 84 kB gz, CSS 7 kB gz); oxlint clean; preview: /, /r/punjab, /proof, /data, /ask all 200; all §4.2 tokens present in built CSS; vercel.json SPA rewrite |
| 0.7 ⏸ Push + Vercel import steps; user confirms live URL | blocked | push 403: Git Credential Manager is signed in as Murugun-Sharma-Roma-Rishi, not Muru265. 6 local commits waiting. |

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

- 2026-11-09 — 0.2–0.5 done (see table). Coverage plan: per-stream operating-days proxy from the Australia file (inventory flag 8).

## Decisions / open questions
- Python 3.11 used instead of 3.12 (no functional impact expected).
