# Lead → Fall Handoff-Mapping

> **AAR-584 (C1):** Menschen-lesbare Doku des Lead→Fall-Converters.
> **Source of Truth im Code:** [`src/lib/lead-fall-mapping.ts`](../src/lib/lead-fall-mapping.ts).
> **Verwendet in:** `signSAandCreateFall` — beim Fall-Anlegen nach erfolgreicher SA-Signatur des Kunden.

Diese Doku spiegelt den Code-Stand aus `lead-fall-mapping.ts`. Wenn du ein neues Feld dort hinzufügst, trage es hier parallel ein (oder genauer: diese Doku wird bei Änderungen regeneriert und in einem PR aktualisiert).

## 1. Kategorien-Überblick

Der Converter kennt 5 Kategorien:

| Kategorie | Semantik | Handling |
|---|---|---|
| **DIRECT** | `faelle`-Spalte heißt genauso wie `leads`-Spalte | `insert[field] = lead[field] ?? null` |
| **DEFAULT** | Gleicher Name, aber NOT-NULL-Spalte mit explizitem Fallback | `insert[field] = lead[field] ?? defaultValue` |
| **RENAMED** | `faelle`-Spalte heißt anders als `leads`-Spalte | `insert[fallField] = lead[leadField] ?? null` |
| **RENAMED + DEFAULT** | Renamed + NOT-NULL-Fallback | `insert[fallField] = lead[leadField] ?? defaultValue` |
| **TRANSFORM** | Wert wird vor Übernahme konvertiert (z. B. Number-Cast) | `insert[fallField] = transform(lead[leadField])` |
| **COMPUTED** | Konstante oder aus Option berechnet (`fall_nummer`, `status`, `service_typ`…) | Siehe `fallComputedFields()` |
| **ENTITY-RESOLVER** | Foreign-Key-IDs (4 Entities) via Lookup gelöst | Siehe `resolveFallEntityFks()` |

## 2. DIRECT_FIELDS (identischer Name)

