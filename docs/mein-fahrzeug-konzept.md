# „Mein Fahrzeug" — Plattform-Konzept

**Stand:** 10.05.2026
**Status:** Konzept-Dokument, noch nicht in Implementation
**Vision:** Eine separate, fahrzeug-zentrische Datenbank die als **Plattform-Layer** zwischen allen Marktteilnehmern rund ums Auto fungiert. Claimondo zieht Daten daraus + contributed eigene. Andere Player (Versicherer, Werkstätten, OEMs, Sachverständige) ebenfalls.

---

## 1. Warum separat?

Heute liegen Fahrzeug-Daten verteilt bei jedem Marktteilnehmer:

- **OEM** kennt Bau-Spezifikationen, Werks-Optionen, Software-Versionen
- **Werkstatt** kennt Reparaturhistorie, Verschleißteile, Inspektions-Ergebnisse
- **Versicherer** kennt Schadenshistorie, Risikoeinstufung, Tarif-Eingruppierung
- **Sachverständiger** erstellt Gutachten — landet im Versicherer-Archiv und ist für niemand anderes wieder zugänglich
- **Halter** hat in der Regel garnichts strukturiert in der Hand außer Fahrzeugschein
- **Claimondo** hat die Schaden-Snapshot-Sicht im Moment der Regulierung

Das Ergebnis: jeder Marktteilnehmer macht teure Recherche-Arbeit (CarDentity, HIS-Datei, OEM-Anfragen) für Daten die woanders längst existieren. Plus: der **Halter** hat keinen einzigen zentralen Ort wo „mein Auto" lebt.

**„Mein Fahrzeug" löst das**: ein neutraler Daten-Layer den Halter besitzen und Marktteilnehmer mit Halter-Consent nutzen.

---

## 2. Stakeholder am Markt

| Player | Was sie brauchen | Was sie beitragen können |
|---|---|---|
| **Halter** | Single-Source-of-Truth für ihr Fahrzeug, Wertentwicklung, Wartung-Reminder | Eigentum + Consent-Layer |
| **OEM** | Direkte Beziehung zum Halter post-sale (heute via Händler abgeschnitten) | VIN-Mapping, Bau-Specs, Software-Versionen, Recall-Status |
| **Werkstatt** | Reparaturhistorie, Inspektions-Daten zur Diagnose | Reparatur-Berichte, Verschleißprognosen |
| **Versicherer** | Schadenshistorie, Risikoprofile, Tarif-Berechnung | Schadensereignis-Daten (mit Halter-Consent) |
| **Sachverständiger** | Vorschaden-Abgrenzung, Wertgutachten-Historie | Gutachten-Reports |
| **TÜV/DEKRA** | HU/AU-Historie | Prüfprotokolle |
| **Leasinggeber/Bank** | Sicherheit-Bewertung, Verwertungswerte | Finanzierungs-Status |
| **Claimondo** | Vorschaden-Daten für Schadensregulierung, Halter-Daten für Mandats-Aufbau | Schadensregulierungs-Berichte, Reparatur-Quittungen |

---

## 3. Daten-Modell pro Fahrzeug

### 3.1 Identität
- **VIN** (FIN) als primärer Key — eindeutig, unveränderlich
- HSN/TSN
- Erstzulassung, aktuelle Zulassung
- Kennzeichen-Historie (mit Datums-Bereichen — Halter wechseln, Kennzeichen auch)
- OEM-spezifische Identifier (BMW-VIN-Prefix, Tesla-VIN, etc.)

### 3.2 Bau-Spezifikation (vom OEM)
- Modell, Modelljahr, Karosserie-Variante
- Motor (Hubraum, Leistung, Antrieb)
- Werks-Optionen (Sonderausstattung)
- Lackcode
- Software-Versionen (Tesla, BMW iDrive, Mercedes MBUX)
- Recalls (offen/erledigt)

