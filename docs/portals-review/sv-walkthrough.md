# SV-Portal — Architektur-Walkthrough

Sachverständigen-Frontend für Claimondo. URL: `/gutachter/**`. Test-Login: `test-sv@claimondo.de` / `Test1234!`.

## Layout

`src/app/gutachter/layout.tsx` → `GutachterShell.tsx` (Client) wrapt alles.
`GutachterShell` rendert:
- Sidebar links (Desktop) bzw. Bottom-Nav (Mobile)
- Realtime-Badges für Mitteilungen + Tasks
- Wetter-Widget (Sticky-Header)
- Theme-Switcher (light/dark — AAR-507)

Auth-Guard: Layout redirected wenn `profile.rolle !== 'sachverstaendiger'`.

## Routen-Map

### Operative Tages-Ansichten

| Route | Datei | Zweck | Wichtigste Komponenten |
|---|---|---|---|
| `/gutachter` | `page.tsx` | Dashboard mit „Heute" + KPIs + nächster Termin | `DashboardKpis`, `NaechsterTerminCard` |
| `/gutachter/heute` | `heute/page.tsx` | Vertikaler Tageskalender (AAR-381) | `HeuteVerticalCalendar` |
| `/gutachter/route` | `route/page.tsx` | Tagesroute mit Map + Stops | `TagesroutenMap`, `StopListe` |
| `/gutachter/feldmodus` | `feldmodus/page.tsx` | Live-GPS-Tracking on-the-go (AAR-382) | `FeldmodusClient`, `useGeoTracking`, `KundeLiveMap` |
| `/gutachter/kalender` | `kalender/page.tsx` | Monats-/Wochen-Kalender mit Buchungen | `KalenderClient`, `DayCell` |

### Aufträge & Fälle

| Route | Zweck | Komponenten |
|---|---|---|
| `/gutachter/auftraege` | Aktive Aufträge (CMM-32f, vor QC-Freigabe) | `AuftragCard`, `AuftraegeListClient` |
| `/gutachter/faelle` | Geschlossene Fälle in Regulierung (post-QC) | `FaelleListClient` |
| `/gutachter/fall/[id]` | Fall-Detail-Akte (für SV) | `FallDetailClient`, `FallHeader`, `AuftragHeaderPanel`, Tabs |
| `/gutachter/fall/[id]/stellungnahme` | Stellungnahme-Editor (AAR-559) | `StellungnahmeForm` |
| `/gutachter/termine` | Termine-Liste mit View-Toggle | `TermineClient` |
| `/gutachter/termine/[id]` | Termin-Detail | mit Vor-Ort + Navigation Sub-Routes |

### Inbox & Kommunikation

| Route | Zweck |
|---|---|
| `/gutachter/posteingang` | Multi-Channel-Inbox (Chat-Threads pro Fall) — `MultiChannelChat` |
| `/gutachter/nachrichten` | Spezifische Nachrichten-Listing |
| `/gutachter/mitteilungen` | System-Notifications (`gutachter_mitteilungen`) |
| `/gutachter/tasks` | Auto-Tasks zur Abarbeitung |
| `/gutachter/reklamationen` | Reklamationen (KFZ-150) |

### Profil & Einstellungen

| Route | Zweck |
|---|---|
| `/gutachter/profil` | Stammdaten + Google-Bewertung + Bio |
| `/gutachter/profil/branding` | Custom-Branding (Logo, Farben — AAR-536/K4) |
| `/gutachter/einstellungen` | Notification-Prefs, Google-Calendar-Sync (AAR-500/707) |
| `/gutachter/einstellungen/kalender` | Kalender-Sync-Detail (Google/CalDAV) |

### Business-Cockpit

| Route | Zweck |
|---|---|
| `/gutachter/abrechnung` | Rechnungen + Zahlungseingänge |
| `/gutachter/statistiken` | Eigene KPIs (Bewertung, Durchsatz, Reklamationsquote) |
| `/gutachter/leadpreise` | Werbebudget + Lead-Preise pro Region |
| `/gutachter/gebiet` | Service-Gebiet mit Polygon-Editor |
| `/gutachter/team` | Team-Mitglieder (für Büro-Account) |
| `/gutachter/community` | Community-Feed |

### Onboarding-Strecke

