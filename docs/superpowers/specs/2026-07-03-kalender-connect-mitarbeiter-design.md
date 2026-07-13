# SP2b — Kalender-Connect-UI für Mitarbeiter (KB/Dispatch/Admin)

**Datum:** 2026-07-03
**Kontext:** 3. Inkrement des universellen Kalender-Sync-Features. Stacked auf SP2a (#3544, geteiltes profil-generisches Connect-Modul). Google-OAuth ist bereits rollen-agnostisch; das CalDAV-Connect-Modul seit SP2a auch. SP2b macht die Connect-UI für die Mitarbeiter-Rollen (Kundenbetreuer/Dispatch/Admin) auf `/mitarbeiter/profil` **erreichbar** — durch Extraktion eines geteilten Panels aus der bestehenden SV-Connect-UI.

## Ziel

Ein Mitarbeiter (KB/Dispatch/Admin) kann auf `/mitarbeiter/profil` seinen Google- **und** CalDAV-Kalender verbinden/trennen — mit exakt derselben UI wie der SV, über eine geteilte Komponente.

## Nicht-Ziele (YAGNI)

- **Kein** Termin-Sync-Wiring (SP2c gutachter_termine / SP2d admin_termine). Ein Mitarbeiter, der hier verbindet, blockt noch keine Slots und synct noch keine Termine, bis SP2c/d landen.
- **Keine** neue Server-Action (SP2a lieferte das geteilte Connect-Modul).
- `MitarbeiterProfilClient` bleibt unangetastet (Panel wird als Geschwister in `page.tsx` gerendert, wie `KontoSicherheitPanel`).

## Architektur

`KalenderEinstellungenClient` (SV) = `PageHeader` (Seiten-Shell) + **Google-Section + CalDAV-Section + `CalDavConnectModal`** (rollen-agnostischer Kern; `svId` ungenutzt, nur der Google-`return`-Pfad ist hartcodiert). Dieser Kern wird extrahiert.

### Komponenten

1. **Neu `src/components/shared/KalenderConnectPanel.tsx`** (client): der Google-Card + CalDAV-Card + Modal-Kern. Props: `{ googleConnected: boolean; googleEmail: string | null; caldav: CalDavState | null; returnPath: string }`. Der `returnPath` steuert den Google-OAuth-Redirect (`/api/auth/google/connect?return=<returnPath>`) und wird auch im `CalDavConnectModal`-`onSuccess`/Disconnect als `router.refresh()`-Ziel genutzt. `CalDavState`-Type wandert hierher (Export).
2. **Refactor `src/app/gutachter/einstellungen/kalender/KalenderEinstellungenClient.tsx`**: rendert `PageHeader` + `<KalenderConnectPanel returnPath="/gutachter/einstellungen/kalender" …/>`. Reiner Move der Markup — gleiche Optik, gleiche Props-Quelle (die SV-`page.tsx` liefert `googleConnected/googleEmail/caldav` schon).
3. **`src/app/mitarbeiter/profil/page.tsx`**: lädt zusätzlich `profiles.google_connected_at, google_email` (kanonische Google-Quelle, rollen-agnostisch) + die `kalender_verbindungen`-caldav-Row per `user.id`, baut den `CalDavState`, und rendert eine „Kalender"-Section mit `<KalenderConnectPanel returnPath="/mitarbeiter/profil" …/>` als Geschwister zwischen `MitarbeiterProfilClient` und `KontoSicherheitPanel`.

### Disclaimer-Korrektheits-Fix

Der Panel-Footer sagt heute „Dispatch-Check läuft Read-only — wir schreiben keine Termine in deinen privaten Kalender." Das ist seit dem SV-OUT-Sync (#3486) bereits falsch und wird mit SP2c/d generell falsch. Neu (generisch, für alle Rollen korrekt): „Credentials werden verschlüsselt gespeichert (AES-256-GCM). Claimondo berücksichtigt deine Kalender-Verfügbarkeit bei Terminvorschlägen." (betrifft auch die SV-Sicht — bewusst.)

## Datenfluss

`/mitarbeiter/profil` (server) → lädt Google-State (`profiles.google_connected_at`/`google_email`) + CalDAV-State (`kalender_verbindungen` per `user.id`) → `KalenderConnectPanel` (client) → Google-Button → `/api/auth/google/connect?return=/mitarbeiter/profil`; CalDAV → `CalDavConnectModal` → geteiltes Connect-Modul (SP2a, schreibt `kalender_verbindungen` per `user.id`) → `router.refresh()`.

## Testing

- **Build/tsc/Ratchets** grün. Der **component-set-Ratchet** darf durch das extrahierte Panel keine neuen Verletzer bekommen (die Extraktion reduziert Duplikat-Markup; die Cards bleiben handrolled Tailwind wie zuvor — Baseline-neutral, kein NEUER Verletzer, da es bereits existierte).
- **Prod-Smoke:** `/mitarbeiter/profil` rendert als KB (JWT) die „Kalender"-Section mit beiden Cards + Status „nicht verbunden" (kein Crash beim State-Load); der Google-Button-`href` trägt `return=/mitarbeiter/profil`. Kein echter Connect (keine Test-Credentials) — Erreichbarkeit + State-Load werden bewiesen.

## Risiko & Rollback

Berührt den deployten SV-`KalenderEinstellungenClient` (Extraktion — identische Markup, niedriges Risiko) + fügt additiv zur `/mitarbeiter/profil`-Seite hinzu. Rollback = Code-Revert. Keine DB-/Migration-Änderung.

## Reihenfolge

SP2a (✅ #3544) → **SP2b** (dieses Dokument) → SP2c KB-Beratungstermine-Sync → SP2d Rückruf-Sync.
