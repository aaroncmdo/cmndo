# DAT Claim-Map — Konzept für Claude Code

**Stand:** 2026-05-12 · Validiert mit Nicolas + Aaron
**Scope:** Public, embeddable Claim-Map auf `gutachter.claimondo.de/claim` (oder als iframe-Modul auf `dat.de/sachverstaendige`)
**Trigger:** E-Mail von Philipp Sedelmeier (DAT-Gebietsleiter) an 62 DAT Expert Standorte PLZ 50–59

---

## 1. Übersicht

Die Claim-Map ist die erste Berührung der Gutachter mit der Plattform nach Philipps E-Mail. Sie hat genau einen Job: in unter 90 Sekunden den Standort vom Lead-Status zum geclaimten Status bringen, plus E-Mail-Adresse erfassen für die Aktivierungs-Mail.

Architektur-Entscheidung: **Option C — Map als Embed-Modul, Claim als Portal-Modal.** Die Map ist eine schlanke standalone Komponente (Mapbox + Supabase REST), der Claim öffnet ein Modal/Slide-over im Portal-Kontext. So lässt sich die Map später auch als iframe auf `dat.de` einbetten, der Claim selbst bleibt im claimondo.de-Kontext mit Supabase Auth.

---

## 2. Layout & Wireframes

### 2.1 Desktop (≥ 1024px)

