# Claim-SSoT — Cardentity-Extraction-Audit

**Datum:** 2026-05-16
**Zweck:** Was schreibt die Cardentity-Extraction, und was lässt sich mit den Gutachten-Werten konsolidieren/erweitern. Teil-Audit 4 von `claim-ssot-vollmigration-audit-strategie.md` (§3.1c).

---

## 1 · Was Cardentity heute schreibt

| Stelle | Typ | Spalten | Ziel |
|---|---|---|---|
| `lib/cardentity/enrich-fahrzeug.ts:73` (`enrichByFin`) | A (auto, FIN-OCR) | `cardentity_enriched_at`, `cardentity_report`, `fahrzeug_hersteller`, `fahrzeug_modell`, `erstzulassung`, `fahrzeug_ausstattung` | **`faelle`** bzw. `leads` |
| `lib/cardentity/typ-b.ts:116` (Lead) | B (manuell, 15 €) | `cardentity_report`, `hat_vorschaeden`, `cardentity_enriched_at` | **`leads`** |
| `lib/cardentity/typ-b.ts:180` (Fall) | B | `vorschaden_typ_b_bericht`, `vorschaden_geprueft`, `hat_vorschaeden`, `vorschaden_anzahl`, `vorschaden_letzter_datum`, `cardentity_abfrage_am` | **`faelle`** |
| `api/cardentity/typ-a|typ-b/route.ts` | A/B Mock | dieselben faelle-Spalten | **`faelle`** — **Dead-Code** (echter Pfad läuft über `lib/cardentity`) |
| `api/cron/cardentity-recheck/route.ts` | Recheck-Stub | `cardentity_last_checked` | `vehicles` — **Stub ohne API-Call** |

**Kernbefunde:**
- Cardentity schreibt **auf `faelle`/`leads`, NICHT auf `vehicles`** — obwohl die `vehicles`-Tabelle (44 Spalten, FIN-verankert, AAR-773) genau dafür existiert. `vehicles.cardentity_letzter_pull` ist nie befüllt.
- **Cardentity-Output ist im claims-SSoT-Modell unsichtbar:** `cardentity_report`, `vorschaden_typ_*`, `fahrzeug_ausstattung`, `hat_vorschaeden` stehen **nicht** in der 34-Spalten-Sync-Liste → der `faelle↔claims`-Trigger spiegelt sie nicht.
- 2 parallele Implementierungen: `lib/cardentity/*` (echte API) + `api/cardentity/typ-*` (Mock-Routen, Dead-Code-Kandidat).

## 2 · `gutachten`-Werte (38 OCR-Felder)

Sub-Tabelle, claim-scoped (`claim_id` UNIQUE), Writer = RPC `apply_gutachten_ocr`. Felder: Fahrzeug-Identität (`gutachten_fin/_kennzeichen/_erstzulassung/_laufleistung_km/_fahrzeug_typ/_farbe/_kraftstoff`), Vorschäden+Zustand (`gutachten_vorschaeden_text`, `lackmesswert_max_my`, `karosseriezustand`), Reparatur-Detail, Mietwagen-Sätze, SV-Meta, Wert-Output (`reparaturkosten_*`, `minderwert`, `restwert`, `wiederbeschaffungswert`, `nutzungsausfall_tage`, `totalschaden`).

## 3 · Überlappung Cardentity ↔ Gutachten

| Domäne | Cardentity | Gutachten | Verhältnis |
|---|---|---|---|
| Fahrzeug-Identität | Hersteller/Modell/Erstzulassung/Ausstattung (FIN-Anker, Spec-DB-genau) | `gutachten_fin/_typ/_erstzulassung/_farbe/...` (OCR aus PDF) | **direkte Doppelung** — Cardentity präzise, Gutachten OCR-fehleranfällig |
| Laufleistung | `report.events[].mileage` | `gutachten_laufleistung_km` (Tachostand am Besichtigungstag) | Überlappung |
| Vorschäden | `report.events[]` → `vorschaden_anzahl/_letzter_datum`, JSONB-Bericht | `gutachten_vorschaeden_text` (SV-Doku vor Ort) | **komplementär** — Cardentity = Fahrzeug-Historie, Gutachten = aktueller SV-Befund |
| Bewertung | `report.valuation.current` (Marktwert generisch) | `restwert`/`wiederbeschaffungswert` (schadenfall-spezifisch) | kein Merge — Gutachten gewinnt |

## 4 · Konsolidierungs-Empfehlung

1. **Fahrzeug-Spec → kanonisch in `vehicles`** (nicht `faelle`/`gutachten`). Cardentity-Typ-A-Writer auf `vehicles`-Upsert-per-FIN umstellen, `cardentity_letzter_pull` befüllen, Recheck-Cron ausimplementieren. `faelle`/`claims` referenzieren das Fahrzeug eh über `vehicle_id` (in der 34-Sync-Liste) — keine Pro-Fall-Duplikation nötig.
2. **`gutachten`-Werte bleiben claim-zeitig** — nicht in `vehicles` zurückmergen. Sie sind OCR-Snapshots zum Schadenzeitpunkt.
3. **Cardentity reichert Gutachten an — Plausibilisierung statt Merge.** Abgleich `gutachten_fin ↔ vehicles.fin`, `gutachten_erstzulassung ↔ vehicles.erstzulassung` als OCR-Fehler-Detektor (neuer Confidence-/Mismatch-Indikator).
4. **Vorschaden-Domäne → neue fahrzeug-gebundene Sub-Tabelle `vehicle_damage_events`** (FK → `vehicles.id`). Heute verteilt auf `faelle.vorschaden_typ_*` (JSONB), `leads.cardentity_report`, `faelle.hat_vorschaeden/_anzahl`, `gutachten_vorschaeden_text` — alles uneinheitlich + claims-SSoT-unsichtbar. Strukturierte Event-Tabelle (`event_datum`, `art`, `schwere`, `mileage`, `quelle`=cardentity_a/b|gutachten|manuell): Cardentity-Events + SV-Gutachten-Vorschäden fließen als Zeilen ein, `hat_vorschaeden`/`vorschaden_anzahl` werden ableitbare Aggregate (View). Ein Folgefall am selben Fahrzeug sieht die volle Historie.

**Ziel-Zuordnung:** Fahrzeug-Spec → `vehicles` · Vorschaden-/Schaden-Historie → neue `vehicle_damage_events` · OCR des aktuellen Schadens → `gutachten` (bestehend) · `faelle.vorschaden_typ_*`-JSONB + `cardentity_report` → nach Migration deprecaten.

## 5 · Quellen

Code-Audit 16.05.2026 (`lib/cardentity/*`, `api/cardentity/*`, `lib/ai/gutachten-ocr.ts`, Migrations aar773/aar84/cluster-fg). Ergänzt `claim-ssot-vollmigration-audit-strategie.md` §3.1c.
