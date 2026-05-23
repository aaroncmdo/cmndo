# CMM-44 SP-I4 (Eskalation 12 Spalten → kanzlei_faelle) Plan

> Slice 4 des SP-I-Clusters. Der **sauberste** Slice: 12 Spalten, **alle cov=0**, ein einziger Writer (auto via Peel), kein faelle-direkter Reader. Recipe-Quelle: `docs/23.05.2026/handoff-cmm44-sp-i-completion.md`.

**Goal:** 12 Eskalations-Lifecycle-Spalten rein additiv von `faelle` auf `kanzlei_faelle` (1:1).

**Spalten (12):** `eskalation_tag_{14,21,28}_{am,ergebnis,ergebnis_am,ergebnis_von}` — `am`/`ergebnis_am`=timestamptz, `ergebnis`=text, `ergebnis_von`=uuid (FK→profiles auf faelle; auf kanzlei_faelle als plain uuid). Alle cov=0.

## Drift-Check (Live 2026-05-23) — done
- Alle 12 nur auf `faelle`, kein kanzlei_faelle-Drift. cov=0 → **kein Backfill**.
- 3 Views exponieren sie: `v_faelle_mit_aktuellem_termin` (alle 12), `faelle_kunde_view` + `faelle_sv_view` (je 6: `ergebnis`+`ergebnis_am` für 14/21/28). **Alle 3 haben den kf-Join schon** (SP-I1/I2/I3) → reine f→kf-Swaps.

## PR1 — Schema (Migration `20260523191910`) — done
12 ADD COLUMN (Typen exakt von faelle) + 3 View-Repoints (generiert via `scripts/_spi4-gen-views.mjs`, Wortgrenzen-Regex gegen Substring-Falle `ergebnis ⊂ ergebnis_am/_von`). Live appliziert + `migration repair`. Types regeneriert (Drift: 3 faelle-FK-Relationships vom Generator weggelassen — FKs existieren live weiter, compile-time-only, kein Consumer → Types=DB, nicht restored).

## PR2 — Code-Sweep (minimal) — done
- **Writer:** `KANZLEI_FAELLE_COLS` += 12 → `process-event.ts` (`vs_eskalation_kontakt_ergebnis`-Event baut die dynamischen `eskalation_tag_${k}_*`-Keys in `computeFieldUpdates`) wird automatisch via Peel-Kaskade (`peelKanzleiFaelleColumns` + `upsertKanzleiFall`) auf kanzlei_faelle umgebogen. **Einziger Writer.** (`_am` hat keinen Writer = dormant.)
- **Reader:** `subphase-resolver.ts` liest `fall.eskalation_tag_*` in-memory aus dem (View-gesourcten) fall-Objekt → **Pattern E**, kein Change. Kein faelle-direkter SELECT-Reader (Grep: nur process-event + subphase-resolver + types referenzieren `eskalation_tag_`).

## Verifikation
Voller `next build` grün (8GB-Heap). Smoke (`scripts/smoke-cmm44-spi4.mjs`) Post-Merge. **Rein additiv** — faelle-Spalten sterben in Phase 6. Offen in SP-I: SP-I5 Rüge (6), SP-I6 `kanzlei_id` (1, TBD).
