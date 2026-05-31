# CMM-64 PR3 — View-Repoint Vorschäden/Cardentity (faelle-Entkopplung)

**Datum:** 2026-05-31 · **Master:** CMM-44 (faelle-Drop) · **Bezug:** CMM-64 PR1 (#2085, Schema live) + PR2 (#2095, Writer, offen)
**Status:** ✅ GEBAUT 31.05. — Migration `20260531122744_cmm64_pr3_vorschaeden_cardentity_view_repoint` (Option 2 Backfill+Repoint, EXCEPT-0/0 verifiziert, 0× faelle-vorschaden/cardentity-Ref in beiden Views). Live-Re-Check ergab **3 Flags** (hat_vorschaeden/geprueft/erkannt) je false×74 zu backfillen (nicht nur hat_vorschaeden).

---

## 0 · Ziel
`v_claim_full` + `v_faelle_mit_aktuellem_termin` lesen Vorschäden/Cardentity noch aus `faelle`. Diese Reads auf das CMM-64-Modell umlenken (claims-Flags + `vehicle_vorschaeden` + `vehicles.cardentity_report`), damit die Views `DROP TABLE faelle` überleben. Letzter vorschaden/cardentity-Eintrag der v_claim_full-Gap-Map.

## 1 · Live-Befund (31.05., autoritativ)
- Beide Views lesen noch `f.hat_vorschaeden` / `f.vorschaden_*` / `f.cardentity_*` (PR3 offen, keine Fremd-Session).
- **`reloptions` beider Views = NULL** (kein `security_invoker` gesetzt — anders als v_claim_listing/v_claim_timeline). CREATE OR REPLACE bewahrt das; nach Apply explizit re-prüfen.
- Daten-Coverage: `faelle.hat_vorschaeden` **74/74 gesetzt (alle = false)**, `vorschaden_anzahl` 0, `cardentity_abfrage_am` 0. `claims.hat_vorschaeden` **0** (null), `vehicle_vorschaeden` 0 Rows, `vehicles.cardentity_report` 0.

## 2 · Mapping (faelle-Read → neue Heimat)
| View-Spalte | heute | neu |
|---|---|---|
| `hat_vorschaeden` | `f.hat_vorschaeden` | `c.hat_vorschaeden` |
| `vorschaden_geprueft` | `f.vorschaden_geprueft` | `c.vorschaden_geprueft` |
| `vorschaden_erkannt` | `f.vorschaden_erkannt` | `c.vorschaden_erkannt` |
| `vorschaeden_beschreibung` | `f.vorschaeden_beschreibung` | `c.vorschaeden_beschreibung` |
| `vorschaden_anzahl` | `f.vorschaden_anzahl` | abgeleitet `count(vehicle_vorschaeden)` via `claims.vehicle_id` (LATERAL) |
| `vorschaden_letzter_datum` | `f.vorschaden_letzter_datum` | abgeleitet `max(vv.schaden_datum)` (LATERAL) |
| `vorschaden_typ_a_ergebnis` | `f.vorschaden_typ_a_ergebnis` | `veh.cardentity_report->'typA'` |
| `vorschaden_typ_b_bericht` | `f.vorschaden_typ_b_bericht` | `veh.cardentity_report` (bzw. `->'typB'`) |
| `vorschaden_typ_b_pdf_url` | `f.vorschaden_typ_b_pdf_url` | `veh.cardentity_report->>'pdfUrl'` |
| `cardentity_abfrage_am` | `f.cardentity_abfrage_am` | `veh.cardentity_letzter_pull` |
| `cardentity_enriched_at` (nur vfat) | `f.cardentity_enriched_at` | `veh.cardentity_letzter_pull` |
| `cardentity_report` (nur vfat) | `f.cardentity_report` | `veh.cardentity_report` |

`veh` = der bereits in beiden Views vorhandene `LEFT JOIN vehicles veh ON veh.id = c.vehicle_id`. Für `vorschaden_anzahl`/`letzter_datum` ein neuer `LEFT JOIN LATERAL (SELECT count(*), max(schaden_datum) FROM vehicle_vorschaeden WHERE vehicle_id = c.vehicle_id) vv`.

## 3 · ⚠️ EXCEPT-0/0-Trap (HARTER Blocker, Aaron-Input)
**`f.hat_vorschaeden` ist false×74, `c.hat_vorschaeden` ist null×75.** Ein simpler Repoint ändert die View-Ausgabe (false→null) → **EXCEPT ≠ 0/0**, UI-Regression (Boolean „Nein" → „unbekannt").

Ursache = **Semantik-Divergenz**: `leads/faelle.hat_vorschaeden` = Kunden-Selbstauskunft im Schaden-Flow (default false). CMM-64 `claims.hat_vorschaeden` = **Ergebnis des claim-zeitigen CarDentity-Checks** (null bis abgefragt). Zwei verschiedene Quellen.

**Optionen (eine wählen, Aaron):**
1. **COALESCE-Brücke:** View liest `COALESCE(c.hat_vorschaeden, f.hat_vorschaeden)` → 0/0 sofort, aber behält faelle-Read (View NICHT faelle-frei → kein Phase-6-Fortschritt, nur Vorbereitung). ❌ verfehlt das PR3-Ziel.
2. **Backfill + Repoint:** `UPDATE claims c SET hat_vorschaeden = f.hat_vorschaeden FROM faelle f WHERE f.claim_id=c.id AND c.hat_vorschaeden IS NULL` → dann reiner `c.`-Repoint = 0/0. ✅ faelle-frei. **Aber:** vermischt Kunden-Selbstauskunft in das CarDentity-Check-Feld (Semantik-Bruch laut CMM-64-Modell).
3. **Getrenntes Feld:** Kunden-Selbstauskunft separat halten (z.B. `claims.kunde_angabe_vorschaeden`) + View zeigt CarDentity-Flag. Sauberste Semantik, größter Scope (neue Spalte + Reader).

**Empfehlung:** Option 2 für den faelle-Drop (pragmatisch, das Feld bedeutet faktisch „hat (irgendwie bekannte) Vorschäden"), mit Doku der Semantik-Zusammenführung. Option 3 nur wenn die Trennung Kunden-Angabe-vs-Cardentity fachlich gebraucht wird. **Die anderen Felder (anzahl/datum/typ_*/cardentity_*) sind alle 0/0-trivial** — nur `hat_vorschaeden` hat den false×74-Trap.

> **ENTSCHIEDEN (Aaron, 31.05.): Option 2 — Backfill + Repoint.** Die nächste Session baut: (1) `UPDATE claims c SET hat_vorschaeden = f.hat_vorschaeden FROM faelle f WHERE f.claim_id = c.id AND c.hat_vorschaeden IS NULL` (Plugin-Migration, gap=0 verifizieren), dann (2) reiner `c.hat_vorschaeden`-Repoint in beiden Views. Semantik-Zusammenführung (Kunden-Selbstauskunft + CarDentity-Check in einem Feld) im Migration-Kommentar + Spalten-COMMENT dokumentieren. **Live-Re-Check vor Apply Pflicht** (Coverage kann sich geändert haben, sobald PR2 #2095 Cardentity-Writes erzeugt).

## 4 · Plan (nach PR2-Merge + §3-Entscheidung)
1. Backfill (falls Option 2) via Plugin-Migration + Verify gap=0.
2. View-Repoint je View: **server-seitiger `replace()`-Transform der Live-Viewdef** (Vorlage `20260530205453` cmm50.3b / `20260530222551` cmm66) für die 1:1-Token (f.→c., f.cardentity_*→veh.*); die LATERAL-Aggregate (anzahl/datum) + jsonb-Pfade als gezielter Block-Replace. Pro View: Self-Assert (0× `f.vorschaden`, 0× `f.cardentity`, 0× `f.hat_vorschaeden`) + **Output-Hash-EXCEPT-0/0-Guard** + reloptions-Re-Check.
3. `npx tsc --noEmit` (Consumer der View-Felder unverändert benannt → kein Code-Change erwartet).
4. Portal-Smoke: Stammdaten-Vorschaden-Block (admin/SV/kunde) rendert wie vorher.
5. Migration-File == recorded version. PR vs staging.

## 5 · Danach (v_claim_full Gap-Map Rest, nicht PR3)
`f.id AS fall_id` (FK-Architektur, Aaron) · `f.status` (Lifecycle/AAR-939) · `f.organisation_id`/`f.dispatch_id` (Ownership, Aaron) · `f.gegner_*` (Heimat-Entscheidung) · `f.kunde_id` (CMM-63) · COALESCE(veh,f.*)-Fahrzeug-Fallback (CMM-50-Cutover).

## 6 · Quellen
Live-Viewdefs in Session-Transcript. PR2 = `docs/superpowers/specs/2026-05-31-cardentity-scharf.md`. Schema = PR1 `20260530233705`. Memory `project_cmm64_vorschaeden_pr1`.
