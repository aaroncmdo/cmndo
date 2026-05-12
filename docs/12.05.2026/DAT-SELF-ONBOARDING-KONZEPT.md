# DAT Self-Onboarding + Tier-Auswahl — Konzept für Claude Code

**Stand:** 2026-05-12 · Validiert mit Nicolas + Aaron
**Scope:** Self-Onboarding-Flow im Gutachterportal nach Account-Aktivierung (zwischen Aktivierungs-Mail und Live-Status)
**Voraussetzung:** Gutachter hat Claim abgeschlossen, Aktivierungs-Mail erhalten, Magic-Link geklickt, Passwort gesetzt, ist jetzt im Portal eingeloggt

---

## 1. Gesamt-Flow im Überblick

```
Claim auf gutachter.claimondo.de/claim
   ↓
Aktivierungs-Mail (separates Konzept — siehe Abschnitt 11)
   ↓
Magic-Link → Passwort setzen → Erstes Login
   ↓
─── ONBOARDING START ───────────────────────────────────────
   ↓
Screen 1: Willkommen (3 Mehrwert-Karten)
   ↓
Screen 2a: Qualifikationen (Titel + Mitgliedschafts-Nummern, optional)
   ↓
Screen 2b: Fahrzeugtypen (min. 1 Pflicht)
   ↓
Screen 2c: Schadenarten (min. 1 Pflicht)
   ↓
Screen 2d: Einsatzgebiet (Radius)
   ↓
Screen 3: Reward — Karte mit aktivem Pin + Mini-Profil
   ↓
Screen 4: Tier-Auswahl + AGB
   ↓
   ├── Free gewählt → Screen 8 (Abschluss)
   │
   ├── Basic aktiviert → Screen 5 → 6 → 7 → 8
   │   (Kalender → Verfügbarkeit → Google Business → Abschluss)
   │
   └── Premium vorgemerkt + Free/Basic:
       läuft denselben Flow, Premium ist zusätzliches Flag
   ↓
─── ONBOARDING ENDE ───────────────────────────────────────
   ↓
Portal-Dashboard
```

**Stepper (durchgehend sichtbar):** 3 Hauptsteps — `Profil · Angebot · Startklar`
- Step 1 „Profil" umfasst Screens 1 + 2a–2d + 3 (Reward). Sub-Progress „Profil (1/4)" bis „(4/4)" während 2a–2d.
- Step 2 „Angebot" umfasst Screen 4 (Tier-Auswahl).
- Step 3 „Startklar" umfasst Screens 5–8 (technisches Setup + Abschluss).

---

## 2. Screen-by-Screen Wireframes

### 2.1 Screen 1 — Willkommen

```
┌────────────────────────────────────────────────────────────────┐
│  [Claimondo Logo]                            [DAT Expert Badge] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                  Willkommen, Thomas.                            │  ← --text-h1
│                                                                │
│         Drei Schritte bis du auf der Live-Karte bist.           │  ← --text-body --c-muted
│                                                                │
│                                                                │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│   │  📍            │  │  ✓             │  │  ⚙             │    │
│   │  Geschädigte   │  │  Qualifizierte │  │  Weniger Büro, │    │
│   │  finden dich   │  │  Fälle, kein   │  │  mehr          │    │
│   │  direkt        │  │  Callcenter    │  │  Besichtigung  │    │
│   │                │  │                │  │                │    │
│   │  Dein Standort │  │  Wir prüfen    │  │  Kundenkommu-  │    │
│   │  ist live auf  │  │  jeden Fall    │  │  nikation,     │    │
│   │  der Karte.    │  │  vor der       │  │  Termin-       │    │
│   │  Geschädigte   │  │  Vermittlung.  │  │  koordination, │    │
│   │  in deiner     │  │  Nur Haft-     │  │  Regulierungs- │    │
│   │  Region sehen  │  │  pflicht mit   │  │  begleitung —  │    │
│   │  dein Profil   │  │  Sicherungs-   │  │  wir nehmen    │    │
│   │  und können    │  │  abtretung,    │  │  das Backoffice│    │
│   │  Termine       │  │  100% BVSK-    │  │  ab.           │    │
│   │  anfragen.     │  │  Honorar.      │  │                │    │
│   └────────────────┘  └────────────────┘  └────────────────┘    │
│      .card                .card                .card           │
│                                                                │
│         ●━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○                       │  ← Stepper
│         Profil          Angebot          Startklar              │
│                                                                │
│                  [  Profil einrichten →  ]                      │
│                                                                │
│        ca. 5 Minuten · Fragen? partner@claimondo.de             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Komponenten:** Header (Logo links, DAT-Badge rechts), `.text-h1` Headline mit dynamischem `{vorname}`. Drei `.card` Container Grid 3 Spalten Desktop / Stack Mobile, jede Card mit Icon-Circle oben (`--c-navy` bg, weißes Icon), `.text-h3` Titel, `.text-body --c-muted` Beschreibung. Stepper-Komponente (3 Dots verbunden mit Linien, aktiv = `--c-ondo`, kommend = `--c-border`). Primary CTA `.btn-default` zentriert, breit. Caption darunter.

**Edge Case Fallback:** Wenn `vorname` leer → Headline „Willkommen im Gutachterportal."

**DAT Badge Logic:** Nur sichtbar wenn `sv_leads.quelle = 'dat_expert'` UND `qualifikationen_claim` enthält `'DAT'`.

---

### 2.2 Screen 2a — Qualifikationen (kombiniert)

```
┌────────────────────────────────────────────────────────────────┐
│  [Logo]    Willkommen, Thomas              [DAT Expert Badge]   │
│      ●━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○                          │
│      Profil (1/4)    Angebot          Startklar                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                   Deine Qualifikationen                         │
│                                                                │
│   Berufliche Titel und Mitgliedschafts-Nummern für deine        │
│   verifizierten Badges. Beides ist optional, kann später         │
│   im Portal nachgetragen werden.                                │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ ◐ Habe gerade keine Nummern parat              [Toggle]│   │  ← Toggle oben
│   └────────────────────────────────────────────────────────┘   │     deaktiviert
│                                                                │     Felder
│   ┌────────────────────────────────────────────────────────┐   │
│   │  Beruflicher Titel (Multi-Auswahl)                      │   │
│   │                                                         │   │
│   │  ☐ Dipl.-Ing.   ☐ B.Eng.   ☐ M.Eng.                    │   │
│   │  ☐ Kfz-Meister  ☐ Karosseriebaumeister                  │   │
│   │                                                         │   │
│   │  Sonstiges: [                                       ]   │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐   │
│   │  Mitgliedschafts-Nummern                                │   │
│   │  (Nur die im Claim angekreuzten erscheinen)              │   │
│   │                                                         │   │
│   │  DAT-Expert-Nummer                                       │   │
│   │  ┌───────────────────────────────────┐                  │   │
│   │  │ z.B. 12345                        │                  │   │
│   │  └───────────────────────────────────┘                  │   │
│   │                                                         │   │
│   │  BVSK-Mitgliedsnummer                                    │   │
│   │  ┌───────────────────────────────────┐                  │   │
│   │  │ z.B. 67890                        │                  │   │
│   │  └───────────────────────────────────┘                  │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
│              [ ← Zurück ]              [ Weiter → ]              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Bedingte Logik der Mitgliedschafts-Felder:**
- Wenn `qualifikationen_claim` enthält `'DAT'` → DAT-Nummer-Feld sichtbar
- Wenn `'BVSK'` → BVSK-Nummer-Feld sichtbar
- Wenn `'ÖBuV'` → ÖBuV-Nummer-Feld sichtbar
- Wenn `'IHK'` → IHK-Nummer-Feld sichtbar
- Mindestens eines ist immer sichtbar (Min-1-Regel aus Claim)

