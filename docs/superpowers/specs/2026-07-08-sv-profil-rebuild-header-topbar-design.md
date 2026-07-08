# SV-UI: Profil-Rebuild + Header→Top-Bar — Design

**Datum:** 2026-07-08
**Auslöser:** Aaron: „im gesamten SV-UI passen die Header nicht — lass uns die rausnehmen und sauber bauen. Und das SV-Profil muss neu gebaut werden."
**Entscheidungen (brainstorming):** Header → **Titel in die Top-Bar** · Profil → **von Settings trennen**.

## 1. Dekomposition & Reihenfolge

Zwei unabhängige Baustellen:

| Sub-Projekt | Lane | Kollision | Reihenfolge |
|---|---|---|---|
| **A) Profil-Rebuild** (`/profil` + `/einstellungen`) | Per-Seiten, meine Lane | keine | **zuerst** (diese Spec) |
| **B) Header→Top-Bar** (`GutachterShell` + 24 Seiten) | Shell | **`eb3e46ca`** (baut Shell gerade um: „Sidebar freischwebend") | **gesequenced**, nach/mit deren Shell-Umbau |

**B wird hier gespec't, aber NICHT parallel implementiert** — der Top-Bar-Titel-Slot lebt in `GutachterShell.tsx`, das `eb3e46ca` gerade neu baut. Parallel-Edit = garantierter Konflikt. Stattdessen: Koordinations-Marker an `eb3e46ca` mit der Top-Bar-Titel-Anforderung; Implementierung sobald deren Shell gelandet ist.

Diese Spec ist damit **primär die Profil-Rebuild-Spec** (implementierbar). B ist als Anforderungs-Anhang dokumentiert.

## 2. Profil-Rebuild (Sub-Projekt A)

### 2.1 Problem
`/gutachter/profil` (`ProfilClient.tsx`, 908 Zeilen) vermischt **echtes Profil** mit **Settings** und **operativen** Elementen in einem Monolithen mit ~15 Inline-Sub-Components. Unübersichtlich, schwer wartbar, „passt nicht" zur restlichen UI.

### 2.2 Zielbild: `/gutachter/profil` (echtes Profil)
Behält (kunden-/stammdaten-relevant):
- **Identität:** Avatar (`AvatarUpload`), Anzeigename, Anrede/Titel/Vorname/Nachname, Email (read-only), Telefon.
- **Firma / Steuer:** Firmenname, Rechtsform, Steuernummer, USt-IdNr, HRB.
- **Standort:** Anschrift (`GooglePlaceAutocomplete`), PLZ, Koordinaten.
- **Darstellung (kunden-sichtbar):** Profiltext, Google-Business-Verknüpfung (`GoogleBusinessFeld`), Branding-Editor-Link.
- **Spezialisierungen:** Qualifikationen, Spezifikationen, Schadenarten (`SpezSection`).
- **Vertrag (read-only Info):** Paket, offene/gesamt Fälle, zugewiesene Fälle.
- **Community-Privacy** (nur `community_member`).

### 2.3 Wandert nach `/gutachter/einstellungen` (Settings-Hub, existiert)
- **Benachrichtigungen** (`NotificationPreferencesForm`).
- **2FA:** `TwoFaPhoneChange`, `TotpEnrollCard`, Telefon-Verifizierung (`PhoneVerificationModal` / `TwoFaPhoneSection`).
- **Live-Standort / GPS-Toggle** (`GpsTrackingToggle`).
- (Kalender-Verbindung ist bereits dort.)

### 2.4 Fliegt raus (operativ, anderswo schon vorhanden)
- **Offene Terminanfragen** (`pendingTermine`) — bereits in Kalender/Heute sichtbar; gehört nicht aufs Profil.

### 2.5 Komponenten-Struktur
Monolith → fokussierte Section-Components (kleine, testbare Einheiten), gebaut auf `SectionCard`:
- `profil/_components/ProfilIdentitaet.tsx` (Avatar + Stammdaten-Form, Edit/Save)
- `profil/_components/ProfilFirma.tsx`
- `profil/_components/ProfilStandort.tsx` (GooglePlace)
- `profil/_components/ProfilDarstellung.tsx` (Profiltext + Google-Business + Branding-Link)
- `profil/_components/ProfilSpezialisierung.tsx` (die 3 `SpezSection`)
- `profil/_components/ProfilVertrag.tsx` (read-only)
- Gemeinsame Feld-Primitives (`FieldRow`/`ControlledRow`/`SelectRow`) → nach `profil/_components/fields.tsx` extrahiert (aktuell im Monolithen dupliziert).

`ProfilClient.tsx` wird dünner Orchestrator (lädt State-Props, rendert die Sections).

### 2.6 Datenfluss
- `profil/page.tsx` (Server) lädt künftig **weniger**: `email`, `profile` (Name-Felder), `sv` (firma/standort/spezialisierung/paket/community/anzeige), `faelleCount`, Google-Business-Status. **Nicht mehr**: `notificationPrefs`, 2FA-Felder, `pendingTermine`, `live_tracking_enabled` (→ Einstellungen).
- `einstellungen/page.tsx` (Server) lädt **zusätzlich**: `notificationPrefs`, `twofa_telefon`, `live_tracking_enabled` (+ vorhandenes Kalender/gcal).
- Save: bestehende `updateOwnProfile` Server-Action bleibt (Result-Object `{ success }` — Achtung: altes `success`-Shape; **nicht** auf `ok` umstellen ohne Caller-Sync).
- Toggles (GPS/Community/Spezialisierung) bleiben Direct-Client-Update auf `sachverstaendige` (wie heute) — unverändert, nur verschoben.

### 2.7 Reuse (Redundanz-Check)
`SectionCard`, `AvatarUpload`, `GooglePlaceAutocomplete`, `GoogleBusinessFeld`, `NotificationPreferencesForm`, `TwoFaPhoneChange`, `TotpEnrollCard`, `PhoneVerificationModal`, `LoadingButton` — alle bestehend, werden nur re-organisiert/verschoben, nicht neu gebaut.

## 3. Einstellungen-Erweiterung
`/gutachter/einstellungen` bekommt neue Sektionen (verschobene Panels), konsistent zum bestehenden Hub-Layout (`PageHeader` + Section-Liste, bis Header→Top-Bar landet). Reihenfolge: Kalender (da) → Benachrichtigungen → 2FA → Live-Standort → DSGVO-Löschung (da).

## 4. Header→Top-Bar (Sub-Projekt B, gesequenced/koordiniert)
**Anforderung:** Per-Seiten-`PageHeader` (24 SV-Seiten) entfernen; Seitentitel + Page-Actions (Bearbeiten/Export/View-Toggle) in einen schlanken **Top-Bar-Slot** der `GutachterShell` (Desktop: neben/statt WeatherBanner-Zeile; Mobile: Floating-Capsule). `PageHeader`-Verwendung app-weit auf den neuen Slot umstellen (per-Seite Titel/Actions via Layout-Context oder pro-Page-Prop an die Shell).
**Koordination:** `eb3e46ca` (portal-shell-floating) baut `GutachterShell` gerade um. Marker mit dieser Anforderung hinterlegen; Implementierung nach deren Shell-Landing (oder von ihnen als Teil des Shell-Umbaus). **Nicht in dieser Spec implementiert.**

## 5. Verifikation / Testing
- **Visuell:** Playwright als `test-sv@claimondo.de` (gleiche SV-UI wie jeder SV; `aaron.sprafke` selbst blockiert durch 2FA-Secret, das ich nicht habe) — Vorher/Nachher-Screenshots `/profil` + `/einstellungen`. Setup via bestehenden e2e-Harness (`tests/e2e/fixtures.ts`, TOTP-Secret aus env).
- **Funktional:** Profil-Save-Flow (`updateOwnProfile`) unverändert grün; verschobene Settings (Benachrichtigungen/2FA/GPS) funktionieren auf `/einstellungen`; `/profil` zeigt keine verwaisten Imports; alte Bookmarks `/profil` bleiben (nur Inhalt schlanker).
- **Build/Ratchets:** tsc, component-set (SectionCard-Reuse), token-audit, knip (keine toten Files nach Extraktion), status-registry.

## 6. Out-of-Scope / Risiken
- **Header→Top-Bar-Implementierung** (Sub-Projekt B) — koordiniert/gesequenced, nicht hier.
- **Shell-Kollision** (`eb3e46ca`): B strikt nach deren Shell; A berührt die Shell **nicht**.
- **`updateOwnProfile` `success`-Shape:** nicht auf `ok` umstellen (AGENTS Server-Action-Pattern erlaubt beide, aber File-konsistent bleiben; Caller in `ProfilClient` erwartet `success`).
- **Datenfluss-Split:** Beim Verschieben der Settings die Server-Loads sauber mit-verschieben (sonst lädt `/profil` tote Props / `/einstellungen` fehlt Data).

## 7. Reihenfolge der Umsetzung (Plan-Vorschau)
1. Feld-Primitives + Section-Components aus `ProfilClient` extrahieren (verhaltensgleich).
2. Settings-Panels (Benachrichtigungen/2FA/GPS) nach `/einstellungen` verschieben (inkl. Server-Load-Split).
3. `pendingTermine` + tote Imports/Loads aus `/profil` entfernen.
4. Verifikation (Playwright test-sv Vorher/Nachher, Build, Ratchets).
5. (Separat, koordiniert) Header→Top-Bar mit `eb3e46ca`.