| Route | Zweck |
|---|---|
| `/gutachter/willkommen` | Erster Login nach Magic-Link, AGB-Check |
| `/gutachter/onboarding` | Profil-Erfassung |
| `/gutachter/onboarding/buero` | Büro-Spezifisches Onboarding |
| `/gutachter/verifizierung` | BVSK-/IHK-Zertifikat-Upload |
| `/gutachter/vertrag` | Vertragsabschluss + SA-Vorlage-Upload |

## Datenfluss-Highlights

### Aufträge (auftraege-Tabelle, CMM-32a)

`/gutachter/auftraege` liest direkt aus `auftraege` mit `sv_id = current_sv` und `status NOT IN ('storniert', 'abgeschlossen')`. Der Status-Lifecycle ist:

```
termin → besichtigung → gutachten → abgeschlossen
```

Mutationen via Server-Actions in `src/app/gutachter/fall/[id]/actions.ts` und `src/lib/auftrag/*`. Status-Übergänge gehen NICHT über `transitionFallStatus()` — das ist ausschließlich für `faelle.status` (KFZ-202).

### Termin-Verlegung (AAR-864)

In `AuftragHeaderPanel` löst der „Verlegung vorschlagen"-Button `terminGegenvorschlag` aus. Eigene State-Machine auf `gutachter_termine.status` (siehe `supabase/migrations/20260430091325_aar864_termin_verlegung_state_machine.sql`).

### Realtime

`FallDetailClient` mountet `FallRealtimeRefresh` (Sub auf `gutachter_termine`, `auftraege`, `faelle`, `claims`, `kanzlei_faelle`). Updates triggern `router.refresh()`.

### Live-Geo (Feldmodus)

`useGeoTracking` (Hook) sendet alle 30s die GPS-Position an `gutachter_termine.live_position`. Kunde sieht das in `KundeLiveMap` über Realtime-Sub.

### Google-Calendar (AAR-707)

`profiles.google_refresh_token` ist Single-Source. Sync-Service liest beim Verifizieren bzw. zur Cron-Zeit aus Google-Calendar-API. Settings-Tab zeigt den Connect-Status.

## Bekannte Stolperstellen

- **Anonymität (AAR-858):** SV-Anzeige beim Kunden zeigt nur `anzeigename` oder `vorname`, nie `nachname`. Custom-Branding (eigene Firma) bleibt aber erhalten.
- **CMM-32 Walkthrough offen:** `kitta/cmm-32-walkthrough-p2`-Branch hatte mehrere SV-Polish-Themen (Stammdaten-Layout, Termin-Verlegen-Button) — Status siehe Memory `project_cmm32_walkthrough_p2.md`
- **2FA-Pflicht:** SV-Account muss `twofa_aktiviert=false` haben für E2E (Memory `project_e2e_test_users.md`)
- **Avatar-Fallback:** SV ohne `avatar_url` → Initialen aus vorname+nachname (Memory `project_avatar_upload.md`)
- **Vergangene Termine:** Werden im Kalender ausgegraut, sind aber im Auftrag noch sichtbar bis Status `abgeschlossen`

## Komponenten-Hierarchie (Auswahl)

```
GutachterLayout
└── GutachterShell (client)
    ├── GutachterSidebar (desktop)
    ├── GutachterMobileNav
    ├── WetterWidget (sticky)
    ├── ThemeSwitcher
    └── {children}
        └── (z.B. /gutachter/fall/[id])
            └── FallDetailClient (client)
                ├── FallHeader (mit Kennzeichen + Status-Pill)
                ├── AuftragHeaderPanel
                │   ├── TerminVorschlagModal (AAR-864)
                │   └── StatusBadge
                ├── FallRealtimeRefresh (subscribe)
                └── Tabs (Stammdaten / Bilder / Gutachten / Dokumente / Chat)
```

## Wo Du anpassen würdest, wenn …

| Anpassungs-Wunsch | Touchpoint |
|---|---|
| Sidebar-Items ändern | `src/app/gutachter/_components/SVSpotlight.tsx` + `GutachterShell` |
| Auftrag-Card-Layout | `src/app/gutachter/auftraege/AuftragCard.tsx` |
| Fall-Detail-Header | `src/app/gutachter/fall/[id]/_components/FallHeader.tsx` |
| Theme/Branding | `src/lib/branding/` + Settings-Tab |
| Push-Notifications | `useGutachterTasks.ts` Hook + `gutachter_mitteilungen` |
| Kennzeichen-Render | `src/components/kunde/Kennzeichenhalter.tsx` (shared!) |