**Toggle-Verhalten:** Wenn „Habe gerade keine Nummern parat" eingeschaltet → alle Eingabefelder werden `disabled`, visuell gedimmt mit `opacity: 0.5`. Pills für Titel bleiben aktiv.

**DB-Mapping:**
- Titel-Auswahl → `qualifikationen_neu[]`
- Freitext „Sonstiges" → wird wenn ausgefüllt zu `qualifikationen_neu[]` hinzugefügt
- DAT-Nr → `dat_nummer`, BVSK-Nr → `bvsk_mitgliedsnummer`, ÖBuV-Nr → `oebuv_bestellungsnummer`, IHK-Nr → `ihk_zertifikat_nummer`

---

### 2.3 Screen 2b — Fahrzeugtypen

```
┌────────────────────────────────────────────────────────────────┐
│  Stepper:    ●━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○                  │
│              Profil (2/4)    Angebot          Startklar          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              Welche Fahrzeuge begutachtest du?                  │
│                                                                │
│         Mehrfach-Auswahl. Mindestens eine Option.               │
│                                                                │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│   │ ✓ PKW      │  │   LKW      │  │ Transporter│                │
│   └────────────┘  └────────────┘  └────────────┘                │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│   │ Motorrad   │  │ E-Fahrzeuge│  │ Oldtimer   │                │
│   └────────────┘  └────────────┘  └────────────┘                │
│                                                                │
│         [ Weitere Fahrzeugtypen anzeigen ▼ ]                    │
│                                                                │
│   (Wenn expanded — 10 weitere Cards in 3 Spalten:)               │
│   Hybrid · Youngtimer · Sportwagen · Sonderfahrzeuge ·           │
│   Anhänger · Wohnmobil · Wohnwagen · Nutzfahrzeuge ·             │
│   Baumaschinen · Landmaschinen                                   │
│                                                                │
│              [ ← Zurück ]              [ Weiter → ]              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Selection-Card-Verhalten:**
- Unselected: `border: 1px solid --c-border`, weißer Hintergrund
- Selected: `border: 2px solid --c-ondo`, `background: rgba(123, 163, 204, 0.10)`, Checkmark-Icon ✓ oben links
- Tap toggelt
- Min-1-Validierung: „Weiter" disabled (`opacity: 0.5`) bis mind. 1 selected

**Top-6 Reihenfolge:** PKW, LKW, Transporter, Motorrad, E-Fahrzeuge, Oldtimer (Begründung: häufigste Kfz-Schadensbesichtigungen).

**Wichtig:** Gutachten-Arten (Unfallrekonstruktion, Gerichtsgutachten, Oldtimer-Bewertung) sind im DB-Feld `spezifikationen[]` ebenfalls enthalten, gehören aber konzeptionell nicht in Fahrzeugtypen. Aaron: im Frontend filtern, im Portal als separate „Zusatzleistungen"-Sektion anbieten.

**DB-Mapping:** `spezifikationen[]` Array.

---

### 2.4 Screen 2c — Schadenarten

```
┌────────────────────────────────────────────────────────────────┐
│  Stepper:    ●━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○                  │
│              Profil (3/4)    Angebot          Startklar          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              Welche Schadenarten begutachtest du?               │
│                                                                │
│         Mehrfach-Auswahl. Mindestens eine Option.               │
│                                                                │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│   │✓Karosserie-  │ │ Hagelschaden │ │ Glasschaden  │            │
│   │ schaden      │ │              │ │              │            │
│   └──────────────┘ └──────────────┘ └──────────────┘            │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│   │ Wildschaden  │ │ Totalschaden │ │ Vandalismus- │            │
│   │              │ │              │ │ schaden      │            │
│   └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                │
│         [ Weitere Schadenarten anzeigen ▼ ]                    │
│                                                                │
│   (Wenn expanded — 9 weitere:                                    │
│   Lackschaden · Marderschaden · Brandschaden · Wasserschaden ·   │
│   Diebstahlschaden · Elementarschaden · Bagatellschaden ·        │
│   Motorschaden · Getriebeschaden)                                │
│                                                                │
│              [ ← Zurück ]              [ Weiter → ]              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Top-6 Reihenfolge:** Karosserieschaden, Hagelschaden, Glasschaden, Wildschaden, Totalschaden, Vandalismusschaden (häufigste Schadenarten im Haftpflicht-Bereich).

