# Handoff — CMM-44 SP-H (Auftrag-Lifecycle) ABGESCHLOSSEN

**Datum:** 2026-05-22
**Sub-Projekt:** CMM-44 SP-H — 18 Auftrag-Lifecycle-Spalten `faelle` → `auftraege` (1:N pro Claim)
**Status:** **KOMPLETT.** PR1 #1520 + PR2 #1537 auf staging+main; PR3 (Catch-up) appliziert; Smoke 0 SP-H-Regression.

## Was SP-H war
Die 18 Spalten, die semantisch zum *Auftrag* (nicht zum Claim global) gehoeren, von `faelle` additiv auf die `auftraege`-Sub-Table verschieben. „Aktueller Auftrag" = `ORDER BY reihenfolge DESC LIMIT 1`. Cluster: Filmcheck(3), Storno(3), Besichtigung-Start(1), SV-Briefing(6), TechStellungnahme(5). **Rein additiv** — kein per-Spalten-DROP; `faelle` behaelt die Spalten bis Phase 6.

## Geliefert
| PR | Inhalt | Stand |
|---|---|---|
| **PR1 #1520** | 18 ADD COLUMN auf auftraege + UPDATE-Backfill + 3 View-Repoints (LATERAL auf aktuellen Auftrag) | gemergt staging+main |
| **PR2 #1537** | Reader/Writer-Sweep (28 Sites) — code-only, kein Schema-Change | gemergt staging+main |
| **PR3 (Migration `20260522113102`)** | idempotenter COALESCE-Catch-up-Backfill auftraege<-faelle | appliziert + repair-recorded; Datei in dieser Finishing-PR |

## PR2-Architektur (das Wichtige)
- **Reads:** Pattern A (nur SP-H-Cols → dedizierte `auftraege`-Query mit `reihenfolge DESC`); Pattern B (gemischt → nested Embed `claims:claim_id(auftraege(<cols>))` mit Array-Normalisierung auf beiden Ebenen). Filter/Count-Praedikate (reissue-abrechnung storniert_am, KpiCards filmcheck_ok, abrechnung TS-Sektion) → Quelle auf `v_faelle_mit_aktuellem_termin` umgestellt (View exponiert die SP-H-Cols flach aus dem aktuellen Auftrag).
- **Writes:** 12 direkte Pattern-C-Sites (SP-H-Wert aus faelle-Write entfernt, separat auf aktuellen Auftrag, skip+warn wenn keiner). Die **2 zentralen Writer** (`state-machine.ts` transitionFallStatus, `lexdrive/process-event.ts`) routen Status-Writes durch `splitOrKeepFaelleUpdate` — neuer **`AUFTRAEGE_OWNED_COLUMNS`-Set + `peelAuftraegeColumns()`** in `src/lib/faelle/claim-duplicate-columns.ts` peelt SP-H-Cols VOR dem faelle/claims-Split heraus.
- **Sonderfaelle:** `besichtigung_gestartet_am` — SSoT ist `gutachter_termine` (alle Reader lesen dort), toter faelle-Dual-Write **ersatzlos entfernt** (nicht auf auftraege gespiegelt). `gutachter/abrechnung` TS-Sektion — **View-Switch (Aaron-Entscheidung 2026-05-22)**: behebt latenten Bug (Filter `IS NOT NULL` lief auf NOT-NULL-Default ins Leere → listete alle Faelle); listet jetzt nur Faelle mit TS-tragendem Auftrag.

## Verifikation
- `npm run build` grün (225/225 pages, exit 0), `tsc --noEmit` clean.
- Re-Grep (`scripts/cmm44-sph-grep.mjs`): 0 echte unrerouted faelle-SP-H-Reads/Writes (31 Resthits = Writes/Kommentare/Type-Echoes/View-Reads).
- 2-Stufen-Review (Writer + Reader, je Spec+Quality) APPROVED.
- 5-Portal-Smoke (`scripts/smoke-cmm44-sph.mjs`, `docs/22.05.2026/cmm44-sph-smoke-pr2.md`): **0 SP-H-Regression**. SV-Abrechnung-TS-View-Switch + Fallakte-SV-Briefing/TS-Blocker (alle internen Portale) rendern korrekt. HARD-Flags alle non-SP-H (pre-existing #418, Redirect-#310, transienter ChunkLoadError).
- PR3-Verify: `sph_neu_auf_auftraege=18` (additiv, kein Schema-Change).

## Lessons (SP-H-spezifisch)
1. **Zentrale Writer via Helper** — der Plan sah nur direkte `from('faelle').update`-Sites vor; tatsaechlich routen state-machine + process-event durch `splitOrKeepFaelleUpdate`. Bei künftigen SPs immer die Helper-Caller (`grep splitOrKeepFaelleUpdate`) prüfen, nicht nur direkte from('faelle')-Writes.
2. **1:N-Cardinality** — Reads/Writes brauchen „aktueller Auftrag" via `reihenfolge DESC LIMIT 1`. Nested-Embed garantiert KEINE Order (PostgREST) → pre-launch ≤1 Auftrag ok, aber SV/Kunde-sichtbare Reads deterministisch (Pattern A) machen. **Follow-up:** 11 Pattern-B-Embeds vor Multi-Auftrag-Launch deterministisch heben (Inventory §10).
3. **Filter auf gewanderter Spalte** — Embed kann nicht filtern; Quelle auf den repointed View umstellen ist der saubere Weg (Row-Count-Parität vorher live verifizieren!). Deckte einen latenten Filter-Bug auf (NOT-NULL-Default).
4. **Build-Env** — root node_modules war unvollständig (`require-in-the-middle` fehlte). Junction zu root erbt die Lücke → eigenes `npm install` im Worktree. NIE `npm install` mit aktiver node_modules-Junction.

## Reststrecke CMM-44 (nach SP-H)
SP-C (läuft, 2 Sessions) · SP-E (Fahrzeug, braucht vehicle_id-Backfill) · SP-F (Vorschaeden, braucht Cardentity-Audit) · SP-I (Kanzleifall-LC, 56 Spalten) · SP-J (Abrechnung, 12) · SP-K (Reader-Sweep pro Portal) · SP-L (Sync-Trigger-Drop + `DROP TABLE faelle`). Reihenfolge: Phase-1-Doc §4.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
