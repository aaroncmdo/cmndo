# CMM-44 SP-I6 (kanzlei_id → kanzlei_faelle) Plan — letzter SP-I-Slice

> Slice 6 (letzter) des SP-I-Clusters. 1 Spalte (`kanzlei_id`), aber **nicht trivial** trotz cov=0: Billing-Filter + Writer-Routing auf dem Lead→Claim-Pfad. Verdikt (Aaron 2026-05-23): kanzlei_faelle (Hypothese „Fall→Kanzlei fürs Kanzleiportal" bestätigt).

**Goal:** `faelle.kanzlei_id` (Fall→Kanzlei-Zuordnung) rein additiv auf `kanzlei_faelle` (1:1).

## Verdikt-Check (Live 2026-05-23)
- `kanzleien`-Tabelle existiert (Law-Firms: id/name/email/ansprechpartner). `faelle.kanzlei_id` zeigt darauf (FK **unenforced**), cov=0.
- `kanzlei_id` gibt's auf `faelle` + `kanzlei_abrechnungen` (Billing-Record) — **NICHT auf claims/kanzlei_faelle** → kein Duplikat.
- Genutzt von: `erstelle-abrechnung` (filtert faelle per kanzlei_id = „alle Fälle einer Kanzlei" → Monats-Abrechnung), `kanzlei-mahnungen`, `get-kunde-faelle`. Kanzleiportal /mandate+/kanban scopen NICHT per kanzlei_id (intern/Status). → **Heimat = kanzlei_faelle** (die Kanzleifall-Row trägt die Kanzlei).

## PR1 — Schema (Migration `20260523202538`) — done
1 ADD COLUMN (kanzlei_id uuid, FK bewusst nicht gesetzt wie faelle) + 1 View-Repoint (`v_faelle_mit_aktuellem_termin`: f.kanzlei_id → kf.kanzlei_id, via `scripts/_spi6-gen-views.mjs`). Live appliziert + repair. Types regeneriert. **Kein Backfill** (cov=0).

## PR2 — Code-Sweep — done
- **Writer:** `KANZLEI_FAELLE_COLS` += kanzlei_id. `lead-fall-mapping.fallComputedFields` setzt kanzlei_id NICHT mehr im faelle-Insert; `convert-lead-to-claim` routet `entityFks.kanzleiId` (LexDrive-Pfad A) nach Claim-Creation via `upsertKanzleiFall` auf kanzlei_faelle (nur bei aufgelöster Kanzlei, cov=0 sonst).
- **Reader:** `kanzlei-mahnungen` + `get-kunde-faelle` (Detail) → `kanzlei_faelle(kanzlei_id)`-Embed (Array-norm). `erstelle-abrechnung` Billing-Filter: `.eq('kanzlei_id')` ging nicht auf dem Embed + `fall_nr` fehlt in der View → `kanzlei_faelle(kanzlei_id)`-Embed + **clientseitiger** Filter (`kanzlei_provision_status='berechtigt'` bleibt Server-Filter, narrowt vor). View-Reader (v_faelle) = Pattern E.
- `erstelle-abrechnung:82` `.eq('kanzlei_id')` bleibt — das ist auf `kanzlei_abrechnungen` (legit, nicht faelle).

## Verifikation
Voller `next build` grün (8GB). Re-Grep: 0 bare faelle-kanzlei_id-Reads/Writes. vitest: 1 pre-existing Failure (`kunde_email`, SP-A-stale-Test, NICHT SP-I6) — Baseline-bestätigt, keine neue Regression. **Rein additiv** — faelle stirbt Phase 6. **Damit ist SP-I komplett (48/48 Spalten).**