```
┌──────────────────────────────────────────────────────────────────┐
│  [Claimondo Logo]    [DAT Expert Partner Badge]                   │  ← Header
│                                                                  │     32px hoch
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐                                               │
│ │ 🔍 PLZ, Firma… │                                               │  ← Floating
│ └────────────────┘                                               │     Searchbar
│                                                                  │     top-left
│                                                                  │
│                                                                  │
│                                                                  │
│              [ MAPBOX-KARTE — fullscreen ]                        │
│                                                                  │
│              62 Pins: 45 Hauptstandorte + 17                      │
│              Nebenstandorte (gleiche Firmen)                      │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ 62 Standorte · 0€ für DAT Expert Partner · Live-           │  │  ← Stat-Bar
│ │ Disponierung in 5 Klicks                                    │  │     unten zentriert
│ └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

Wenn Pin angeklickt: Side-Panel schiebt sich von rechts (Width 420px, full-height) als Overlay. Karte bleibt links sichtbar.

### 2.2 Mobile (< 768px)

```
┌──────────────────────┐
│  [Logo] [DAT Badge]  │
├──────────────────────┤
│ ┌──────────────────┐ │
│ │ 🔍 PLZ, Firma…   │ │
│ └──────────────────┘ │
│                      │
│                      │
│      MAPBOX-KARTE    │
│                      │
│                      │
│                      │
├──────────────────────┤
│  ━━━ Drag-Handle ━━━ │  ← Bottom-Sheet Peek
│  62 Standorte        │     ~30% Höhe
│  Liste durchsuchen ↑ │     hochziehbar
└──────────────────────┘
```

Bottom-Sheet hat drei Zustände:
- **Peek (30%):** Nur Stat-Bar + Hint sichtbar
- **Half (60%):** Firmenliste sichtbar, scrollbar
- **Full (95%):** Liste + Claim-Formular nach Pin-Auswahl

---

## 3. Mapbox-Konfiguration

```js
const mapConfig = {
  center: [7.0, 51.0],          // Köln/Bonn-Region
  zoom: 9,                       // ganze PLZ 50–59 sichtbar
  minZoom: 8,
  maxZoom: 17,
  style: 'mapbox://styles/mapbox/light-v11',  // Claimondo-Look
  attributionControl: false,     // dezenter Footer separat
};
```

Stilanpassungen via Layer-Overrides:
- Wasser: `--c-light-blue` 20% opacity
- Straßen: `--c-border`
- Labels: `--c-muted` / `--c-navy`
- Country/State borders: `--c-border` dashed

---

## 4. Pin-Design

### 4.1 Pin-Typen

| Typ | Design | Wann |
|---|---|---|
| **Hauptstandort verfügbar** | Größer (32px), `--c-ondo` Fill, „H"-Badge oben | `sv_leads.ist_hauptstandort = true` UND `warteliste_status = 'ausstehend'` |
| **Nebenstandort verfügbar** | Kleiner (24px), `--c-light-blue` Fill | `ist_hauptstandort = false` UND `warteliste_status = 'ausstehend'` |
| **Soeben geclaimed** (Session) | Animation: blau → grün, kurzer Bounce | Nach Submit, vor Page-Reload |
| **Bereits vergeben** | 50% Opacity, kein Hover-Effekt, nicht klickbar | `warteliste_status IN ('geclaimed', 'verifiziert', 'aktiv')` |

### 4.2 Firma-Gruppierung

Pins der gleichen Firma (gleiche `firma_key`) bekommen:
- Gleiche Farbe-Sättigung (etwas variiert um sie zu unterscheiden)
- Bei Hover über einen Pin → alle Pins der gleichen Firma pulsieren kurz
- Im Side-Panel: „+ 3 weitere Standorte dieser Firma" als Hinweis

### 4.3 Clustering

Bei Zoom < 10: Pins werden zu Cluster-Bubbles aggregiert mit Anzahl-Label. Mapbox built-in Clustering. Beim Klick auf Cluster: Zoom + 2 Stufen.

---

## 5. Suchfeld (Floating Searchbar)

**Position:** Desktop oben links auf der Karte, 16px Margin. Mobile: oben unter dem Header.
**Komponente:** `.input` mit `search`-Icon links, `.shadow-md`, weißer Hintergrund.
**Verhalten:** Autocomplete-Dropdown mit max. 8 Treffern, fuzzy-matching auf:
- Firmenname (alle 45 Firmen)
- PLZ (50000–59999)
- Ortsname (Köln, Bergisch Gladbach, Bonn, etc.)

Bei Auswahl: Karte fliegt zum Pin (Mapbox `easeTo`), Pin pulsiert 2 Sekunden, Side-Panel öffnet sich automatisch.

**Wichtig:** Suche FILTERT NICHT die Pins. Alle 62 bleiben sichtbar. Suche zoomt nur hin. Das ist Social Proof — der Gutachter sieht die volle Abdeckung.

---

## 6. Side-Panel / Bottom-Sheet — 4 Zustände

### Zustand 1 — Pin-Preview (nach Pin-Klick)

```
┌────────────────────────────────────┐
│ [×] Schließen                       │
├────────────────────────────────────┤
│                                    │
│  Ing.-Büro Wester GmbH             │  ← --text-h2
│                                    │
│  Venloerstr. 1041                  │  ← --text-body
│  50829 Köln                        │
│                                    │
│  [Hauptstandort Badge]              │  ← .pill-blue
│                                    │
│  Diese Firma hat noch 3 weitere    │  ← --text-caption
│  Standorte (Lütz GmbH).             │     --c-muted
│                                    │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Standort beanspruchen  →    │  │  ← .btn-default
│  └──────────────────────────────┘  │     volle Breite
│                                    │
└────────────────────────────────────┘
```

### Zustand 2 — Claim-Formular

```
┌────────────────────────────────────┐
│ [←] Zurück                          │
├────────────────────────────────────┤
│                                    │
│  Ing.-Büro Wester GmbH             │  ← Kompakt-Header
│  Venloerstr. 1041, 50829 Köln       │
│                                    │
│  ──────────────────────────────    │
│                                    │
│  Vorname *                          │
│  ┌──────────────────────────────┐  │
│  │ Thomas                       │  │  ← .input 40px
│  └──────────────────────────────┘  │
│                                    │
│  Nachname *                         │
│  ┌──────────────────────────────┐  │
│  │ Bergmann                     │  │
│  └──────────────────────────────┘  │
│                                    │
│  E-Mail *                           │
│  ┌──────────────────────────────┐  │
│  │ thomas@bergmann-gutachten.de │  │
│  └──────────────────────────────┘  │
│                                    │
│  Telefon (optional)                 │
│  ┌──────────────────────────────┐  │
│  │ 0221 1234567                 │  │
│  └──────────────────────────────┘  │
│                                    │
│  ──────────────────────────────    │
│                                    │
│  Qualifikation (mind. 1)            │
│                                    │
│  ☑ DAT Expert                       │  ← Checkboxen
│  ☐ BVSK Mitglied                    │     keine Nummern
│  ☐ ÖBuV                             │
│  ☐ IHK zertifiziert                 │
│                                    │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Standort sichern ✓          │  │  ← .btn-default
│  └──────────────────────────────┘  │     disabled bis
│                                    │     Pflicht-Felder OK
└────────────────────────────────────┘
```

**Validierung:**
- E-Mail-Format Regex (RFC 5322 light)
- Mindestens 1 Qualifikations-Checkbox
- Vor- und Nachname mind. 2 Zeichen
- Telefon (optional): wenn ausgefüllt, mindestens 7 Ziffern

### Zustand 3 — Multi-Standort-Check (conditional)

Wird nur angezeigt wenn `sv_leads` weitere Einträge mit gleichem `firma_key` enthält und `warteliste_status = 'ausstehend'`.

```
┌────────────────────────────────────┐
│ Standort gesichert ✓                │  ← --c-success-fg
├────────────────────────────────────┤
│                                    │
│  Wir sehen 3 weitere Standorte     │  ← --text-h3
│  von Lütz GmbH:                    │
│                                    │
│  ☑ Hauptstr. 12, 51465 BergGladbach │
│  ☑ Marktstr. 8, 51491 Overath       │  ← alle vorausgewählt
│  ☑ Bahnhofstr. 33, 51545 Waldbröl   │
│                                    │
│  Möchtest du diese auch             │
│  beanspruchen? Du kannst alle mit   │
│  derselben E-Mail verwalten.       │
│                                    │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Alle bestätigen →           │  │
│  └──────────────────────────────┘  │
│                                    │
│  [ Nur den Hauptstandort claimen ] │  ← .btn-outline
│                                    │
└────────────────────────────────────┘
```

### Zustand 4 — Bestätigung

```
┌────────────────────────────────────┐
│                                    │
│           ┌──────┐                 │
│           │  ✓   │                 │  ← Grüner Kreis
│           └──────┘                 │     animiert (scale 0→1)
│                                    │
│   Dein Standort ist gesichert!     │  ← --text-h1
│                                    │
│   Ing.-Büro Wester GmbH            │
│   Venloerstr. 1041, 50829 Köln     │
│                                    │
│   ──────────────────────────────   │
│                                    │
│   Was jetzt passiert:              │  ← --text-h3
│                                    │
│   1  Aktivierungs-Mail prüfen      │  ← Numbered list
│      Magic-Link per E-Mail.         │
│                                    │
│   2  Passwort setzen                │
│      Einmal-Passwort eingeben,      │
│      eigenes Passwort wählen.       │
│                                    │
│   3  Profil einrichten              │
│      Qualifikationen, Kalender      │
│      und Verfügbarkeit.             │
│                                    │
│   4  Live auf der Karte             │
│      Geschädigte können dich        │
│      finden und buchen.             │
│                                    │
│   ──────────────────────────────   │
│                                    │
│   ┌──────────────────────────────┐ │
│   │ 📅 Live-Webinar am 04. Juni  │ │  ← alert alert-info
│   │ Nicolas, Aaron und Philipp    │ │
│   │ zeigen alles im Detail.       │ │
│   │                              │ │
│   │ [ Termin speichern ↓ ]       │ │  ← .btn-outline btn-sm
│   │                              │ │
│   │ Meet-Link folgt per Mail.    │ │
│   └──────────────────────────────┘ │
│                                    │
│   Fragen? partner@claimondo.de     │  ← --text-caption
│                                    │
└────────────────────────────────────┘
```

Gleichzeitig: Pin auf der Karte wechselt von Blau zu Grün mit Bounce-Animation.

---

## 7. Backend-Aktionen

### 7.1 Pin-Klick (kein DB-Call)

Nur Frontend-State, Lead-Daten kommen aus initialem Map-Load.

### 7.2 Map-Load (Page Load)

```sql
SELECT id, firma, strasse, plz, ort, lat, lng, 
       firma_key, ist_hauptstandort, warteliste_status
