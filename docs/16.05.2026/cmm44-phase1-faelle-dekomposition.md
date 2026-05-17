# CMM-44 Phase 1 — `faelle`-Drop Dekomposition (341-Spalten-Mapping)

**Datum:** 2026-05-16 · **Status:** Audit-Deliverable — Phase-1 Teil-Audit 1
**Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Strategie:** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` §3.1, §4 Phase 1
**Vorgaenger:** CMM-60 (`claims.sv_id` SSoT) abgeschlossen — Handoff `handoff-2026-05-16-cmm60-phase6-faelle-drop.md`

**Update 2026-05-17:** SP-A2 erledigt — 28 Semantik-Duplikat-Spalten via PR1a/b/c
(Reader-Rename) + PR2 (Backfill + View-Repoint + DROP COLUMN ×28) gedroppt.
`fall_nummer` → SP-A3 ausgegliedert (Nummern-Generator), `gegner_anzahl_beteiligte`
→ SP-C (kein echtes DUP). Siehe `docs/superpowers/plans/2026-05-17-cmm44-spa2-semantik-duplikate.md`.

---

## 0 · Was dieses Dokument ist

Die Strategie §4 Phase 1 verlangt sechs Teil-Audits. Drei sind erledigt (Rendering, RLS,
Routen-Hygiene), das **Spalten-Domaenen-Mapping** war offen — das ist der zentrale Blocker,
ohne den keine Migration sauber laufen kann. Dieses Dokument liefert es:

1. **Vollstaendige Klassifizierung aller 341 `faelle`-Spalten** gegen den Live-Stand
   (Verdikt + Heimat-Tabelle + Domaenen-Cluster).
2. **Dekomposition in Sub-Projekte** mit Abhaengigkeits-Reihenfolge — die Vorlage fuer
   die CMM-45..52-Strecke.

Es ist **kein Code** und **keine Migration** — es ist die Landkarte, gegen die die
folgenden Sub-Projekte gebrainstormt + geplant werden.

### Reproduzierbarkeit

Alles live gegen die Prod-DB gemessen (Supabase linked, 2026-05-16). Skripte im Branch:

| Skript | Zweck |
|---|---|
| `scripts/cmm44-faelle-inventory.sql` | Spalten-Inventar `faelle` + 8 Ziel-Tabellen aus `information_schema` |
| `scripts/cmm44-faelle-coverage.sql` | Non-NULL-Coverage je `faelle`-Spalte (generiert) |
| `scripts/cmm44-classify.mjs` | Pro-Spalte-Klassifizierung → `cmm44-classified.json` |

> **Drift-Warnung** (`feedback_information_schema_check`): Andere Sessions droppen parallel
> weiter. Dieser Snapshot ist 16.05. — vor jedem Migrations-PR `information_schema` neu messen.

---

## 1 · Live-Kennzahlen (2026-05-16)

| Tabelle | Spalten | Rolle im Zielmodell |
|---|---:|---|
| `faelle` | **341** | wegfallend — Quelle der Migration |
| `claims` | 82 | SSoT-Rueckgrat |
| `leads` | 201 | Pre-Claim, bleibt |
| `gutachter_termine` | 84 | Besichtigungstermin (Auftrag-LC) — **kein `claim_id`** |
| `gutachten` | 73 | Gutachten-Werte-Sub-Table |
| `claim_parties` | 54 | Beteiligte |
| `vehicles` | 45 | Fahrzeug-SSoT |
| `auftraege` | 17 | Auftrag-LC-Marker |
| `kanzlei_faelle` | 8 | Kanzleifall-LC-Marker |

`faelle`: **30 Zeilen**, davon **110 Spalten befuellt**, **231 Spalten 0-Coverage**.
0-Coverage ≠ tot — die meisten 0-Coverage-Spalten sind Lifecycle-Phasen-Felder, die in den
30 Test-/Frueh-Faellen schlicht noch nicht erreicht wurden (`feedback_post_drop_smoke`).
Coverage ist hier nur ein **Hinweis** auf echte Drop-Kandidaten, kein Beweis.

---

## 2 · Klassifizierungs-Ergebnis (alle 341 Spalten)

### Verdikt-Verteilung

| Verdikt | Anzahl | Bedeutung |
|---|---:|---|
| **MOVE** | 167 | In Domaenen-/Lifecycle-Tabelle verschieben (semantisch dort zuhause) |
| **DUP** | 69 | Gegenstueck existiert bereits auf `claims` (namens- oder semantik-gleich) → faelle-seitig droppen |
| **CLAIMS** | 64 | Claim-globale Eigenschaft, noch nicht auf `claims` → nach `claims` ziehen |
| **TBD** | 33 | Klassifizierung braucht Vertikal-/Cardentity-Audit |
| **DROP** | 6 | Tot/Legacy/Diagnose → ersatzlos droppen |
| **FK** | 2 | Strukturelle FK/PK (`id`, `claim_id`) |

### Heimat-Tabellen-Verteilung

| Heimat | Spalten | Anteil |
|---|---:|---|
| `claims` | 148 | Stammdaten + Status + claim-globale Werte |
| `kanzlei_faelle` | 56 | Kanzleifall-LC: Regulierung, VS, Eskalation, Ruege, AS |
| `claim_parties` | 33 | Kunde-/Halter-/Gegner-Snapshots |
| `gutachter_termine` | 25 | Besichtigungs-/Nachbesichtigungs-Termin |
| `gutachten` | 19 | Gutachten-/OCR-Werte (F+G-Rest) |
| `auftraege` | 18 | Auftrag-LC: Briefing, QC, TS, Storno |
| `vehicles` | 18 | Fahrzeug-Spec |
| `abrechnungen` | 12 | Zahlungen, Auszahlungen, Provisionen |
| `?` (offen) | 11 | Vorschaeden/Cardentity — §3.1c-Audit |
| `faelle` | 1 | `id` (PK, faellt mit Tabelle) |

**Lese-Hilfe:** „Heimat = `claims`" heisst nicht zwingend „neue Spalte" — bei Verdikt
**DUP** existiert das Ziel schon, bei **CLAIMS** muss es angelegt werden.

---

## 3 · Domaenen-Cluster — Detail-Mapping

Die 26 Domaenen-Cluster. Jeder Cluster ist potenziell ein eigener Migrations-PR.

<!-- AUTOGENERIERT aus cmm44-classified.json — bei DB-Drift neu erzeugen -->

#### Struktur (7)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `id` | uuid | 30 | FK | faelle | PK |
| `lead_id` | uuid | 30 | DUP | claims | auf claims |
| `dispatch_id` | uuid | 0 | TBD | claims | 0-cov — Dispatcher-Zuordnung, evtl DROP |
| `organisation_id` | uuid | 0 | TBD | claims | Org-Zuordnung — Reader pruefen |
| `makler_id` | uuid | 0 | CLAIMS | claims | Makler-Herkunft des Claims |
| `vehicle_id` | uuid | 0 | DUP | vehicles | FK auf claims vorhanden |
| `claim_id` | uuid | 30 | FK | claims | FK->claims, beim Drop weg |

#### Workflow (38)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `fall_nummer` | text | 30 | DUP→SP-A3 | claims | claim_nummer; aus SP-A2 ausgegliedert — Nummern-Generator + 198 Files, eigener Zyklus |
| `status` | enum | 30 | DUP | claims | auf claims |
| `betreuungspaket` | enum | 30 | CLAIMS | claims | Paket-Zuordnung |
| `filmcheck_ok` | boolean | 30 | MOVE | auftraege | Auftrag-LC QC-Schritt |
| `filmcheck_am` | timestamptz | 0 | MOVE | auftraege | Auftrag-LC QC-Schritt |
| `filmcheck_notizen` | text | 0 | MOVE | auftraege | Auftrag-LC QC-Schritt |
| `notizen` | text | 2 | CLAIMS | claims | Freitext-Notiz |
| `created_at` | timestamptz | 30 | DUP | claims | auf claims |
| `updated_at` | timestamptz | 30 | DUP | claims | auf claims |
| `prioritaet` | text | 30 | CLAIMS | claims | Bearbeitungsprio |
| `onboarding_complete` | boolean | 30 | CLAIMS | claims | Onboarding-Gate |
| `konvertiert_am` | timestamptz | 28 | TBD | claims | Lead-Konversion — leads.konvertiert_* SSoT |
| `konvertiert_von_lead` | uuid | 28 | DUP | claims | lead_id auf claims |
| `status_changed_at` | timestamptz | 30 | CLAIMS | claims | Status-Zeitstempel |
| `abgeschlossen_am` | timestamptz | 0 | DUP | claims | auf claims |
| `google_review_gesendet` | boolean | 30 | CLAIMS | claims | Review-Flag |
| `datenschutz_akzeptiert` | boolean | 30 | CLAIMS | claims | DSGVO-Zustimmung |
| `datenschutz_akzeptiert_am` | timestamptz | 0 | CLAIMS | claims | DSGVO-Zeitstempel |
| `interne_notizen` | text | 2 | CLAIMS | claims | Interne Notiz |
| `ist_aktiv` | boolean | 30 | CLAIMS | claims | Aktiv-Flag |
| `deaktiviert_am` | timestamptz | 0 | CLAIMS | claims | Deaktivierung |
| `deaktiviert_grund` | text | 0 | CLAIMS | claims | Deaktivierung |
| `deaktiviert_notiz` | text | 0 | CLAIMS | claims | Deaktivierung |
| `szenario` | text | 30 | CLAIMS | claims | Fall-Szenario |
| `storniert_am` | timestamptz | 0 | MOVE | auftraege | Auftrag-Storno |
| `storno_grund` | text | 0 | MOVE | auftraege | Auftrag-Storno |
| `storno_durch_user_id` | uuid | 0 | MOVE | auftraege | Auftrag-Storno |
| `no_show_gemeldet_am` | timestamptz | 0 | MOVE | gutachter_termine | Termin-No-Show |
| `spezifikation` | text | 0 | DUP | claims | auf claims |
| `aktuelle_phase` | text | 3 | DUP | claims | phase auf claims |
| `service_typ` | text | 30 | CLAIMS | claims | Service-Variante |
| `no_show_count` | integer | 30 | DUP | claims | kunde_no_show_count/sv_no_show_count auf claims |
| `geschlossen_grund` | text | 0 | CLAIMS | claims | Abschluss-Grund |
| `bevorzugter_kanal` | text | 0 | CLAIMS | claims | Praeferierter Kanal |
| `sprache` | text | 30 | CLAIMS | claims | Kommunikationssprache |
| `fallakte_angelegt_am` | timestamptz | 1 | CLAIMS | claims | Fallakte-Anlage-Zeit |
| `besichtigung_gestartet_am` | timestamptz | 1 | MOVE | auftraege | Auftrag-LC |
| `google_review_prompt_gezeigt_am` | timestamptz | 0 | CLAIMS | claims | Review-Prompt |

#### Zuweisung (8)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `sv_id` | uuid | 21 | DUP | claims | CMM-60 erledigt — claims.sv_id SSoT |
| `sv_zugewiesen_am` | timestamptz | 19 | CLAIMS | claims | SV-Zuweisungszeit |
| `kundenbetreuer_id` | uuid | 28 | DUP | claims | auf claims |
| `kundenbetreuer_fallback_flag` | boolean | 30 | CLAIMS | claims | KB-Fallback |
| `kundenbetreuer_zugewiesen_am` | timestamptz | 0 | CLAIMS | claims | KB-Zuweisungszeit |
| `eskaliert_an_admin_id` | uuid | 0 | CLAIMS | claims | Admin-Eskalation |
| `eskaliert_am` | timestamptz | 0 | CLAIMS | claims | Admin-Eskalation |
| `eskaliert_grund` | text | 0 | CLAIMS | claims | Admin-Eskalation |

#### Unfall (36)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `schadens_beschreibung` | text | 0 | DUP | claims | hergang_kunde_text auf claims |
| `schadens_datum` | date | 5 | DUP | claims | schadentag auf claims |
| `schadens_entdeckt_am` | date | 0 | DUP | claims | entdeckt_am auf claims |
| `schadens_adresse` | text | 0 | DUP | claims | schadenort_adresse auf claims |
| `schadens_plz` | text | 0 | DUP | claims | schadenort_plz auf claims |
| `schadens_ort` | text | 5 | DUP | claims | schadenort_ort auf claims |
| `schadens_fall_typ` | text | 0 | DUP | claims | fall_typ auf claims |
| `kunden_konstellation` | text | 0 | DUP | claims | auf claims |
| `personenschaden_flag` | boolean | 30 | DUP | claims | hat_personenschaden auf claims |
| `gewerbe_flag` | boolean | 30 | DUP | claims | auf claims |
| `halter_ungleich_fahrer_flag` | boolean | 30 | DUP | claims | halter_ungleich_fahrer auf claims |
| `schadens_hoehe_netto` | numeric | 1 | CLAIMS | claims | Geschaetzte Schadenshoehe |
| `unfallhergang` | text | 0 | DUP | claims | hergang_kunde_text auf claims |
| `unfallort` | text | 0 | DUP | claims | schadenort_adresse auf claims |
| `unfalldatum` | date | 0 | DUP | claims | schadentag auf claims |
| `schadens_art` | text | 0 | DUP | claims | schadenart auf claims |
| `unfall_konstellation` | text | 1 | DUP | claims | auf claims |
| `schadens_ursache` | text | 0 | CLAIMS | claims | Schadensursache-Freitext |
| `ist_fahrzeughalter` | boolean | 30 | MOVE | claim_parties | claim_parties.ist_halter |
| `schadens_hergang` | text | 0 | DUP | claims | hergang_kunde_text auf claims |
| `unfallort_kategorie` | text | 0 | DUP | claims | schadenort_kategorie auf claims |
| `unfallskizze_url` | text | 0 | DUP | claims | auf claims |
| `zeugen_kontakte` | jsonb | 0 | DUP | claim_parties | auf claims (A6: claim_parties rolle=zeuge) |
| `unfallskizze_svg` | text | 0 | DUP | claims | auf claims |
| `unfallskizze_bestaetigt` | boolean | 30 | DUP | claims | auf claims |
| `unfallskizze_ablehnung_grund` | text | 0 | DUP | claims | auf claims |
| `unfallskizze_generiert_am` | timestamptz | 0 | DUP | claims | auf claims |
| `zeugen_vorhanden` | boolean | 30 | CLAIMS | claims | Zeugen-Flag |
| `sachschaden_flag` | boolean | 30 | DUP | claims | hat_sachschaden auf claims |
| `sachschaden_beschreibung` | text | 0 | DUP | claims | auf claims |
| `fahrerflucht` | boolean | 4 | DUP | claims | auf claims |
| `auslandskennzeichen` | boolean | 4 | DUP | claims | auf claims |
| `unfall_uhrzeit` | text | 0 | DUP | claims | schadenzeit auf claims |
| `unfallort_lat` | numeric | 0 | DUP | claims | schadenort_lat auf claims |
| `unfallort_lng` | numeric | 0 | DUP | claims | schadenort_lng auf claims |
| `bkat_unfallart` | enum | 0 | CLAIMS | claims | BKAT-Unfallart-Enum |

#### Polizei (4)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `polizei_aktenzeichen` | text | 1 | DUP | claims | auf claims |
| `polizei_bericht_vorhanden` | boolean | 30 | DUP | claims | auf claims |
| `polizei_vor_ort` | boolean | 30 | DUP | claims | auf claims |
| `polizeibericht_status` | text | 0 | DUP | claims | auf claims |

#### Gegner (10)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `gegner_name` | text | 0 | MOVE | claim_parties | claim_parties rolle=verursacher |
| `gegner_versicherung` | text | 0 | MOVE | claim_parties | cp.versicherung_klartext |
| `gegner_kennzeichen` | text | 0 | MOVE | claim_parties | cp.kennzeichen |
| `gegner_bekannt` | boolean | 30 | DUP | claims | auf claims |
| `gegner_versicherungsnummer` | text | 1 | DUP | claims | auf claims |
| `gegner_anzahl_beteiligte` | integer | 30 | DUP→SP-C | claims | KEIN echtes DUP (≠ anzahl_beteiligte_total) — Count über claim_parties, voraussichtlich ersatzlos droppen |
| `gegner_fahrzeugtyp` | text | 0 | MOVE | claim_parties | cp.fahrzeugtyp_klartext |
| `gegner_versicherung_id` | uuid | 0 | DUP | claims | auf claims |
| `gegner_versicherung_anfrage_datum` | date | 0 | MOVE | kanzlei_faelle | VS-Anfrage-Zeit |
| `gegner_schadennummer` | text | 0 | DUP | claims | gegner_aktenzeichen auf claims |

#### Kunde (12)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `kunde_id` | uuid | 26 | MOVE | claim_parties | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `kunde_vorname` | text | 30 | MOVE | claim_parties | cp.vorname |
| `kunde_nachname` | text | 30 | MOVE | claim_parties | cp.nachname |
| `kunde_telefon` | text | 29 | MOVE | claim_parties | cp.telefon |
| `kunde_email` | text | 29 | DUP | claims | auf claims (CMM-60 Whitelist) |
| `kunde_strasse` | text | 2 | MOVE | claim_parties | cp.adresse_strasse |
| `kunde_plz` | text | 2 | MOVE | claim_parties | cp.adresse_plz |
| `kunde_stadt` | text | 2 | MOVE | claim_parties | cp.adresse_ort |
| `kunde_adresse` | text | 1 | MOVE | claim_parties | cp Adress-Felder |
| `kunde_lat` | numeric | 1 | TBD | claims | Kunde-Geocoding — Reader pruefen |
| `kunde_lng` | numeric | 1 | TBD | claims | Kunde-Geocoding — Reader pruefen |
| `kunde_match_via` | text | 0 | DROP | claims | 0-cov Diagnose-Feld |

#### Halter (9)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `halter_vorname` | text | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_nachname` | text | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_strasse` | text | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_plz` | text | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_stadt` | text | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_telefon` | text | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_email` | text | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_geburtsdatum` | date | 0 | MOVE | claim_parties | cp rolle=halter |
| `halter_name` | text | 0 | MOVE | claim_parties | cp rolle=halter |