### 3.3 Halter-Beziehung
- Aktueller Halter (uuid → Person/Firma)
- Halter-Historie mit Zeitabschnitten
- Consent-Matrix (welcher Player darf welche Daten lesen)
- Eigentümer ≠ Halter wenn Leasing/Finanzierung — beide referenziert

### 3.4 Service & Wartung
- Service-Heft: Inspektionen, KM-Stand, Werkstatt
- Reparatur-Historie: Datum, Werkstatt, Teile, Arbeitskosten, Bilder
- TÜV/HU/AU-Historie
- Verschleißteil-Wechsel (Bremsen, Reifen, Öl)

### 3.5 Schadenshistorie
- Vorschäden mit Schwere, Datum, Ort
- Reparaturberichte (Daten + Quittungen)
- Gutachten-PDFs mit Datum + Sachverständiger
- Versicherungs-Abrechnungen (ja/nein/teilweise pro Schaden)
- Zusammengefasst als „Vorschaden-Score" ähnlich CarDentity

### 3.6 Versicherung
- Aktueller Versicherer + Tarif + Vertragsnummer
- Vorherige Versicherer (Versicherer-Wechsel-Historie)
- HIS-Datei-Status (mit Halter-Consent)
- Schadenfreiheitsklasse aktueller Stand

### 3.7 Wertentwicklung
- Initialer Kaufpreis + Datum
- Aktuelle DAT-Bewertung
- Kilometerstand-Historie
- Wertminderungen aus Schäden (kumulativ)

### 3.8 Mobilitäts-Layer (optional, aber differenzierend)
- Telematik-Daten (mit Consent) — Fahrweise, KM/Tag, Ladestand bei E-Auto
- Standorte (anonymisiert) — Heimat-Region, Pendel-Profil
- Crash-Detection-Trigger via OBD2/Smartphone-Sensor

---

## 4. Halter-zentriertes Eigentums-Modell

**Kern-Prinzip:** Der **Halter besitzt** seine Fahrzeug-Daten. Plattform ist nur Treuhänder.

- Halter loggt sich ein (Magic-Link / Apple-ID / Google) und sieht alle Daten zu allen seinen Fahrzeugen
- Pro Datenpunkt sieht er: wer hat geschrieben, wann, mit welcher Berechtigung
- Consent-UI: Halter aktiviert/deaktiviert Read-Access pro Marktteilnehmer pro Datenkategorie
- Bei Verkauf: 1-Klick-Übergabe zum neuen Halter (oder Anonymisierung der historischen Daten)

**Rechtliche Grundlage** (DSGVO):
- Halter-Account = Datenverarbeiter-Verantwortlicher seiner eigenen Daten
- Plattform-Betreiber = Auftragsverarbeiter
- Marktteilnehmer = berechtigte Drittpartei nach Halter-Consent (Art. 6 Abs. 1 lit. a)

---

## 5. Claimondo-Integration

### 5.1 Read-Pfade — Claimondo zieht
- Bei neuer Anfrage → VIN abfragen → Vorschaden-Historie ziehen → ersetzt CarDentity
- Halter-Daten (Adresse, Vertrag) → ersetzt manuelles Tippen im Onboarding
- Service-Heft → SV nutzt für plausible Reparatur-Vorhersage
- Wertentwicklung → Anwalt nutzt für Wertminderungs-Argument

### 5.2 Write-Pfade — Claimondo contributed
- Nach Schadensregulierung: Reparatur-Report + Gutachten-PDF → Halter-Vault
- Versicherungs-Abrechnung: ja/nein/teilweise + Beträge
- Schadens-Snapshot mit Fotos vor/nach Reparatur

### 5.3 API-Konzept (Sketch)

```
GET  /api/vehicles/{vin}                   # Halter-Account-Token
GET  /api/vehicles/{vin}/damages           # Schadenshistorie
GET  /api/vehicles/{vin}/reports           # Gutachten-PDFs
POST /api/vehicles/{vin}/damages           # Claimondo schreibt Schaden
POST /api/vehicles/{vin}/reports           # Claimondo lädt Gutachten hoch

GET  /api/holders/{halterId}/vehicles      # alle Fahrzeuge eines Halters
POST /api/holders/{halterId}/consent       # Consent-Update pro Player
```

