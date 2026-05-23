# LLM-Visibility-Sprint — Repo-Mirror

Dieser Ordner ist der **committete Repo-Mirror** der LLM-Visibility-Sprint-Planung.
Die strategischen Master-Docs leben in `marketing-strategy/` (gitignored, `.gitignore`
Zeile 119) — dieser Mirror macht die sprint-relevanten Teile fuer Claude Code, CI und
Mitentwickler im Repo sichtbar (Stream 0, Doc 32).

## Was hier liegt

| File | Quelle (gitignored) | Inhalt |
|---|---|---|
| `EXECUTION-PLAN.md` | Doc 31 v2 | 90-Tage-Master-Execution-Plan (4 Sprints, ~35 Streams, Gates G0–G8) |
| `BRAND-IDENTITY-SOT.md` | Doc 30 v1.0 | Brand-Identity-SOT (D1–D12, 56 Faktensaetze, Bios, Boilerplates, Tone-of-Voice, Verbots-Vokabular) |
| `streams/stream-A..J.md` | Doc 25/26/29/30 | 1-Pager pro Sprint-1-Stream mit Querverweis, DoD, Validation |

## Code-Outputs aus Stream 0 (committed in `src/`, nicht hier)

- `src/lib/seo/brand-constants.ts` — D1–D12 + Bios + Boilerplates (Doc 30 §3/§6/§7)
- `src/lib/seo/brand-fakten-library.ts` — 56 Faktensaetze (Doc 30 §8)
- `src/lib/seo/conversion-handoff.ts` — Hand-Off-Saetze + PotentialAction-Schema (Doc 30 §13)
- `src/data/citation-box-mapping.ts` — Skelett, Aaron befuellt in Sprint 1 Stream D
- `src/data/faq-stems-mapping.ts` — Skelett, Sprint 1 Stream F
- `src/data/vr-bait-mapping.ts` — Skelett, Sprint 1 Stream G/H

## Sync-Regel (Doc 31 v2 §0.1 R12 + Doc 30 §9.2)

`marketing-strategy/` ist die Single-Source-of-Truth. Bei Doc-30/31-Updates: **zuerst dort**,
dann diesen Mirror **und** die `src/`-Constants synchronisieren. Kein Direct-Edit der
TS-Constants ohne korrespondierendes Doc-30-Update — sonst driftet die Faktenpraegung.

## Noch nicht hier (bewusst, MVP-Scope Stream 0 — Doc 32 §7)

- Sprint-2/3/4-Stream-Briefs (Konversions-Blueprint, Twin-Brands, Coup-Release, Cobrand)
- Mirror von Doc 26 (8-Stream-Plan) + Doc 27 (Coup-Spec)

Folgen, wenn Sprint 1 abgeschlossen ist.