#### Fahrzeug (21)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `kennzeichen` | text | 0 | MOVE | vehicles | vehicles.kennzeichen_aktuell |
| `fahrzeug_typ` | text | 0 | MOVE | vehicles | vehicles Stammdaten |
| `fahrzeug_hersteller` | text | 0 | MOVE | vehicles | vehicles.hersteller |
| `fahrzeug_modell` | text | 0 | MOVE | vehicles | vehicles.modell_haupttyp |
| `fahrzeug_baujahr` | integer | 0 | MOVE | vehicles | vehicles.baujahr_monat |
| `fin_quelle` | text | 0 | DROP | vehicles | Diagnose — vehicles trackt Pull selbst |
| `fin_extrahiert_am` | timestamptz | 0 | DROP | vehicles | vehicles.cardentity_letzter_pull |
| `fahrzeug_farbe` | text | 0 | MOVE | vehicles | vehicles.farbe_klartext |
| `erstzulassung` | text | 0 | MOVE | vehicles | vehicles.erstzulassung |
| `kilometerstand` | integer | 0 | MOVE | vehicles | vehicles.aktueller_kilometerstand |
| `fin_vin` | text | 1 | MOVE | vehicles | vehicles.fin |
| `fahrzeug_ausstattung` | jsonb | 0 | MOVE | vehicles | vehicles Spec |
| `hsn` | text | 0 | MOVE | vehicles | vehicles.hsn |
| `tsn` | text | 0 | MOVE | vehicles | vehicles.tsn |
| `zb1_status` | text | 0 | CLAIMS | claims | ZB1-Dokumentstatus |
| `lackfarbe_code` | text | 0 | MOVE | vehicles | vehicles.farbcode |
| `kennzeichen_kreis` | text | 0 | MOVE | claim_parties | cp.kennzeichen_kreis vorhanden |
| `kennzeichen_buchstaben` | text | 0 | MOVE | claim_parties | cp.kennzeichen_buchstaben |
| `kennzeichen_zahl` | text | 0 | MOVE | claim_parties | cp.kennzeichen_zahl |
| `kennzeichen_suffix` | text | 0 | MOVE | claim_parties | cp.kennzeichen_suffix |
| `fahrzeug_aufbau` | text | 0 | MOVE | vehicles | vehicles.aufbau |

