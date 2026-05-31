# CMM-64 PR2/PR3 — Readiness-Inventar + Sequencing (read-only Audit)

**Datum:** 2026-05-31 · **Voraussetzung:** PR1 (Schema-Struktur) gemergt (#2085, `95022b59a`).
**Zweck:** Exakte Writer-/Reader-Landkarte für PR2 (Writer) + PR3 (Reader/View) — damit die nächste Session nicht blind grept.
**Status:** PR2/PR3 **noch nicht gebaut** — sequencing-geblockt (s. §3) + nicht smoke-bar (Cardentity = Mock + gated, 0/74 Daten).

---

## 1 · Writer-Sites (PR2) — schreiben heute `faelle`/`leads` vorschaden_*/cardentity_*

| Datei | Heute (Quelle) | Ziel nach PR2 |
|---|---|---|
| `src/app/api/cardentity/typ-a/route.ts:43-53` | `.from('faelle').update({vorschaden_geprueft, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, vorschaden_typ_a_ergebnis, cardentity_abfrage_am}).eq('id', fall_id)` | claims-Flags (`hat_vorschaeden`/`vorschaden_geprueft`/`vorschaden_erkannt`) via `fall_id→claims` **sofort**; `vehicle_vorschaeden`-Rows + `vehicles.cardentity_report` via `claims.vehicle_id` **nur wenn gesetzt** (non-fatal guard). `vorschaden_typ_a_ergebnis`→`cardentity_report.typA`. |
| `src/app/api/cardentity/typ-a/route.ts:56-63` | `timeline.insert({fall_id, ...})` | `fall_id` bleibt (eigener Re-Key Phase 6) — nicht in PR2 anfassen. |
| `src/lib/cardentity/typ-b.ts:116-120` (Lead-Scope) | `leads.update({cardentity_report, hat_vorschaeden, cardentity_enriched_at})` | Lead-Pfad: bleibt vorerst auf `leads` (Lead lebt eigenständig; vehicle erst bei Konversion). Nur dokumentieren. |
| `src/lib/cardentity/typ-b.ts:180-189` (Fall-Scope) | `faelle.update({vorschaden_typ_b_bericht, vorschaden_geprueft, hat_vorschaeden, vorschaden_anzahl, cardentity_abfrage_am, vorschaden_letzter_datum})` | wie typ-a: claims-Flags sofort; Report→`vehicles.cardentity_report.typB`; Events→`vehicle_vorschaeden`; anzahl/letzter_datum **nicht** schreiben (abgeleitet). |
| `src/lib/cardentity/enrich-fahrzeug.ts:74-83` | `{table}.update({cardentity_enriched_at, cardentity_report, fahrzeug_*})` | `cardentity_report`→`vehicles` (Pfad existiert schon via `ensureVehicleFromFin`/CMM-50.0, Z.90-115). Nur `cardentity_report` zusätzlich auf vehicles ziehen. |

**Guard-Pflicht (Lesson [[feedback_dead_code_activation]]):** vehicle-scoped Writes nur wenn `claims.vehicle_id != null`, sonst still überspringen — sonst latente Bugs sobald CMM-68 vehicles füllt.

## 2 · Reader-Sites (PR3) — lesen vorschaden_*/cardentity_* (conditional-render = Strategie §3.1b Prüf-Fall)

| Datei:Zeile | Liest | Render-Bedingung | Neue Heimat |
|---|---|---|---|
| `src/app/faelle/[id]/_stammdaten/Sections.tsx:113,214` | `vorschaden_anzahl`, `hat_vorschaeden`, `vorschaden_letzter_datum` | Vorschaden-Block conditional | claims-Flags + `vehicle_vorschaeden`-Aggregat (count/max) |
| `src/app/faelle/[id]/page.tsx:490` | `vorschaden_typ_b_pdf_url` | SystemDokumente | `vehicles.cardentity_report->>'pdfUrl'` |
| `src/app/dispatch/leads/[id]/page.tsx:129-140` | Fall-Vorschaden auf Lead-View gemappt | — | claims-Flags / vehicle (nach Konversion) |
| `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:98-103,1202,1217` | typ_b_bericht, anzahl, beschreibung | conditional | claims + vehicle |
| `src/lib/ai/briefing-prompt.ts:42,115` + `briefing-fallback.ts:79` | `vorschaeden_beschreibung` | wenn gesetzt | `claims.vorschaeden_beschreibung` (PR1 angelegt) |
| `src/lib/mitteilungen.ts:33,123` | `vorschaden_anzahl` | Notification-Text | `vehicle_vorschaeden`-count |
| `src/components/admin/fallakte/dokumente/SystemDokumenteBox.tsx:18,44` | `vorschaden_typ_b_pdf_url` | Doc-Link wenn vorhanden | `vehicles.cardentity_report->>'pdfUrl'` |
| `src/lib/stammdaten/schema.ts:266-268` + `leadSchema.ts:125-130` | Feld-Definition (anzahl, beschreibung) | Stammdaten-Editor | claims-Flags / Lead bleibt |
| **View** `v_claim_full` | `f.hat_vorschaeden`, `f.vorschaden_anzahl`, `f.vorschaden_letzter_datum`, `f.vorschaden_typ_b_bericht`, `f.cardentity_abfrage_am` | — | claims-Flags + `vehicle_vorschaeden` LATERAL + `vehicles.cardentity_report` (EXCEPT-0/0) |
| **View** `v_faelle_mit_aktuellem_termin` | 12 Reads: vorschaden_geprueft/anzahl/letzter_datum/typ_a/typ_b_bericht/typ_b_pdf_url/hat_vorschaeden/vorschaeden_beschreibung/vorschaden_erkannt + cardentity_* | — | dito (server-seitiger `replace()`-Transform der Live-Viewdef, EXCEPT-0/0) |

Plus `seed-test-data.ts:253` (vorschaeden_beschreibung) + `database.types.ts` (regeneriert nach Migration).

## 3 · Sequencing (warum PR2/PR3 nicht „jetzt sofort")

```
CMM-68 (vehicles Write-Path, PR #2066, In Progress)  ── muss zuerst mergen
   └─ füllt vehicles + claims.vehicle_id (heute 0 / 0/75)
        └─ CMM-64 PR2 (Writer)  ── claims-Flags gehen sofort; vehicle-Teil erst sinnvoll wenn vehicle_id da
              └─ CMM-64 PR3 (Reader/View-Repoint)  ── braucht PR2-Writer live + smoke-bare Daten
```

- **PR2 claims-Flags-Teil** ist technisch sofort baubar, aber **nicht smoke-bar** (Cardentity = Mock + gated, 0/74 → die Writer feuern nie im Test). Verifikation = unmöglich bis Feature ungated. Daher: zusammen mit CMM-68-Merge bauen, dann ein Mock-Trigger-Smoke über `api/cardentity/typ-a` (fall_id mit FIN) der einen `vehicle_vorschaeden`-Row + claims-Flag erzeugt.
- **PR3** strikt nach PR2 (Reader brauchen befüllte neue Heimat für EXCEPT-0/0-Beweis).

## 4 · Empfehlung
1. **CMM-68 (#2066) mergen lassen** (entsperrt den vehicle-Teil + macht PR2 smoke-bar).
2. Dann **PR2** in eigener Session + Build-Gate (npm ci) + Cardentity-Mock-Trigger-Smoke.
3. Dann **PR3** (v_claim_full + v_faelle_mit_aktuellem_termin, `replace()`-Transform, EXCEPT-0/0 + Portal-Smoke).
4. Parallel davon unabhängig: **CMM-67** (Halter — nur `ist_fahrzeughalter` hat Daten 74/74, `firma_name`/`ust_id` 0/74) wenn die AAR-939-Schreib-Sessions ruhen (Kollisionsrisiko an Edit-Writern).

Quelle: Live-Messung 31.05. (`vehicles`=0, `claims.vehicle_id`=0/75). Reader/Writer per Grep gegen `kitta/cmm-ssot-strecke-31-05`.
