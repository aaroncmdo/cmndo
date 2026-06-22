# Werkstatt-Vermittler — Design

**Datum:** 2026-06-22
**Status:** Design (Spec) — Review offen
**Kontext:** Neues Feature. Werkstätten vermitteln uns Claims (QR im Betrieb → Kunde scannt → FlowLink)
und werden je Claim verprovisioniert (150 €). Geschwister-Spec: **Auto-Beratungstermin** (separat —
„immer beraten" für allen Self-Service).

---

## 1. Kontext & Problem

Werkstätten sind ein **Vermittler-Kanal**: in der Werkstatt hängt ein **QR-Code**, der Kunde scannt ihn,
landet im kanonischen **FlowLink** (Self-Service), und der Claim wird der Werkstatt zugeordnet — wir
zahlen ihr **150 € je Claim** Provision. Werkstätten brauchen eine **eigene Rolle**, ein **eigenes
Portal** (primär: den QR abrufen), werden **vom Admin angelegt** (Standort etc.), und ihre **ID muss
am Lead/Claim hängen** (Provisionierung).

**Bestand (wichtig — nicht Greenfield):**
- **`werkstaetten`-Tabelle existiert** (leer, 0 Zeilen): `name/normalized_name`, `adresse_*`,
  `telefon/email/website`, **`lat/lng/isochrone`** (Geo!), `partner` (bool), `ansprechpartner_person_id`.
  Sie ist heute ein Werkstatt-Verzeichnis für die Schadensteuerung (`repairs.werkstatt_id → werkstaetten`),
  **ohne** Referral-Aspekte (kein Portal-User, keine Provision, kein Status-Lifecycle, keine Rolle).
- **`repairs`** (claim↔werkstatt-Reparatur-Tracking) + **`leads/claims.werkstatt_seit_datum`** existieren
  → das „Auto steht in der Werkstatt"-Konzept ist teilweise da.
- **`makler`** ist das fertige **Vermittler-Muster** (provision_betrag je service_typ, `user_id`/Portal,
  `status`/`aktiviert_am`, Rolle `makler`, `claims.makler_id`, Provisions-Cron `release-makler-provisionen`).
  **Makler = Versicherungsmakler, eigene Rolle, eigene Logik** — wir spiegeln nur das *Muster*, teilen
  weder Tabelle noch Code.

**Aaron-Prinzip:** kanonisch + Bestand wiederverwenden, kein Herumgefuchtel.

## 2. Ziele / Nicht-Ziele

**Ziele**
- Werkstatt als **eigene Vermittler-Entität** (`werkstaetten` erweitert) + Rolle `werkstatt`.
- **Admin-Anlage** (Standort geocoden, Provision, Portal-Account, aktivieren).
- **QR → FlowLink → `werkstatt_id`** kanonisch durch gfa→lead→claim.
- **Provision 150 €/Claim, fällig bei Claim-Erstellung.**
- **Besichtigungsort:** Auto-in-Werkstatt (Werkstatt-Geo) ODER Kunde gibt Adresse ein.
- **Werkstatt-Portal** (QR abrufen + Provisions-Übersicht).

**Nicht-Ziele**
- **Auto-Beratungstermin** — eigene Schwester-Spec (cross-cutting, aller Self-Service).
- Makler anfassen (eigene Rolle/Logik, bleibt unberührt).
- Die Schadensteuerung (`repairs`-Workflow) ausbauen — nur `werkstatt_seit_datum` mitnutzen.

## 3. Architektur-Überblick

```
  Admin legt Werkstatt an        Kunde scannt QR                    Claim-Erstellung (Trigger)
  ────────────────────────       ────────────────                   ──────────────────────────
  werkstaetten (erweitert)   ─►  /start/werkstatt/[id]          ─►  claims.werkstatt_id gesetzt
  + user(rolle=werkstatt)        → gfa.werkstatt_id                 → DB-Trigger: werkstatt_provisionen
  + Geo (geocode+isochrone)      → issueCanonicalFlowLink              (150€, status='faellig')
  + provision_betrag=150         → lead.werkstatt_id            ─►  release-werkstatt-provisionen-Cron
                                  → FlowLink: „Auto in Werkstatt?"     zahlt aus (Bank)
                                     ja → Werkstatt-Geo = Besichtigungsort
                                     nein → ort_abfragen (Bestand)
  Werkstatt-Portal /werkstatt: QR abrufen + vermittelte Claims + Provisions-Status
```

## 4. §1 — Entität: `werkstaetten` erweitern (+ Rolle)

**DDL via Plugin (Regel 2), additiv:**
```sql
ALTER TABLE werkstaetten
  ADD COLUMN user_id uuid REFERENCES profiles(id),            -- Portal-Login
  ADD COLUMN provision_betrag_netto numeric DEFAULT 150,      -- pro Werkstatt konfigurierbar
  ADD COLUMN provision_aktiv boolean DEFAULT true,
  ADD COLUMN status text DEFAULT 'aktiv',                     -- 'aktiv'|'gesperrt'
  ADD COLUMN aktiviert_am timestamptz, ADD COLUMN aktiviert_von uuid,
  ADD COLUMN gesperrt_am timestamptz, ADD COLUMN gesperrt_grund text,
  ADD COLUMN bank_iban text, ADD COLUMN bank_bic text, ADD COLUMN bank_kontoinhaber text;
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'werkstatt';     -- neue Rolle
```
Reuse: `name/adresse_*/lat/lng/isochrone/partner/ansprechpartner_person_id` bleiben.

## 5. §2 — Admin-Anlage
Admin-Seite (Muster `admin/sachverstaendige/anlegen` + `admin/makler`): Name + Adresse →
**`geocodeAdresse`** (lat/lng) + Isochrone-Backfill (reuse `isochrone-backfill`-Cron-Logik) + Kontakt
+ `provision_betrag` (default 150) + **User-Account anlegen** (`rolle='werkstatt'`, Magic-Link/Passwort
wie SV/Makler) + `aktiviert_am/von` setzen. Server-Action Result-Pattern (`{ ok, error? }`).

## 6. §3 — QR + FlowLink-Verknüpfung (Kern)
- **QR** kodiert eine werkstatt-scoped Start-URL `/start/werkstatt/[werkstattId]` (Muster `app/start/[anfrageId]`
  / `start-link`). Im Werkstatt-Portal abrufbar (PNG/SVG, druckbar).
- Scan → Gutachter-Finder/Anfrage-Flow mit **`werkstatt_id` vorgesetzt**. Die ID fließt kanonisch:
  **`gfa.werkstatt_id`** (neu) → `issueCanonicalFlowLinkForAnfrage` mappt → **`lead.werkstatt_id`** (neu)
  → `convertLeadToClaim` mappt → **`claims.werkstatt_id`** (neu, analog dem existierenden `claims.makler_id`).
- DDL: `ALTER TABLE gutachter_finder_anfragen ADD COLUMN werkstatt_id uuid REFERENCES werkstaetten(id);`
  (+ leads + claims). issueCanonical/convertLeadToClaim um das 1:1-Mapping ergänzen (wie sie `makler_id`/
  `zugeordneter_sv_id` schon durchreichen).

## 7. §4 — Provision (150 €/Claim, fällig bei Claim-Erstellung)
- **`werkstatt_provisionen`-Tabelle** (Muster Makler-Provision): `id, werkstatt_id, claim_id,
  betrag_netto, status ('faellig'|'ausgezahlt'|'storniert'), faellig_am, ausgezahlt_am, created_at`.
- **DB-Trigger** `AFTER INSERT ON claims WHEN (NEW.werkstatt_id IS NOT NULL)` → insert `werkstatt_provisionen`
  (`betrag_netto = werkstaetten.provision_betrag_netto`, `status='faellig'`, `faellig_am=now()`). DB-nativ
  + garantiert (wie der Rückruf-Trigger) — die Provision ist **fällig im Moment der Claim-Erstellung**.
- **Auszahlung:** `release-werkstatt-provisionen`-Cron (Muster `release-makler-provisionen`): fällige →
  Sammel-Auszahlung an `bank_iban`, `status='ausgezahlt'`. (Storno: Claim storniert → Provision `storniert`.)
- Dedup: ein offener Provisions-Datensatz pro (werkstatt_id, claim_id) — partieller Unique-Index.

## 8. §5 — Besichtigungsort: Auto (Werkstatt) vs. Kunde
Nur wenn `lead.werkstatt_id` gesetzt (Werkstatt-Quelle) fügt der FlowLink **einen Schritt** ein:
**„Steht das Fahrzeug noch bei [Werkstatt-Name]?"**
- **Ja** → `werkstaetten.lat/lng` + Adresse als Besichtigungsort auf den Lead schreiben (automatisch) +
  `werkstatt_seit_datum` setzen → Resolver verlässt `ort_abfragen`, Matching läuft.
- **Nein** → bestehendes **`ort_abfragen`** (GooglePlaceAutocomplete).

Erweitert die Besichtigungsort-Kette in `ladeMatchingFlow`:
`besichtigungsort_lat ?? fahrzeug_standort_lat ?? Text-Geocode-Fallback ?? [Werkstatt-Schritt] ?? ort_abfragen`.
Der Werkstatt-Schritt ist ein neuer Flow-State `werkstatt_abfragen` (analog `ort_abfragen`), den
`ladeMatchingFlow` für Werkstatt-Leads ohne Coords VOR `ort_abfragen` surfaced; „ja" schreibt die
Werkstatt-Geo als Besichtigungsort (Muster `speichereBesichtigungsortFlow`). Der **pure** `flow-resolver`
bleibt unverändert (gatet auf Coords). Reuse: Werkstatt-Geo liegt schon in `werkstaetten`.

## 9. §6 — Werkstatt-Portal
`/werkstatt` (Muster `/makler`-Shell, `portal-nav`, rollen-gegatet `werkstatt`):
- **QR abrufen** (Kern-Wunsch) — Download/Druck.
- Übersicht **vermittelte Claims** (claims via `werkstatt_id`, leak-sichere Projektion) + **Provisions-Status**
  (`werkstatt_provisionen`: fällig/ausgezahlt).
- Minimal — kein Claim-Edit (Werkstatt sieht nur ihren Vermittlungs-/Provisions-Stand).

## 10. Reuse-Map
`werkstaetten` (erweitern) · `geocodeAdresse`+Isochrone-Backfill (Anlage) · `issueCanonicalFlowLink`/
`convertLeadToClaim` (werkstatt_id-Durchreichung wie makler_id) · Makler-Provisions-/Portal-/Anlage-**Muster**
(spiegeln) · Besichtigungsort-Resolver (`ladeMatchingFlow`, erweitern) · `repairs`/`werkstatt_seit_datum`
(Auto-in-Werkstatt) · `portal-nav`-Shell · Rückruf-Trigger-Muster (Provisions-Trigger).

## 11. Testing
- **vitest:** werkstatt_id-Mapping (gfa→lead→claim); Besichtigungsort-Resolver mit Werkstatt-Geo
  (istWerkstattLead + ja/nein); Provisions-Betrags-/Status-Logik.
- **pgTAP/Smoke:** Claim-Insert mit werkstatt_id → genau ein `werkstatt_provisionen`-faellig (Trigger);
  Storno → storniert.
- **Integration je Strecke:** Admin legt Werkstatt an → QR → Scan → Lead trägt werkstatt_id → „Auto in
  Werkstatt?"=ja → Werkstatt-Adresse als Besichtigungsort → Claim → Provision fällig → Portal zeigt sie.

## 12. Work-Packages
| WP | Inhalt |
|---|---|
| A | DDL: werkstaetten erweitern + Rolle `werkstatt` + `werkstatt_id` auf gfa/leads/claims + `werkstatt_provisionen` + Trigger (Regel 2). |
| B | Admin-Anlage (Seite + Action, geocode+isochrone+User+aktivieren). |
| C | QR + Start-URL `/start/werkstatt/[id]` + werkstatt_id-Durchreichung (issueCanonical/convertLeadToClaim). |
| D | Provision: Trigger + `release-werkstatt-provisionen`-Cron (Muster Makler). |
| E | Besichtigungsort-Schritt „Auto in Werkstatt?" (FlowLink + Resolver-Erweiterung). |
| F | Werkstatt-Portal `/werkstatt` (QR + Claims + Provisions). |
Reihenfolge: A → (B, C parallel) → D → E → F.

## 13. Risiken & Koordination
- **⚠️ CMM-49-Kollision:** `claims.werkstatt_id` hinzufügen, während die CMM-49-Linie (bca5b079) claims
  migriert/faelle droppt — **additiv, niedrig-Risiko**, aber die WP-A-Migration mit ihnen abstimmen
  (Reihenfolge im Migrations-Stream). `claims.makler_id` existiert schon → das Muster ist etabliert.
- **`ALTER TYPE user_role ADD VALUE`** ist nicht transaktional rückrollbar — in eigener Migration, vor der Nutzung.
- **QR-Sicherheit:** der Start-Link darf keine PII tragen (nur werkstatt_id, signiert wie start-link HMAC).
- **Provisions-Storno:** Claim-Storno muss die fällige Provision auf `storniert` setzen (Trigger/State-Machine).
- **Besichtigungsort-Resolver** wird gerade aktiv angefasst (#3064 Geocode-Fallback) — Erweiterung E darauf aufbauen.

## 14. Definition of Done
- Admin legt Werkstatt an (Geo+Portal-Account+Provision); Werkstatt loggt ein, ruft QR ab.
- QR-Scan → Lead/Claim tragen `werkstatt_id` kanonisch.
- Claim-Erstellung mit werkstatt_id → `werkstatt_provisionen` fällig (Trigger); Cron zahlt aus.
- Werkstatt-Lead: „Auto in Werkstatt?"=ja → Werkstatt-Adresse Besichtigungsort; nein → ort_abfragen.
- Portal zeigt vermittelte Claims + Provisions-Status. vitest+Build+Ratchets grün.
