# BEFUND — Horizontaler Audit `leads`-Tabelle

**Datum:** 2026-05-14
**Methode:** Schema-Dump + Coverage-Statistik (gefüllt/total über 26 Smoke-Datensätze) + Migration-Kommentar-Grep.
**Ziel:** Welche Spalten sind redundant, ungenutzt, deprecated?

## Schema-Stand

| Tabelle | Anzahl Spalten | Person/Adress-Felder | Status |
|---|---:|---:|---|
| `leads` | 176 | 19 (top-level + halter_* + kunde_*) | Über-modelliert |
| `faelle` | viel | 22 (halter_* mit DEPRECATED-Kommentar + kunde_*) | Halb-migriert |
| `claims` (SSoT) | viel | 3 (nur Flags + FK) | Sauber ✓ |
| `vehicles` | 45 | 0 halter_* | Migration-Ziel AAR-810, nie umgesetzt |

## Konkrete Befunde

### Befund 1 — Person/Kontakt 3× modelliert

Dieselbe Person ist in 3 Spalten-Sätzen auf `leads`:

| Schicht | Felder | Coverage (26 Rows) |
|---|---|---:|
| Top-Level | `vorname`, `nachname`, `email`, `telefon`, `anrede` | **25× / 96%** |
| Halter-Set | `halter_vorname`, `halter_nachname`, `halter_email`, `halter_telefon`, `halter_geburtsdatum` | **1× / 4%** |
| Legacy-Combined | `halter_name` (kombiniert) | **0× / 0%** |
| Firma-Set | `firma_name`, `firma_ustid` | **0×** |
| Differenzierer | Flag `ist_fahrzeughalter` + Feld `ansprechpartner_beziehung` | (Edge-Case-Lösung) |

**Diagnose:** Top-level ist tatsächlich der einzig genutzte Pfad. Halter-Set + halter_name + firma_* sind Tote-Felder.

**Quelle der Doppelung:** AAR-575 (April 2026) führte halter_* + kunde_* ein, um den Edge-Case „Anrufer ≠ Fahrzeughalter" sauber zu trennen. In der Praxis pflegt das System diese Differenzierung nicht — der Edge-Case bleibt theoretisch.

### Befund 2 — Adresse 3× modelliert

3 Adress-Sets auf `leads`:

| Set | Felder | Coverage |
|---|---|---:|
| `halter_*` | halter_strasse, halter_plz, halter_stadt | **1×** |
| `kunde_*` (split) | kunde_strasse, kunde_plz, kunde_stadt | **0×** |
| `kunde_adresse` (single) | kunde_adresse (text) + kunde_lat + kunde_lng | **0×** |

**Diagnose:** Eine Adresse pro Lead reicht. 9 Spalten für 1 Adresse, 8 davon leer.

### Befund 3 — Fahrzeug-Standort vs Besichtigungsort

| Feld-Set | Felder | Coverage |
|---|---|---:|
| `fahrzeug_standort_*` | _adresse, _plz, _lat, _lng, _place_id | **7× / 27%** |
| `besichtigungsort_*` | _adresse, _lat, _lng, _place_id, _notiz | **0×** |

**Diagnose:** 95% der Fälle: Auto steht zuhause, SV kommt dahin. Zwei separate Sets mit 5+5=10 Spalten für 1 Konzept.

### Befund 4 — Schadens-Klassifikation 5× modelliert, 1× genutzt

| Feld | Coverage |
|---|---:|
| `schadentyp` | **16× / 62%** |
| `schadentyp_freitext` | (Begleit-Feld) |
| `schadens_art` | **0×** |
| `schadens_fall_typ` | **0×** |
| `schadensursache` | **0×** |

**Diagnose:** Historisch evolviert (verschiedene Versionen der Klassifikation). Nur eine aktiv gepflegt. 3 leere Spalten.

### Befund 5 — Kennzeichen 5× modelliert, 1× genutzt

| Feld | Coverage |
|---|---:|
| `kennzeichen` (Komplett-String) | **1×** |
| `kennzeichen_kreis` | **0×** |
| `kennzeichen_buchstaben` | **0×** |
| `kennzeichen_zahl` | **0×** |
| `kennzeichen_suffix` | **0×** |

**Diagnose:** Split-Parser-Konzept existierte, wurde nie implementiert. 4 leere Spalten.

### Befund 6 — Konvertierungs-Tracking doppelt

| Feld | Coverage | Status |
|---|---:|---|
| `konvertiert_zu_fall_id` | **11×** | CMM-Legacy |
| `konvertiert_zu_claim_id` | **11×** | CMM-SSoT |

**Diagnose:** CMM-Strecke (claims↔faelle Sync via Trigger) setzt beide simultan. Eines ist SSoT, das andere Legacy.

### Befund 7 — vehicles-FK ungenutzt (Migration nie umgesetzt)

`leads.vehicle_id` (UUID, FK auf `vehicles`-Tabelle): **0× gesetzt.**

**Diagnose:** AAR-810 plante "Halter-Daten leben in vehicles". Migration nie zum Live-Pfad. Daher die Multi-Tabellen-Halter-Duplikate.

## Quantifizierung

**`leads.*`**:
- 17 Spalten **komplett leer** (0% Coverage) — droppen ohne Risiko möglich
- 5 weitere Spalten mit <5% Coverage (halter_*) — Halb-Tote
- ~22 Felder Konsolidierungspotenzial

**`faelle.halter_*`**: DEPRECATED-Kommentar seit AAR-810. Code-Cleanup ("C.1.a") nie passiert. 10 Felder warten auf Drop.

**Schätzung:** Total ~50 Spalten droppable wenn Konsolidierung durchgezogen wird (über leads + faelle).

## Limitierungen dieses Befunds

Dieser horizontale Audit zeigt **WAS gespeichert wird**, nicht **WIE es gepflegt wird**. Offene Fragen für den vertikalen Audit:

1. **Drift zwischen Write-Pfaden:** Schreibt OCR-ZB1 in dieselben Felder wie Dispatch-Phase-4? Oder gibt es Halter-Daten die nur in halter_*, andere die nur in top-level landen?
2. **Read-Path-Drift:** Liest die Fallakte (Stammdaten-Tab) konsistent aus einer Schicht? Oder mischt sie top-level + halter_*?
3. **Semantik-Drift:** Bedeutet `vorname` immer „Halter-Vorname" oder mal „Anrufer-Vorname" (wenn nicht-Halter)?
4. **Migration-Konsistenz:** Wenn Lead → Fall konvertiert wird, werden alle 3 Adress-Sets korrekt nach faelle übernommen, oder gibt's Datenverlust?
5. **Trigger-Logik:** Macht der claims↔faelle-Sync-Trigger mit den Halter-Feldern was?

**→ Diese Fragen beantwortet der vertikale Audit (nächster Schritt).**