FROM sv_leads
WHERE quelle = 'dat_expert' AND warteliste_status != 'inaktiv';
```

### 7.3 Claim-Submit

```sql
-- Hauptstandort
UPDATE sv_leads
SET 
  warteliste_status = 'geclaimed',
  vorname = $1,
  nachname = $2,
  email = $3,
  telefon = $4,
  qualifikationen_claim = $5,  -- array von DAT/BVSK/ÖBuV/IHK
  geclaimed_at = now()
WHERE id = $lead_id;

-- Multi-Standort (optional, gleicher firma_key)
UPDATE sv_leads
SET warteliste_status = 'geclaimed',
    email = $3,
    geclaimed_at = now(),
    parent_lead_id = $main_lead_id
WHERE id = ANY($selected_secondary_ids);

-- Aktivierungs-Mail triggern
INSERT INTO claim_activations (lead_id, email, one_time_code, magic_link_token, expires_at)
VALUES ($main_lead_id, $3, $generated_code, $generated_token, now() + interval '72 hours');

-- Edge Function call
SELECT supabase_functions.http_request(
  'POST', 'https://[project].supabase.co/functions/v1/send-activation-email',
  '{"lead_id": "$main_lead_id"}'
);
```

---

## 8. DB-Schema-Erweiterungen

Neue Felder in `sv_leads`:

```sql
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS firma_key text;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS ist_hauptstandort boolean DEFAULT true;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS parent_lead_id uuid REFERENCES sv_leads(id);
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS quelle text DEFAULT 'organisch';  -- 'dat_expert', 'organisch', 'bvsk'
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS qualifikationen_claim text[] DEFAULT '{}';  -- DAT, BVSK, ÖBuV, IHK
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS geclaimed_at timestamptz;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS vorname text;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS nachname text;

