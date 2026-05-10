# Audit: Gutachter-Finden Terminierung-Strecke

**Stand:** 2026-05-10
**Zweck:** Ist-Stand der `/gutachter-finden`-Strecke vor Refactor zu DB-getriebenem Onboarding-Pattern (`onboarding_phasen` + `onboarding_felder`).

---

## 1. Phasen-Inventory (chronologisch)

| Phase | Name | Zweck | User-Input | Abschluss |
|-------|------|-------|-----------|-----------|
| `routing` | Standort-Routing | Am Unfallort oder später buchen? | Klick "Ja" / "Nein" | → `vor_ort_fotos` oder `wann` |
| `vor_ort_fotos` | Foto-Wizard | GPS-gestempelte Unfallfotos sofort am Ort | Min. 1 Foto (ideal: Übersicht, Schaden nah, Kennzeichen, Umfeld) | → `vor_ort_kontakt` |
| `vor_ort_kontakt` | Vor-Ort-Kontakt | Schnelle Kontakterfassung ohne Termin | Vorname, Nachname, Email, Telefon | → `vor_ort_erfolg` |
| `vor_ort_erfolg` | Vor-Ort-Erfolg | "Wir rufen dich in 5 Min an"-Bestätigung | — | Statisch |
| `wann` | Terminwunsch | Zeitpräferenz | Select: `sofort` / `heute` / `tage` | → `schaden` |
| `schaden` | Schadenstyp | Art des Schadens + Kennzeichen Verursacher | Select (Auffahrunfall/Parkschaden/Kreuzung/Wild/Sonstiges) + KZ | → `fahrzeug` |
| `fahrzeug` | Fahrzeugtyp | SV-Spezialisierung bestimmen | Select (PKW/Motorrad/Transporter/LKW/Wohnmobil) | → `gps` |
| `gps` | GPS-Standort | Position für SV-Nähe-Matching | Klick "Standort freigeben" | → `map` |
| `map` | Karte mit SV-Markern | Visuelle SV-Auswahl | Klick auf SV-Marker | → `detail` |
| `detail` | SV-Detail + Termine | Slot-Auswahl | Klick auf TerminSlot | → `ansprueche` |
| `ansprueche` | Z35-Anspruchswahl | Vollregulierung vs. Nur-Gutachten | Select: `vollstaendig` / `nur_gutachten` | → `formular` |
| `formular` | Kontakt + Signatur | Stammdaten + SA-Vollmacht-Signatur (Canvas) + AGB | Inputs + Canvas + Checkbox | → `erfolg` |
| `erfolg` | Erfolgsscreen | Termin-Bestätigung + ZB1-OCR-Angebot | Optional: Fahrzeugschein-Foto | Display-only |

**13 Phasen aktuell** vs. 5 Phasen im neuen iOS-Mockup. Die Vor-Ort-Strecke + Z35-Anspruch + GPS/Map sind klare zusätzliche Pfade die conditional bleiben sollten.

---

## 2. Datenfluss pro Phase

**Single Endpoint:** Fast alle Phasen committen via `erstelleGutachterFinderAnfrage()` (in `src/lib/actions/gutachter-finder-actions.ts`) — Insert in `gutachter_finder_anfragen`. Alles andere ist Browser-State bis Submit.

| Phase | DB-Write? | Tabelle / Spalten |
|---|---|---|
| `routing` | nein | nur State |
| `vor_ort_fotos` + `vor_ort_kontakt` | **Ja** | `gutachter_finder_anfragen.am_unfallort_flag=true`, `aufnahme_fotos` (jsonb), `aufgenommen_am`, plus Kontakt-Felder |
| `wann` | **nein** ⚠ | wird nur lokal als Slot-Generator-Input genutzt, nicht persistiert |
| `schaden`, `fahrzeug` | nein | nur State (`schadentyp`, `fahrzeug_beschreibung`, `kennzeichen`) |
| `gps` | nein | nur State (`schadenort_lat/lng`) |
| `map`, `detail` | nein | `gewaehlterSV`, `gewaehlterSlot` lokal |
| `ansprueche` | nein | `regulierungs_modus` lokal |
| `formular` (Submit) | **Ja** | Insert `gutachter_finder_anfragen` mit komplettem Payload, Status `'neu'` |
| Post-Submit | **Ja** | `konvertiereAnfrageZuFall()` (fire-and-forget) erstellt `faelle`, `claims`, `profiles`, schickt Magic-Link |

**Submit-Payload:** `vorname, nachname, email, telefon, kennzeichen, fahrzeug_beschreibung, schadentyp, schadenort_lat/lng, wunschtermin, zugeordneter_sv_id` (oder `sv_lead_id`), `matching_typ, sa_signatur_data_url, regulierungs_modus, am_unfallort_flag: false`.

---

## 3. Kalender-Verfügbarkeit — kritischer Mangel ⚠

**Status: Vollständig gemockt.**

