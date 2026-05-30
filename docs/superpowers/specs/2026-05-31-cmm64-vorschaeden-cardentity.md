# CMM-64 — Vorschäden/Cardentity-Cluster: Heimat + Migration

**Datum:** 2026-05-31
**Master:** CMM-44 (Claim-SSoT-Vollmigration / faelle-Drop, Phase 0–6)
**Ticket:** [CMM-64](https://linear.app/aaroncmndo/issue/CMM-64) (blockedBy CMM-62 ✅ done · blocks CMM-49)
**Status PR1:** Schema-Struktur (additiv) — in dieser Session appliziert.
**Status PR2/PR3:** spezifiziert, NICHT gebaut (warten auf Aaron-Review).

---

## 0 · Warum / Kontext

Der Vorschäden-/Cardentity-Cluster ist die **letzte echte Spalten-Domäne** (neben CMM-67 Halter), die noch komplett auf `faelle` lebt und kein Zuhause auf `claims`/Sub-Tables hat. Solange er nicht migriert ist, blocken die 4 schweren Views (`v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`) — sie lesen `f.hat_vorschaeden`, `f.vorschaden_*`, `f.cardentity_*` noch echt aus faelle — und damit auch `DROP TABLE faelle` (CMM-49).

**CMM-62-Entscheidung (Aaron, 30.05., vehicle-zentrisch):**
- `cardentity_*` (der Report zur FIN) → **`vehicles`**
- `vorschaden_*` (die einzelnen Vorschaden-Ereignisse) → **neue 1:N-Tabelle `vehicle_vorschaeden`**
- claim-zeitige Check-Flags (`geprueft`/`erkannt`/`hat_vorschaeden`/Notiz) → **`claims`**

Begründung der Vehicle-Zentrik: Vorschäden hängen am **Fahrzeug** (per FIN über CarDentity ermittelt), nicht am Schadenfall. Ein Fahrzeug kann über die Zeit mehrere Vorschäden haben und in mehreren Claims auftauchen — die Historie gehört zum Fahrzeug, die *Bewertung im konkreten Fall* zum Claim.

---

## 1 · Live-Befund (empirisch, 2026-05-31, Prod `paizkjajbuxxksdoycev`)

| Fakt | Wert | Quelle |
|---|---|---|
| `faelle.hat_vorschaeden` true | **0 / 74** | `count(*) WHERE hat_vorschaeden IS TRUE` |
| `faelle.cardentity_abfrage_am` non-null | **0 / 74** | live |
| `vehicle_vorschaeden`-Tabelle existiert | **nein** | `information_schema.tables` |
| `vehicles.cardentity_letzter_pull` existiert | **ja** (= „abfrage_am") | live |
| `vehicles.cardentity_report` existiert | **nein** | live |
| `claims.{hat_vorschaeden,vorschaden_geprueft,vorschaden_erkannt,vorschaeden_beschreibung}` | **keine** | live |
| `vehicles`-Rows | **0** (SSoT leer, CMM-68 Write-Path pending) | live |
| `claims.vehicle_id` gesetzt | **0 / 75** (NULL) | live |

→ **0 Live-Daten** im ganzen Cluster (Cardentity ist Mock + gated). Migration ist **rein strukturell, kein Backfill, kein Datenverlust-Risiko**, EXCEPT-0/0 trivial erfüllt.

### faelle-Quellspalten (12)
`hat_vorschaeden` (bool), `vorschaden_anzahl` (int), `vorschaden_erkannt` (bool), `vorschaden_geprueft` (bool), `vorschaden_letzter_datum` (date), `vorschaden_typ_a_ergebnis` (jsonb), `vorschaden_typ_b_bericht` (jsonb), `vorschaden_typ_b_pdf_url` (text), `vorschaeden_beschreibung` (text), `cardentity_abfrage_am` (ts), `cardentity_enriched_at` (ts), `cardentity_report` (jsonb).

---

## 2 · Ziel-Datenmodell (Mapping jede Quellspalte → Heimat)

| faelle-Spalte | Heimat | Zielspalte/-form | Begründung |
|---|---|---|---|
| `cardentity_report` | `vehicles` | `cardentity_report` jsonb (NEU) | Report beschreibt die FIN, nicht den Fall |
| `cardentity_abfrage_am` | `vehicles` | `cardentity_letzter_pull` (existiert) | **Dedup** — Spalte gibt's schon |
| `cardentity_enriched_at` | `vehicles` | `cardentity_letzter_pull` (existiert) | dito, gleiche Semantik |
| `vorschaden_typ_a_ergebnis` | `vehicles` | in `cardentity_report` jsonb (`.typA`) | Teil des Reports |
| `vorschaden_typ_b_bericht` | `vehicles` | in `cardentity_report` jsonb (`.typB`) | Teil des Reports |
| `vorschaden_typ_b_pdf_url` | `vehicles` | in `cardentity_report` jsonb (`.pdfUrl`) | Report-Metadatum |
| — Vorschaden-Events — | `vehicle_vorschaeden` | 1 Row/Ereignis (NEU) | 1:N FIN-Historie |
| `vorschaden_letzter_datum` | abgeleitet | `max(vehicle_vorschaeden.schaden_datum)` | nicht denormalisieren |
| `vorschaden_anzahl` | abgeleitet | `count(vehicle_vorschaeden)` | nicht denormalisieren |
| `hat_vorschaeden` | `claims` | `hat_vorschaeden` bool (NEU) | claim-zeitiges Ergebnis-Flag |
| `vorschaden_geprueft` | `claims` | `vorschaden_geprueft` bool (NEU) | KB-Check pro Claim |
| `vorschaden_erkannt` | `claims` | `vorschaden_erkannt` bool (NEU) | CarDentity-Verdikt pro Claim |
| `vorschaeden_beschreibung` | `claims` | `vorschaeden_beschreibung` text (NEU) | manuelle Notiz pro Claim |

### Neue Tabelle `vehicle_vorschaeden` (1:N pro Fahrzeug)
```
id            uuid PK
vehicle_id    uuid NOT NULL → vehicles(id) ON DELETE CASCADE
schaden_datum date
art           text        -- Heckschaden / Frontschaden / …
schwere       text        -- leicht / mittel / schwer
quelle        text NOT NULL DEFAULT 'cardentity'
beschreibung  text
rohdaten      jsonb       -- Roh-Event aus CarDentity
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
```

### 3 bewusste Abweichungen vom Ticket-Wortlaut (Aaron approved 31.05.)
1. **Keine** `cardentity_abfrage_am`/`cardentity_enriched_at` auf vehicles — `cardentity_letzter_pull` existiert bereits (Dedup, kein Duplikat-Spalten-Anti-Pattern).
2. **Tabelle heißt `vehicle_vorschaeden`** (vehicle-scoped), nicht generisch `vorschaeden` — macht die 1:N-Fahrzeug-Bindung explizit.
3. **`vorschaden_anzahl` + `vorschaden_letzter_datum` werden NICHT gespeichert** (abgeleitet aus der Sub-Table) — keine Denormalisierung, keine Sync-Pflicht.

### RLS-Verbesserung (claim-nativ)
Die neue Tabelle nutzt für den SV-Lesezugriff **`claims.sv_id`** (CMM-60 SSoT), nicht `faelle.sv_id` wie die alte `vehicles`-Policy. Damit führt CMM-64 **keine neue faelle-Abhängigkeit** ein (die bestehende `vehicles_select_public_consol`-Policy ist separat in Phase 5/6 zu de-faellen).

---

## 3 · PR-Strecke

### PR1 — Schema-Struktur (additiv, DDL-only) ✅ diese Session
- `vehicles.cardentity_report` jsonb ADD
- `vehicle_vorschaeden` CREATE TABLE + Index + updated_at-Trigger + RLS (2 Policies) + Grants
- `claims` 4 Flag-Spalten ADD
- **Kein** src/-Change, **kein** Reader/Writer, **kein** View-Touch → Views unverändert, EXCEPT-0/0 trivial.
- Verifikation: Spalten/Tabelle/Policies existieren live; die 6 faelle-Views resolven weiterhin.

### PR2 — Writer-Migration (gated, Review-pflichtig)
3 Cardentity-Writer von `faelle`/`leads` auf das neue Modell umstellen:
- `src/app/api/cardentity/typ-a/route.ts` — Mock-Typ-A: schreibt heute `faelle.vorschaden_*` → künftig `claims`-Flags + `vehicle_vorschaeden`-Rows + `vehicles.cardentity_report`.
- `src/lib/cardentity/typ-b.ts` — manueller Typ-B (Lead + Fall-Scope) → dito.
- `src/lib/cardentity/enrich-fahrzeug.ts` — Typ-A-Enrich (`enrichByFin`) schreibt `cardentity_report`/`cardentity_enriched_at` → künftig auf `vehicles` (via `ensureVehicleFromFin`-Pfad, der schon existiert).
- **Abhängigkeit:** sauberer vehicles-Write-Path braucht CMM-68 (vehicle_id-Verdrahtung). Bis dahin: claims-Flags sofort schreibbar, vehicle-Rows erst wenn `claims.vehicle_id` gesetzt ist → Writer non-fatal guarden (kein vehicle_id ⇒ nur claims-Flags). Lesson [[feedback_dead_code_activation]].
- Timeline-Insert (`timeline.fall_id`) bleibt vorerst (eigener fall_id-Re-Key, Phase 6).

### PR3 — Reader/View-Repoint (gated, Review-pflichtig)
- Views `v_claim_full` + `v_faelle_mit_aktuellem_termin` (+ `faelle_kunde_view`/`faelle_sv_view` falls sie Vorschaden zeigen): `f.hat_vorschaeden`/`f.vorschaden_*`/`f.cardentity_*` → claims-Flags + `vehicle_vorschaeden`-Aggregat (`count`/`max(datum)`) + `vehicles.cardentity_report`. Server-seitiger `replace()`-Transform, EXCEPT-0/0 + Portal-Smoke pro View (CMM-50-Pattern).
- Reader-Sweep der ~20 Stellen (Stammdaten-Vorschaden-Block, Dispatch Phase4, AI-Briefing, mitteilungen, SystemDokumenteBox) — conditional-Render-Bedingungen mitziehen (Strategie §3.1b Prüf-Fall).

---

## 4 · Akzeptanzkriterien
- [ ] PR1: `vehicle_vorschaeden` existiert mit RLS enabled + 2 Policies + FK CASCADE + updated_at-Trigger.
- [ ] PR1: `vehicles.cardentity_report` + die 4 `claims`-Flags existieren live.
- [ ] PR1: alle 6 faelle-Views resolven weiterhin (kein Bruch durch additive DDL).
- [ ] PR1: Migration-File-Name == vom Plugin getrackte Version (kein Twin-Drift).
- [ ] PR2/PR3: separat, nach Aaron-Review.

## 5 · Risiken / Caveats
- **0-Data ist Testset-Stand (74 Rows).** Vor dem finalen faelle-DROP (CMM-49) gegen echten Prod-Datensatz re-verifizieren ([[feedback_information_schema_check]]).
- **vehicles leer (CMM-68 pending):** PR2-Writer können vehicle-scoped Rows erst schreiben, wenn `claims.vehicle_id` gesetzt wird. PR1 ist davon unberührt (nur Struktur).
- **Parallele AAR-939-Sessions** arbeiten an `claims`/Lifecycle — PR1 fügt nur neue Spalten/Tabelle hinzu (additiv, keine Namens-Kollision). Migration-Tracking via Plugin verhindert Drift.

## 6 · Quellen
- Master-Plan Phase 0–6: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`
- Strecke-Stand 30.05.: `git show origin/kitta/cmm-50-3b-view-reader-repoint:docs/30.05.2026/claim-ssot-strecke-stand.md`
- CMM-62-Entscheidung: Memory `project_cmm_phase_24_finishing` (Update 31.05. Abend)
- Live-Probe: dieser Session-Audit (MCP execute_sql gegen Prod)