#### Fahrzeug-Schaden (3)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `werkstatt_seit_datum` | date | 0 | CLAIMS | claims | Werkstatt-Eingang |
| `fahrzeug_fahrbereit` | boolean | 0 | CLAIMS | claims | claim-spezifischer Zustand |
| `fahrzeugschaden_beschreibung` | text | 0 | CLAIMS | claims | claim-spezifisch |

#### Vorschaeden (12)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `vorschaden_geprueft` | boolean | 30 | TBD | ? | Cardentity-Audit §3.1c |
| `vorschaden_anzahl` | integer | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `vorschaden_letzter_datum` | date | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `vorschaden_typ_a_ergebnis` | jsonb | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `vorschaden_typ_b_bericht` | jsonb | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `vorschaden_typ_b_pdf_url` | text | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `cardentity_abfrage_am` | timestamptz | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `hat_vorschaeden` | boolean | 30 | TBD | ? | Cardentity-Audit §3.1c |
| `vorschaeden_beschreibung` | text | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `cardentity_enriched_at` | timestamptz | 0 | TBD | vehicles | Cardentity-Audit §3.1c |
| `cardentity_report` | jsonb | 0 | TBD | ? | Cardentity-Audit §3.1c |
| `vorschaden_erkannt` | boolean | 30 | TBD | ? | Cardentity-Audit §3.1c |

