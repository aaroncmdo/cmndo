# KONSOLIDIERUNGS-CLUSTER — Cross-Table-Redundanzen

**Datum:** 2026-05-14
**Frage:** Welche Spalten-Cluster modellieren ein-und-dasselbe Konzept mehrfach über Tabellen hinweg? Horizontal zusammenführen wo vertikal eins.

## Methode
Schema-Scan über `leads`, `faelle`, `claims`, `claim_parties`, `vehicles`, `profiles` nach gleich-benannten Spalten + semantischen Duplikaten.

## Tabellen-Realität

| Tabelle | Spalten | Rows | Rolle |
|---|---:|---:|---|
| `leads` | 176 | viele | Entry-Point |
| `faelle` | ? | viele | CMM-Legacy |
| `claims` | 127 (nach heute) | 13 | CMM-SSoT |
| `claim_parties` | 54 | 9 | Parties-SSoT, AKTIV |
| `vehicles` | 45 | **0** | Halb-fertig (AAR-810) |
| `profiles` | ? | viele | User-Daten |

---

## Cluster 1 — GEGNER (Verursacher + dessen Versicherung) — STÄRKSTE Redundanz

### Was ist vertikal eins?
**Eine Person** (oder „unbekannt"), die den Schaden verursacht hat, mit **einem** Fahrzeug, **einer** Versicherung, **einer** Schadensnummer.

### Wie ist es horizontal modelliert?

| Tabelle | Spalten | Coverage |
|---|---|---|
| **leads** | gegner_name, _kennzeichen, _fahrzeugtyp, _schadennummer, _versicherung, _versicherung_id, _versicherungsnummer, _versicherung_anfrage_datum, _anzahl_beteiligte, _bekannt (10) | aktiv |
| **faelle** | gleiche 10 Spalten | aktiv (sync) |
| **claims** | gegner_aktenzeichen, gegner_bekannt, gegner_versicherung_id, gegner_versicherungsnummer, gegnerisches_vehicle_id, anzahl_beteiligte_total (6) | 0/13 |
| **claim_parties** | rolle='verursacher' + vorname/nachname/firma/versicherung_id/versicherungsnummer/versicherungs_aktenzeichen + 50 weitere Spalten | 0/13 |

**Befund:** Gegner-Daten sind über **4 Tabellen** verstreut, ~26 Spalten redundant. `claim_parties` mit `rolle='verursacher'` wäre der saubere SSoT — aber noch leer.

### Empfehlung
- **Mittelfristig:** Verursacher-Pfad konsolidieren auf `claim_parties` (mit fallback `vehicles.gegnerisches_*` für Fahrzeug-Daten)
- **Quick-Win heute:** Wenn `claims.gegner_aktenzeichen` / `claims.gegner_versicherungsnummer` 0/13 sind UND `claim_parties.versicherungs_aktenzeichen` der SSoT ist → claims-Spalten könnten droppable sein. Aber: dispatch-fall-actions schreibt aktiv auf `claims.gegner_versicherungsnummer` über lead-fall-mapping (zu prüfen). Drop wahrscheinlich Stufe 2.

---

## Cluster 2 — HALTER (Fahrzeughalter)

### Was ist vertikal eins?
**Eine Person** ist Halter des betroffenen Fahrzeugs. Pro Fahrzeug.

### Wie ist es horizontal modelliert?

| Tabelle | Spalten | Coverage |
|---|---|---|
| **leads** | halter_vorname, _nachname, _name (generated), _email, _telefon, _strasse, _plz, _stadt, _geburtsdatum, _ungleich_fahrer_flag, ist_fahrzeughalter (11) | viele |
| **faelle** | identische 11 Spalten | viele (sync) |
| **vehicles** | current_owner_id (FK auth.users) | 0/0 |
| **claim_parties** | ist_halter (boolean) + beziehung_zum_halter (text) | 0 |
| **claims** | halter_ungleich_fahrer | 0 |

**Befund:** Halter-Daten auf leads + faelle dupliziert (22 Spalten). Auf vehicles existiert nur 1 FK-Spalte (current_owner_id). claim_parties hat nur ein Flag.

### Vertikal-Konflikt-Risiko (aus BEFUND.md leads-Audit)
- `halter_vorname` wird in zwei Pfaden geschrieben:
  - OCR-Pipeline aus ZB1-Scan
  - Phase4-Stammdaten-Auto-Sync mappt `lead.vorname` → `halter_vorname` wenn `ist_fahrzeughalter=true`
- **Race-Condition:** OCR setzt korrekten Halter, Phase4 überschreibt mit Kundendaten

### Empfehlung
- **Mittelfristig:** Halter ist Fahrzeug-Eigenschaft → `vehicles`-Tabelle als Träger. Aktuell aber `vehicles.current_owner_id` allein reicht nicht (Adresse fehlt). Müsste erweitert werden.
- **Alternative:** Halter als `claim_parties` (rolle='halter') — dann nicht fahrzeug-, sondern claim-zentriert.
- **Quick-Win:** Aktuell keiner — Halter-Refactor ist mehrere Tage Arbeit (AAR-810-Linie).

---

## Cluster 3 — FINANZIERUNG (Fahrzeug-Eigenschaft)

### Was ist vertikal eins?
**Ein Finanzierungs- oder Leasing-Partner** für **ein** Fahrzeug. Ist Fahrzeug-Eigenschaft, nicht Claim-Eigenschaft.

### Wie ist es horizontal modelliert?

| Tabelle | Spalten | Coverage |
|---|---|---|
| **leads** | finanzierung_leasing, leasing_geber, finanzierung_bank, finanzierungsgeber_adresse, _name, _vertragsnr, brn (7) | wenig |
| **faelle** | finanzierung_leasing, leasinggeber_name, leasinggeber_informiert, finanzierungsgeber_adresse, _name, _vertragsnr, brn (7) | wenig |
| **claims** | identische 7 Felder zu faelle | **0/13** |
| **vehicles** | **0 Spalten** für Finanzierung | n/a |

**Befund:** 21 Spalten über 3 Tabellen, alle dasselbe Konzept. `vehicles` (das logische Ziel) hat den Cluster gar nicht.

### Empfehlung
- **Stufe 1b Original-Plan:** vehicles um 7 Finanzierungs-Spalten erweitern + dispatch-fall-actions umstellen. Aber vehicles ist 0 Rows → erst muss ein Vehicle-Writer existieren.
- **Realistisch:** Bevor Finanzierung auf vehicles wandert, muss vehicles als Tabelle erst zum Leben erweckt werden. Das ist AAR-810 H2 (großer Refactor).
- **Quick-Win heute:** `claims.finanzierung_*` (alle 0/13, kein Code-Writer auf claims direkt) könnten **gedropped** werden, ohne vehicles erst zu erweitern. faelle behält Finanzierung, claims wirft sie raus. Konsistent mit firma_name-Pattern.

---

## Cluster 4 — KUNDE-EMAIL

### Was ist vertikal eins?
Die **eine** Email-Adresse des Kunden. Pro Person.

### Wie ist es horizontal modelliert?

| Tabelle | Spalte | Coverage / Status |
|---|---|---|
| **auth.users** | email | kanonisch (Supabase Auth) |
| **profiles** | email | mirror von auth.users |
| **leads** | email | aktiv (entry-point) |
| **faelle** | kunde_email | cache |
| **claims** | kunde_email | **2/13** |

**Befund:** **5 Stellen** für dieselbe Email. Nur `auth.users.email` ist SSoT, alles andere ist Cache für Read-Perf oder Legacy.

### Empfehlung
- `claims.kunde_email` 2/13 — Cache mit hoher Drift-Wahrscheinlichkeit. Wenn Kunde Email ändert, läuft Cache leer.
- **Quick-Win:** Drop claims.kunde_email, Reads gehen auf JOIN `claims.geschaedigter_user_id → auth.users.email` oder profile.
- Aber: ist `kunde_email` für **Gast-Claims** (kein User-Account) gedacht? Dann legit. Prüfen.

---

## Cluster 5 — FIRMA-NAME (Gewerbe-Kundendaten)

### Status nach heute
- `claims.firma_name` ✅ gedropped (PR #1123)
- `claims.firma_ustid` ✅ gedropped (PR #1126)
- `leads.firma_ustid` ✅ gedropped (PR #1099)
- `leads.schadensursache` ✅ gedropped (PR #1099)

### Was bleibt offen?
- `leads.firma_name` (existiert noch)
- `faelle.firma_name` (existiert noch)
- `profiles.firma` (User-Profil-Firma)
- `claim_parties.firma` + `.ist_gewerbe` + `.ust_id` (SSoT)

### Empfehlung
**Mittelfristig:** Firma-Pfad voll auf `claim_parties` (geschaedigter-Party mit `ist_gewerbe=true`). `leads.firma_name` + `faelle.firma_name` bleiben als Onboarding-Felder für Pre-Claim-Phase. Drop nur wenn Convert-Lead-to-Claim die Firma in claim_parties schreibt.

---

## Cluster 6 — KLASSIFIKATION (Schadens-Art)

### Was ist vertikal eins?
**Eine** Klassifikation des Schadens. Aber: legitime mehrere Achsen (was-Art / wer-Schuld / Bußgeld-Kategorie).

### Spalten

| Tabelle | Spalte | Achse |
|---|---|---|
| claims | `schadenart` (NOT NULL) | Was-Art (kaskoschaden/diebstahl/...) |
| claims | `fall_typ` | SF-Codes (sf-01..04) — Smoke-Tool-Filter |
| claims | `ursache` | Freitext-Ursache |
| claims | `unfall_konstellation` | UK-Codes (Geometrie des Unfalls) |
| claims | `bkat_unfallart` | Bußgeld-Enum (LLM-inferenced) |

**Befund:** 5 Spalten, alle live (Writer existieren — siehe Stufe 1 Vertikal-Audit).

### Empfehlung
- Nicht droppable, alle haben Live-Pfade.
- **Mittelfristig:** Überprüfen ob `schadenart` + `unfall_konstellation` + `bkat_unfallart` alle 3 nötig sind oder ob 2 davon abgeleitet werden können. Aber kein Quick-Win, semantisch unterscheidbar.

---

## Cluster 7 — KENNZEICHEN

### Was ist vertikal eins?
**Ein** aktuelles Kennzeichen pro Fahrzeug.

### Spalten

| Tabelle | Spalte |
|---|---|
| vehicles | kennzeichen_aktuell |
| leads | kennzeichen |
| faelle | kennzeichen |

**Befund:** 3 Spalten — vehicles ist SSoT, andere sind Caches. Aber vehicles ist 0/0, also Caches sind im Moment der einzige Pfad.

### Empfehlung
Wie bei Halter — abhängig von vehicles-Aktivierung.

---

## Prioritisierte Aktions-Liste

### Sofort möglich (Quick-Wins):

| # | Aktion | Aufwand | Risiko |
|---|---|---|---|
| 1 | `claims.kunde_email` droppen (2/13 Cache, Reads via JOIN) | 1 PR | Klein wenn Gast-Claims geprüft |
| 2 | `claims.finanzierung_*` 7 Felder droppen (alle 0/13, kein Writer auf claims direkt) | 1 PR | Klein — vehicles-Migration kann später Felder auf vehicles neu anlegen |
| 3 | `claims.gegner_aktenzeichen` + `_versicherungsnummer` Cluster prüfen — falls 0/13 + kein Writer → drop | 1 PR | Mittel — könnte aktiv schreiben |

**Diese 3 könnten 10+ Spalten weg räumen, alle ohne Funktions-Verlust.**

### Mittelfristig (1-2 Tage):

- Cluster 5 Firma: convert-lead-to-claim auf claim_parties umstellen → leads.firma_name + faelle.firma_name droppable
- Cluster 1 Gegner: claim_parties als Verursacher-SSoT live machen → claims.gegner_* + leads.gegner_* + faelle.gegner_* konsolidieren

### Großer Refactor (mehrere Tage, AAR-810):

- Cluster 2 Halter + Cluster 3 Finanzierung + Cluster 7 Kennzeichen: vehicles-Tabelle als Fahrzeug-SSoT aktivieren. Alle fahrzeug-bezogenen Felder dorthin.

## Empfehlung Nächster Schritt

**Quick-Win-Batch (1 PR):** Drop von `claims.finanzierung_*` (7 Felder) + `claims.kunde_email` + ggf. `claims.gegner_aktenzeichen` und `gegner_versicherungsnummer` falls Vertikal-Check ok. 9-10 Spalten in einem Wisch. Konsistent mit Stufe-0-Pattern.

Danach claim_parties-zentrierte Konsolidierung (Firma + Gegner) als Stufe 2.
