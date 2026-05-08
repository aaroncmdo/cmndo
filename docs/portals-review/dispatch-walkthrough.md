# Dispatch-Portal — Architektur-Walkthrough

Frontend für die Lead-Verteilung auf Sachverständige. URL: `/dispatch/**`. Test-Login: `test-dispatch@claimondo.de` / `Test1234!`.

`dispatch` ist eine **eigene Rolle** ≠ admin (siehe Memory `project_dispatch_rolle.md`).

## Layout

`src/app/dispatch/layout.tsx` → eigene Sidebar (kein Wetter, kein Theme — anders als SV).
Auth-Guard: redirect wenn `profile.rolle !== 'dispatch'` und nicht admin.

## Routen

| Route | Zweck | Komponenten |
|---|---|---|
| `/dispatch/dashboard` | KPI-Tiles, neueste Leads, dringende Tasks | `DispatchKpis`, `DispatchTasks` |
| `/dispatch/leads` | Lead-Liste mit Filter (Status, Zuweisung, Sprache) | `LeadsListClient`, `LeadCard` |
| `/dispatch/leads/[id]` | Lead-Detail-Seite mit Phasen-Wizard | `LeadDetailClient`, `Phase1-5` Steps |
| `/dispatch/sachverstaendige` | SV-Liste mit Filter (Region, Paket, Verfügbarkeit) | `SVListeClient` |
| `/dispatch/sachverstaendige/[id]` | SV-Detail (vom Dispatcher-Blickwinkel) | `SVDetailDispatch` |
| `/dispatch/karte` | SV-Karte (Mapbox, AAR-Block-G) — Live-Verfügbarkeit | `DispatchKarteClient` |
| `/dispatch/isochrone` | Isochronen-Tool für Reichweiten-Visualisierung | `IsochroneClient` |
| `/dispatch/kalender` | Kalender mit allen SV-Buchungen | `KalenderDispatch` |
| `/dispatch/rueckrufe` | Rückrufe-Liste (Lead → später anrufen) | `RueckrufeListe` |

## Datenfluss-Highlights

### findBestSV-Algorithmus (AAR-264 / AAR-718)

`src/lib/dispatch/findBestSV.ts` ist der Kern. Bekommt einen Lead, liefert ranked SV-Liste:
1. SV im Service-Gebiet (Polygon-Match)
2. Im richtigen Paket-Tier
3. Verfügbarkeit am Wunschtermin (gutachter_termine + Google-FreeBusy)
4. Erreichbarkeit von Vorgänger-Termin (Mapbox-Matrix)
5. Bewertungs-Score (google_bewertungen_cache)

Ergebnis: scored Liste mit Reasons. Wird vom Dispatcher in `Phase4Stammdaten` für die SV-Auswahl angezeigt.

### Lead-Phasen (Phase1-5)

`/dispatch/leads/[id]` rendert einen Wizard mit fünf Phasen:
1. Erstkontakt — Lead-Daten erfassen
2. Schadenkonstellation — bestimmt dynamische Pflichtfelder (Memory `project_mandantenfragebogen.md`)
3. Mandant + Fahrzeugdaten
4. SV-Auswahl + Termin
5. Übergabe an Kunde (FlowLink-Versand)

Jede Phase ist eigene Server-Component mit eigener Server-Action. State liegt in `leads`-Tabelle.

### Realtime-Lead-Alerts

`src/app/dispatch/_components/RealtimeLeadAlert.tsx` subscribed auf `leads`-Inserts und triggert eine Toast + Sound-Notification beim Dispatcher.

### Karte (AAR-Block G)

`/dispatch/karte` nutzt Mapbox-Token (entsperrt 2026-04-17, Memory `project_block_g_mapbox_blocked.md`). Zeigt SVs als Marker mit Farbe nach Status (frei/belegt/offline) — Live-Update via Realtime.

## Bekannte Stolperstellen

- **8-Rollen-Permissions-Matrix** ist in 5 Files verteilt — Aaron hat das als offen markiert (Memory `project_rollen_berechtigungen_offen.md`)
- **Dispatch ≠ Admin:** Manche Operationen (`adminStornoFall`, Werbebudget-Aufladen) sind nur Admin
- **Lead-Konvertierung:** `lib/leads/convert-lead-to-claim.ts` ist die Kernfunktion — bei Schema-Änderungen am Claim-Schema hier mit-anpassen

## Komponenten-Hierarchie

```
DispatchLayout
└── DispatchSidebar
    └── {children}
        └── (z.B. /dispatch/leads/[id])
            └── LeadDetailClient
                ├── PhaseStepper (1→5)
                ├── Phase4Stammdaten
                │   ├── SVPickerWithReasons
                │   └── TerminWunschPicker
                └── ÜbergabePhase
                    └── FlowLinkVersender
```

## Wo Du anpassen würdest, wenn …

| Anpassungs-Wunsch | Touchpoint |
|---|---|
| SV-Picker-Score-Reasons | `findBestSV.ts` + `SVPickerWithReasons` |
| Lead-Phasen-Reihenfolge | `Phase1-5` + `PhaseStepper` |
| Karten-Marker-Styling | `DispatchKarteClient` + Mapbox-Styles |
| Realtime-Alerts | `RealtimeLeadAlert.tsx` |