#### Gutachten (16)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `gutachten_eingegangen_am` | timestamptz | 1 | MOVE | gutachten | gutachten.fertiggestellt_am |
| `gutachten_betrag` | numeric | 0 | MOVE | gutachten | gutachten.gesamt_schadensbetrag |
| `gutachter_honorar` | numeric | 1 | MOVE | gutachten | gutachten.gutachten_sv_honorar_* |
| `ocr_extrahiert_am` | timestamptz | 1 | MOVE | gutachten | gutachten.ocr_finished_at |
| `ocr_rohdaten` | jsonb | 1 | MOVE | gutachten | gutachten.gutachten_ocr_raw |
| `ki_kalkulation` | jsonb | 0 | TBD | gutachten | KI-Schaetzung — Reader pruefen |
| `ki_kalkulation_am` | timestamptz | 0 | TBD | gutachten | KI-Schaetzung |
| `ki_geschaetzte_kosten_min` | numeric | 0 | TBD | gutachten | KI-Schaetzung |
| `ki_geschaetzte_kosten_max` | numeric | 0 | TBD | gutachten | KI-Schaetzung |
| `gutachten_vorhanden` | boolean | 30 | MOVE | gutachten | abgeleitet aus gutachten.status |
| `gutachten_hochgeladen_am` | timestamptz | 0 | MOVE | gutachten | gutachten.pdf_uploaded_at |
| `gutachten_positionen` | jsonb | 0 | MOVE | gutachten | gutachten Sub-Table |
| `gutachten_nummer` | text | 0 | MOVE | gutachten | gutachten.auftragsnummer |
| `reparaturkosten` | numeric | 0 | MOVE | gutachten | gutachten.reparaturkosten_* |
| `wertminderung` | numeric | 0 | MOVE | gutachten | gutachten.minderwert |
| `gutachten_stundensatz` | numeric | 0 | MOVE | gutachten | gutachten Lohnsatz-Felder |

#### Termin (15)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `losfahren_erinnerung_gesendet` | boolean | 30 | MOVE | gutachter_termine | Termin-Reminder |
| `termin_erinnerung_5min_gesendet` | boolean | 30 | MOVE | gutachter_termine | Termin-Reminder |
| `geschaetzte_fahrzeit_min` | integer | 0 | MOVE | gutachter_termine | Termin-Routing |
| `geschaetzte_fahrdistanz_km` | numeric | 0 | MOVE | gutachter_termine | Termin-Routing |
| `gcal_event_id` | text | 0 | MOVE | gutachter_termine | Termin-Sub-Table |
| `besichtigungsort_adresse` | text | 1 | MOVE | gutachter_termine | Termin-Ort |
| `besichtigungsort_lat` | numeric | 1 | MOVE | gutachter_termine | Termin-Ort |
| `besichtigungsort_lng` | numeric | 1 | MOVE | gutachter_termine | Termin-Ort |
| `besichtigungsort_place_id` | text | 0 | MOVE | gutachter_termine | Termin-Ort |
| `sv_termin_dokument_reminder_gesendet_am` | timestamptz | 0 | MOVE | gutachter_termine | Termin-Reminder |
| `wunschtermin` | timestamptz | 11 | MOVE | gutachter_termine | Termin-Sub-Table |
| `besichtigungsort_notiz` | text | 0 | MOVE | gutachter_termine | Termin-Ort |
| `re_termin_token` | uuid | 1 | MOVE | gutachter_termine | Re-Termin-Flow |
| `re_termin_token_eingelaufen_am` | timestamptz | 0 | MOVE | gutachter_termine | Re-Termin-Flow |
| `re_termin_eskalation_an_kb_am` | timestamptz | 0 | MOVE | gutachter_termine | Re-Termin-Flow |