-- warteliste_status erweitern
-- bestehend: 'ausstehend', 'aktiv'
-- neu: 'geclaimed', 'verifiziert', 'inaktiv'
```

Neue Tabelle für Aktivierungs-Codes:

```sql
CREATE TABLE claim_activations (
  id ulid PRIMARY KEY,
  lead_id uuid REFERENCES sv_leads(id) ON DELETE CASCADE,
  email text NOT NULL,
  one_time_code text NOT NULL,           -- XXXX-XXXX Format
  magic_link_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_claim_activations_token ON claim_activations(magic_link_token);
CREATE INDEX idx_claim_activations_code ON claim_activations(one_time_code);
```

---

## 9. Edge Cases

| Szenario | Verhalten |
|---|---|
| Gutachter klickt mehrfach auf Submit | Submit-Button wird nach erstem Klick disabled, Loading-Spinner |
| E-Mail bereits in `sv_leads.email` registriert | Hinweis: „Diese E-Mail ist bereits für einen anderen Standort registriert. [Login] oder andere Mail nutzen." |
| Lead-ID nicht gefunden (URL manipuliert) | 404 mit „Standort nicht gefunden — bitte öffne die Mail von Philipp" |
| Standort bereits geclaimed | Pin ausgegraut, beim Klick: „Dieser Standort wurde bereits beansprucht. Wenn das ein Fehler ist, kontaktiere partner@claimondo.de" |
| Multi-Standort: Gutachter wählt Nebenstandorte ab | Nur Hauptstandort wird geclaimed, Nebenstandorte bleiben verfügbar |
| Network-Error beim Submit | Toast: „Verbindung fehlgeschlagen. Versuch's nochmal." — Form-State bleibt erhalten |
| Map lädt nicht (Mapbox-Token invalid) | Fallback: Liste der Standorte als Cards mit „Standort beanspruchen"-Buttons |

---

## 10. Animationen

- **Pin-Drop bei Page-Load:** 62 Pins droppen nacheinander (stagger 30ms) von oben mit ease-out-bounce
- **Pin-Hover:** Scale 1.15, Schatten verstärken, 150ms ease-out
- **Pin-Klick:** Quick scale-down 0.95 → 1.05 → 1.0 (200ms)
- **Side-Panel rein:** translateX(100%) → 0, 300ms cubic-bezier(0.4, 0, 0.2, 1)
- **Bottom-Sheet Drag:** native iOS-like drag mit `react-spring`
- **Geclaimed-State:** Pin-Farbe Blau→Grün crossfade 600ms + Bounce-Scale-Animation
- **Bestätigungs-Screen ✓:** Grüner Kreis scaliert von 0 auf 1 mit ease-out-back (500ms)

---

## 11. Design-Token-Referenz

Aus dem Claimondo Design System:

```css
/* Farben */
--c-navy: #0D1B3E;
--c-shield: #1E3A5F;
--c-ondo: #4573A2;             /* Primary Action, Active States */
--c-light-blue: #7BA3CC;       /* Secondary Pins */
--c-bg: #f8f9fb;
--c-card: #ffffff;
--c-border: #e4e7ef;
--c-muted: #6b7280;
--c-success-fg: #047857;
--c-success-bg: #ecfdf5;

/* Radien */
--radius-sm: 7px;
--radius-md: 10px;
--radius-lg: 12px;
--radius-xl: 17px;
--radius-2xl: 22px;

/* Komponenten-Klassen */
.btn-default        /* Navy bg, primary CTA */
.btn-outline        /* Border, secondary action */
.btn-sm             /* Height 28px */
.input              /* Height 32px, radius-lg, ondo focus */
.card               /* white bg, border, radius-xl, shadow-sm */
.pill-blue          /* Badge-Variante */
.alert.alert-info   /* Info-Box mit light-blue Hintergrund */

/* Typography (Montserrat) */
--text-h1: 28px / 600
--text-h2: 22px / 600
--text-h3: 17px / 600
--text-body: 14px / 400
--text-caption: 11px / 400
```

---

## 12. Empfohlene Dateistruktur

```
src/
├── app/
│   └── claim/
│       ├── [token]/page.tsx           # Personalisierte URL (zukünftig wenn E-Mails)
│       └── page.tsx                   # Offene Map (Ansatz B aktuell)
│
├── components/
│   └── claim/
│       ├── ClaimMap.tsx               # Mapbox + Pin-Layer
│       ├── ClaimSearchbar.tsx         # Floating searchbox
│       ├── ClaimStatBar.tsx           # 62 Standorte · 0€ ...
│       ├── ClaimSidePanel.tsx         # Desktop Slide-over
│       ├── ClaimBottomSheet.tsx       # Mobile Sheet
│       ├── ClaimPreview.tsx           # Zustand 1
│       ├── ClaimForm.tsx              # Zustand 2
│       ├── ClaimMultiStandort.tsx     # Zustand 3
│       └── ClaimSuccess.tsx           # Zustand 4
│
├── lib/
│   └── claim/
│       ├── leads.ts                   # Supabase queries
│       ├── claim-actions.ts           # submit, validate
│       └── geocoding.ts               # für Bulk-Import
│
└── supabase/
    └── functions/
        └── send-activation-email/index.ts
```

---

## 13. Was als Nächstes ansteht

1. **DB-Migration:** 25 Test-Leads aus `sv_leads` entfernen, 62 echte Standorte aus Julias Excel geocodieren und importieren (mit `firma_key`, `ist_hauptstandort` setzen)
2. **Mapbox-Style:** Custom Style-URL im Claimondo-Look erstellen oder mit `light-v11` + Style-Overrides starten
3. **E-Mail-Provider:** Resend oder Postmark einrichten für transaktionale Aktivierungs-Mails
4. **Edge Function:** `send-activation-email` mit Magic-Link-Generierung + Code-Generierung implementieren
5. **Magic-Link-Page:** `/aktivieren` Route mit Token-Validierung + Passwort-Setzen-Formular

---

## 14. Outbound-Mail von Philipp (Out of Scope für diese MD)

Die E-Mail die Philipp Sedelmeier an die 62 DAT Gutachter verschickt löst diesen Flow aus. Sie ist separat zu konzipieren (Subject, Body, Foto-Strip Philipp+Nicolas+Aaron, Karten-Screenshot als Static Image, Webinar-Termin). Aktueller Status: blockiert auf Philipps Klärung von Webinar-Datum + Versandweg.
