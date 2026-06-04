# CMM Entity-Katalog — Spec (PLAN, Stand 2026-06-04)

**Status: PLAN — KEIN Code.** Execution wartet auf CMM-49 (faelle-Drop) + ruhiges aar-939-Fenster, koordiniert/supervised. Diese Spec **erweitert** die Ziel-Spec `cmm-entity-model-target-spec.md` (#2348) um die fehlende **Dedup-/Resolver-Schicht**, die **Presentation-Schicht** und den **Lead→Entity-Input-Contract**. Live-verifiziert gegen `paizkjajbuxxksdoycev` am 04.06.

**Koordination:** CMM-49 (PR #2425 — orthogonal, Seam = `v_claim_full`-Read-Contract) · Lead-/FlowLink-Strecke (Session 753d8096 — Lead→Entity-Input-Contract §6) · Memory `project_cmm_entity_model`.

---

## §0 · Prinzip (Aaron 04.06.)

1. **Statische, global wiederverwendbare Entitäten** (Identitäten der Welt — Person, Fahrzeug, Firma, Versicherer, Werkstatt, …) = **eine SoT pro realem Ding, deduped**; alle Referenzen routen per **FK** darauf.
2. **Der Claim = SSoT des DYNAMISCHEN Vorfalls** — er bindet die Entitäten per **Rolle** + besitzt die dynamische Wahrheit (Schaden, Konstellation, Lifecycle). „Das macht den Claim erst zur SSoT."
3. **Drei Schichten:** **Storage** (normalisierte Entitäten) → **Population/Write** (dedupende `ensure<Entity>`-Resolver in der Konvertierung) → **Presentation/Read** (Claim-Views aggregieren pro Rolle wieder „alles im Claim zusammengefasst").
4. **Niemals flach-per-Claim + keine Dupes:** entity-Daten gehen durch dedupende Resolver in die Entitäten, nie als flache Kopie auf `claims`. Sonst nur „flaches Modell von faelle nach claims verschoben" + N-fach derselbe Mensch/Wagen/Versicherer.

---

## §1 · Entity-Katalog (vollständig, live-verifiziert)

### Layer 1 — Globale Entitäten (SoT + Dedup-Resolver)

| Entität | SoT-Tabelle | Dedup-Key / Resolver | Claim-Link | Stirbt rein (flach→Entität) | Status |
|---|---|---|---|---|---|
| Account-Mensch (Kunde/Staff/SV-Person) | `profiles` | auth `user_id` / `email` (UNIQUE) | `claims.geschaedigter_user_id` · `kundenbetreuer_id`/`makler_id`/`faelle.dispatch_id` · `claim_parties.user_id` | — | ✅ kanonisch |
| Nicht-Account-Mensch (Gegner/Zeuge/Halter-Person/AP) | `personen` | `user_id`; sonst Identity-Engine (verified-contact / name+gebdat) | `claim_parties.person_id` | `claim_parties` flache Person-Felder, `parteien`, `personenschaden_personen` | Resolver `ensurePersonForData` ✅, **auto-dedupe-reversibel (§2)** |
| **Firma** (Gegner-/Halter-Firma, Gewerbe-Partei) | `firmen` | `normalized_name` + `ust_id` | `claim_parties.firma_id` + `rolle` | `claim_parties.firma` TEXT, `leads.firma_name/firma_ustid`, `claims.gegner_name` (Firma-Fall) | Tabelle da (0 Rows, nur PK) · **`ensureFirma` + `ansprechpartner_person_id` = TODO** |
| Fahrzeug | `vehicles` | **FIN** (UNIQUE) / `kennzeichen_normalized` (provisorisch) | `claims.vehicle_id` · `claim_vehicle_involvements.rolle` · `claim_parties.vehicle_id` | `claims.fahrzeug_*`/`kennzeichen*`/`hsn`/`tsn`, gegner-Fahrzeug-Klartext | FIN: `ensureVehicleFromFin` ✅ · **Kennzeichen-Resolver = TODO** |
| **Schaden** (am Fahrzeug, dynamisch im Claim) | `vehicle_damages` (NEU, vereinheitlicht mit `vehicle_vorschaeden`) | `vehicle_id` + `claim_id` (+ Lifecycle-State) | `claims` referenziert current; Positionen = `schadenspositionen` | `claims.fahrzeugschaden_beschreibung`/`hergang`/`sachschaden_beschreibung` | **NEU — §4** |
| **Vorschaden** (am Fahrzeug, eingefroren) | `vehicle_vorschaeden` (→ ggf. `vehicle_damages` mit State=`vorschaden`) | `vehicle_id` (+schaden_datum/art) | claim-unabhängig (Fahrzeug-Historie) | — | Tabelle da (0 Rows), vehicle-bound ✅ · §4 |
| Versicherer | `versicherungen` | `normalized_name` (+ bafin) | `claims.gegner_versicherung_id` · `claim_parties.versicherung_id` (eigene/gegner) | `claim_parties.versicherung_klartext`, `leads.gegner_versicherung` | 95-Registry, `name` UNIQUE (exakt) · **`ensureVersicherung` create+normalized = TODO** |
| Werkstatt | `werkstaetten` | `normalized_name` (+ adresse/`ust_id`) | `repairs.werkstatt_id` | — | Stub (0 Rows) · `ensureWerkstatt` = TODO |
| Mietwagen-Unternehmen | `mietwagenunternehmen` | `normalized_name` | `claim_mietwagen.mietwagenunternehmen_id` | `claim_mietwagen.anbieter` TEXT | (0 Rows) · `ensureMietwagen` = TODO |
| Kanzlei | `kanzleien` | `normalized_name` / `ust_id` | `kanzlei_faelle.kanzlei_id` | `claims.kanzlei_ansprechpartner_*` (→ Person der Kanzlei) | (1 Row) · Resolver in `resolveFallEntityFks` (fuzzy) |
| **Gutachter-Org** („unser Paket") | `organisationen` | `normalized_name` (+`ust_id`) | `sachverstaendige.organisation_id`; kann auch Schädiger-Partei sein (→ via `firmen`) | — | **NICHT droppen** (Q1 revidiert); SV-Bündelung; typ/parent/stripe/branding |
| SV (Business-Entität) | `sachverstaendige` | `profile_id` (Account) | `claims.sv_id` | — | ✅ (= `profiles` via profile_id, gehört zu organisationen) |

### Layer 2 — Claim-Link/Rolle (per-Claim, KEINE Entität)
`claim_parties` (Person **ODER** Firma + Rolle + Facetten-Flags; trägt schon `person_id`/`firma_id`/`vehicle_id`/`versicherung_id`) · `claim_vehicle_involvements` (Fahrzeug↔Claim + rolle) · `claim_mietwagen` · `repairs` (Fahrzeug×Werkstatt×Claim×Kosten).

### Layer 3 — Claim-Child / Work-Product (claim-gebunden, KEINE globale Entität)
`gutachten`(+`gutachten_positionen`/`_fotos`) — Werte hier, `claims` hält dünnen Rollup `schadens_hoehe_netto` · `schadenspositionen` (Line-Items des Schadens) · `vehicle_ownership_history`.

### Claim-native (auf `claims`, KEINE Entität)
Status/Lifecycle/Workflow · Schadensereignis-Metadaten (`schadentag`/`schadenort_*`/`schadenart`/`unfall_konstellation`) · Bank/Zahlung (Decision 5) · Leasing/Finanz (Decision 6) · Refs/Dates/Doc-Paths.

### Legacy (stirbt)
`parteien` → `claim_parties`/`personen` · `personenschaden_personen` → `personen`. (**Entity ownt deren `fall_id`-FK-Retirement** — kritischer Pfad fürs finale `DROP faelle`, mit CMM-49 abgestimmt.)

---

## §2 · Dedup-Prinzip (3 Klassen) + Resolver-Foundation

**Aaron Q2: alle auto-dedupen.** Mechanismus pro Klasse:
- **Orgs** (firmen/versicherungen/werkstaetten/mietwagenunternehmen/kanzleien/organisationen): **`normalized_name`(+ust_id/bafin), deterministisch auto** — semantisch sicher.
- **Fahrzeuge:** **FIN** kanonisch; FIN-los = `kennzeichen_normalized` provisorisch (mergebar wenn FIN auftaucht; Kennzeichen wird neu vergeben → schwacher Key).
- **Menschen:** Account (`user_id`/`email`) + Identity-Engine (verified-contact HART, name+gebdat STARK) — **auto**, ABER **reversibel** (`personen.canonical_person_id`/`claim_parties.previous_person_id`-Tombstone) + **tiered** (verified > name+gebdat) + Audit (Dublettenliste #2382). (Reversibilität = die DSGVO-/False-Merge-Sicherung bei zwei echten Gleichnamigen.)

**Resolver-Foundation (HARTE Vorbedingung vor Writer-Wiring je Typ):**
1. `normalized`-Schlüssel-Spalten je Entity (`firmen.normalized_name`, `versicherungen.normalized_name`, `werkstaetten.normalized_name`, `mietwagenunternehmen.normalized_name`, `personen.firma_normalized` n/a [Firma = eigene Tabelle], `vehicles.kennzeichen_normalized`).
2. `ensure<Entity>`-Resolver je Typ (§5).
3. dedupe-Backfill (v.a. 95er-`versicherungen`-Registry).
4. Writer routen per FK auf die SoT. **Kein Writer feuert ohne seinen Resolver.**

---

## §3 · Firma ↔ Ansprechpartner (mit Lead-Strecke abgestimmt)

**Beides — verschiedene Fragen, nicht entweder/oder:**
- **Stehender Default-Kontakt** „Firma X hat Kontakt Y" → **`firmen.ansprechpartner_person_id`** (NEU) → `personen`. Global, claim-unabhängig, wiederverwendbar. Normalfall.
- **Rolle pro Claim** → `claim_parties.firma_id` + `rolle` (`gegner`/`halter`). Bei „Gegner/Halter = Firma" wird **`firma_id` gefüllt, NICHT `nachname`-Klartext**.
- **Abweichender Kontakt pro Claim** (selten) → zusätzliche `claim_parties`-Row mit **`rolle='ansprechpartner'`** (NEU im rolle-CHECK, wie `'halter'`). Default reicht `firmen.ansprechpartner_person_id`; Kontakt NICHT in jede Claim-Party duplizieren.

---

## §4 · Schaden + Vorschaden = fahrzeug-gebundene Damage-Entitäten

**„Der Schaden von heute ist der Vorschaden von morgen am selben Fahrzeug"** — gleiche Entitäts-Art, verschiedene Lifecycle-States:
- **Schaden** = aktueller, dynamischer Schaden, im Claim begutachtet (`vehicle_id`+`claim_id`, State=`aktuell`). Line-Items = `schadenspositionen` (claim-gebunden). Heute flach (`claims.fahrzeugschaden_beschreibung`) → soll vehicle-linked.
- **Vorschaden** = vergangener, eingefrorener Schaden (Fahrzeug-Historie, claim-unabhängig; aus Cardentity/ZB1). Heute `vehicle_vorschaeden` (vehicle-bound ✅).
- **Vorschlag:** `vehicle_vorschaeden` → generalisieren zu `vehicle_damages` (vehicle_id, claim_id nullable, state ∈ {aktuell, vorschaden}, art/schwere/datum/quelle/beschreibung). Schaden→Vorschaden = State-Übergang beim Claim-Abschluss. Macht den Claim zur dynamischen SSoT + das Fahrzeug zum stabilen Damage-Historie-Träger.

---

## §5 · Population (3-Schicht-Verdrahtung) + `ensure<Entity>`-Signaturen

**Schicht-Trennung (mit Lead-Strecke abgestimmt):**
- **`ensure<Entity>`-Module** (Entity-Revier, konsistent zu `ensure-vehicle`/`ensure-person`): dedupende find-or-create-Resolver.
- **`resolveFallEntityFks`** = dünner Orchestrator (von „fuzzy-only" → „resolve-or-ensure"), ruft `ensure<Entity>`, gibt FKs zurück.
- **`convert-lead-to-claim`** = Population-Sequenz (Schritt 4/5 `claim_parties`+`involvements`), konsumiert die FKs. Bleibt lesbar.

**`ensure<Entity>`-Signaturen (Entity definiert — Lead-Strecke dockt Lead-Felder an):**
| Resolver | Pflicht-Input | Dedup-Key | liefert |
|---|---|---|---|
| `ensurePersonForData` ✅ | user_id? + name/email/telefon-Snapshot | user_id / Identity-Engine | `person_id` |
| `ensureVehicleFromFin` ✅ | fin + Snapshot | FIN | `vehicle_id` |
| `ensureVehicleFromKennzeichen` (NEU) | kennzeichen (+Klartext) | `kennzeichen_normalized` (provisorisch) | `vehicle_id` |
| `ensureFirma` (NEU) | `firma_name` + `ust_id` (+ optional Kontakt-Person) | `normalized_name`+`ust_id` | `firma_id` (+ setzt `ansprechpartner_person_id`) |
| `ensureVersicherung` (NEU) | `versicherung_klartext` | `normalized_name` (fuzzy → create-if-missing) | `versicherung_id` |
| `ensureWerkstatt` / `ensureMietwagen` (NEU, später) | name (+adresse/ust_id) | `normalized_name` | `*_id` |

---

## §6 · Lead→Entity-Input-Contract (geteiltes Artefakt mit Lead-/FlowLink-Strecke)

Welche flachen Lead-Felder die `ensure<Entity>` brauchen — Lead/FlowLink garantiert deren saubere Befüllung (+ dynamic-display: schon vorhandene vorausgefüllt, nicht neu abgefragt):

| Entität | Lead-Feld(er) | → Resolver |
|---|---|---|
| Gegner-Fahrzeug | `gegner_kennzeichen` (+ `gegner_fahrzeugtyp` Klartext) | `ensureVehicleFromKennzeichen` |
| Firma (Gegner/Halter) | `firma_name` + `firma_ustid` (+ Rolle) | `ensureFirma` |
| Versicherung | `gegner_versicherung` (Klartext, existiert) | `ensureVersicherung` |
| Halter | `halter_*` (aus ZB1) — **⚠️ Halter kann Firma sein** (Leasing/Firmenwagen) → dann `firma_name/ustid` statt Person | `ensureFirma` ODER `ensurePersonForData` |

**Intersection mit FlowLink:** „Ansprechpartner = Halter?" + „Halter = Person oder Firma?" feedet genau den Firma/Person-Resolver. Lead-Strecke richtet die Lead-/FlowLink-Felder an diesen Input-Namen aus.

---

## §7 · Presentation (Read) — „alles im Claim zusammengefasst", pro Rolle

**„Steht schon" — adaptieren + viel erweitern, nicht neu bauen.** `v_claim_full` aggregiert bereits als jsonb: `parties`, `vehicle_involvements`, `mietwagen`, `repairs`, `payments`, `vs_korrespondenz`, `vorschaden`. Rollen-Views existieren: `faelle_kunde_view`, `faelle_sv_view`, `v_claim_sv`, `v_sv_inbox`, `v_claim_for_gast`, `v_claim_parties_safe`, `v_claim_listing/phase/timeline`.

**Adapt+Extend (entity-sourcen, pro Rolle):**
- `parties[]` → `person_id`→`personen` (Entity-Namen) + **`firma_id`→`firmen`(+Ansprechpartner)**.
- `vehicle_involvements[]` → entity-sourced `vehicles` (inkl. Gegner-Fahrzeug).
- **NEU aggregieren:** `vorschaeden[]` / `schaden` (vehicle-bound) · resolved `gegner_name`/`gegner_versicherung_name`/`werkstatt_name`.
- **Rollen-scoped** (Kunde: eigene Partei + Gegner-Summary + Status; SV: Begutachtung; Gast: leak-safe) — **`v_claim_parties_safe`/§2-Invariante wahren** (Entity-Sourcing leakt nicht mehr PII über Rollen).

**Eingefrorener `v_claim_full`-Contract für CMM-49 (Gegner/VS = flache Namen, additiv):**
- `gegner_name` = `COALESCE(firmen.name, personen-Name)` (Gegner = Firma oder Mensch)
- `gegner_versicherung_name` = `versicherungen.name` via `gegner_versicherung_id`
- ids bleiben (`gegner_versicherung_id`/`gegnerisches_vehicle_id`). Konsistent zu den schon-flachen `halter_*`/`fahrzeug_*`/`kennzeichen`. Namen+Typen beim Freeze fixiert, nur additiv.

---

## §8 · Koordination / Ownership / Gates / Reihenfolge

**Ownership:** Storage+Resolver+`ensure<Entity>`+View-Entity-Sourcing+`parteien`/`personenschaden_personen`-Retirement = **Entity (wir)**. `convert-lead-to-claim`-Population-Sequenz + upstream Lead/FlowLink = **Lead-Strecke (753d8096)**. Relationale `fall_id→claim_id`-Rekeys + `DROP faelle` + View-Repoints = **CMM-49 (#2425)**.

**Seam-Verträge:** (a) `v_claim_full`-Read-Contract (§7) ↔ CMM-49. (b) `ensure<Entity>`-Inputs (§5) ↔ Lead→Entity-Contract (§6) ↔ Lead-Strecke.

**Gates / Reihenfolge (Aaron: PLAN jetzt, Execution nach CMM-49):**
1. CMM-49 fährt clean-core (entity-frei, orthogonal) — läuft.
2. Entity: Resolver-Foundation (normalized-Spalten + `ensure<Entity>` + dedupe-Backfill) — **erst nach CMM-49 / ruhigem Fenster, supervised.**
3. Writer-Wiring: `resolveFallEntityFks` → resolve-or-ensure (koordiniert mit Lead-Strecke, in deren `convert-lead-to-claim`).
4. View-Entity-Sourcing (`v_claim_full`-Def, 1 Mig, keine App-Files) — entsperrt CMM-49 Bucket-2.
5. Flat-Drop (`claim_parties`-Person-Felder, `parteien`, `personenschaden_personen`, faelle-Spalten) — Pre-Drop **ungekappt** + Post-Drop-Smoke. Finales `DROP faelle` erst FK==0 über ALLE Strecken (CMM-49 pingt).

**Harte Regeln:** §2-Invariante (Access nie über `person_id`) · Resolver service_role-only wo PII · DDL nur via `apply_migration` · nie main / PR gegen staging / nicht selbst mergen · operative_status-Loch (Claim 6f2b) vor status-Drop füllen.