#### SV-Briefing (7)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `sv_briefing_text` | text | 6 | MOVE | auftraege | Auftrag-LC Briefing |
| `sv_briefing_generated_at` | timestamptz | 6 | MOVE | auftraege | Auftrag-LC Briefing |
| `sv_briefing_model` | text | 6 | MOVE | auftraege | Auftrag-LC Briefing |
| `sv_briefing_version` | integer | 30 | MOVE | auftraege | Auftrag-LC Briefing |
| `sv_briefing_struktur` | jsonb | 0 | MOVE | auftraege | Auftrag-LC Briefing |
| `sv_notizen_vor_ort` | text | 0 | MOVE | auftraege | SV-Vor-Ort-Notiz |
| `technische_stellungnahme_notiz_sv` | text | 0 | MOVE | auftraege | SV-TS-Notiz |

#### TechStellungnahme (4)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `technische_stellungnahme_status` | text | 30 | MOVE | auftraege | TS-Workflow |
| `technische_stellungnahme_beauftragt_am` | timestamptz | 0 | MOVE | auftraege | TS-Workflow |
| `technische_stellungnahme_hochgeladen_am` | timestamptz | 0 | MOVE | auftraege | TS-Workflow |
| `technische_stellungnahme_freigabe_am` | timestamptz | 0 | MOVE | auftraege | TS-Workflow |

#### Nachbesichtigung (9)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `nachbesichtigung_status` | text | 30 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_angefordert_am` | timestamptz | 0 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_termin_datum` | timestamptz | 0 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_konfrontation` | boolean | 30 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_ergebnis` | text | 0 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_kunde_termin_vorschlaege` | jsonb | 30 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_kunde_termin_eingereicht_am` | timestamptz | 0 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_sv_konfrontation_gewuenscht` | boolean | 0 | MOVE | gutachter_termine | Re-Besichtigung |
| `nachbesichtigung_sv_termin_vereinbart_am` | timestamptz | 0 | MOVE | gutachter_termine | Re-Besichtigung |

#### Mietwagen (15)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `mietwagen_flag` | boolean | 30 | DUP | claims | hat_mietwagen auf claims |
| `nutzungsausfall_tagessatz` | numeric | 0 | MOVE | gutachten | gutachten.gutachten_nutzungsausfall_tagessatz_eur |
| `reparaturdauer_tage` | integer | 0 | MOVE | gutachten | gutachten.wiederbeschaffungsdauer_tage |
| `nutzungsausfall_gesamt` | numeric | 0 | MOVE | gutachten | gutachten Nutzungsausfall |
| `nutzungsausfall` | boolean | 30 | DUP | claims | hat_nutzungsausfall auf claims |
| `mietwagen_kanzlei_informiert` | boolean | 30 | MOVE | kanzlei_faelle | Kanzlei-Info |
| `mietwagen_kanzlei_informiert_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-Info |
| `mietwagen_hat` | boolean | 30 | DUP | claims | hat_mietwagen auf claims |
| `mietwagen_seit_datum` | date | 0 | CLAIMS | claims | Mietwagen-Zeitraum |
| `mietwagen_limit_tage` | integer | 0 | CLAIMS | claims | Mietwagen-Limit |
| `mietwagen_limit_grund` | text | 0 | CLAIMS | claims | Mietwagen-Limit |
| `mietwagen_rechnung_vorhanden` | boolean | 30 | CLAIMS | claims | Mietwagen-Beleg |
| `mietwagen_rechnung_url` | text | 0 | CLAIMS | claims | Mietwagen-Beleg |
| `mietwagen_argumentations_puffer` | integer | 30 | CLAIMS | claims | Mietwagen-Argumentation |
| `mietwagen_vermieter` | text | 0 | CLAIMS | claims | Mietwagen-Vermieter |

#### Dokumente (18)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `abtretung_pdf` | text | 28 | CLAIMS | claims | oder dokumente-Tabelle |
| `vollmacht_pdf` | text | 0 | CLAIMS | claims | oder dokumente-Tabelle |
| `abtretung_signiert_am` | timestamptz | 28 | CLAIMS | claims | Abtretung-Signatur |
| `vollmacht_signiert_am` | timestamptz | 0 | CLAIMS | claims | Vollmacht-Signatur |
| `anschlussschreiben_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC AS |
| `sa_unterschrieben` | boolean | 30 | CLAIMS | claims | SA-Signatur |
| `sa_unterschrieben_am` | timestamptz | 28 | CLAIMS | claims | SA-Signatur |
| `sa_pdf_url` | text | 0 | CLAIMS | claims | SA-PDF |
| `sa_unterschrift_url` | text | 0 | CLAIMS | claims | SA-Unterschrift |
| `vollmacht_status` | text | 30 | CLAIMS | claims | Vollmacht-Status |
| `anschlussschreiben_url` | text | 0 | MOVE | kanzlei_faelle | Kanzlei-LC AS |
| `anschlussschreiben_sendedatum` | date | 0 | MOVE | kanzlei_faelle | Kanzlei-LC AS |
| `anschlussschreiben_unterschrift` | boolean | 30 | MOVE | kanzlei_faelle | Kanzlei-LC AS |
| `anschlussschreiben_ocr_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC AS |
| `vollmacht_geprueft_am` | timestamptz | 0 | CLAIMS | claims | Vollmacht-Pruefung |
| `vollmacht_geprueft_von` | text | 0 | CLAIMS | claims | Vollmacht-Pruefung |
| `vollmacht_pruefung_status` | text | 0 | CLAIMS | claims | Vollmacht-Pruefung |
| `vollmacht_pruefung_begruendung` | text | 0 | CLAIMS | claims | Vollmacht-Pruefung |

#### Kanzlei (11)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `kanzlei_uebergeben_am` | timestamptz | 0 | DUP | claims | auf claims |
| `kanzlei_ansprechpartner_name` | text | 0 | DUP | claims | auf claims |
| `kanzlei_ansprechpartner_email` | text | 0 | DUP | claims | auf claims |
| `kanzlei_ansprechpartner_telefon` | text | 0 | DUP | claims | auf claims |
| `kanzlei_ansprechpartner_position` | text | 0 | CLAIMS | claims | fehlt noch auf claims |
| `mandatsnummer` | text | 12 | MOVE | kanzlei_faelle | Kanzlei-LC Mandat |
| `kanzlei_id` | uuid | 0 | TBD | kanzlei_faelle | Kanzlei-Zuordnung — kanzlei_faelle? |
| `lexdrive_case_id` | text | 0 | MOVE | kanzlei_faelle | LexDrive-Case |
| `lexdrive_ocr_data` | jsonb | 0 | MOVE | kanzlei_faelle | LexDrive-OCR |
| `lexdrive_ocr_received_at` | timestamptz | 0 | MOVE | kanzlei_faelle | LexDrive-OCR |
| `klage_uebergeben_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Klage |

