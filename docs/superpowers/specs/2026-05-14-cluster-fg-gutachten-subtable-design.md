# Cluster F+G — claims-OCR/Wert-Felder in `gutachten` Sub-Table konsolidieren

**Datum:** 2026-05-14
**Branch:** `kitta/aar-cluster-fg-gutachten`
**Aus:** CLAIMS-VERTIKAL-AUDIT.md (Cluster F + G)
**Vorgänger:** Stufe-0-Final (PR #1155, gemerged)
**Status:** Design approved, Implementation pending

## Kontext

Das Vertikal-Audit hat 38 Spalten auf `claims` identifiziert, die thematisch ein Sub-Asset „Gutachten" beschreiben und logisch zur bereits existierenden `gutachten`-Tabelle gehören:

- **Cluster F** — 30 OCR-Output-Felder (`gutachten_*` Prefix): was Claude aus dem Gutachten-PDF extrahiert hat — FIN, Lohnsätze, Materialkosten, SV-Honorar, Kalkulationssystem, Mietwagen-Tagessatz, Karosserie-Zustand, etc., plus die Pipeline-Meta `gutachten_ocr_processed_at/_raw/_error/_manuell_ueberschrieben` und `gutachten_datum`
- **Cluster G** — 8 Wert-Felder ohne `gutachten_`-Prefix: `reparaturkosten_netto/_brutto`, `minderwert`, `restwert`, `wiederbeschaffungswert`, `wiederbeschaffungsdauer_tage`, `nutzungsausfall_tage`, `totalschaden`

Die `gutachten`-Tabelle existiert seit AAR-818 (April 2026) mit ~40+ Lifecycle-Spalten (status/auftragsnummer/besichtigt_am/bericht_pdf_url + OCR-Pipeline-Meta wie `ocr_status/_engine/_started_at/_finished_at/_run_id/_confidence/_felder_quelle_jsonb/_editable_for_sv`), aber **0 Rows** — die Migration wurde halb fertiggestellt: Lifecycle-Wrapper ja, Daten-Felder nein. Das hier zieht das durch.

## Entscheidungen

- **Multiplicity: 1:1** — eine `gutachten`-Row pro Claim. Nachbesichtigungen leben weiter in den separaten `nachbesichtigung_*`-Spalten auf `claims`/`faelle`.
- **Strategie: Phased mit View, 2 PRs** — kein Big-Bang über 25 Reader-Files in einem PR, kein 3-Phasen-Helper-Detour. View `v_gutachten_werte` als JOIN-Layer, Dual-Write in der Übergangsphase.

## PR-1 — Schema + View + Dual-Write

### Migration A (`supabase/migrations/<ts>_aar_gutachten_data_columns.sql`)

1. **`ALTER TABLE gutachten ADD COLUMN IF NOT EXISTS`** für alle 38 Spalten mit identischen Typen + CHECK-Constraints wie heute auf claims:
   - 30 Cluster-F-Spalten (siehe `20260502001441_claims_gutachten_ocr.sql` + `20260502104809_claims_gutachten_ocr_extended.sql` als Quelle)
   - 8 Cluster-G-Spalten (siehe `20260502001441` Zeile 7-14)
   - 3 CHECK-Constraints kopieren: `karosseriezustand_check`, `kalkulationssystem_check`, `kraftstoff_check`
2. **Backfill für 1:1-Garantie**: für jeden Claim mit `gutachten_ocr_processed_at IS NOT NULL` AND `faelle.sv_id IS NOT NULL` AND ohne bestehende gutachten-Row INSERT. Form: `INSERT INTO gutachten (claim_id, sv_id, status, <38 Felder>) SELECT c.id, f.sv_id, 'final', c.<38 Felder> FROM claims c JOIN faelle f ON f.claim_id = c.id WHERE c.gutachten_ocr_processed_at IS NOT NULL AND f.sv_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gutachten g WHERE g.claim_id = c.id)`. Claims ohne SV oder ohne OCR bekommen keinen Backfill — die View liefert dann `COALESCE(g.<spalte>, c.<spalte>) = c.<spalte>` (Übergangsphase).
3. **View `v_gutachten_werte`** mit `WITH (security_invoker = true)` als `claims LEFT JOIN gutachten ON g.claim_id = c.id` — exposed `claim_id` + alle 38 Werte. In Übergangsphase mit `COALESCE(g.spalte, c.spalte)` damit Reader die View sofort nutzen können, auch wenn die OCR-Pipeline gerade nur eine der beiden Tabellen geschrieben hat.

### Atomicity: Dual-Write-Helper-Function

Postgres-Function `apply_gutachten_ocr(p_claim_id uuid, p_values jsonb)`:

- Eine Transaction
- `UPDATE claims SET <38 Felder> WHERE id = p_claim_id` (alte Schreibrichtung)
- `INSERT INTO gutachten (claim_id, sv_id, status, <38 Felder>) VALUES (...) ON CONFLICT (claim_id) DO UPDATE SET <38 Felder>` (neue Schreibrichtung)
- `SECURITY DEFINER`, `search_path = public, pg_temp`
- UNIQUE-Constraint auf `gutachten.claim_id` muss vorher hinzugefügt werden (heute hat nur Index, kein UNIQUE) — `ALTER TABLE gutachten ADD CONSTRAINT gutachten_claim_id_unique UNIQUE (claim_id)` als Teil der Migration

OCR-Writer (3 Stellen) rufen `apply_gutachten_ocr` über Supabase-RPC statt direkten `.from('claims').update()`:

- `src/lib/ai/gutachten-ocr.ts:179/194/232/256/274` — die zentrale Pipeline-Logik
- `src/app/faelle/[id]/_actions/gutachten-ocr.ts:106` — manuelle Admin-Edits aus GutachtenOcrCard

### Type-Regenerate

`npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts` nach Migration-Push.

### Verification

- `tsc --noEmit` exit 0
- `npm run build` grün
- Manueller Smoke: OCR-Test-Claim verarbeiten → `SELECT * FROM v_gutachten_werte WHERE claim_id = '<id>'` zeigt Werte; `SELECT reparaturkosten_brutto FROM claims WHERE id = '<id>'` UND `SELECT reparaturkosten_brutto FROM gutachten WHERE claim_id = '<id>'` zeigen denselben Wert (Dual-Write-Konsistenz)
- Smoke: Admin-Fallakte öffnen + Screenshot (Memory `feedback_smoke_screenshot_pflicht`) — keine Crashes, GutachtenOcrCard zeigt Werte normal

## PR-2 — Reader-Migration + Drop

### Reader auf View umstellen (25 Files in 5 Sections)

Granular review im PR-Body, ein Commit pro Portal:

| Portal | Files | Anzahl |
|---|---|---:|
| Admin | `src/app/faelle/[id]/page.tsx`, `_stammdaten/Sections.tsx`, `_tabs/UebersichtTab.tsx`, `components/admin/fallakte/GutachtenOcrCard.tsx`, `components/fall/StammdatenDetail.tsx`, `components/admin/fallakte/mietwagen/MietwagenEditCard.tsx` | 6 |
| SV | `gutachter/GutachterShell.tsx`, `gutachter/fall/[id]/FallDetailClient.tsx`, `gutachter/fall/[id]/_components/GutachtenCard.tsx`, `gutachter/fall/[id]/page.tsx`, `gutachter/faelle/page.tsx`, `gutachter/auftraege/page.tsx` | 6 |
| Kunde | `kunde/faelle/[id]/page.tsx`, `kunde/faelle/[id]/FallDetailSections.tsx`, `components/kunde/SaeuleMeinGeld.tsx`, `components/kunde/KundeAusfallEntschaedigungCard.tsx` | 4 |
| Makler+Shared | `components/makler/akte-detail/MaklerAkteDetail.tsx`, `components/shared/mietwagen/MietwagenStatusCard.tsx`, `src/lib/auftrag/phase.ts` | 3 |
| OCR/API + Lib | `api/ocr-gutachten/route.ts`, `api/ocr/anspruchsschreiben/route.ts`, `api/seed-testdata/route.ts`, `lib/ai/gutachten-ocr.ts`, `lib/stammdaten/schema.ts` (Kernwerte-Block `getValue`), `lib/claims/get-claim-for-role.ts` (COLUMN_PROFILES auf View-Spalten) | 6 |

Pattern: `.from('claims').select('...reparaturkosten_brutto...')` → `.from('v_gutachten_werte').select('...reparaturkosten_brutto...')`. Wenn der ursprüngliche Select claim-spezifische Spalten (status, phase, etc.) hatte, splitten in `claims`-Query und `v_gutachten_werte`-Query, oder die View um die 4-5 claim-Lifecycle-Spalten erweitern, die häufig zusammen gelesen werden.

### Migration B (`supabase/migrations/<ts>_aar_drop_claims_gutachten_columns.sql`)

1. **Sync-Trigger-Patch**: `sync_claims_to_faelle` + `sync_faelle_to_claims` ohne die 38 Spalten neu (Pattern aus Stufe-0-Final-Migration 20260514203513). Trigger `trg_sync_claims_to_faelle` `UPDATE OF`-Liste ohne die 38.
2. **Views droppen**: `v_claim_full` + `v_claim_for_gast` — beide referenzieren die 38 Spalten (`v_claim_full` exposed alle, `v_claim_for_gast` nur einige davon).
3. **DROP COLUMN x38** auf `claims`.
4. **Views recreate** ohne die 38 (`v_claim_full` analog Stufe-0-Final-Recreate).
5. **`v_gutachten_werte` recreate** ohne die `COALESCE` auf claim-Spalten (jetzt nur noch von gutachten lesend). Explizit `DROP VIEW IF EXISTS v_gutachten_werte` gefolgt von `CREATE VIEW v_gutachten_werte WITH (security_invoker = true) AS ...` — nicht `CREATE OR REPLACE`, weil sich die Spalten-Quellen geändert haben (Postgres lässt `CREATE OR REPLACE VIEW` nur bei strukturell identischer SELECT-Liste zu).

### Dual-Write entfernen

Function `apply_gutachten_ocr` neu definieren — nur noch `INSERT INTO gutachten ... ON CONFLICT DO UPDATE`. Keine Schreibrichtung auf claims mehr.

### Verification

- `tsc --noEmit` exit 0
- `npm run build` grün
- Volle Portal-Smoke (Memory `feedback_post_drop_smoke`): Admin-Fallakte, SV-Fall, Kunde-Fallakte, Makler-Akte — alle mit Screenshot + Auswertung im PR-Body. Erwartet: GutachtenOcrCard zeigt Werte, SaeuleMeinGeld zeigt Reparatur/Wiederbeschaffung/Restwert, Stammdaten-Kernwerte-Block zeigt Werte
- Grep-Sweep: `claims.gutachten_*` + `claims.reparaturkosten_*` + andere 6 Wert-Felder = null Treffer im src/

## Risiken & Trade-offs

| Risiko | Mitigation |
|---|---|
| Dual-Write in PR-1 driftet (Writer scheitert auf einer Tabelle, andere bekommt update) | Atomic via Postgres-Function `apply_gutachten_ocr` in einer TX, beide Schreib-Ops oder keine |
| Backfill schlägt fehl bei Claims ohne `faelle.sv_id` (gutachten.sv_id NOT NULL) | Backfill-Filter `WHERE f.sv_id IS NOT NULL` — Claims ohne SV haben sowieso keine OCR-Werte erzeugt, brauchen keinen Backfill |
| View `v_gutachten_werte` ohne `security_invoker` würde RLS umgehen | Migration setzt `WITH (security_invoker = true)` explizit; pre-existing RLS auf `gutachten` (admin/kb-own/sv-own/buero-admin) greift dadurch |
| RLS `gutachten_buero_admin_select` triggert `sv_buero_memberships`-Recursion (Bug aus Stufe-0-Final-Smoke) | Im Scope dieses PRs **nicht fixen** — Smoke-Tests werden den Error wieder sehen, im PR-Body als bekannt verlinkt + separates Ticket öffnen |
| `v_claim_full` + `v_claim_for_gast` referenzieren die 38 Spalten | In PR-2 beide Views recreated, Pattern bekannt aus Stufe 0/0.5/Final |
| 25 Reader-Files in PR-2 = großer Diff | Pro Portal ein Commit (5 Commits), granular reviewable. Erst Admin, dann SV, dann Kunde, dann Makler+Shared, dann OCR/API+Lib |
| UNIQUE-Constraint auf `gutachten.claim_id` schlägt fehl wenn schon 1:N-Daten drin (sollte nicht, 0 Rows) | Migration zuerst `SELECT count(*), claim_id FROM gutachten GROUP BY claim_id HAVING count(*) > 1` — wenn leer, ADD CONSTRAINT, sonst Error mit Hinweis |
| OCR-Pipeline `gutachten_ocr_raw` (jsonb) ist groß — Backfill könnte Memory-Issue erzeugen | Backfill in Batches von 100 Claims, oder jsonb explizit als TEXT casten wenn nötig |

## Was NICHT in diesem Scope

- Cluster H (Finanzierung → `vehicles`, AAR-810 H2) — eigene Strecke, ~5 Tage
- `gutachten_positionen` + `gutachten_fotos` als Live-Pfad — bleiben leer, separates Ticket
- RLS-Recursion-Fix auf `sv_buero_memberships` — pre-existing Bug, separates Ticket
- Drift-Bugs aus VERTIKAL-AUDIT (`kunde_strasse` Lexdrive-Email, `halter_*` Race-Condition in Phase4Stammdaten) — eigene Strecke
- Hydration-Mismatch `KontaktRow > LinkComponent > PhoneButton` (nested `<a>`) — pre-existing UI-Bug, separates Ticket
- SV/Kunde-Read-Coverage über die 38 Felder hinaus — diese Strecke betrifft was schon sichtbar war + ist primär Datenmodell-Konsolidierung, kein neues Feature-Surface
- 1:N-Modell für Mehrfach-Gutachten (Erstgutachten + Revision je eigene Row) — explizit ausgeschlossen (siehe „Multiplicity")

## Akzeptanzkriterien

**PR-1 abgeschlossen wenn:**
- 38 Spalten + 3 CHECK-Constraints auf `gutachten`
- UNIQUE-Constraint `gutachten_claim_id_unique` auf `gutachten.claim_id`
- View `v_gutachten_werte` mit `security_invoker=true`, joint claims×gutachten, COALESCE in Übergangsphase
- Postgres-Function `apply_gutachten_ocr(claim_id, jsonb)` schreibt atomic auf beide Tabellen
- 4 OCR-Writer-Stellen rufen die Function statt direkt claims-update
- `database.types.ts` regeneriert
- Build + tsc grün
- Manueller OCR-Smoke zeigt identische Werte auf beiden Tabellen + View

**PR-2 abgeschlossen wenn:**
- 25 Reader-Files lesen von `v_gutachten_werte` statt `claims`
- Sync-Trigger ohne die 38 Spalten
- `v_claim_full` + `v_claim_for_gast` recreated ohne die 38
- `claims` 38 Spalten gedroppt
- `apply_gutachten_ocr` schreibt nur noch auf gutachten
- Build + tsc grün
- Volle 4-Portal-Smoke mit Screenshots im PR-Body
- Grep: `claims.gutachten_*` + Cluster-G-Spalten in src/ = 0 Treffer