**DB-Mapping:** `schadenarten[]` Array.

---

### 2.5 Screen 2d — Einsatzgebiet

```
┌────────────────────────────────────────────────────────────────┐
│  Stepper:    ●━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○                  │
│              Profil (4/4)    Angebot          Startklar          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              Wie weit fährst du für eine Besichtigung?          │
│                                                                │
│         Den Radius kannst du später jederzeit anpassen.         │
│                                                                │
│                                                                │
│        ○ 15 km     ● 30 km     ○ 50 km     ○ 75 km              │  ← Radio-Pills
│                                                                │     horizontal zentriert
│                                                                │
│              [ ← Zurück ]              [ Weiter → ]              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Komponenten:** Radio-Pill-Gruppe, jede Pill ist `.pill` mit fester Width 80px, selected = `.pill-blue` (`--c-ondo` bg, white text).

**Default-Wert:** 30 km (vorausgewählt). Empfehlung: DB-Default `paket_umkreis_km` von 20 auf 30 ändern (realistischer für Kfz-Schadensbesichtigungen).

**DB-Mapping:** `paket_umkreis_km` Integer.

**Optional-Feature für später:** Kleine Mapbox-Vorschau die einen Kreis um den Standort visualisiert wenn ein Radius angeklickt wird.

---

### 2.6 Screen 3 — Reward (Standort aktiv)

```
┌──────────────────────────────────────────────────────────────────┐
│  Stepper:    ●━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○                    │
│              Profil          Angebot          Startklar            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                                                                  │
│              [ MAPBOX KARTE — fullscreen ]                        │
│              Pin: grün, leicht pulsierend                         │
│              Andere Pins: sichtbar                                │
│              Einsatzradius als Kreis-Overlay                      │
│                                                                  │
│   ┌──────────────────────────────────┐                            │
│   │  ✓ Dein Standort ist aktiv       │                            │  ← Overlay-Card
│   │                                  │                            │     unten links
│   │  Ing.-Büro Wester GmbH           │                            │     .card
│   │  📍 50829 Köln                   │                            │     --shadow-lg
│   │                                  │                            │
│   │  DAT Expert · BVSK               │                            │
│   │  PKW · LKW · E-Fahrzeuge         │                            │
│   │  Haftpflicht · Kasko             │                            │
│   │  Einsatzgebiet: 30 km            │                            │
│   │                                  │                            │
│   │  So sehen dich Geschädigte       │                            │
│   │  in deiner Region.               │                            │
│   │                                  │                            │
│   │  [ Weiter → ]                    │                            │
│   └──────────────────────────────────┘                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Verhalten:**
- Karte ist die gleiche Mapbox-Karte wie auf der Claim-Page
- Auf den Standort gezoomt (Zoom-Level ~13)
- Pin pulsiert mit `--c-success-fg` (grün)
- Einsatzradius als halbtransparenter Kreis-Overlay (`--c-ondo` mit 15% Opacity)
- Andere DAT-Pins in der Umgebung sichtbar als kleinere `--c-light-blue` Punkte (Social Proof)

**Mobile:** Karte 60% Höhe oben, Overlay-Card als Bottom-Sheet unter der Karte.

**Wichtig:** Das ist der psychologische Reward-Moment. Pin-Animation muss sauber laufen — er sieht „mein Standort wurde gerade live geschaltet". Visuelle Bestätigung wertvoller als jeder Erklärtext.

---

### 2.7 Screen 4 — Tier-Auswahl + AGB