#### Regulierung (21)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `regulierung_betrag` | numeric | 0 | DUP | claims | regulierungs_betrag auf claims |
| `regulierung_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Regulierung |
| `regulierung_angekuendigt_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Regulierung |
| `vs_eskalationsstufe` | text | 30 | MOVE | kanzlei_faelle | VS-Eskalation |
| `regulierungsweise` | text | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Regulierung |
| `vs_reaktion_typ` | text | 0 | MOVE | kanzlei_faelle | VS-Reaktion |
| `vs_reaktion_am` | timestamptz | 0 | MOVE | kanzlei_faelle | VS-Reaktion |
| `vs_ablehnungsgrund` | text | 0 | DUP | claims | vs_ablehnungs_grund auf claims |
| `kuerzungs_betrag` | numeric | 0 | MOVE | kanzlei_faelle | VS-Kuerzung |
| `vs_frist_bis` | timestamptz | 0 | MOVE | kanzlei_faelle | VS-Frist |
| `as_geforderte_summe` | numeric | 0 | MOVE | kanzlei_faelle | AS-Detail |
| `as_frist` | date | 0 | MOVE | kanzlei_faelle | AS-Detail |
| `as_vs_reaktion_text` | text | 0 | MOVE | kanzlei_faelle | AS-Detail |
| `as_salesforce_id` | text | 0 | MOVE | kanzlei_faelle | AS-Salesforce |
| `as_zuletzt_synced_am` | timestamptz | 0 | MOVE | kanzlei_faelle | AS-Sync |
| `vs_kuerzung_grund` | text | 0 | MOVE | kanzlei_faelle | VS-Kuerzung |
| `vs_quote_prozent` | numeric | 0 | MOVE | kanzlei_faelle | VS-Quote |
| `vs_quote_grund` | text | 0 | MOVE | kanzlei_faelle | VS-Quote |
| `vs_quote_akzeptiert_am` | timestamptz | 0 | MOVE | kanzlei_faelle | VS-Quote |
| `vs_quote_betrag_ausgezahlt` | numeric | 0 | MOVE | kanzlei_faelle | VS-Quote |
| `vs_kuerzungs_typ` | text | 0 | MOVE | kanzlei_faelle | VS-Kuerzung |

#### Eskalation (12)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `eskalation_tag_14_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_21_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_28_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_14_ergebnis` | text | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_14_ergebnis_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_14_ergebnis_von` | uuid | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_21_ergebnis` | text | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_21_ergebnis_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_21_ergebnis_von` | uuid | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_28_ergebnis` | text | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_28_ergebnis_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |
| `eskalation_tag_28_ergebnis_von` | uuid | 0 | MOVE | kanzlei_faelle | Kanzlei-LC Eskalation |

#### Ruege (6)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `ruege_erhalten_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Ruege-Workflow |
| `ruege_grund` | text | 0 | MOVE | kanzlei_faelle | Ruege-Workflow |
| `ruege_gesendet_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Ruege-Workflow |
| `ruege_betrag` | numeric | 0 | MOVE | kanzlei_faelle | Ruege-Workflow |
| `ruege_counter` | integer | 30 | MOVE | kanzlei_faelle | Ruege-Workflow |
| `ruege_frist_tage` | integer | 30 | MOVE | kanzlei_faelle | Ruege-Workflow |

#### Abrechnung (27)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `zahlung_eingegangen_am` | timestamptz | 0 | MOVE | abrechnungen | Zahlungseingang |
| `kanzlei_honorar` | numeric | 0 | MOVE | kanzlei_faelle | Kanzlei-Honorar |
| `zahlung_erwartet_am` | date | 0 | MOVE | abrechnungen | Zahlungsplan |
| `zahlung_betrag` | numeric | 0 | MOVE | abrechnungen | Zahlung |
| `lead_preis_netto` | numeric | 0 | TBD | claims | Lead-Preis — leads? |
| `lead_preis_typ` | text | 0 | TBD | claims | Lead-Preis — leads? |
| `lead_preis_berechnet_am` | timestamptz | 0 | TBD | claims | Lead-Preis — leads? |
| `guthaben_verrechnet_netto` | numeric | 30 | MOVE | abrechnungen | Guthaben-Verrechnung |
| `sv_nachzahlung_netto` | numeric | 0 | MOVE | abrechnungen | SV-Nachzahlung |
| `abrechnung_id` | uuid | 0 | MOVE | abrechnungen | abrechnungen-FK |
| `kanzlei_abrechnung_id` | uuid | 0 | MOVE | abrechnungen | Kanzlei-Abrechnung-FK |
| `kanzlei_provision_status` | text | 30 | MOVE | kanzlei_faelle | Kanzlei-Provision |
| `kanzlei_provision_ausgezahlt_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kanzlei-Provision |
| `schlussabrechnung_am` | timestamptz | 0 | MOVE | abrechnungen | Schlussabrechnung |
| `iban` | text | 0 | TBD | claim_parties | Bankdaten — claim_parties oder profiles |
| `bic` | text | 0 | TBD | claim_parties | Bankdaten |
| `kontoinhaber` | text | 0 | TBD | claim_parties | Bankdaten |
| `bankdaten_hinterlegt_am` | timestamptz | 0 | TBD | claim_parties | Bankdaten |
| `zahlungsweg` | text | 0 | MOVE | abrechnungen | Zahlungsweg |
| `abrechnungsart_besprochen` | text | 0 | CLAIMS | claims | Abrechnungsart |
| `abrechnungsart_notiz` | text | 0 | CLAIMS | claims | Abrechnungsart |
| `abrechnungsart_besprochen_am` | timestamptz | 0 | CLAIMS | claims | Abrechnungsart |
| `auszahlung_kunde_betrag` | numeric | 0 | MOVE | kanzlei_faelle | Kunde-Auszahlung |
| `auszahlung_kunde_eingegangen_am` | timestamptz | 0 | MOVE | kanzlei_faelle | Kunde-Auszahlung |
| `auszahlung_gutachter_eingegangen_am` | timestamptz | 0 | MOVE | abrechnungen | SV-Auszahlung |
| `auszahlung_zahlungsweg` | text | 0 | MOVE | abrechnungen | Auszahlungsweg |
| `auszahlung_gutachter_betrag` | numeric | 0 | MOVE | abrechnungen | SV-Auszahlung |

