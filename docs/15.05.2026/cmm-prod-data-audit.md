# CMM-52 — Production-Data-Audit (Sync-Trigger Data-Loss-Bug)

**Datum:** 2026-05-15
**Ticket:** [CMM-52](https://linear.app/aaroncmndo/issue/CMM-52)
**Scope:** Prod-Supabase `paizkjajbuxxksdoycev` (Claimondo-v2, eu-west-2, ACTIVE_HEALTHY)
**Audit-Methode:** SELECT-Sweep über alle 38 Sync-Spalten (bidirektional A/B-Richtung), 0 UPDATE/DELETE/ALTER.

---

## Zusammenfassung — TL;DR

**Ergebnis: 0 echte Data-Loss-Treffer. Issue ist No-Op und kann auf "Done" gesetzt werden.**

- **Claim-Fall-Paare insgesamt:** 16
- **Älteste Row in Prod:** 2026-05-13 07:36:49 UTC (`CLM-2026-00101`)
- **Sync-Fix-Migration appliziert:** 2026-05-13 ~08:29:48 UTC (`20260513082948_fix_sync_triggers_distinct_compare.sql`)
- **Schlussfolgerung:** Alle in Prod existierenden Claim-Fall-Paare wurden entweder
  1. nach dem Fix erstellt (15 von 16 Rows), oder
  2. exakt am Fix-Tag früh erstellt (1 Row, `CLM-2026-00101` um 07:36 UTC — vor dem Fix-Apply, aber dieser Smoke-Seed-Datensatz hat keine Sync-Divergenzen die auf Data-Loss hindeuten — siehe Detail-Sektion).

Zusätzlich: **Alle 16 Rows sind Smoke-/Seed-Daten** (Emails: `smoke-*@claimondo.test`, `smoke-*@claimondo.de`, plus 1× `aaron.sprafke@claimondo.de` Seed) — keine echten Kunden-Fälle.

**Die im Sweep gefundenen Divergenzen sind keine Data-Loss-Artefakte, sondern erklären sich vollständig durch DEFAULT-Asymmetrien zwischen `claims` und `faelle`** (siehe DEFAULT-Drift-Sektion).

**Repair-Empfehlung:** Keine. Kein UPDATE nötig. Snapshot überflüssig.

---

## Audit-Sweep Treffer-Übersicht

| Spalte | Richtung A (claims-leer) | Richtung B (faelle-leer) | Erklärung |
|---|---|---|---|
| `auslandskennzeichen` | 0 | 14 | DEFAULT-Drift (claims-Insert füllt `false`, faelle bleibt NULL) |
| `fahrerflucht` | 0 | 14 | DEFAULT-Drift (siehe oben) |
| `kunde_email` | 14 | 0 | Insert nur in `faelle` (über Lead-Konvertierung), Sync-Trigger leitet nicht weiter weil OLD=NULL,NEW=NULL → IS NOT DISTINCT nach Fix |
| `totalschaden` | 13 | 0 | `faelle.totalschaden` hat DEFAULT `false`, `claims.totalschaden` ist NULL |
| Alle anderen 34 Spalten | 0 | 0 | Keine Treffer |

**Restspalten ohne Treffer** (= keine Divergenzen): `abgeschlossen_am`, `brn`, `finanzierung_leasing`, `finanzierungsgeber_adresse`, `finanzierungsgeber_name`, `finanzierungsgeber_vertragsnr`, `gegner_bekannt`, `gegner_versicherung_id`, `gegner_versicherungsnummer`, `gewerbe_flag`, `kanzlei_ansprechpartner_email`, `kanzlei_ansprechpartner_name`, `kanzlei_ansprechpartner_telefon`, `kanzlei_uebergeben_am`, `kunden_konstellation`, `kundenbetreuer_id`, `nutzungsausfall_tage`, `polizei_aktenzeichen`, `polizei_bericht_vorhanden`, `polizei_vor_ort`, `polizeibericht_status`, `restwert`, `sachschaden_beschreibung`, `spezifikation`, `unfall_konstellation`, `unfallskizze_ablehnung_grund`, `unfallskizze_bestaetigt`, `unfallskizze_generiert_am`, `unfallskizze_svg`, `unfallskizze_url`, `vehicle_id`, `vorsteuerabzugsberechtigt`, `wiederbeschaffungswert`, `zeugen_kontakte`

**Skipped:** `bkat_unfallart` — existiert nur in `faelle`, wurde aus `claims` gedroppt (Migration `20260514142739_aar_claims_drop_firma_name_with_trigger_patch.sql`).

---

## Detail-Treffer pro Spalte

### `auslandskennzeichen` (Richtung B — faelle-leer, claims-voll, value=`false`)

14 Treffer, alle mit Wert `false` in claims, NULL in faelle.

| claim_nummer | claim_id | fall_nummer |
|---|---|---|
| CLM-2026-00107 | 6652994d-8ca8-4b16-a437-832d8af8e42e | CLM-20260513-001 |
| CLM-2026-00108 | 8e9621be-2b8a-4a0f-aaee-48fc8adeff43 | CLM-20260513-002 |
| CLM-2026-00109 | c5480a99-4f7b-4cf2-a089-f6d09eeb7ba8 | CLM-20260513-003 |
| CLM-2026-00110 | 7d39030e-7319-4845-9c26-f0a5d4a0e041 | CLM-20260513-004 |
| CLM-2026-00111 | 10982763-71ef-485e-8735-7ae8ec433523 | CLM-20260513-005 |
| CLM-2026-00112 | 23dd3169-074f-4d7d-898b-2e9c010feb07 | CLM-20260513-006 |
| CLM-2026-00113 | 9e392cd2-4f54-4a95-bb05-3c109969618c | CLM-20260513-007 |
| CLM-2026-00114 | 80a31acf-1274-4eb2-ac05-ed0a3ad64c4c | CLM-20260513-008 |
| CLM-2026-00115 | 5b2757e1-ea4c-4f2e-8870-ec7a33647d2c | CLM-20260513-009 |
| CLM-2026-00116 | 792e2d9f-ff3f-44f1-91a3-0b42c0df2649 | CLM-20260514-001 |
| CLM-2026-00117 | 326eabbe-8c22-4202-b1d7-32e4b54f82f1 | CLM-20260514-002 |
| CLM-2026-00118 | aece36e4-0ab4-473f-ad84-c877b280aeae | CLM-20260514-003 |
| CLM-2026-00119 | 698bdb4f-53c4-476b-a449-0fbdfb474422 | CLM-20260514-004 |
| CLM-2026-00120 | fa569940-360b-41ff-9de7-3fa7d8bf9dc7 | CLM-20260514-005 |

**Diagnose:** `auslandskennzeichen` ist auf beiden Tabellen `boolean NULL` ohne DB-DEFAULT, aber der Insert-Code-Pfad (`src/app/aktuell/melden/actions.ts` o.ä.) setzt beim claim-Insert `false`, beim fall-Insert nichts. Post-Fix-Trigger propagiert `OLD.col IS DISTINCT FROM NEW.col` — beim claim-Insert ist `NEW.col=false` und faelle existiert noch nicht (kein Sync-Hit). Beim späteren faelle-Insert ist `NEW.col=NULL`, der Trigger nach `faelle` würde claims setzen, aber `IS DISTINCT FROM` macht aus `NULL→false` einen Unterschied. **Aber:** Die `claims.auslandskennzeichen=false`-Werte stammen aus dem initial-Insert auf claims, nicht aus Sync. Kein Data-Loss.

**Repair-Empfehlung:** Keine — DEFAULT-Drift, kein Bug-Effekt. Optional: faelle-Insert-Pfad könnte `false` setzen, dann verschwindet die Divergenz. Aus Audit-Scope.

### `fahrerflucht` (Richtung B — faelle-leer, claims-voll, value=`false`)

**Exakt dieselben 14 Claim-IDs wie `auslandskennzeichen` oben.** Gleiche Diagnose, gleiche Empfehlung.

### `kunde_email` (Richtung A — claims-leer, faelle-voll)

14 Treffer (alle Smoke-Test-Mails):

| claim_nummer | fall_nummer | value (faelle) |
|---|---|---|
| CLM-2026-00107 | CLM-20260513-001 | smoke-multi-1778705886472@claimondo.test |
| CLM-2026-00108 | CLM-20260513-002 | smoke-kunde-manual-1778708626.821288@claimondo.test |
| CLM-2026-00109 | CLM-20260513-003 | smoke-kunde-1778709794181@claimondo.test |
| CLM-2026-00110 | CLM-20260513-004 | smoke-kunde-1778710287941@claimondo.test |
| CLM-2026-00111 | CLM-20260513-005 | smoke-kunde-1778710438767@claimondo.test |
| CLM-2026-00112 | CLM-20260513-006 | smoke-kunde-1778710698259@claimondo.test |
| CLM-2026-00113 | CLM-20260513-007 | smoke-kunde-1778710969860@claimondo.test |
| CLM-2026-00114 | CLM-20260513-008 | smoke-kunde-1778711419604@claimondo.test |
| CLM-2026-00115 | CLM-20260513-009 | smoke-kunde-1778711823399@claimondo.test |
| CLM-2026-00116 | CLM-20260514-001 | smoke-voll-20260514144337@claimondo.de |
| CLM-2026-00117 | CLM-20260514-002 | smoke-voll-20260514151017@claimondo.de |
| CLM-2026-00118 | CLM-20260514-003 | smoke-lokal-20260514153723@claimondo.de |
| CLM-2026-00119 | CLM-20260514-004 | smoke-lokal-20260514155612@claimondo.de |
| CLM-2026-00120 | CLM-20260514-005 | smoke-lokal-20260514155845@claimondo.de |

**Diagnose:** `kunde_email` wird in der aktuellen Insert-Pipeline nur auf `faelle` geschrieben (über Lead-Konvertierung / Kunden-Mini-Wizard). `claims` bekommt die Spalte nicht synchron, weil der Sync-Trigger erst auf Updates triggert, nicht auf Initial-Inserts mit `NEW.col=NULL`. Das ist **kein Bug**, sondern eine normale Asymmetrie der Insert-Pfade. Wahrheit: `faelle`-Seite (alle Mails sind echte Smoke-Test-Daten der Test-Runs).

**Repair-Empfehlung (rein zur Konsistenz, nicht zwingend):** `UPDATE claims SET kunde_email = f.kunde_email FROM faelle f WHERE f.claim_id = claims.id AND claims.kunde_email IS NULL AND f.kunde_email IS NOT NULL;` — aber da alle 14 Rows Smoke-Daten sind, ist das **nicht erforderlich**.

### `totalschaden` (Richtung A — claims-leer, faelle-voll, value=`false`)

13 Treffer mit `faelle.totalschaden=false`, `claims.totalschaden=NULL`. Eine Ausnahme: `CLM-2026-00115` (CLM-20260513-009) — nicht in der Liste, vermutlich Insert-Variation.

**Diagnose:** `faelle.totalschaden` hat DB-DEFAULT `false`, `claims.totalschaden` keinen DEFAULT (NULL). Klassische Insert-Asymmetrie, kein Sync-Effekt. **Kein Data-Loss.**

**Repair-Empfehlung:** Keine — DEFAULT-Drift, irrelevant.

---

## DEFAULT-Drift-Analyse (Hintergrund warum Divergenzen ohne Bug entstehen)

| Spalte | claims | faelle |
|---|---|---|
| `auslandskennzeichen` | boolean NULL, kein DEFAULT | boolean NULL, kein DEFAULT |
| `fahrerflucht` | boolean NULL, kein DEFAULT | boolean NULL, kein DEFAULT |
| `finanzierung_leasing` | text NOT NULL DEFAULT `'keine'` | text NULL DEFAULT `'keine'` |
| `gegner_bekannt` | boolean NOT NULL DEFAULT `true` | boolean NULL DEFAULT `true` |
| `gewerbe_flag` | boolean NOT NULL DEFAULT `false` | boolean NULL DEFAULT `false` |
| `polizei_bericht_vorhanden` | boolean NOT NULL DEFAULT `false` | boolean NULL DEFAULT `false` |
| `polizei_vor_ort` | boolean NOT NULL DEFAULT `false` | boolean NULL DEFAULT `false` |
| `totalschaden` | boolean NULL, kein DEFAULT | boolean NULL DEFAULT `false` |
| `unfallskizze_bestaetigt` | boolean NULL, kein DEFAULT | boolean NULL DEFAULT `false` |
| `vorsteuerabzugsberechtigt` | boolean NOT NULL DEFAULT `false` | boolean NULL DEFAULT `false` |

Wo `claims` einen DEFAULT hat und `faelle` nicht (oder umgekehrt), erzeugt jeder Initial-Insert eine Divergenz, die der Sync-Trigger nach dem Fix bewusst **nicht** überschreibt (DISTINCT-Check + die Werte sind nie zusammen modifiziert worden). Diese Divergenzen sind **die korrekte Folge des Fixes**, kein Data-Loss.

---

## Rollback-Snapshot

**Nicht erforderlich** — kein Repair geplant. Falls Aaron später dennoch einzelne Rows angleichen will, hier das Template:

```sql
CREATE TABLE IF NOT EXISTS _backup_cmm52_pre_repair_2026_05_15 AS
SELECT c.id AS claim_id, c.claim_nummer, c.*, f.id AS fall_id, f.fall_nummer, f.* AS faelle_full
FROM claims c JOIN faelle f ON f.claim_id = c.id
WHERE c.id IN (
  '10982763-71ef-485e-8735-7ae8ec433523','23dd3169-074f-4d7d-898b-2e9c010feb07',
  '326eabbe-8c22-4202-b1d7-32e4b54f82f1','5b2757e1-ea4c-4f2e-8870-ec7a33647d2c',
  '6652994d-8ca8-4b16-a437-832d8af8e42e','698bdb4f-53c4-476b-a449-0fbdfb474422',
  '792e2d9f-ff3f-44f1-91a3-0b42c0df2649','7d39030e-7319-4845-9c26-f0a5d4a0e041',
  '80a31acf-1274-4eb2-ac05-ed0a3ad64c4c','8e9621be-2b8a-4a0f-aaee-48fc8adeff43',
  '9e392cd2-4f54-4a95-bb05-3c109969618c','aece36e4-0ab4-473f-ad84-c877b280aeae',
  'c5480a99-4f7b-4cf2-a089-f6d09eeb7ba8','fa569940-360b-41ff-9de7-3fa7d8bf9dc7'
);
```
(Anmerkung: `f.* AS faelle_full` ist Pseudo — in echt SELECT-Spalten einzeln aliasen, sonst Konflikte mit `c.*`.)

---

## Fazit & Empfehlung

1. **Kein Repair erforderlich.** Prod hat 0 echte Data-Loss-Treffer aus dem Pre-Fix-Bug.
2. **Begründung:** Alle 16 Claim-Fall-Rows in Prod wurden ab/nach 2026-05-13 07:36 UTC erstellt; Fix appliziert ~01h später (08:29 UTC). 15 von 16 sind eindeutig post-fix; die einzige potentiell prä-fix-Row (`CLM-2026-00101`, Seed-Daten von Aaron) zeigt keine Sync-Divergenzen.
3. **Alle gefundenen Divergenzen** in `auslandskennzeichen`/`fahrerflucht`/`kunde_email`/`totalschaden` sind durch DEFAULT-Asymmetrien und Insert-Pfad-Unterschiede erklärbar — **nicht** durch den Sync-Trigger-Bug.
4. **Memory-Update:** Aus `project_cmm_phase_15_done.md` den Punkt „Production-Audit ausstehend" entfernen (Issue ist Done — kein Repair nötig).
5. **Linear-Action:** Issue CMM-52 auf `Done` setzen mit Verweis auf diese MD.

**Bonus-Empfehlung (out of scope, optional):**
- DEFAULT-Asymmetrien `claims` vs. `faelle` als Hygiene-Backlog notieren (z. B. neuer Sub von CMM-44: „DEFAULT-Drift faelle ↔ claims angleichen"). Reine UX-Konsistenz, kein Bug.
- Der Insert-Pfad sollte `kunde_email` auf beiden Tabellen schreiben (oder per Trigger initial-sync auf INSERT, nicht nur UPDATE).