| `faelle`-Spalte | Quelle | Bei NULL | Kontext / Linear |
|---|---|---|---|
| `schadens_fall_typ` | `lead.schadens_fall_typ` | `null` | Schadentyp aus Dispatch-Phase 3 |
| `kunden_konstellation` | `lead.kunden_konstellation` | `null` | KK-01…KK-06 aus Qualifizierung |
| `spezifikation` | `lead.spezifikation` | `null` | KFZ-154 Dispatcher-Match |
| `schadens_art` | `lead.schadens_art` | `null` | KFZ-154 |
| `unfall_konstellation` | `lead.unfall_konstellation` | `null` | KFZ-153 |
| `gegner_anzahl_beteiligte` | `lead.gegner_anzahl_beteiligte` | `null` | KFZ-153 |
| `gegner_fahrzeugtyp` | `lead.gegner_fahrzeugtyp` | `null` | KFZ-153 |
| `kennzeichen` | `lead.kennzeichen` | `null` | |
| `fahrzeug_hersteller` | `lead.fahrzeug_hersteller` | `null` | |
| `fahrzeug_modell` | `lead.fahrzeug_modell` | `null` | |
| `fahrzeug_farbe` | `lead.fahrzeug_farbe` | `null` | |
| `erstzulassung` | `lead.erstzulassung` | `null` | DD.MM.YYYY aus ZB1-OCR |
| `fahrzeug_baujahr` | `lead.fahrzeug_baujahr` | `null` | AAR-181 Pflichtfeld Phase 4 |
| `hsn` | `lead.hsn` | `null` | AAR-576 A2 — DAT-API-Blocker, aus ZB1 |
| `tsn` | `lead.tsn` | `null` | AAR-576 A2 |
| `gegner_name` | `lead.gegner_name` | `null` | |
| `gegner_versicherung` | `lead.gegner_versicherung` | `null` | Freitext (legacy) |
| `gegner_versicherung_id` | `lead.gegner_versicherung_id` | Fuzzy-Match Fallback aus Resolver | AAR-265 + AAR-545 D — FK auf versicherungen-Stammdaten |
| `gegner_kennzeichen` | `lead.gegner_kennzeichen` | `null` | |
| `unfallhergang` | `lead.unfallhergang` | `null` | |
| `polizei_aktenzeichen` | `lead.polizei_aktenzeichen` | `null` | BUG-73 / AAR-124 |
| `polizei_vor_ort` | `lead.polizei_vor_ort` | `null` | |
| `unfallort_kategorie` | `lead.unfallort_kategorie` | `null` | parkplatz / strasse / autobahn / … |
| `firma_name` | `lead.firma_name` | `null` | Gewerbe |
| `wunschtermin` | `lead.wunschtermin` | `null` | AAR-264 SV-Matching |
| `source_channel` | `lead.source_channel` | `null` | google-ads / website / telefon / … |
| `source_domain` | `lead.source_domain` | `null` | |
| `schadens_hergang` | `lead.schadens_hergang` | `null` | KFZ-208 |
| `halter_vorname` | `lead.halter_vorname` | `null` | KFZ-208 |
| `halter_nachname` | `lead.halter_nachname` | `null` | |
| `halter_strasse` | `lead.halter_strasse` | `null` | |
| `halter_plz` | `lead.halter_plz` | `null` | |
| `halter_stadt` | `lead.halter_stadt` | `null` | (⚠️ **nicht** `halter_ort`, siehe AAR-598) |
| `halter_telefon` | `lead.halter_telefon` | `null` | |
| `halter_email` | `lead.halter_email` | `null` | |
| `finanzierungsgeber_name` | `lead.finanzierungsgeber_name` | `null` | |
| `finanzierungsgeber_adresse` | `lead.finanzierungsgeber_adresse` | `null` | |
| `finanzierungsgeber_vertragsnr` | `lead.finanzierungsgeber_vertragsnr` | `null` | |
| `vorschaeden_beschreibung` | `lead.vorschaeden_beschreibung` | `null` | KFZ-202 |
| `zeugen_kontakte` | `lead.zeugen_kontakte` | `null` | AAR-298 JSONB-Array |
| `werkstatt_seit_datum` | `lead.werkstatt_seit_datum` | `null` | AAR-305 |
| `fahrzeug_fahrbereit` | `lead.fahrzeug_fahrbereit` | `null` | AAR-305 |
| `halter_geburtsdatum` | `lead.halter_geburtsdatum` | `null` | AAR-318 |
| `gegner_versicherung_anfrage_datum` | `lead.gegner_versicherung_anfrage_datum` | `null` | AAR-314 Deutsche Büro Grüne Karte |
| `sprache` | `lead.sprache` | `null` | AAR-316 Kundensprache |
| `unfallskizze_svg` | `lead.unfallskizze_svg` | `null` | AAR-317 Phase 5 |
| `unfallskizze_url` | `lead.unfallskizze_url` | `null` | AAR-317 |
| `unfallskizze_ablehnung_grund` | `lead.unfallskizze_ablehnung_grund` | `null` | AAR-317 |
| `unfallskizze_generiert_am` | `lead.unfallskizze_generiert_am` | `null` | AAR-317 |
| `sachschaden_beschreibung` | `lead.sachschaden_beschreibung` | `null` | AAR-357 |
| `kunde_strasse` | `lead.kunde_strasse` | `null` | AAR-575 A1 — nur bei Kunde ≠ Halter |
| `kunde_plz` | `lead.kunde_plz` | `null` | AAR-575 A1 |
| `kunde_stadt` | `lead.kunde_stadt` | `null` | AAR-575 A1 |
| `kunde_adresse` | `lead.kunde_adresse` | `null` | AAR-575 A1 |
| `kunde_lat` | `lead.kunde_lat` | `null` | AAR-575 A1 |
| `kunde_lng` | `lead.kunde_lng` | `null` | AAR-575 A1 |
| `besichtigungsort_adresse` | `lead.besichtigungsort_adresse` | `null` | AAR-581 N4 — ersetzt sv_treffpunkt |
| `besichtigungsort_lat` | `lead.besichtigungsort_lat` | `null` | AAR-581 N4 |
| `besichtigungsort_lng` | `lead.besichtigungsort_lng` | `null` | AAR-581 N4 |
| `besichtigungsort_place_id` | `lead.besichtigungsort_place_id` | `null` | AAR-581 N4 — Google place_id |

## 3. DEFAULT_FIELDS (NOT-NULL mit Fallback)