#### Finanzierung (11)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `ust_id` | text | 0 | MOVE | claim_parties | cp.ust_id |
| `leasinggeber_name` | text | 0 | DROP | claims | AAR-918 droppte claims-Twin — Legacy |
| `leasinggeber_informiert` | boolean | 30 | CLAIMS | claims | Leasinggeber-Info-Flag |
| `bank_name` | text | 0 | DROP | claims | AAR-918 — Legacy |
| `firma_name` | text | 0 | MOVE | claim_parties | cp.firma (A3) |
| `finanzierung_leasing` | text | 30 | DUP | claims | auf claims |
| `vorsteuerabzugsberechtigt` | boolean | 30 | DUP | claims | auf claims |
| `finanzierungsgeber_name` | text | 1 | DUP | claims | auf claims |
| `finanzierungsgeber_adresse` | text | 1 | DUP | claims | auf claims |
| `finanzierungsgeber_vertragsnr` | text | 1 | DUP | claims | auf claims |
| `brn` | text | 0 | DUP | claims | auf claims |

#### Marketing (5)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `marketing_quelle` | text | 0 | TBD | claims | Marketing-Herkunft — leads? |
| `marketing_provision` | numeric | 0 | TBD | claims | Marketing-Provision |
| `marketing_provision_status` | text | 0 | TBD | claims | Marketing-Provision |
| `source_channel` | text | 27 | TBD | claims | Akquise-Kanal — created_via auf claims? |
| `source_domain` | text | 0 | DROP | claims | 0-cov |

#### Reminder (4)

| Spalte | Typ | Cov | Verdikt | Heimat | Notiz |
|---|---|--:|---|---|---|
| `unfallmitteilung_status` | text | 30 | CLAIMS | claims | Unfallmitteilung |
| `dokumente_vollstaendig_fuer_phase` | text | 0 | CLAIMS | claims | Dok-Vollstaendigkeit |
| `dokumente_vollstaendig_am_phase` | timestamptz | 0 | CLAIMS | claims | Dok-Vollstaendigkeit |
| `dokumente_reminder_whatsapp_letzte_sendung` | timestamptz | 0 | CLAIMS | claims | Dok-Reminder |

---

## 4 · Sub-Projekt-Dekomposition (CMM-44-Strecke)

Leitprinzip Strategie §4: **claims-first, `faelle` stirbt zuletzt.** Jedes Sub-Projekt ist
eigenstaendig mergebar (Spec → Plan → Execution → Smoke → PR). Reihenfolge nach
Abhaengigkeit + Risiko, abhaengigkeitsarm + risikoarm zuerst.

### Abhaengigkeits-Graph

```
  Phase 0 (CMM-53/54 Prod-Bugs)  ──┐
                                   ▼
  SP-A Duplikat-Drops ────────────────────────────┐
  SP-B Claims-native (CLAIMS-Spalten) ────────────┤
  SP-C Parteien → claim_parties ──────────────────┤
  SP-G2 gutachter_termine.claim_id-FK ──▶ SP-D Termin-Cluster
  vehicle_id-Backfill (AAR-810) ────────▶ SP-E Fahrzeug-Cluster
  Cardentity-Audit §3.1c ───────────────▶ SP-F Vorschaeden-Cluster
  SP-G Gutachten-Rest → gutachten ────────────────┤
  SP-H Auftrag-LC → auftraege ────────────────────┤
  SP-I Kanzleifall-LC → kanzlei_faelle ───────────┤
  SP-J Abrechnung → abrechnungen ──────────────────┘
                                   ▼
  SP-K Reader-Sweep pro Portal (Strategie Phase 4)
                                   ▼
  SP-L Sync-Trigger-Drop + DROP TABLE faelle (Phase 5+6)
```

### Die Sub-Projekte

| # | Sub-Projekt | Spalten | Heimat | Abhaengigkeit | Risiko |
|---|---|---:|---|---|---|
| **SP-A** | **Duplikat-Drops** | 69 (DUP) | claims | — | niedrig |
| **SP-B** | **Claims-native ADD** | 64 (CLAIMS) | claims | — | mittel |
| **SP-C** | **Parteien-Snapshots** | 33 (Kunde/Halter/Gegner) | claim_parties | — | mittel |
| **SP-D** | **Termin-Cluster** | 25 | gutachter_termine | **SP-G2** (claim_id-FK) | hoch |
| **SP-E** | **Fahrzeug-Spec** | 18 | vehicles | vehicle_id-Backfill (AAR-810) | mittel |
| **SP-F** | **Vorschaeden/Cardentity** | 11 | ? | **Cardentity-Audit §3.1c** | mittel |
| **SP-G** | **Gutachten-Rest** | 19 | gutachten | F+G-Cluster (laufend) | niedrig |
| **SP-H** | **Auftrag-LC** | 18 | auftraege | — | mittel |
| **SP-I** | **Kanzleifall-LC** | 56 | kanzlei_faelle | — | hoch |
| **SP-J** | **Abrechnung** | 12 | abrechnungen | — | mittel |
| **SP-G2** | **`gutachter_termine.claim_id`-FK** | — | gutachter_termine | — | hoch |

