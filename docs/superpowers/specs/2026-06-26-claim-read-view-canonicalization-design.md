# Claim-Read-View-Kanonisierung — `v_claim_base` + 2 dünne Layer

**Datum:** 2026-06-26
**Status:** Design (approved — Richtung + kanonische Defaults a/b bestätigt; Spec-Review-Gate offen)
**Branch:** `kitta/view-canon-claim-base` (off staging)
**Herkunft:** Kanonizitäts-Audit 25.06. ([[COORDINATION-claims-onboarding-canon-audit]]), Read-Layer-Befund.

---

## 1. Problem

Es gibt **zwei parallele Claim-Detail-Read-Views**, die dieselben Daten exponieren:

| View | Spalten | Charakter | Hauptkonsumenten |
|---|---|---|---|
| `v_faelle_mit_aktuellem_termin` (vfmat) | 339 | breite **operative** View (voller Lifecycle + „aktueller Termin" flach gejoint) + Legacy-Naming (`schadens_*`/`unfall*`) + viele `NULL::type`-Kompat-Platzhalter | Admin-Fallakte (`getFallById`/`getFallForSv`), AI-Briefing, Copilot, Finance (`abrechnungen-generator`), autoPhase, faq-bot, Termin-Engine-Adjazenz |
| `v_claim_full` (vcf) | 165 | **Entity-Aggregat**-View (claim-native Naming + JSONB-Aggregate parties/payments/repairs/mietwagen/vs_korrespondenz/vehicle_involvements) | Kunde-Portal (`getKundeFaelle`, `getKundeFallDetailRecord`), `getClaimForRole`, Kalender-Kontext |

**112 Spalten geteilt, je großer Eigenanteil (227 nur vfmat / 53 nur vcf).**

### Der eigentliche Schaden (dreifach)
1. **Duplizierte Entity-Sourcing-Logik:** Beide Views re-implementieren **dieselben ~13 LATERALs/Joins** unabhängig — halter-Party, verursacher-Party, geschädigter-Party (je `claim_parties` + `personen` + `firmen`), `vehicles` (eigenes + Gegner), `versicherungen`, `vehicle_vorschaeden`, `gutachten`, `kanzlei_faelle`, `v_claim_phase`, „aktueller Termin", „aktueller Auftrag", `faelle_claim_bridge`. Jede Entity-Änderung (z.B. #3098-Repoint) muss **zweimal** gepflegt werden.
2. **Sie sind bereits auseinandergelaufen (aktive Inkonsistenz, nicht hypothetisch):**
   - **geschädigter-Party:** vcf ordnet `reihenfolge, created_at`; vfmat ordnet `created_at, id` → bei mehreren geschädigter-Parties können die zwei Views **unterschiedliche Kunden-/Adressdaten** für denselben Claim liefern.
   - **„aktueller Termin":** vcf nimmt „neuester per `start_zeit`" (LATERAL `spd_termin`); vfmat nimmt `get_aktueller_gt_termin_id(c.id)` (LATERAL `t`) → **unterschiedlicher Termin** ⇒ unterschiedlicher `besichtigungsort_*`, `no_show_gemeldet_am`, `re_termin_*`.
3. **Namens-Divergenz** für identische Quellspalten: z.B. `claims.hergang_kunde_text` → vcf `hergang_kunde_text`; vfmat **3×** als `schadens_beschreibung` / `unfallhergang` / `schadens_hergang`. `claims.schadentag` → vcf `schadentag`; vfmat `schadens_datum` + `unfalldatum`. `claims.schadenort_adresse` → vcf `schadenort_adresse`; vfmat `schadens_adresse` + `unfallort`. `claims.schadenart` → vcf `schadenart`; vfmat `schadens_art`. `claims.schadenzeit` → vfmat `unfall_uhrzeit`.

→ Doppelpflege **plus** Drift-Risiko **plus** bereits-existierende Inkonsistenz. „Kanonisierung" = **ein** Entity-Sourcing-SSoT.

---

## 2. Ziel / Nicht-Ziel

**Ziel:** Das Entity-Sourcing genau **1×** definieren (`v_claim_base`), beide öffentlichen Views als **dünne Layer** darauf neu aufsetzen. Drift + Doppelpflege eliminiert; die beiden bestehenden Output-Shapes (operativ-breit / Entity-Aggregat) bleiben erhalten.

**Harte Invariante:** Beide öffentlichen Views (`v_claim_full`, `v_faelle_mit_aktuellem_termin`) behalten **exakt** ihre heutigen Output-Spaltennamen + -Typen → **0 Consumer-Rewrites**. Geändert werden ausschließlich die **Werte** der 2 heute driftenden Felder (siehe §5) — das ist der gewollte Fix.

**Nicht-Ziel:**
- Kollaps auf eine einzige View (verworfen — die 2 Shapes dienen genuin verschiedenen Consumern).
- Consumer-Umbauten / Spalten-Renames in der App (Namen bleiben; Legacy-Aliase bleiben in vfmat).
- View-Konsolidierung mit `v_claim_listing` / `v_claim_phase` (eigene, kleine Views — out of scope).
- Backfill von Daten (separat; die 3 „person-losen Parties" sind Test-Daten, s. Audit-Marker).

---

## 3. Architektur

```
                 ┌──────────────────────────────┐
                 │        v_claim_base (NEU)     │   ← einziges Entity-Sourcing-SSoT
                 │  claims c + alle ~13 LATERALs │     (flache kanonische Spalten,
                 │  → flache kanonische Spalten  │      claim-native Naming)
                 └───────────────┬──────────────┘
                   ┌─────────────┴─────────────┐
        ┌──────────▼──────────┐     ┌──────────▼─────────────────────┐
        │   v_claim_full      │     │ v_faelle_mit_aktuellem_termin   │
        │ = base-Subset       │     │ = base-Spalten + Legacy-Aliase  │
        │   + JSONB-Aggregate │     │   + NULL-Kompat-Platzhalter     │
        │   (vcf-spezifisch)  │     │   + operative Passthrough       │
        └─────────────────────┘     └─────────────────────────────────┘
```

### `v_claim_base` (neu) — Inhalt
- **Anker:** `claims c` + `faelle_claim_bridge fcb` (für `fall_id`; Hinweis: post-CMM-49 gilt `fall_id === claim_id`).
- **Alle Entity-LATERALs genau 1×** (kanonisch, mit den unten festgelegten Defaults):
  - `halter_p` — halter-Party (`claim_parties.ist_halter=true`) → `personen` → halter_*
  - `geschaedigter_p` — geschädigter-Party → `personen` + `firmen` → kunde_*/ist_fahrzeughalter
  - `verursacher_p` — verursacher-Party → versicherungsnummer/aktenzeichen/kennzeichen/versicherung_klartext/fahrzeugtyp_klartext/firma_id/person_id/vehicle_id
  - `gegner_firma` (`firmen` via verursacher.firma_id), `gegner_person` (`personen` via verursacher.person_id), `gegner_vehicle` (`vehicles` via verursacher.vehicle_id), `gegner_versicherung` (`versicherungen` via `claims.gegner_versicherung_id`)
  - `vehicle` (`vehicles` via `claims.vehicle_id`) → kennzeichen/hersteller/modell/typ/fin/baujahr/farbe/hsn/tsn/km/erstzulassung/cardentity_*
  - `vorschaeden` (`vehicle_vorschaeden` count/max)
  - `gutachten` (`gutachten` via claim_id)
  - `kanzlei` (`kanzlei_faelle` via claim_id)
  - `phase` (`v_claim_phase`)
  - `aktueller_termin` (siehe §5 Decision a) — die volle aktuelle-`gutachter_termine`-Zeile, damit beide Layer ihre Termin-Felder daraus ziehen
  - `aktueller_auftrag` (`auftraege` neuester per `reihenfolge`) — volle relevante Spalten (filmcheck_*, sv_briefing_*, technische_stellungnahme_*, storno_*) für vfmat; vcf nutzt nur `storniert_am`
- **Claim-native Spaltennamen** als kanonische Quelle (`schadenort_*`, `schadentag`, `schadenzeit`, `schadenart`, `hergang_kunde_text`, `hergang_sv_text`). Aliase macht der vfmat-Layer.
- **Keine** JSONB-Aggregate im Base (Performance, §6) — die bleiben im vcf-Layer.
- **Keine** `NULL::type`-Kompat-Platzhalter im Base — die bleiben im vfmat-Layer.

### `v_claim_full` (Layer)
`SELECT <base-Spalten in vcf-Naming + vcf-only claim-Spalten> + <JSONB-Aggregate: parties, vehicle_involvements, payments, mietwagen, vs_korrespondenz, repairs> FROM v_claim_base b`. `id` = `b.claim_id`.

### `v_faelle_mit_aktuellem_termin` (Layer)
`SELECT <base-Spalten + Legacy-Aliase (schadens_*/unfall*) + NULL::type-Platzhalter + operative Passthrough> FROM v_claim_base b`. `id` = `b.fall_id` (== claim_id). Die `aktueller_termin_*`-Flachfelder + `sv_termin`/`gutachter_termin_*` kommen aus `b.aktueller_termin`.

---

## 4. Kanonisches Naming (im Base)

Base führt die **claim-native** Spalte als Quelle; Aliase nur im vfmat-Layer (Kompat). Mapping-Auszug:

| claims-Quelle | Base (kanonisch) | vfmat-Aliase (Kompat-Layer) |
|---|---|---|
| `hergang_kunde_text` | `hergang_kunde_text` | `schadens_beschreibung`, `unfallhergang`, `schadens_hergang` |
| `schadentag` | `schadentag` | `schadens_datum`, `unfalldatum` |
| `schadenort_adresse` | `schadenort_adresse` | `schadens_adresse`, `unfallort` |
| `schadenort_plz/ort` | `schadenort_plz/ort` | `schadens_plz`, `schadens_ort` |
| `schadenart` | `schadenart` | `schadens_art` |
| `schadenzeit` | `schadenzeit` | `unfall_uhrzeit` |
| `schadenort_kategorie` | `schadenort_kategorie` | `unfallort_kategorie` |
| `schadenort_lat/lng` | `schadenort_lat/lng` | `unfallort_lat/lng` |

Vollständiges Mapping wird im Implementierungs-Plan aus den beiden aktuellen View-DDLs 1:1 abgeleitet (jede vfmat-Output-Spalte → ihre Base-Quelle).

---

## 5. Kanonische Entscheidungen (Verhaltensänderungen — approved a/b)

**(a) „Aktueller Termin" = `get_aktueller_gt_termin_id(claim_id)`** (vfmats Logik, dedizierte Funktion = bewusste „aktiver Termin"-Definition) — ersetzt vcfs „neuester per `start_zeit`".
- **Effekt:** vcf-Felder `besichtigungsort_*`, `no_show_gemeldet_am`, `re_termin_token*`, `re_termin_eskalation_an_kb_am` können sich für Claims ändern, bei denen „neuester per start_zeit" ≠ `get_aktueller_gt_termin_id()`. **Impl muss diese Felder pro Claim diffen + den Delta-Satz reviewen** (erwartet: klein; die Funktion ist die intendierte Definition).
- **Impl-Vorbedingung:** `get_aktueller_gt_termin_id()`-Definition lesen + bestätigen, dass sie die fachlich gewünschte „aktive Termin"-Zeile liefert (inkl. NULL-Fall = kein Termin).

**(b) Party-Ordering = `reihenfolge, created_at`** (vcfs Logik; `reihenfolge` ist das explizite Sortierfeld) — ersetzt vfmats `created_at, id` für die geschädigter-Party.
- **Effekt:** vfmat-`kunde_*`-Felder können sich für Claims mit >1 geschädigter-Party ändern. **Impl muss diffen + reviewen** (erwartet: minimal — heute hat fast jeder Claim genau 1 geschädigter-Party).
- Gilt einheitlich für alle Party-LATERALs (halter/verursacher/geschädigter) → eine Ordering-Regel.

---

## 6. Performance

- Postgres **inlined** View-on-View (der Planner expandiert `v_claim_full`/vfmat in die Base-Query und projiziert). LEFT-JOINs auf Unique-Keys, die ein Layer nicht selektiert, können geprunt werden.
- **Aggregate bleiben im vcf-Layer** (nicht im Base) → vfmat zahlt nicht für parties/payments/… die es nicht braucht.
- **`NULL::type`-Platzhalter im vfmat-Layer** (nicht im Base) → kein toter Compute im Base.
- **Impl-Gate:** `EXPLAIN ANALYZE` für je einen typischen Single-Row-Read (`WHERE id = $1`) auf beiden neuen Layern vs. den heutigen Views — **keine Plan-Regression** (gleiche LATERAL-Anzahl wie heute, nur 1× definiert). Bei Regression: Layer-Selects verschlanken oder Base als `sql`-STABLE-Function evaluieren.

---

## 7. Verifikation (Sicherheit) — Äquivalenz-Harness

Vor jedem Cutover, pro View:
1. **Spalten-Shape:** `information_schema.columns` der NEUEN Layer-View == der ALTEN (gleiche Namen + Typen, gleiche Anzahl). Hartes Gate.
2. **Wert-Äquivalenz pro Claim (alle Rows):** für jede Output-Spalte muss `alt` == `neu` gelten — **außer** den unter §5 (a)/(b) bewusst vereinheitlichten Feldern. Praktisch über eine Vergleichs-Query (alte View als `CREATE TEMP VIEW old_X AS <alte def>` gegen die neue), `EXCEPT`-Diff je Spalte oder ein row-hash-Vergleich über die nicht-ausgenommenen Spalten.
3. **Delta-Review:** Der §5-Delta-Satz (Termin-/Ordering-bedingte Wert-Änderungen) wird pro Claim aufgelistet + manuell als „gewollt" abgenommen.

---

## 8. Rollout / Phasen

DDL **ausschließlich via Supabase-Plugin** (`apply_migration`, Regel 2), getrackte Migration; File-Name == getrackte Version. `CREATE OR REPLACE VIEW` ist reversibel (alte Defs in der Migration als Kommentar + im git-Verlauf gesichert).

- **Phase 1:** `CREATE v_claim_base` + `CREATE OR REPLACE v_claim_full` als Layer. Harness §7 gegen das alte vcf. Eine Migration.
- **Phase 2:** `CREATE OR REPLACE v_faelle_mit_aktuellem_termin` als Layer. Harness §7 gegen das alte vfmat. Eine Migration.
- Jede Phase: Migration → list_migrations → File benennen → execute_sql-Verifikation → Harness → tsc/build (Types ggf. regenerieren falls Consumer Typen ziehen).
- **Reihenfolge bewusst vcf zuerst** (kleiner, weniger Consumer-Risiko) — Lerneffekt vor dem 339-Spalten-vfmat.

---

## 9. Koordination / Risiko

- **CMM-49-Hot-Infra:** Beide Views sind aktiv CMM-49-Territorium (#3098 = vfmat-Entity-Repoint, erst 23.06.). 9 Sessions aktiv. **Vor der Implementierung:** via Marker prüfen, ob eine Session gerade an `v_claim_full`/vfmat/den Entities baut; in ein ruhiges Fenster legen; kein Blind-DDL.
- **Blast-Radius:** Beide Views speisen Admin/SV/Kunde/AI/Finance. Die Shape-Invariante (§2) + der Harness (§7) sind die Absicherung.
- **Reversibilität:** Pro Phase 1 Migration; Rückfall = alte View-Def re-applien.
- **Types:** Falls `database.types.ts` die View-Spalten trägt → nach Phase 2 `generate_typescript_types`. Da Namen/Typen unverändert: i.d.R. kein Consumer-Code-Change.

---

## 10. Offene Punkte für den Spec-Review
- §5(a)/(b): final ok? (approved, hier zur Bestätigung im Review.)
- Phasen-Schnitt (vcf zuerst) ok?
- Soll der Implementierungs-Plan den vollständigen Spalten-für-Spalten-Mapping-Anhang (jede der 339 + 165 Output-Spalten → Base-Quelle) enthalten, oder reicht das Muster + Ableitung im Plan-Schritt? (Empfehlung: vollständiger Mapping-Anhang — er IST die Implementierung.)