OAuth2 + scoped Tokens pro Marktteilnehmer:
- `claimondo:read:damages` — darf Schadenshistorie lesen
- `claimondo:write:damages` — darf eigene Schadens-Records schreiben
- `oem:read:specs` — OEM darf Bau-Specs lesen
- usw.

---

## 6. Architektur-Skizze

```
                 ┌──────────────────────────────────┐
                 │  „Mein Fahrzeug" Plattform        │
                 │  (separate Codebase, eigenes      │
                 │   Backend, eigene DB)             │
                 │                                   │
                 │  ┌─ Vehicle Service ─────────┐   │
                 │  │  Postgres (VINs als PK)    │   │
                 │  │  S3 (PDFs, Fotos)          │   │
                 │  │  Redis (Consent-Cache)     │   │
                 │  └────────────────────────────┘   │
                 │                                   │
                 │  ┌─ Halter Service ──────────┐   │
                 │  │  Auth (OIDC)               │   │
                 │  │  Consent-Engine            │   │
                 │  └────────────────────────────┘   │
                 │                                   │
                 │  ┌─ API Gateway ─────────────┐   │
                 │  │  OAuth2-Flow per Player    │   │
                 │  │  Rate-Limit, Audit-Log     │   │
                 │  └────────────────────────────┘   │
                 └──────────────┬───────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼────┐             ┌────▼────┐             ┌────▼────┐
   │Claimondo│             │   OEM   │             │Werkstatt│
   │ App     │             │ Portal  │             │ DMS     │
   └─────────┘             └─────────┘             └─────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   Claim-Daten           Bau-Specs              Service-Heft
   schreiben/lesen       schreiben              schreiben
```

**Tech-Stack-Vorschlag (separate Plattform):**
- Backend: Hono / Bun für die API-Layer (schnell, kompakt)
- DB: Postgres (Supabase oder Neon) — VINs als Primary Key, Halter-FK
- Storage: S3-kompatibel (Backblaze B2 / Cloudflare R2) für PDFs/Fotos
- Auth: WorkOS / Stytch oder Supabase-Auth wenn Single-Provider gewollt
- Consent: eigener Service mit Audit-Log (DSGVO-Pflicht)
- API: REST + GraphQL parallel, OAuth2 für Player-Tokens

---

## 7. Monetarisierung

### 7.1 Halter-Seite (Free + Premium)
- **Free**: Vault, Service-Reminder, Dokument-Vault
- **Premium (~5€/Monat)**: Wertentwicklungs-Tracking, Versicherungs-Vergleich, Recall-Push
- B2C als Aboflagger gegenüber Versicherer-Apps die die gleichen Daten haben

### 7.2 Player-Seite
- **API-Subscription** pro Player + Volumen-Stufe
- **Pay-per-Lookup** für Casual-Use-Cases (z.B. Werkstatt fragt VIN ab → 0,50 €)
- **Revenue-Share** wenn Player Halter über Plattform akquiriert (z.B. Versicherer-Switch)

### 7.3 Marktplatz-Layer (later)
- Versicherungs-Vergleich + Switch
- Werkstatt-Vermittlung
- Gebrauchtwagen-Wertgutachten on-demand
- Alles mit Halter-Consent + Provision pro Vermittlung

---

## 8. Datenschutz / Wettbewerbsrecht

### Risiken:
- **Datenmonopol-Vorwurf** wenn ein einzelner Player (z.B. Versicherer) zu viel Macht über die Plattform bekommt
- **HIS-Datei-Konflikt** — Versicherer betreiben heute die Hinweis-Informations-System-Datei, die Plattform würde direkt damit kollidieren
- **OEM-Telematik** — laut EU-Vehicle-Type-Approval-Verordnung sollten Halter Zugriff auf eigene Telematik-Daten bekommen, OEMs blockieren das aktiv

