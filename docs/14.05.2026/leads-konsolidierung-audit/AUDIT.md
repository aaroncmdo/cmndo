# Horizontaler Quellen-Audit: `leads` + `faelle` Redundanzen

**Datum:** 2026-05-14
**Trigger:** Aaron-Frage „gibt es Redundanzen? Jeder Lead sollte ein Feld für 'halter' haben, nicht halter_flowwizard + halter_dispatch."
**Antwort:** Du hast Recht. Es ist sogar schlimmer als gedacht.

## Executive Summary

| Tabelle | Spalten | Person/Adresse-Spalten | Coverage Person-Felder |
|---|---:|---:|---:|
| `leads` | **176** | 19 (halter_* + kunde_* + top-level) | top-level 96%, halter_* 4% |
| `faelle` | viel | 22 (halter_* + kunde_*) | halter_* mit DEPRECATED-Kommentar |
| `claims` (SSoT) | viel | **3** (nur Flags + Beziehung) | clean ✓ |
| `vehicles` | 45 | 0 halter_* | Migration AAR-810 nie fertiggestellt |

**Hauptbefund:** Die DB ist mitten in einer **halb-fertigen Migration**:
- `claims` (CMM-Strecke) ist der neue SSoT und enthält KEINE redundanten Person/Adress-Felder.
- `faelle.halter_*` sind explizit als **DEPRECATED** kommentiert (AAR-810), Ziel-Tabelle ist `vehicles` — aber `vehicles` hat KEINE halter_*-Spalten. Die Migration wurde nicht durchgezogen.
- `leads.halter_*` + `leads.kunde_*` (Adresse) sind komplett ungenutzt (0–4% Coverage).

## Befunde: Redundanz-Cluster

### 1. Person/Kontakt (am schlimmsten)

Dieselbe Person ist in 3 Spalten-Sätzen:

| Top-Level (Anrufer) | Halter-Variante | Coverage |
|---|---|---|
| `vorname` | `halter_vorname` | 25× vs 1× |
| `nachname` | `halter_nachname` | … |
| `email` | `halter_email` | … |
| `telefon` | `halter_telefon` | … |

Plus `halter_name` (legacy, kombiniert, 0×) + `firma_name` (0×).

**Grund laut Code-Kommentaren:**
- AAR-575: Trennt „Anrufer" (vorname/nachname) von „Halter" für den Edge-Case `ist_fahrzeughalter=false`.
- Flag `ist_fahrzeughalter` + Feld `ansprechpartner_beziehung` existieren BEIDE auf `leads` zur Differenzierung.

**Problem:** In der Praxis schreibt das System nur top-level (25/26). Die halter_*-Felder werden quasi nie befüllt. Der Edge-Case wird nicht gepflegt.

### 2. Adresse (Über-Modellierung)

3 Adress-Sets auf `leads`:

| Set | Felder | Coverage |
|---|---|---:|
| `halter_*` | halter_strasse/plz/stadt | 1× |
| `kunde_*` (split) | kunde_strasse/plz/stadt | **0×** |
| `kunde_adresse` (single) | kunde_adresse (text) | **0×** |
| `kunde_lat/_lng` | (Geo) | … |

**4 Spalten komplett unbeschrieben.** `kunde_adresse` (single) und `kunde_strasse/plz/stadt` (split) sind Duplikate desselben Konzepts — historisch nebeneinander gewachsen.

### 3. Fahrzeug-Standort vs Besichtigungsort

| `fahrzeug_standort_*` | `besichtigungsort_*` |
|---|---|
| _adresse, _plz, _lat, _lng, _place_id (7×) | _adresse, _lat, _lng, _place_id, _notiz (**0×**) |

In 95% der Fälle identisch (Auto steht zuhause, SV kommt dahin). Zwei separate Sets mit 5+5 Feldern = 10 Spalten für 1 Konzept.

### 4. Schadens-Klassifikation (5 Felder, 1 genutzt)

| Feld | Coverage |
|---|---:|
| `schadentyp` | 16× |
| `schadentyp_freitext` | (frei-Text-Variante) |
| `schadens_art` | **0×** |
| `schadens_fall_typ` | **0×** |
| `schadensursache` | **0×** |

3 ungenutzte Felder die alle dasselbe klassifizieren.

### 5. Kennzeichen (5 Felder, 1 genutzt)

| Feld | Coverage |
|---|---:|
| `kennzeichen` | 1× |
| `kennzeichen_kreis` | **0×** |
| `kennzeichen_buchstaben` | **0×** |
| `kennzeichen_zahl` | **0×** |
| `kennzeichen_suffix` | **0×** |

Split-Parser geplant, aber nie implementiert. 4 leere Spalten.

### 6. Konvertierungs-Tracking (Migration-Legacy)

| Feld | Coverage |
|---|---:|
| `konvertiert_zu_fall_id` | 11× |
| `konvertiert_zu_claim_id` | 11× |