```
┌──────────────────────────────────────────────────────────────────────┐
│  Stepper:  ○━━━━━━━━━━━━●━━━━━━━━━━━━━━○                              │
│            Profil ✓   Angebot          Startklar                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│              Du bist im Verzeichnis. Entscheide                       │
│              wie du Aufträge bekommst.                                │
│                                                                      │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                │
│  │ Dein Status   │ │ ★ EMPFOHLEN   │ │ AUF ANFRAGE   │                │
│  │               │ │               │ │               │                │
│  │ VERZEICHNIS-  │ │ LIVE-TERMIN-  │ │ GEBIETS-      │                │
│  │ EINTRAG       │ │ VERMITTLUNG   │ │ EXKLUSIVITÄT  │                │
│  │               │ │               │ │               │                │
│  │ 0€            │ │ 24,90€ / Mo   │ │ Individuelle  │                │
│  │               │ │ DAT: 0€       │ │ Konditionen   │                │
│  │               │ │               │ │               │                │
│  │ ──────────    │ │ ──────────    │ │ ──────────    │                │
│  │               │ │               │ │               │                │
│  │ ✓ Auf der     │ │ Alles aus     │ │ Alles aus     │                │
│  │   Karte als   │ │ Verzeichnis,  │ │ Termin-       │                │
│  │   Fallback    │ │ plus:         │ │ vermittlung,  │                │
│  │               │ │               │ │ plus:         │                │
│  │ ✓ Basis-      │ │ ✓ Kalender +  │ │               │                │
│  │   Profil      │ │   direkte     │ │ ✓ Google Ads  │                │
│  │               │ │   Termin-     │ │   in deinem   │                │
│  │ ✓ Portal-     │ │   buchung     │ │   Gebiet      │                │
│  │   Zugang      │ │               │ │               │                │
│  │               │ │ ✓ Priori-     │ │ ✓ Aktive      │                │
│  │ ✗ Keine       │ │   sierte      │ │   Fall-       │                │
│  │   aktive      │ │   Vermitt-    │ │   steuerung   │                │
│  │   Vermitt-    │ │   lung        │ │               │                │
│  │   lung        │ │               │ │ ✓ Gebiets-    │                │
│  │               │ │ ✓ Google-     │ │   schutz      │                │
│  │ ✗ Kein        │ │   Bewer-      │ │               │                │
│  │   Kalender    │ │   tungen      │ │ ✓ Backoffice  │                │
│  │               │ │               │ │   + persön-   │                │
│  │               │ │ ✓ Tages-      │ │   licher An-  │                │
│  │               │ │   route       │ │   sprech-     │                │
│  │               │ │               │ │   partner    │                │
│  │               │ │ ✓ Fälle-      │ │               │                │
│  │               │ │   Dashboard   │ │ Wunschgebiet: │                │
│  │               │ │               │ │ [PLZ ___]     │                │
│  │               │ │ ✓ Verifi-     │ │               │                │
│  │               │ │   zierte      │ │ ○ 15 km       │                │
│  │               │ │   Badges      │ │ ○ 40 km       │                │
│  │               │ │               │ │ ● über 50 km  │                │
│  │               │ │ Gutschein:    │ │               │                │
│  │               │ │ ┌──────────┐  │ │               │                │
│  │               │ │ │ DAT2026  │  │ │               │                │
│  │               │ │ └──────────┘  │ │               │                │
│  │               │ │ ✓ eingelöst   │ │               │                │
│  │               │ │               │ │               │                │
│  │ ──────────    │ │ ──────────    │ │ ──────────    │                │
│  │               │ │               │ │               │                │
│  │ Keine Aktion  │ │ [Aktivieren]  │ │ [Vormerken]   │                │
│  │ nötig         │ │               │ │               │                │
│  └───────────────┘ └───────────────┘ └───────────────┘                │
│                                                                      │
│  ☐ Ich akzeptiere die Nutzungsbedingungen und Datenschutzerklärung   │
│                                                                      │
│              [ ← Zurück ]              [ Abschließen → ]              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Visuelle Hierarchie:**
- Free-Karte (links): `--c-bg` Hintergrund (gedimmt), `--c-border`, KEIN Button — Label „Dein Status" oben
- Basic-Karte (Mitte): `--c-card` Hintergrund, `border: 2px solid --c-ondo`, „★ EMPFOHLEN" Badge oben (`.pill-blue`), `[ Aktivieren ]` Button
- Premium-Karte (rechts): `--c-navy` Hintergrund, weiße Schrift, „AUF ANFRAGE" Badge oben, `[ Vormerken ]` Button

**Card-Aktivierungs-Logik:**
- Free ist immer aktiv (Default-Status nach Account-Erstellung)
- Basic und Premium sind UNABHÄNGIGE Toggles — beide können parallel aktiv sein
- Nach Klick auf „Aktivieren" (Basic): Button wechselt zu `.btn-default[disabled]` mit „✓ Aktiviert" Label
- Nach Klick auf „Vormerken" (Premium): Button wechselt zu „✓ Vorgemerkt"
- Klick erneut hebt Auswahl auf

**Gutschein-Code-Logik (Basic-Karte):**
- Eingabefeld mit Placeholder „Gutschein-Code"
- Beim Tippen kein Live-Validate
- Beim Verlassen (blur) oder Enter: Validierung
- Hardcoded check: `code.toUpperCase() === 'DAT2026'`
- Bei Match: Preis-Anzeige wechselt von „24,90€ / Mo" zu „0€ ✓ eingelöst" mit `--c-success-fg`
- Bei Nicht-Match: Hint „Code ungültig" unter Feld
- DB: `gutschein_code = 'DAT2026'`, `paket_preis = 0`

**Premium-Vormerkung — Pflichtfelder bei Klick auf „Vormerken":**
- PLZ (5-stellig validiert)
- Radius (Radio: 15 / 40 / über 50 km)
- Wenn beide leer → Button bleibt disabled

**AGB Checkbox:** Sitzt UNTER allen drei Karten. Pflicht für „Abschließen → ". `vertraege_unterzeichnet` Eintrag mit `typ = 'nutzungsbedingungen'` bei Submit.

**Abschließen-Button-Verhalten:**
- Wenn nur Free aktiv (nichts gewählt) → trotzdem klickbar (Free ist OK)
- Wenn Basic aktiviert → führt zu Screen 5 (Kalender)
- Wenn nur Premium vorgemerkt (kein Basic) → führt direkt zu Screen 8 (Abschluss)
- Wenn Basic + Premium → führt zu Screen 5 (Basic-Setup-Flow)

**DB-Updates:**
```sql
UPDATE sachverstaendige SET
  paket = CASE WHEN basic_aktiviert THEN 'basic' ELSE 'free' END,
  paket_preis = CASE WHEN gutschein = 'DAT2026' THEN 0 ELSE 24.90 END,
  gutschein_code = NULLIF($gutschein, ''),
  premium_waitlist = $premium_vorgemerkt,
  premium_wunsch_plz = NULLIF($premium_plz, ''),
  premium_wunsch_radius = $premium_radius