Summe: 69+64+33+25+18+11+19+18+56+12 = **325**. Rest: 2 FK + 6 DROP + 8 TBD-Einzelfaelle
(`dispatch_id`, `organisation_id`, `kunde_lat/lng`, `lead_preis_*`, `marketing_*`,
`source_channel`, `kanzlei_id`, `iban`/`bic`/`kontoinhaber`/`bankdaten_*`) → in das jeweils
fachlich passende Sub-Projekt mit „TBD"-Markierung; Verdikt faellt beim Sub-Projekt-Spec.

### Empfohlene Reihenfolge

1. **Phase 0** — CMM-53 + CMM-54 Prod-Bugs (Writes auf gedroppte Spalten) zuerst fixen.
2. **SP-A Duplikat-Drops** — groesster Hebel (69 Spalten, −20 %), niedrigstes Risiko.
   Voraussetzung: pro Spalte verifizieren, dass (a) der Sync-Trigger das claims-Gegenstueck
   speist und (b) kein Reader die faelle-Seite liest. Die 40 namensgleichen sind reine
   Drops; die ~29 semantik-gleichen (`schadens_datum`→`schadentag` etc.) brauchen vorab
   Reader-Rename.
3. **SP-G2** parallel — `gutachter_termine.claim_id`-FK (Strategie Phase 2, entsperrt SP-D).
4. **SP-G Gutachten-Rest** — schliesst die laufende F+G-Cluster-Arbeit ab.
5. **SP-B / SP-C / SP-H / SP-J** — unabhaengig, parallelisierbar.
6. **SP-E Fahrzeug** sobald vehicle_id-Backfill steht; **SP-F Vorschaeden** sobald
   Cardentity-Audit §3.1c durch.
7. **SP-I Kanzleifall-LC** — groesstes Einzel-Cluster (56), hohes Risiko (`kanzlei_faelle`
   hat heute nur 8 Spalten → waechst massiv); spaet, wenn die Mechanik der kleineren
   Cluster steht.
8. **SP-K Reader-Sweep** pro Portal (Strategie Phase 4) — nachdem alle Daten umgezogen sind.
9. **SP-L** — Sync-Trigger droppen, dann `DROP TABLE faelle CASCADE` (Phase 5+6).

---

## 5 · Offene Audit-Abhaengigkeiten

Drei Sub-Projekte sind durch noch fehlende Teil-Audits blockiert:

| Blocker | Betrifft | Strategie-Ref |
|---|---|---|
| **Cardentity-Audit** — was schreibt Typ-A/Typ-B, Konsolidierung mit Gutachten-Werten | SP-F (11 Spalten Heimat `?`) | §3.1c, Phase-1 Teil-Audit 4 |
| **Lifecycle-Tabellen-Audit** — spaltengenaues Writer-/Reader-Audit `auftraege`/`kanzlei_faelle`/`gutachter_termine` | SP-D, SP-H, SP-I, SP-G2 | §3.2, Phase-1 Teil-Audit 2 |
| **vehicle_id-Backfill** — `vehicles.id`-FK auf claims wird laut Audit oft nicht initial gesetzt (AAR-810/Cluster-H unfertig) | SP-E | §3.1a Fahrzeug-Hinweis |

Diese drei Audits sind die naechste Audit-Arbeit **vor** dem ersten Sub-Projekt-Code.
SP-A / SP-B / SP-C / SP-G / SP-G2 / SP-H / SP-J haengen an keinem davon — dort kann sofort
gebrainstormt werden.

---

## 6 · Watch-outs fuer die Sub-Projekt-Umsetzung

- **DDL nur via supabase-CLI-Migration** (AGENTS.md Regel 2). Targeted-Apply wegen
  Fremd-Drift: `db query --linked --file <migration.sql>` + `migration repair --status applied`.
- **Sync-Trigger:** `trg_sync_faelle_to_claims` / `trg_sync_claims_to_faelle` decken heute
  34 Duplikat-Spalten ab. Jeder DUP-Drop in SP-A muss den Trigger ohne die gedroppte Spalte
  neu erzeugen — Reihenfolge: View/Function droppen → Trigger recreate → DROP COLUMN.
- **`gutachter_termine` ohne `claim_id`** ist ein struktureller Blocker (Strategie §3.3 +
  RLS-Audit) — SP-G2 muss vor SP-D laufen.
- **Reader-Sweep ≠ grep:** dynamische `fall[feld]`-Zugriffe greppt man nicht. Pro Portal
  klicken + Smoke (`feedback_post_drop_smoke`, `feedback_smoke_annahmen_alle_portale`).
- **TBD-Spalten nicht raten** — beim jeweiligen Sub-Projekt-Spec gegen echte Reader/Writer
  + Vertikal-Audit (`claim-rendering-vertikal-audit.md`) entscheiden.

---

## 7 · Naechster Schritt

Empfehlung fuer die Folge-Session (Strategie §4 Phase 1 Rest + erstes Sub-Projekt):

1. **SP-A Duplikat-Drops brainstormen** — abhaengigkeitsfrei, groesster Hebel, niedrigstes
   Risiko. Spec → Plan → Execution. Vorab: die 69 DUP-Spalten in „namensgleich" (40, reiner
   Drop) vs „semantik-gleich" (29, Reader-Rename noetig) splitten + pro Spalte den
   Sync-Trigger-/Reader-Status verifizieren.
2. **Parallel:** Cardentity-Audit (§3.1c) + Lifecycle-Tabellen-Audit (§3.2) als die zwei
   noch offenen Phase-1-Teil-Audits — sie entsperren SP-D/E/F/H/I.
3. CMM-44 Linear-Master + Sub-Tickets CMM-45..52 gegen die SP-A..L-Struktur oben
   abgleichen/neu ordnen.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