| `faelle`-Spalte | Quelle | Default (bei NULL) | Kontext |
|---|---|---|---|
| `gegner_bekannt` | `lead.gegner_bekannt` | `true` | |
| `personenschaden_flag` | `lead.personenschaden_flag` | `false` | |
| `sachschaden_flag` | `lead.sachschaden_flag` | `false` | AAR-357 — NOT NULL DEFAULT false |
| `mietwagen_flag` | `lead.mietwagen_flag` | `false` | |
| `nutzungsausfall` | `lead.nutzungsausfall` | `false` | AAR-313 |
| `gewerbe_flag` | `lead.gewerbe_flag` | `false` | |
| `halter_ungleich_fahrer_flag` | `lead.halter_ungleich_fahrer_flag` | `false` | |
| `ist_fahrzeughalter` | `lead.ist_fahrzeughalter` | `true` | KFZ-208 |
| `finanzierung_leasing` | `lead.finanzierung_leasing` | `'keine'` | AAR-548 D10 + AAR-580 N3 — Enum (`keine`/`leasing`/`finanzierung`) |
| `vorsteuerabzugsberechtigt` | `lead.vorsteuerabzugsberechtigt` | `false` | |
| `hat_vorschaeden` | `lead.hat_vorschaeden` | `false` | KFZ-202 |
| `unfallskizze_bestaetigt` | `lead.unfallskizze_bestaetigt` | `false` | AAR-317 Audit-M2 |
| `zeugen_vorhanden` | `lead.zeugen_vorhanden` | `false` | AAR-321/322 Audit-Fix |

## 4. RENAMED_FIELDS (`faelle` ≠ `leads`)

| `faelle`-Spalte | `leads`-Quelle | Bei NULL | Kontext |
|---|---|---|---|
| `leasinggeber_name` | `lead.leasing_geber` | `null` | BUG-58 |
| `bank_name` | `lead.finanzierung_bank` | `null` | BUG-58 |
| `ust_id` | `lead.firma_ustid` | `null` | BUG-58 |
| `schadens_datum` | `lead.unfalldatum` | `null` | BUG-73 |
| `schadens_adresse` | `lead.fahrzeug_standort_adresse` | `null` | BUG-73 |
| `schadens_plz` | `lead.fahrzeug_standort_plz` | `null` | BUG-73 |
| `schadens_ort` | `lead.unfallort` | `null` | BUG-73 |
| `fin_vin` | `lead.fin` | `null` | BUG-73 |
| `schadens_ursache` | `lead.schadensursache` | `null` | AAR-548 D4 |
| `kunde_vorname` | `lead.vorname` | `null` | AAR-575 A1 |
| `kunde_nachname` | `lead.nachname` | `null` | AAR-575 A1 |
| `kunde_email` | `lead.email` | `null` | AAR-575 A1 |
| `kunde_telefon` | `lead.telefon` | `null` | AAR-575 A1 |

## 5. RENAMED + DEFAULT

| `faelle`-Spalte | `leads`-Quelle | Default | Kontext |
|---|---|---|---|
| `polizei_bericht_vorhanden` | `lead.polizeibericht_pflicht` | `false` | AAR-127-Audit — „vorhanden" ist mit „pflicht" semantisch fragwürdig befüllt, Fix in eigenem Issue geparkt |

## 6. TRANSFORM_FIELDS

| `faelle`-Spalte | `leads`-Quelle | Transform | Kontext |
|---|---|---|---|
| `kilometerstand` | `lead.kilometerstand` | `v ? Number(v) : null` | Stringify-Schutz für Eingabeform-Zahlen |

## 7. COMPUTED_FIELDS

Werte aus der Session oder konstant gesetzt (siehe `fallComputedFields()`):

| `faelle`-Spalte | Herkunft | Wert |
|---|---|---|
| `fall_nummer` | `options.fallNummer` | z. B. `CLM-20260419-001` |
| `lead_id` | `lead.id` | UUID |
| `status` | Ableitung | `'sv-termin'` wenn `svIdFromTermin`, sonst `'ersterfassung'` |
| `sv_id` | `options.svIdFromTermin` | UUID oder `null` |
| `sv_zugewiesen_am` | Abgeleitet | `now()` wenn SV zugewiesen, sonst `null` |
| `service_typ` | `lead.service_typ` | Default `'komplett'` wenn NULL |
| `kundenbetreuer_id` | `options.kundenbetreuerId` | UUID oder `null` |
| `konvertiert_am` | immer | `now()` |
| `konvertiert_von_lead` | `lead.id` | UUID |
| `abtretung_pdf` | `options.signatureUrl` | Storage-URL des SA-PDF |
| `abtretung_signiert_am` | immer | `now()` |
| `sa_unterschrieben` | immer | `true` (wir erzeugen den Fall genau dann) |
| `kanzlei_id` | `options.kanzleiId` | Aus Resolver (LexDrive bei `komplett`) |
| `organisation_id` | `options.organisationId` | Aus Resolver (SV-Mitgliedschaft) |
| `leadbearbeiter_id` | `options.leadbearbeiterId` | `lead.zugewiesen_an` |

## 8. ENTITY-RESOLVER

`resolveFallEntityFks(admin, lead, svIdFromTermin)` löst 4 FK-IDs mit **Non-Blocking**-Semantik (jeder Miss → `null`):