WHERE id = $user_sv_id;
```

---

### 2.8 Screen 5 — Kalender verbinden (nur bei Basic)

```
┌────────────────────────────────────────────────────────────────┐
│  Stepper:    ○━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━●                  │
│              Profil ✓        Angebot ✓        Startklar (1/3)   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                  Kalender verbinden                             │
│                                                                │
│   Damit Geschädigte direkt Besichtigungstermine bei dir         │
│   buchen können, verbinde deinen Kalender. Wir sehen nur        │
│   freie/belegte Zeiten — keine Termindetails.                   │
│                                                                │
│   ┌──────────────────────────────────────────────┐              │
│   │  🔵 Google Calendar verbinden                │              │  ← .btn-default
│   └──────────────────────────────────────────────┘              │     mit Icon
│                                                                │
│   ┌──────────────────────────────────────────────┐              │
│   │  📘 Outlook verbinden                        │              │  ← .btn-outline
│   └──────────────────────────────────────────────┘              │     (Phase 2)
│                                                                │
│              [ Später einrichten → ]                            │
│                                                                │
│   Ohne Kalender können Geschädigte keine Termine buchen.        │
│   Du kannst den Kalender jederzeit im Portal nachholen.         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Verhalten:**
- Google Calendar Button öffnet OAuth-Flow (Supabase OAuth-Provider)
- Outlook ist Phase 2 (Microsoft Graph API Integration nötig — Aaron entscheidet wann)
- „Später einrichten" geht direkt zu Screen 8 (Abschluss), Screens 6+7 werden übersprungen

**DB-Mapping:** Nach erfolgreichem OAuth:
- `gcal_connected = true`
- `gcal_access_token`, `gcal_refresh_token` gespeichert
- `kalender_typ = 'google'` (oder `'outlook'`)

---

### 2.9 Screen 6 — Verfügbarkeit (nur wenn Kalender verbunden)

```
┌────────────────────────────────────────────────────────────────┐
│  Stepper:    ○━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━●                  │
│              Profil ✓        Angebot ✓        Startklar (2/3)   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                  Wann bist du verfügbar?                        │
│                                                                │
│   Geschädigte können nur in diesen Zeiten Termine buchen.       │
│   Du kannst das jederzeit im Portal anpassen.                   │
│                                                                │
│   ┌──────────────────────────────────────────────┐              │
│   │  Mo  ☑   ┌──────┐ — ┌──────┐                │              │
│   │           │08:00 │   │17:00 │                │              │
│   │           └──────┘   └──────┘                │              │
│   │  Di  ☑   08:00 — 17:00                       │              │
│   │  Mi  ☑   08:00 — 17:00                       │              │
│   │  Do  ☑   08:00 — 17:00                       │              │
│   │  Fr  ☑   08:00 — 17:00                       │              │
│   │  Sa  ☐   —                                   │              │
│   │  So  ☐   —                                   │              │
│   └──────────────────────────────────────────────┘              │
│                                                                │
│   Besichtigungen pro Tag:                                       │
│   ┌──────┐                                                      │
│   │ 4  ▼ │                                                      │  ← Dropdown
│   └──────┘                                                      │     1–10
│                                                                │
│              [ ← Zurück ]              [ Weiter → ]              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Default-Werte:** Mo–Fr aktiv, 08:00–17:00 Uhr, 4 Besichtigungen/Tag.

**DB-Mapping:**
- `arbeitszeiten` (jsonb): `{mo: {von: '08:00', bis: '17:00'}, di: {...}, ...}`
- `blockierte_wochentage` (jsonb): `['sa', 'so']`
- `kapazitaeten_jsonb`: `{besichtigungen_pro_tag: 4}`

---

### 2.10 Screen 7 — Google Business (optional, nur Basic/Premium)

```
┌────────────────────────────────────────────────────────────────┐
│  Stepper:    ○━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━●                  │
│              Profil ✓        Angebot ✓        Startklar (3/3)   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                  Google-Bewertungen anzeigen                    │
│                                                                │
│   Geschädigte vertrauen Gutachtern mit Bewertungen. Wenn du     │
│   ein Google Business Profil hast, zeigen wir deine             │
│   Bewertungen automatisch auf deinem Profil an.                 │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐      │
│   │ 🔍 Firmenname oder Adresse eingeben...               │      │  ← Google Places
│   └──────────────────────────────────────────────────────┘      │     Autocomplete
│                                                                │
│   → Beim Auswählen wird Vorschau angezeigt:                     │
│   ┌──────────────────────────────────────────────────────┐      │
│   │  ✓ Ing.-Büro Wester GmbH                              │      │
│   │  ⭐ 4.8 (23 Bewertungen)                              │      │
│   │  „Sehr professionell, schnelle Bearbeitung..."         │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                │
│              [ Überspringen ]              [ Weiter → ]          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Technische Anbindung:** Google Places API Autocomplete + Place Details. Bei Auswahl:
- `standort_place_id` speichern
- `google_bewertungen_anzahl`, `google_bewertungen_schnitt` aus Place Details ziehen

