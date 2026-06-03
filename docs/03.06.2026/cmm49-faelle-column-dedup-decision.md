# CMM-49 — `faelle`-Spalten Dedup-Decision (Business-Logik → SSoT)

**Stand 2026-06-03. Verbindliche Vorlage für P2 (Views/Funktionen/Policies faelle-frei).**
Jede der **278** `faelle`-Spalten bekommt hier ein Verdict + eine Heimat. Kein P2-DDL ohne diese Tabelle — sonst schleppen wir Dupes auf den Claim, statt sie zu killen.

## Prinzip (Aaron 2026-06-03)
> „Alles was eine semantische Dopplung ist, muss raus. Der Claim soll die SSoT sein im Datenmodell — mit einzelnen Entities, weil wir später Werkstätten, Mietwägen usw. dranhängen."

Daraus die **Reihenfolge der Verdict-Regeln** (erste passende gewinnt):
1. **Spalte gibt's namensgleich auf `claims`** → `claims` ist SSoT, faelle-Spalte = Dupe → **DROP** (kein Move).
2. **Spalte gehört einer existierenden Sub-Entity** (`vehicles`/`claim_parties`/`gutachten`/`gutachter_termine`/`auftraege`/`kanzlei_faelle`/`claim_payments`/`vehicle_vorschaeden`) → Entity ist SSoT → **DROP**; Reader/Views auf die Entity zeigen. **Niemals** auf `claims` heben — das wäre der nächste Dupe.
3. **Echt claim-level und nirgends sonst beheimatet** → **MOVE → `claims`** (nur wenn ein lebender Reader existiert).
4. **Extern geplant** (`kunde_id`) → **CMM-63**.
5. **Kein lebender Reader** → **DROP** (stirbt mit dem Table).