| FK-ID | Quelle | Fallback | Notes |
|---|---|---|---|
| `gegnerVersicherungId` | `lead.gegner_versicherung_id` wenn gesetzt, sonst ILIKE-Fuzzy auf `versicherungen.name` | `null` | AAR-155 Audit-Fix #4: LIKE-Wildcards in `lead.gegner_versicherung`-Freitext werden escaped |
| `kanzleiId` | `kanzleien.name ILIKE 'LexDrive%'` **nur** wenn `lead.service_typ = 'komplett'` | `null` | Pfad B (nur-Gutachter) bleibt ohne Kanzlei |
| `organisationId` | `sachverstaendige.organisation_id` des zugewiesenen SV | `null` | SV-Mitgliedschaft in einer SV-Organisation |
| `leadbearbeiterId` | `lead.zugewiesen_an` | `null` | Vom Dispatcher oder aus `sendFlowLinkMultiChannel` gesetzt |

## 9. Lead-only Felder (werden bewusst NICHT vererbt)

Nicht alle `leads`-Spalten landen auf `faelle`. Folgende sind explizit Lead-only (Dispatch-Workflow, pre-conversion):

* `qualifizierungs_phase`, `qualifizierung_data`
* `flow_token`, `flow_link_geoeffnet`, `flow_link_abgeschlossen`, `flow_link_*`
* `wa_gesendet`, `kanzlei_triggered`
* `kontaktversuche`, `verpasste_anrufe`, `anruf_versuche`, `letzter_anruf_*`
* `rueckruf_*`
* `gespraech_*`, `aircall_contact_id`
* `reminder_*`
* `zb1_*` (Fahrzeugschein-OCR-Flow — nur das Ergebnis (`hsn`/`tsn`/`fin`/Halter-*) geht in `faelle`)
* `disqualifiziert*` (disqualifizierte Leads werden nicht konvertiert)
* `sa_signiert` (AAR-578 N1 gedroppt)
* `vollmacht_signiert` (AAR-579 N2 gedroppt)
* `vollmacht_unterschrieben` (AAR-583 N6 gedroppt — Timestamp `vollmacht_signiert_am` bleibt)
* `sv_treffpunkt` (AAR-581 N4 gedroppt — strukturiert via `besichtigungsort_*`)
* `disqualifikations_grund`/`_key` (AAR-582 N5 gedroppt)

## 10. Fallakte-only Felder

`faelle` hat dagegen Spalten die es **nie** auf `leads` gab — alles was NACH dem SA-Signatur-Prozess passiert:

* Gutachten-Phase: `gutachten_*`, `sv_briefing_*`
* Kanzlei-Phase: `kanzlei_*`, `mandatsnummer`, `vollmacht_pruefung_*`, `vollmacht_geprueft_*`, `vollmacht_status`
* Versicherer-Phase: `vs_*`, `ruege_*`, `eskalation_*`
* Regulierung: `regulierung_*`, `auszahlung_*`, `zahlung_*`
* QC: `filmcheck_*`, `nachbesichtigung_*`
* Vorschaden-Analyse: `vorschaden_typ_*`, `ki_*`
* Finance: `iban`, `bic`, `bank_name`
* AAR-571: `phase_transitions`-Tabelle (Audit-Log für Phasenwechsel)

## 11. Regel #35 (AAR-574)

> **Jedes neue Lead-Feld muss entscheiden:** wird es vererbt (same name in `faelle` + Eintrag in `LEAD_TO_FALL_DIRECT_FIELDS`), oder explizit nicht vererbt (Lead-only mit Begründung im Section 9 oben)?

Wenn du ein Feld zu `leads` hinzufügst ohne eine dieser Entscheidungen, bleibt das Feld beim Fall-Erzeugen unsichtbar — klassische Drift-Quelle.

## 12. Historische Referenzen

* **AAR-128** — ursprüngliches Refactoring von Inline-Insert zu diesem Mapping
* **BUG-58 / BUG-73** — frühe Renamed-Felder
* **KFZ-140 / KFZ-146 / KFZ-153 / KFZ-154** — Erweiterungen für Gegner/Fahrzeug-Detaildaten
* **KFZ-202 / KFZ-208** — Mandantenfragebogen
* **AAR-155** — Entity-Resolver (4 FKs)
* **AAR-265 + AAR-545 Cluster D** — Gegner-Versicherungs-FK-Pattern
* **AAR-548** — Konsolidierungs-Welle (D4 schadensursache, D7 halter_name GENERATED, D10 finanzierung_leasing-Enum)
* **AAR-574** — Lead→Fall-Konsistenz-Audit (A/N/C-Tickets)

Stand: 2026-04-19 (AAR-584).