**Skip-Verhalten:** „Überspringen" geht direkt zu Screen 8. Kann später im Portal nachgetragen werden.

---

### 2.11 Screen 8 — Abschluss

```
┌────────────────────────────────────────────────────────────────┐
│  Stepper:    ○━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○ ✓                │
│              Profil ✓        Angebot ✓        Startklar ✓        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│                  ┌────────┐                                     │
│                  │   ✓    │                                     │  ← Grüner Kreis
│                  └────────┘                                     │     animiert
│                                                                │
│                  Du bist startklar.                             │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐      │
│   │ Verzeichniseintrag      ✓ Aktiv                       │      │
│   │ Terminvermittlung       ✓ Aktiv (DAT-Vorteil: 0€)     │      │
│   │ Kalender                ✓ Verbunden                    │      │
│   │ Verfügbarkeit           ✓ Mo–Fr 08:00–17:00            │      │
│   │ Google-Bewertungen      ✓ 4.8 ★ (23 Bew.)              │      │
│   │ Gebietskampagne         ⏳ Vorgemerkt für 50829 / 40km │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                │
│   Was du jetzt noch tun kannst:                                 │
│                                                                │
│   →  Qualifikations-Nachweise hochladen                         │
│      (BVSK, DAT, IHK, ÖBuV — für verifizierte Badges)            │
│                                                                │
│   →  Profilbild / Firmenlogo hochladen                          │
│                                                                │
│   →  Tagesroute im Dashboard ausprobieren                       │
│                                                                │
│                                                                │
│              [ Zum Dashboard → ]                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Status-Box-Logik:**
- Aktive Features: ✓ grün, `--c-success-fg`
- Übersprungene Features: ⊘ grau (oder gar nicht gelistet)
- Premium-Waitlist: ⏳ Sanduhr mit Detail-Info

**DB-Update bei Submit:**
```sql
UPDATE sachverstaendige SET
  onboarding_status = 'abgeschlossen',
  onboarding_step = NULL,
  portal_zugang_freigeschaltet = true,
  ist_aktiv = true
WHERE id = $user_sv_id;
```

---

## 3. Free-Path vs. Basic-Path

| Screen | Free-Path | Basic-Path |
|---|---|---|
| 1 Welcome | ✓ | ✓ |
| 2a Quali | ✓ | ✓ |
| 2b Fahrzeugtypen | ✓ | ✓ |
| 2c Schadenarten | ✓ | ✓ |
| 2d Radius | ✓ | ✓ |
| 3 Reward | ✓ | ✓ |
| 4 Tier-Auswahl | ✓ | ✓ |
| 5 Kalender | ✗ → skip | ✓ |
| 6 Verfügbarkeit | ✗ → skip | ✓ (nur wenn Kalender) |
| 7 Google Business | ✗ → skip | ✓ |
| 8 Abschluss | ✓ | ✓ |

Free-Path: ~3 Minuten · Basic-Path: ~6 Minuten

---

## 4. Persistierungs-Logik

**Incremental Save bei jedem „Weiter":**
- Nach jedem Screen werden die eingegebenen Daten in `sachverstaendige` per UPDATE persistiert
- Neuer Feld `onboarding_step` (text) speichert den aktuellen Screen-Identifier (`welcome`, `profil_quali`, `profil_fahrzeuge`, etc.)
- Beim nächsten Login: System prüft `onboarding_status` und `onboarding_step`, springt zum letzten unvollendeten Screen

**Vorteil:** Gutachter kann mittendrin abbrechen, wird beim nächsten Login an genau der Stelle wieder aufgegriffen.

---

## 5. DB-Schema-Erweiterungen

Neue Felder in `sachverstaendige`:

```sql
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS onboarding_step text;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS gutschein_code text;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS premium_waitlist boolean DEFAULT false;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS premium_wunsch_plz text;
ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS premium_wunsch_radius integer;