**Aaron-Rulings 2026-06-03:** (a) `dispatch_id` + `organisation_id` → auf `claims` heben (einzige echten „Neu-auf-Claim"). (b) `claims.halter_*` (von #2315) wieder **runter** — Halter ist eine Person, lebt in `claim_parties` (`ist_halter=true`).

**Liveness-Disклaimer:** Die *Heimat/SSoT* ist hier architektonisch entschieden. Ob eine Spalte noch einen **lebenden Reader** hat (`count()` + grep), wird pro Spalte **beim jeweiligen Migrationsschritt** verifiziert — nicht hier geschätzt (Memory: Live-Consumer-Audit > Schätzung).

---

## Summary

| Bucket | n | Verdict |
|---|--:|---|
| Dupe direkt auf `claims` (gleicher Name) | **106** | claims = SSoT → DROP, kein Move |
| Dupe auf Sub-Entity (Heimat existiert) | **~157** | Entity = SSoT → DROP; Reader auf Entity |
| MOVE → `claims` (echt claim-level) | **2** | `dispatch_id`, `organisation_id` |
| Extern → CMM-63 | **1** | `kunde_id` → `claims.geschaedigter_user_id` |
| Verify-then-DROP (tot/ambig) | **~12** | OCR-Scratch, Geocode-Cache, lead-origin |
| FK-Bridge | **1** | `claim_id` (stirbt mit Table; Route-Resolution über Bridge-Map) |

---

## A · DROP — Dupe direkt auf `claims` (106) — claims = SSoT

Alle 106 existieren namensgleich auf `claims` (Sync-Trigger-Mirror aus der claims↔faelle-Ära). claims ist/wird SSoT → die faelle-Spalte stirbt mit dem Table.

- **Identity/Lifecycle:** `id`, `created_at`, `updated_at`, `status`, `status_changed_at`, `ist_aktiv`, `prioritaet`, `onboarding_complete`, `deaktiviert_am`, `deaktiviert_grund`, `deaktiviert_notiz`, `geschlossen_grund`, `szenario`, `sprache`, `bevorzugter_kanal`
- **Assignment:** `sv_id`, `sv_zugewiesen_am`, `kundenbetreuer_zugewiesen_am`, `kundenbetreuer_fallback_flag`, `eskaliert_am`, `eskaliert_an_admin_id`, `eskaliert_grund`, `makler_id`, `service_typ`, `betreuungspaket`
- **Lead/Pricing:** `lead_id`, `lead_preis_berechnet_am`, `lead_preis_netto`, `lead_preis_typ`, `marketing_provision`, `marketing_provision_status`, `marketing_quelle`
- **Halter (⚠ Personen-Dupe, s. Abschnitt F):** `halter_vorname`, `halter_nachname`, `halter_name`, `halter_strasse`, `halter_plz`, `halter_stadt`, `halter_telefon`, `halter_email`, `halter_geburtsdatum`
- **SA/Vollmacht/Consent:** `sa_pdf_url`, `sa_unterschrieben`, `sa_unterschrieben_am`, `sa_unterschrift_url`, `vollmacht_pdf`, `vollmacht_status`, `vollmacht_signiert_am`, `vollmacht_geprueft_am`, `vollmacht_geprueft_von`, `vollmacht_pruefung_status`, `vollmacht_pruefung_begruendung`, `abtretung_pdf`, `abtretung_signiert_am`, `datenschutz_akzeptiert`, `datenschutz_akzeptiert_am`, `zb1_status`, `unfallmitteilung_status`
- **Banking:** `iban`, `bic`, `kontoinhaber`, `bankdaten_hinterlegt_am`, `zahlungsweg`
- **Abrechnung/Finance:** `abrechnung_id`, `abrechnungsart_besprochen`, `abrechnungsart_besprochen_am`, `abrechnungsart_notiz`, `auszahlung_gutachter_betrag`, `auszahlung_gutachter_eingegangen_am`, `auszahlung_zahlungsweg`, `schlussabrechnung_am`, `guthaben_verrechnet_netto`, `schadens_hoehe_netto`, `schadens_ursache`, `sv_nachzahlung_netto`, `kanzlei_abrechnung_id`, `kanzlei_honorar`, `kanzlei_provision_status`, `kanzlei_provision_ausgezahlt_am`, `kanzlei_ansprechpartner_position`
- **Mietwagen/Werkstatt:** `mietwagen_limit_tage`, `mietwagen_limit_grund`, `mietwagen_argumentations_puffer`, `mietwagen_rechnung_url`, `mietwagen_rechnung_vorhanden`, `mietwagen_seit_datum`, `mietwagen_vermieter`, `werkstatt_seit_datum`, `leasinggeber_name`, `leasinggeber_informiert`, `fahrzeug_fahrbereit`, `fahrzeugschaden_beschreibung`
- **Vorschaden-Flags:** `hat_vorschaeden`, `vorschaden_erkannt`, `vorschaden_geprueft`, `vorschaeden_beschreibung` (Detail-Daten → vehicle_vorschaeden, s. B)
- **Dokumente/Sonstiges:** `dokumente_reminder_whatsapp_letzte_sendung`, `dokumente_vollstaendig_am_phase`, `dokumente_vollstaendig_fuer_phase`, `fallakte_angelegt_am`, `google_review_gesendet`, `google_review_prompt_gezeigt_am`, `interne_notizen`, `notizen`, `bkat_unfallart`

---

## B · DROP — Dupe auf Sub-Entity (Entity = SSoT)

Diese Spalten gibt's **nicht** auf `claims` (by name), sind aber semantisch von einer existierenden Entity gedoppelt. **Das sind die eigentlichen „semantischen Dupes" aus Aarons Prinzip.** → DROP; Reader/Views auf die Entity zeigen. Niemals auf `claims` heben.

### B1 · → `kanzlei_faelle` (Kanzlei / VS-Regulierung / Anspruchsschreiben / Eskalation) — ~49
`anschlussschreiben_am`, `anschlussschreiben_ocr_am`, `anschlussschreiben_sendedatum`, `anschlussschreiben_unterschrift`, `anschlussschreiben_url`, `as_frist`, `as_geforderte_summe`, `as_salesforce_id`, `as_vs_reaktion_text`, `as_zuletzt_synced_am`, `eskalation_tag_14_am`, `eskalation_tag_14_ergebnis`, `eskalation_tag_14_ergebnis_am`, `eskalation_tag_14_ergebnis_von`, `eskalation_tag_21_am`, `eskalation_tag_21_ergebnis`, `eskalation_tag_21_ergebnis_am`, `eskalation_tag_21_ergebnis_von`, `eskalation_tag_28_am`, `eskalation_tag_28_ergebnis`, `eskalation_tag_28_ergebnis_am`, `eskalation_tag_28_ergebnis_von`, `kanzlei_id`, `klage_uebergeben_am`, `kuerzungs_betrag`, `lexdrive_case_id`, `lexdrive_ocr_data`, `lexdrive_ocr_received_at`, `mandatsnummer`, `mietwagen_kanzlei_informiert`, `mietwagen_kanzlei_informiert_am`, `regulierung_am`, `regulierung_angekuendigt_am`, `regulierungsweise`, `ruege_betrag`, `ruege_counter`, `ruege_erhalten_am`, `ruege_frist_tage`, `ruege_gesendet_am`, `ruege_grund`, `vs_eskalationsstufe`, `vs_frist_bis`, `vs_kuerzung_grund`, `vs_kuerzungs_typ`, `vs_quote_akzeptiert_am`, `vs_quote_betrag_ausgezahlt`, `vs_quote_grund`, `vs_quote_prozent`, `vs_reaktion_am`, `vs_reaktion_typ`

### B2 · → `gutachter_termine` (Termin / Besichtigung / Nachbesichtigung) — ~26
`besichtigung_gestartet_am`, `besichtigungsort_adresse`, `besichtigungsort_lat`, `besichtigungsort_lng`, `besichtigungsort_notiz`, `besichtigungsort_place_id`, `gcal_event_id`, `geschaetzte_fahrdistanz_km`, `geschaetzte_fahrzeit_min`, `losfahren_erinnerung_gesendet`, `nachbesichtigung_angefordert_am`, `nachbesichtigung_ergebnis`, `nachbesichtigung_konfrontation`, `nachbesichtigung_kunde_termin_eingereicht_am`, `nachbesichtigung_kunde_termin_vorschlaege`, `nachbesichtigung_status`, `nachbesichtigung_sv_konfrontation_gewuenscht`, `nachbesichtigung_sv_termin_vereinbart_am`, `nachbesichtigung_termin_datum`, `no_show_gemeldet_am`, `re_termin_eskalation_an_kb_am`, `re_termin_token`, `re_termin_token_eingelaufen_am`, `sv_termin_dokument_reminder_gesendet_am`, `termin_erinnerung_5min_gesendet`, `wunschtermin`

### B3 · → `auftraege` (SV-Auftrag / QC / Briefing / Stellungnahme) — ~14
`filmcheck_am`, `filmcheck_notizen`, `filmcheck_ok`, `sv_briefing_generated_at`, `sv_briefing_model`, `sv_briefing_struktur`, `sv_briefing_text`, `sv_briefing_version`, `sv_notizen_vor_ort`, `technische_stellungnahme_beauftragt_am`, `technische_stellungnahme_freigabe_am`, `technische_stellungnahme_hochgeladen_am`, `technische_stellungnahme_notiz_sv`, `technische_stellungnahme_status`
> `besichtigung_gestartet_am` matcht auch hier — Heimat = `gutachter_termine` (Termin-Event), nicht doppelt führen.

### B4 · → `vehicles` (Fahrzeug; teils umbenannt) — ~18
`cardentity_abfrage_am`(→`cardentity_letzter_pull`), `cardentity_enriched_at`, `cardentity_report`, `erstzulassung`, `fahrzeug_aufbau`(→`aufbau`), `fahrzeug_ausstattung`, `fahrzeug_baujahr`(→`baujahr_monat`), `fahrzeug_farbe`(→`farbe_klartext`), `fahrzeug_hersteller`(→`hersteller`), `fahrzeug_modell`(→`modell`), `fahrzeug_typ`(→`variante`/`bauart`), `fin_extrahiert_am`, `fin_quelle`, `fin_vin`(→`fin`), `hsn`, `kilometerstand`(→`aktueller_kilometerstand`), `lackfarbe_code`(→`farbcode`), `tsn`
> **Kennzeichen** (`kennzeichen`, `kennzeichen_buchstaben`, `kennzeichen_kreis`, `kennzeichen_suffix`, `kennzeichen_zahl`) → `vehicles.kennzeichen_aktuell` + Parts (Fahrzeug-SSoT). `claim_parties` führt das Kennzeichen pro Partei separat (deklariert) — kein Widerspruch, faelle stirbt so oder so.

### B5 · → `claim_parties` (Personen: Geschädigter + Gegner; teils umbenannt) — ~19
`kunde_vorname`(→`vorname`), `kunde_nachname`(→`nachname`), `kunde_strasse`(→`adresse_strasse`), `kunde_plz`(→`adresse_plz`), `kunde_stadt`(→`adresse_ort`), `kunde_adresse`(→`adresse_strasse`), `kunde_telefon`(→`telefon`/`mobil`), `firma_name`(→`firma`), `ust_id`(→`claim_parties.ust_id`), `ist_fahrzeughalter`(→`ist_halter`), `gegner_name`(→ Partei `rolle=gegner` `nachname`/`firma`), `gegner_versicherung`(→`versicherung_klartext`/`versicherung_id`), `gegner_versicherung_anfrage_datum`(→`versicherungs_aktenzeichen`-Kontext), `gegner_kennzeichen`(→ Gegner-Partei/Fahrzeug), `gegner_fahrzeugtyp`(→`fahrzeugtyp_klartext`)
> `gegner_anzahl_beteiligte` ist claim-Metadaten (kein Personen-Attribut) → s. Abschnitt E (verify; ggf. claims).
> `kunde_lat`, `kunde_lng`, `kunde_match_via` → kein Partei-Feld → s. Abschnitt E.

### B6 · → `gutachten` (Schadenkalkulation / Gutachtenwerte) — ~17
`gutachten_betrag`, `gutachten_eingegangen_am`, `gutachten_hochgeladen_am`, `gutachten_nummer`, `gutachten_positionen`, `gutachten_stundensatz`, `gutachten_vorhanden`, `gutachter_honorar`, `ki_geschaetzte_kosten_max`, `ki_geschaetzte_kosten_min`, `ki_kalkulation`, `ki_kalkulation_am`, `nutzungsausfall_gesamt`, `nutzungsausfall_tagessatz`, `reparaturdauer_tage`, `reparaturkosten`, `wertminderung`

### B7 · → `vehicle_vorschaeden` (CMM-64; semantisch, keine Namensgleichheit) — 5
`vorschaden_anzahl`, `vorschaden_letzter_datum`, `vorschaden_typ_a_ergebnis`, `vorschaden_typ_b_bericht`, `vorschaden_typ_b_pdf_url`

### B8 · → `claim_payments` (Zahlungen) — 5
`auszahlung_kunde_betrag`, `auszahlung_kunde_eingegangen_am`, `zahlung_betrag`, `zahlung_eingegangen_am`, `zahlung_erwartet_am`

---

## C · MOVE → `claims` (echt claim-level, Aaron-approved) — 2
`dispatch_id`, `organisation_id`
> Beide nicht auf claims, keine Sub-Entity-Heimat, claim-level Assignment/Routing. Migration: ADD COLUMN auf claims + Backfill aus faelle + Reader repointen.

---

## D · EXTERN → CMM-63 — 1
`kunde_id` → `claims.geschaedigter_user_id`. Bis CMM-63 bleiben die `kunde_id`-Reader (26 Stück, s. Classifier) geblockt.

---

## E · VERIFY-then-DROP (tot / ambig — pro Spalte `count()`+grep vor Drop) — ~12
- **OCR-Scratch:** `ocr_extrahiert_am`, `ocr_rohdaten` — transient; vermutlich kein Reader → DROP.
- **Geocode-Cache/Provenance:** `kunde_lat`, `kunde_lng`, `kunde_match_via` — kein Partei-Feld; DROP wenn 0-Reader, sonst `claims`.
- **Lead-Herkunft (Original auf `leads`, via `lead_id` lesbar):** `source_channel`, `source_domain`, `konvertiert_am` — faelle = Middle-Man → DROP, Reader auf `leads`.
- **Lifecycle-Storno (ggf. Dupe von claims `geschlossen_grund`/`deaktiviert_*`):** `storniert_am`, `storno_durch_user_id`, `storno_grund` — Overlap prüfen; sonst `claims`.
- **Claim-Metadaten:** `gegner_anzahl_beteiligte` — claims oder drop.
- **Banking:** `bank_name` — `claims` (neben iban/bic) wenn lebend, sonst drop.

---

## F · Selbst-erzeugter Dupe — Cleanup (Aaron-approved)
**#2315** hat flache `halter_*` (9 Spalten) auf `claims` appliziert (DB-seitig live via Migration `20260603082646`, PR aber closed). Halter ist eine **Person** → gehört in `claim_parties` (`ist_halter=true`; alle Felder vorhanden: `vorname`/`nachname`/`geburtsdatum`/`telefon`/`email`/`adresse_*`). → `claims.halter_*` sind selbst ein Dupe des Personen-Modells.
**Aktion:** Migration `DROP COLUMN claims.halter_{vorname,nachname,name,strasse,plz,stadt,telefon,email,geburtsdatum}` + `v_claim_full`-Exposure (`20260603083632`) zurücknehmen + `CLAIM_OWNED_DUPLICATE_COLUMNS` (claim-duplicate-columns.ts) um die 8 halter-Einträge bereinigen. Vorher: 0-Reader auf `claims.halter_*` verifizieren (außer der View-Exposure selbst).

---

## G · P2-Konsequenz + nächster Schritt
Diese Tabelle ist die **SSoT-Landkarte**. P2 macht die DB-Objekte faelle-frei, indem jedes Objekt auf die hier festgelegte Heimat zeigt:
1. **Objekt-Enumeration (nächster Schritt):** live die 5 Views / 23 Funktionen / 24 Policies ziehen, die `faelle` referenzieren — pro Objekt notieren, *welche* faelle-Spalten es liest, und gegen diese Tabelle die Ziel-SSoT eintragen.
2. **`v_claim_full`** (LEFT JOIN faelle): die gezogenen faelle-Spalten durch ihre SSoT ersetzen (claims direkt / Sub-Entity-jsonb_agg), dann den faelle-Join entfernen. `halter_*`-Exposure raus (Abschnitt F).
3. **Funktionen/Policies:** `can_access_fall(fall_id)` → `can_access_claim(claim_id)`; Sync-Trigger claims↔faelle werden moot → entfernen. ⚠ Memory: SECURITY-DEFINER-Funktionen brauchen `GRANT EXECUTE TO authenticated` nach `CREATE OR REPLACE` (Inzident AAR-894).
4. Jede Migration idempotent + **grüner Fresh-Replay-Preview** vor „ready".

**Regeln:** DDL nur via `apply_migration` (Regel 2); kein Direct-Push (Regel 1); nicht mit aktiven Sessions interleaven (aar-939-Embed, dispatch-config).