- Slots generiert lokal in `generiereSlots(wann)` — basiert nur auf der `wann`-Wahl + lokale Uhrzeit
- **Kein Server-Fetch**, keine CalDAV-/Google-Calendar-Integration
- **Race-Condition-anfällig**: zwei User können denselben Slot "buchen", erst der `wunschtermin` im Submit landet in der DB
- `generiereSlots()` ignoriert SVs komplett — der gewählte SV bekommt einen Slot der vielleicht gar nicht in seinen Kalender passt
- WhatsApp-Check (async via `checkAndCacheAvailability()`) prüft nur WA-Erreichbarkeit, nicht Termin-Slots

→ **PR 4 (Slot-Engine) muss das fixen** bevor wir den Wizard umstellen.

---

## 4. Lücken-Analyse (Mockup vs. Code)

| Mockup-Phase | Aktuell | Bemerkung |
|---|---|---|
| Schaden | ✓ `schaden` | Schadenstyp + KZ ok, Schuldfrage **fehlt** im Form (wird im Mockup neu eingeführt) |
| Fahrzeug | ✓ `fahrzeug` | Heute nur Typ-Enum, **fehlt: Marke/Modell/Baujahr/KZ-Detail** (Mockup hat 4 Felder) |
| Termin | ✓ `gps`+`map`+`detail` | Slots gemockt, Day/Time-Strip fehlt |
| Kontakt | ✓ `formular` | passt |
| Bestätigung | ✓ Summary in `formular` + `erfolg` | im Mockup ein eigener expliziter Step |
| Vor-Ort-Routing | ✓ existiert | bleibt als Conditional-Branch |
| Z35-Anspruch | ✓ `ansprueche` | bleibt als Conditional-Phase nach Slot-Wahl |

**Felder die heute NICHT persistiert werden (nur Browser-State):**
- `wann` (Sofort/Heute/Tage)
- `fahrzeugtyp` als Enum (heute als `fahrzeug_beschreibung` TEXT)

**Code-Duplikation mit anderen Flows:**
- Kontakt-Formular-Pattern (vorname/nachname/email/telefon) ist identisch in 5+ anderen Onboarding-Strecken — **Hauptkandidat für die wiederverwendbare Komponente**
- `konvertiereAnfrageZuFall()` ist zentral, kein Klon
- Signatur-Canvas-Pattern ist unique — bleibt für jetzt unique

---

## 5. DB-Schema-Verankerung (für `db_target` der `onboarding_felder`)

| Feld | DB-Target |
|---|---|
| Schuldfrage | `gutachter_finder_anfragen.schuldfrage` (**neue Spalte nötig**) |
| Fahrzeug fahrbereit | `gutachter_finder_anfragen.fahrzeug_fahrbereit` (**neue Spalte nötig**) |
| Schaden-Stichworte | `gutachter_finder_anfragen.schadens_kurzbeschreibung` (**neue Spalte nötig**, ergänzt `schadentyp`) |
| Kennzeichen | `gutachter_finder_anfragen.kennzeichen` ✓ |
| Baujahr / Hersteller / Modell | `gutachter_finder_anfragen.fahrzeug_baujahr / _hersteller / _modell` (**neue Spalten nötig**, ergänzen `fahrzeug_beschreibung`) |
| Fahrzeugtyp Enum | `gutachter_finder_anfragen.fahrzeugtyp` (**neue Spalte mit CHECK** ENUM) |
| Wunschtermin (Datum+Zeit) | `gutachter_finder_anfragen.wunschtermin` ✓ (timestamp) |
| Wunschtermin-Präferenz | `gutachter_finder_anfragen.wunschtermin_wann` (**neue Spalte** sofort/heute/tage) |
| Vorname/Nachname/Email/Telefon | ✓ |
| Bevorzugter Kanal | `gutachter_finder_anfragen.bevorzugter_kanal` (**neue Spalte**: whatsapp/email/anruf) |
| DSGVO ok | `gutachter_finder_anfragen.dsgvo_zustimmung_am` (**neue Spalte**, timestamptz) |

**Schema-Cleanup-Migration in PR 2 nötig:** ~7 neue Spalten + 2 ENUM-Checks.

**Existierende Migrations relevant:** `20260510101410_gfa_vor_ort_aufnahme.sql`, `20260509201146_gfa_regulierungs_modus.sql`, `20260510122333_whatsapp_gfa.sql`.

---

## Fazit

Der Flow ist ein **funktionsfähiger Prototyp** mit echtem Endpoint, aber:

1. **Slot-Management ist Mock** — muss in PR 4 echte Verfügbarkeit aus `gutachter_termine` lesen
2. **Daten leben bis Submit nur im Browser** — d.h. wenn der User in Phase 8 abbricht, ist alles weg. Mit dem neuen Pattern (jede Phase committet sofort via `saveOnboardingStep`) wird der Flow resumable.
3. **Schema fehlt ~7 Spalten** für saubere Felder-Persistierung
4. **Vor-Ort + Z35 als Conditional-Phasen** im neuen Pattern abbilden — `conditional_on jsonb` macht's möglich