-- paket-Werte erweitern (in CHECK-Constraint oder Enum)
-- bestehend: 'standard', 'pro'
-- neu: 'free', 'basic', 'premium'
```

Empfehlung: Migration für bestehende Daten:
- `standard` → `basic`
- `pro` → `premium`

---

## 6. Edge Cases

| Szenario | Verhalten |
|---|---|
| Gutachter schließt Browser während Onboarding | Bei nächstem Login: Resume an `onboarding_step` |
| Gutachter klickt Browser-Zurück | Soft-Confirm: „Fortschritt geht verloren wenn du jetzt zurückgehst" — App-eigener Back-Button funktioniert immer |
| Free gewählt, will später upgraden | Im Portal-Dashboard immer ein „Upgrade auf Basic" Button sichtbar |
| Gutschein-Code mehrfach eingegeben (anderer Account) | Code ist nicht 1:1 — kann beliebig oft verwendet werden, aber das Backend prüft ob `quelle = 'dat_expert'` für die DAT-Logik |
| Kalender-OAuth fehlgeschlagen | Toast: „Verbindung fehlgeschlagen. Versuch's nochmal oder überspringe diesen Schritt." Bleibt auf Screen 5 |
| Google Places API down | Fallback: manueller Text-Input (kein Place-ID, keine Bewertungen) — kann später im Portal nachgetragen werden |
| Premium PLZ entspricht nicht dem Claim-Standort | Erlaubt — Gutachter kann für anderes Gebiet vorgemerkt sein als sein Claim-Standort |

---

## 7. Animationen

- **Screen-Übergang:** `translateX(20px)` + fade-in, 200ms ease-out
- **Stepper-Step-Aktivierung:** Dot wechselt von `--c-border` zu `--c-ondo`, Linie fließt animiert (300ms)
- **Selection-Card-Toggle:** Border-Transition + Background-Fade, 150ms
- **Reward Pin-Drop:** Pin droppt von Y=-50px auf Endposition mit ease-out-bounce (600ms)
- **Reward Pulse:** Pin pulsiert kontinuierlich (scale 1 → 1.15 → 1, 2s loop)
- **Abschluss ✓-Kreis:** Scale 0 → 1 mit ease-out-back (500ms), Checkmark-Stroke animiert nach (300ms)

---

## 8. Design-Token-Referenz

Identisch zu Claim-Map-Konzept Abschnitt 11. Siehe `DAT-CLAIM-MAP-KONZEPT.md`.

---

## 9. Empfohlene Dateistruktur

```
src/
├── app/
│   ├── onboarding/
│   │   ├── layout.tsx                 # Stepper-Frame
│   │   ├── willkommen/page.tsx        # Screen 1
│   │   ├── profil/
│   │   │   ├── qualifikationen/page.tsx  # 2a
│   │   │   ├── fahrzeugtypen/page.tsx    # 2b
│   │   │   ├── schadenarten/page.tsx     # 2c
│   │   │   └── radius/page.tsx           # 2d
│   │   ├── standort-aktiv/page.tsx    # Screen 3 (Reward)
│   │   ├── angebot/page.tsx           # Screen 4 (Tier)
│   │   ├── kalender/page.tsx          # Screen 5
│   │   ├── verfuegbarkeit/page.tsx    # Screen 6
│   │   ├── bewertungen/page.tsx       # Screen 7
│   │   └── fertig/page.tsx            # Screen 8
│   │
│   └── aktivieren/page.tsx            # Magic-Link Landing (separat)
│
├── components/
│   └── onboarding/
│       ├── OnboardingStepper.tsx
│       ├── WelcomeCards.tsx
│       ├── QualiToggle.tsx
│       ├── SelectionCard.tsx
│       ├── TierCard.tsx
│       ├── GutscheinInput.tsx
│       ├── KalenderConnect.tsx
│       ├── AvailabilityGrid.tsx
│       ├── PlacesAutocomplete.tsx
│       ├── MapReward.tsx
│       └── AbschlussSummary.tsx
│
├── lib/
│   └── onboarding/
│       ├── persistence.ts             # Incremental save
│       ├── resume.ts                  # State recovery
│       ├── validation.ts              # Pflichtfelder etc.
│       └── tier-logic.ts              # Free/Basic/Premium-Routing
│
└── supabase/
    └── functions/
        └── send-activation-email/index.ts