### Mitigation:
- **Halter-zentrisches Eigentum** als Kern-Argumentation (Art. 20 DSGVO Datenportabilität)
- Plattform als Genossenschaft oder Stiftung statt klassisches Startup → vertrauensbildend für Player
- EU-Data-Act 2024 als rechtlicher Rückenwind (B2B-Datenfluss zwischen Sektoren)

---

## 9. Verhältnis zu Claimondo

**Claimondo ist nicht „Mein Fahrzeug" — Claimondo ist erster Player auf der Plattform.**

Mögliche Modelle:
1. **Claimondo gründet "Mein Fahrzeug" als Schwester-Firma** und nutzt Plattform first → Kontrolle, aber Datenmonopol-Risiko
2. **Claimondo treibt es als Open-Standard / Konsortium** mit OEMs, Versicherern, ADAC, BVSK → langsamer, aber gesellschaftlich tragfähig
3. **Claimondo lizenziert nur das Konzept und führt es aus** → wenig Kontrolle, viel Geld

Strategische Empfehlung: **Modell 2** mit Claimondo als Initial-Maintainer und Tech-Lead. Erst Prototyp im Solo-Betrieb (1 Jahr), dann Konsortium öffnen.

---

## 10. Roadmap-Skizze

| Phase | Dauer | Inhalt |
|---|---|---|
| **0 — Konzept-Validation** | 1-2 Monate | Stakeholder-Interviews (3 OEMs, 5 Versicherer, 10 Werkstätten), Rechtsgutachten DSGVO + Wettbewerbsrecht |
| **1 — Halter-MVP** | 3 Monate | Halter-App + Vault + manuelle Daten-Eingabe + Service-Reminder. **Claimondo als erster Schreib-Player über bestehende Mandate.** |
| **2 — Player-API** | 3 Monate | OAuth2-Flow + Schadens-API + erste 2 Player onboarding (Claimondo + 1 Werkstatt-DMS-Anbieter) |
| **3 — Skalierung** | 6+ Monate | Mehr Player, Premium-Subscription, Marktplatz-Layer |

---

## 11. Was Claimondo aktuell schon hat (Auszug)

Vieles aus dem Konzept existiert in unserer Supabase-DB schon — wir haben quasi den **Player-MVP** in einer Multi-Tenant-Variante:

- `vehicles` Tabelle mit VIN/HSN/TSN/Halter-Daten ✓
- `claims` mit Schaden-Daten ✓
- `dokumente` + `pflichtdokumente` mit PDFs/Fotos ✓
- CarDentity-Integration (Mock — kommt von außen) ✓
- Halter ≠ Fahrer Logik ✓
- Multi-Mandat-Sicht pro Halter ✓

**Was fehlt für „Mein Fahrzeug":**
- Halter-Login getrennt von Mandats-Login (heute haben Kunden nur Account pro Fall)
- Player-Layer (heute alles in einer Org)
- Consent-Engine
- Externe API für Drittparteien
- Halter-zentrische UI statt Mandats-zentrische

---

## 12. Nächste Schritte (wenn entschieden wird das anzugehen)

1. **Strategisches Alignment**: Claimondo-Founder + 1-2 externe Berater (Legal, Mobility-Industry) — ist das das nächste Vehikel oder nur Vision-Doc?
2. **Stakeholder-Pre-Talks**: 3 informelle Gespräche (OEM, Versicherer, Werkstatt) ob Interesse besteht
3. **Tech-Spike**: 2-3 Wochen Prototype für Halter-Vault + 1 Player-API
4. **Investorensuche**: separate Funding-Runde wenn Konzept tragfähig — anders als Claimondo's Schadensregulierungs-Story

---

*Erstellt 10.05.2026 als strategisches Konzept-Dokument. Nicht in Implementation-Backlog. Wenn priorisiert: eigenes Repo / eigene Codebase, nicht in `claimondo-v2`.*