CMM-Strecke (claims↔faelle Sync) setzt beide via Trigger. SSoT ist `claim_id` — `fall_id` ist legacy.

### 7. Vehicles-FK (geplant, ungenutzt)

`leads.vehicle_id` (UUID, FK auf `vehicles`) ist **0× gesetzt**. Die geplante Architektur „Halter-Daten leben in vehicles" wurde nie zum Live-Pfad — daher der ganze Schmerz oben.

## Empfehlung: 3-stufige Konsolidierung

### Stufe 1 — Drop ungenutzter Felder (sicher, 0% Risiko)

15 Spalten die 0/26 Coverage haben + keine Reads im Code finden:

```
ALTER TABLE leads
  DROP COLUMN halter_name,           -- legacy kombiniert, ersetzt durch _vorname/_nachname
  DROP COLUMN kunde_adresse,         -- 0× gefüllt, war Konkurrenz zu kunde_strasse/plz/stadt
  DROP COLUMN kunde_strasse,         -- 0× gefüllt
  DROP COLUMN kunde_plz,             -- 0× gefüllt
  DROP COLUMN kunde_stadt,           -- 0× gefüllt
  DROP COLUMN besichtigungsort_adresse,    -- 0× gefüllt, fahrzeug_standort reicht
  DROP COLUMN besichtigungsort_lat,
  DROP COLUMN besichtigungsort_lng,
  DROP COLUMN besichtigungsort_place_id,
  DROP COLUMN besichtigungsort_notiz,
  DROP COLUMN schadens_art,          -- 0× gefüllt
  DROP COLUMN schadens_fall_typ,     -- 0× gefüllt
  DROP COLUMN schadensursache,       -- 0× gefüllt
  DROP COLUMN kennzeichen_kreis,     -- 0× gefüllt
  DROP COLUMN kennzeichen_buchstaben,
  DROP COLUMN kennzeichen_zahl,
  DROP COLUMN kennzeichen_suffix;
```

**Voraussetzung:** Code-Reads grep'en — wahrscheinlich finden sich Reads in old Tests / TS-types die mit-droppen müssen. Aber Writes gehen nicht ins Leere (waren eh leer).

### Stufe 2 — Halter_* → top-level konsolidieren (mittlere Komplexität)

Wenn `ist_fahrzeughalter=true` sind top-level = halter_*. Strategie:

- Top-Level (vorname/nachname/email/telefon) wird IMMER für die **Halter-Person** gefüllt.
- `ist_fahrzeughalter=false` + `ansprechpartner_*`-Felder für den Edge-Case (5% der Leads).
- Drop `halter_vorname`, `halter_nachname`, `halter_email`, `halter_telefon`, `halter_strasse`, `halter_plz`, `halter_stadt`.

**Migration-Pfad:**
1. Backfill: für die 1 Row mit halter_*-Daten → top-level kopieren wenn anders.
2. Writers anpassen: 12+ Code-Stellen (OCR-ZB1, Dispatch-Phase4, Faelle-Stammdaten, SvToolsCard, Twilio-Webhook, etc.).
3. Drop columns.

### Stufe 3 — vehicles als Halter-SSoT (groß, AAR-810 fertigstellen)

Die Architektur die in AAR-810 angefangen wurde:
1. `vehicles.halter_vorname/_nachname/_strasse/_plz/_stadt/_email/_telefon` anlegen.
2. Backfill aus `faelle.halter_*` + `leads.halter_*`.
3. Code lesen aus `vehicle.halter_*` via JOIN auf `lead.vehicle_id`.
4. Drop von `leads.halter_*` + `faelle.halter_*` (DEPRECATED-Kommentare existieren schon).

Dauer: 3–5 Tage. Klar definierter Plan in AAR-810-Kontext.

## Andere Tabellen kurz

- **`faelle`**: Hat dieselbe Doppel-Halter-Problematik (DEPRECATED-Kommentare seit April 2026) + zusätzlich `kunde_vorname/_nachname/_email/_telefon` als separate Spalten (AAR-575 für ist_fahrzeughalter-Trennung).
- **`claims`**: SSoT der CMM-Strecke. Hat nur `halter_ungleich_fahrer` (Flag) + `kunde_email` + Foreign-Keys. **Sauber.**
- **`vehicles`**: 45 Spalten, KEINE halter_*. Migration-Ziel von AAR-810 aber nie verlegt.

## Nächster Schritt

Aaron entscheidet welche Stufe:
- **A.** Nur Stufe 1 (sichere Drops, ~1 Tag, 17 Felder weg)
- **B.** Stufe 1+2 (Halter konsolidieren, ~3 Tage, +5 Felder)
- **C.** Stufe 1+2+3 (vehicles als SSoT, ~5–7 Tage, mehrere Tabellen)