```

---

## 10. Was als Nächstes ansteht (nach Konzept-Approval)

1. **DB-Migration:** Neue Felder in `sachverstaendige` + neue Tabelle `claim_activations` anlegen
2. **Paket-Werte umbenennen:** `standard` → `basic`, `pro` → `premium`, `free` neu hinzufügen
3. **Routes:** 11 neue Routes unter `/onboarding/*` + `/aktivieren`
4. **Components:** 11 neue Components nach obiger Struktur
5. **Edge Function:** `send-activation-email` implementieren (Resend/Postmark)
6. **OAuth-Setup:** Google Calendar OAuth-Provider in Supabase konfigurieren
7. **Google Places API:** Key beantragen, in Frontend einbinden
8. **Stripe (Phase 2):** Aktuell nicht nötig — Basic ist für DAT 0€, Free ist 0€, Premium läuft über Beratungsgespräch. Wenn Basic später kostenpflichtig wird für Non-DAT, Stripe-Checkout im Tier-Screen nachrüsten.

---

## 11. Aktivierungs-Mail (Brücke zwischen Claim und Onboarding)

**Trigger:** Sofort nach erfolgreichem Claim-Submit (Edge Function `send-activation-email`)

**Subject:** `Thomas, dein Claimondo-Zugang ist bereit (Code: A8F3-9X2K)`

**Sender:** `team@claimondo.de` (Reply-To gleich)

**Body-Struktur:**

```
┌─────────────────────────────────────────────────────────────┐
│  [Claimondo Logo]                       [DAT Expert Badge]   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                              │
│  Thomas, dein Claimondo-Zugang ist bereit                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  ✓ Standort gesichert                                 │    │  ← --c-success-bg
│  │  Ing.-Büro Wester GmbH                                │    │
│  │  Venloerstr. 1041, 50829 Köln                         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Als DAT Expert Partner ist dein Basic-Paket           │    │  ← --c-light-blue/15
│  │  (sonst 24,90€/Monat) für dich kostenlos.             │    │     CONDITIONAL
│  │  Den Vorteil-Code schalten wir während des             │    │     nur bei DAT
│  │  Onboardings automatisch frei.                         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Aktiviere jetzt deinen Account und richte dein Profil       │
│  ein. In etwa 5 Minuten bist du live auf der Karte.          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │       ➤  Account aktivieren                            │    │  ← .btn-default
│  └──────────────────────────────────────────────────────┘    │     Magic-Link
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Falls der Button nicht funktioniert:                         │
│  1.  Öffne https://gutachter.claimondo.de/aktivieren         │
│  2.  Gib diesen Einmal-Code ein:  A8F3-9X2K                  │
│  3.  Setze dein neues Passwort                                │
│                                                              │
│  Der Code ist 72 Stunden gültig.                              │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  📅 Live-Webinar am Donnerstag, 04. Juni · 16:00 Uhr         │  ← Webinar-Block
│                                                                  alert alert-info
│  Nicolas, Aaron und Philipp Sedelmeier (DAT) zeigen dir       │
│  die Plattform und alle Services im Detail.                   │
│                                                              │
│  [ Termin speichern ↓ ]      [ Im Browser ansehen ]           │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Fragen? Schreib uns: partner@claimondo.de                    │
│                                                              │
│  Bis bald,                                                    │
│  Nicolas & Aaron                                              │
│                                                              │
│   ┌────────┐  ┌────────┐                                     │  ← Foto-Strip
│   │ [Foto] │  │ [Foto] │                                     │     64x64 circle
│   │ Nico   │  │ Aaron  │                                     │
│   └────────┘  └────────┘                                     │
│   Nicolas Kitta · Aaron Sprafke                              │
│   Claimondo · gutachter.claimondo.de                          │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  Du erhältst diese Mail weil du deinen Standort auf            │
│  claim.claimondo.de beansprucht hast.                         │
└─────────────────────────────────────────────────────────────┘
```

**Conditional Logic:**
- DAT-Hinweis-Block + DAT Expert Badge: nur wenn `sv_leads.quelle = 'dat_expert'`
- Webinar-Block: nur wenn aktuelles Webinar in der Pipeline (Datum aus Settings-Tabelle)

**Technisches Setup:**
- E-Mail-Provider: Resend oder Postmark
- Magic-Link Format: `https://gutachter.claimondo.de/aktivieren?token={ulid}` — 72h TTL
- Einmal-Code: 8-Char alphanumerisch (Format `XXXX-XXXX`), gleicher 72h-TTL
- Speicherung in `claim_activations` Tabelle (siehe Claim-Map-Konzept Abschnitt 8)
- Foto-URLs: Nicolas + Aaron Headshots aus `/assets/email/nicolas.jpg` und `/assets/email/aaron.jpg`, je 128×128 (2× für Retina), absolute URLs

**Magic-Link-Landing-Page** `/aktivieren`:
- Wenn `?token=` Parameter: Token validieren → Passwort-Setzen-Form anzeigen
- Wenn kein Token: Code-Eingabe-Form anzeigen (Fallback)
- Nach Passwort-Setzen: Auto-Login + Redirect zu `/onboarding/willkommen`

---

## 12. Offene technische Punkte (außerhalb dieses Konzepts)

- **Bestehender Onboarding-Code in `aaroncmdo/cmndo`:** Vor Bau muss der aktuelle Onboarding-Stand reviewed werden (was bleibt, was wird umgebaut). Aaron prüft mit Claude Code: welche Routes, Components, DB-Logik bereits existieren und mit dem neuen Flow gemerged werden können.
- **E-Mail von Philipp Sedelmeier:** Outbound-Mail die den ganzen Funnel auslöst — separates Konzept, blockiert auf Philipps Klärung (Webinar-Datum, Versandweg, Foto-Freigabe).
- **Webinar-Pitch-Deck:** Wird parallel konzipiert sobald Webinar-Datum steht.
- **Zahlen/Daten/Fakten:** Aus Google Ads + Notion + Maik Pramor — für Webinar-Pitch.

---

**Fragen zu diesem Konzept?** Anpinnen im Chat mit Nicolas oder direkt in der MD kommentieren.
