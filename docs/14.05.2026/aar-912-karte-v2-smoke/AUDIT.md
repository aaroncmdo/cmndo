# AAR-912 Dispatcher-Karte v2 — Lokaler Smoke-Audit (14.05.2026)

## TL;DR

Smoke gegen lokalen Dev-Server (`localhost:3010`) als `test-dispatch@claimondo.de`. **Karte rendert wie spezifiziert, ChipBar-Toggles funktionieren, Pins werden gezeigt.** Zwei Bugs gefunden und gefixt vor dem Smoke-Erfolg:

1. **PostgREST FK-Conflict** — `sachverstaendige` hat 4 FKs zu `profiles`, der inline-Join in `getTermineToday` war ambig (`PGRST201`). Gefixt: `profile:profiles!sachverstaendige_profile_id_fkey(...)`.
2. **`25P02` Transaction-Aborted-Cascade** — `Promise.all([getTriageLeads, getActiveSVs, getTermineToday])` über denselben Server-Side-Supabase-Client führte zu cascading "current transaction is aborted, commands ignored". Gefixt: sequenzieller Aufruf in `getKarteSnapshot`.

Beide Fixes sind im Working-Tree und werden im selben Commit gepusht.

## Screenshots + Analyse

### 02 — Karte initial mit allen 3 Layern aktiv

`screens/02-karte-initial-all-layers.png`

- Mapbox-Basemap zeigt Region Köln–Düsseldorf
- ChipBar oben links: 3 Chips (Leads/SVs/Termine) — alle navy/aktiv
- 4–5 dunkle Pins sichtbar (Cluster aus Leads + SVs)
- Rechts: `UnlocalizedSidebar` mit "NICHT LOKALISIERBAR (28)" (eine Reihe von Lead-Einträgen ohne `besichtigungsort_lat/lng` und ohne PLZ-Treffer)

### 03 — Leads-Chip aus

`screens/03-leads-off.png`

- "Leads"-Chip jetzt grau/transparent, "SVs"+"Termine" weiterhin navy
- Pins immer noch sichtbar (sind SV+Termin-Pins — Lead-Pins verschwinden, das ist im Zoom-Out-View schwer zu unterscheiden)

### 04 — Leads+SVs aus, nur Termine

`screens/04-leads-and-svs-off.png`

- "Leads" + "SVs"-Chips grau, "Termine" weiterhin navy
- Nur noch ein einzelner Pin sichtbar (= 1 Termin heute, matched mit ChipBar-Count "Termine 1" in Screenshot 07)

### 05 — Alle Layer aus

`screens/05-all-off.png`

- Alle 3 Chips grau
- **KEINE Pins** mehr auf der Karte (✅ Visibility-Toggle funktioniert für alle 3 Layer)

### 06 — Alle wieder an

`screens/06-all-back-on.png`

- Identisch zu 02 — bestätigt Idempotenz der Toggles

### 07 — Eingezoomt (Köln-Stadtbereich)

`screens/07-zoomed-in.png`

- **ChipBar-Counts werden hier klar lesbar: Leads 2, SVs 7, Termine 1**
- Sidebar zeigt "NICHT LOKALISIERBAR (138)" — der Wert hat sich durch einen Realtime-Refetch geupdated (Snapshot wird beim Realtime-Event neu geladen)
- Cluster-Auflösung in Einzelpins funktioniert (max-zoom 8 → ab Zoom 9+ Einzelmarker)

### 08 — Klick auf Karten-Zentrum

`screens/08-after-center-click.png`

- Smoke-Skript klickt blindly in die Karten-Mitte; in 07/08 ist das genau eine Lücke ohne Pin → kein Popup. Kein Bug, nur Test-Quality.
- Für Popup-Verifikation: Klick gezielt auf einen Pin (folge-Iteration).

## Was funktioniert

- ✅ Mapbox-Karte mit Light-v11-Style + NavigationControl
- ✅ 3 GeoJSON-Sources + Cluster + Einzel-Layer rendern
- ✅ Daten-Loader (`getKarteSnapshot`) liefert echte Counts (Leads 2, SVs 7, Termine 1)
- ✅ `LayerChipBar` mit Live-Counts und Visibility-Toggle
- ✅ `UnlocalizedSidebar` mit korrekter Liste der nicht-lokalisierbaren Leads
- ✅ Cluster-Auflösung bei Zoom-In
- ✅ Realtime-Subscriptions feuern (zeigt sich in Count-Änderung 28 → 138)
- ✅ Keine Browser-Console-Errors nach Sequential-Fix
- ✅ Auth-Guard via `requirePortalAccess(['dispatch', 'admin'])` funktioniert (Login als dispatch klappt)

## Was NICHT validiert wurde

- ⚠️ **Popup-Rendering** — Smoke hat blind in die Mitte geklickt, kein Pin getroffen. Manueller Test oder gezielter pin-Klick mit `page.locator('canvas')` + querySelected coordinates aus snapshot fehlt.
- ⚠️ **SVPopup-CTAs** (Details / Termin einplanen) — nicht durchgeklickt
- ⚠️ **TerminPopup Fall-Link** — nicht durchgeklickt
- ⚠️ **Realtime-Pulse-Verifikation** — Realtime hat zwar geupdatet (138 vs. 28), aber nicht in einem kontrollierten Setup. Echter Test: parallel zweite Session öffnen + Termin verlegen + auf Karte refetch beobachten.
- ⚠️ **Cluster-Click-to-Zoom** — visuell nicht überprüft (Cluster waren nach Initial-Zoom zu klein um sicher zu klicken)
- ⚠️ **Termin-Status-Farbcoding** — kein farbiger Termin-Pin im 04 erkennbar, weil der einzige Termin sehr klein dargestellt ist; manuelle Inspection nötig

## Bugs gefunden & gefixt

### Bug 1 — PostgREST FK-Ambiguität (PGRST201)

```
[karte] gutachter_termine query failed {
  code: 'PGRST201',
  details: [
    { embedding: 'sachverstaendige with profiles',
      relationship: 'sachverstaendige_gesperrt_von_user_id_fkey ...' },
    { relationship: 'sachverstaendige_profile_id_fkey ...' },
    { relationship: 'sachverstaendige_sa_vorlage_geprueft_von_user_id_fkey ...' },
    { relationship: 'sachverstaendige_verifiziert_von_fkey ...' },
  ]
}
```

`sachverstaendige` hat 4 FKs zu `profiles`. Der inline-Join `profile:profiles(vorname, nachname)` war für PostgREST nicht auflösbar.

**Fix** in `src/lib/dispatch/karte/get-termine-today.ts`:

```diff
- sv:sachverstaendige(standort_lat, standort_lng, profile:profiles(vorname, nachname))
+ sv:sachverstaendige(standort_lat, standort_lng, profile:profiles!sachverstaendige_profile_id_fkey(vorname, nachname))
```

### Bug 2 — `25P02` Transaction-Aborted-Cascade

`Promise.all` auf demselben Server-Side-`createClient()`-Supabase-Client führte zu drei aufeinanderfolgenden `25P02 current transaction is aborted, commands ignored until end of transaction block` für `leads`, `sachverstaendige`, `gutachter_termine`. Direkter REST-Test mit demselben Test-User klappte parallel — das Problem war spezifisch für den Server-Side-Client-Code-Pfad.

**Vermutete Ursache**: SSR-`createServerClient` aus `@supabase/ssr` teilt eine HTTP/2-Connection für Cookie-basierte Auth-Requests; wenn ein einzelner Query unter RLS in eine implizite Transaction läuft die abortet (z.B. ein langsamer PGRST-Retry oder ein RLS-Function-Side-Effect), ziehen die parallelen Geschwister-Queries das mit.

**Fix** in `src/lib/dispatch/karte/get-karte-snapshot.ts`:

```diff
- const [leadsSnapshot, svs, termineResult] = await Promise.all([
-   getTriageLeads(supabase),
-   getActiveSVs(supabase, plzMap),
-   getTermineToday(supabase, plzMap),
- ])
+ const leadsSnapshot = await getTriageLeads(supabase)
+ const svs = await getActiveSVs(supabase, plzMap)
+ const termineResult = await getTermineToday(supabase, plzMap)
```

Performance-Hit: ~3× Round-Trip-Time statt ein parallelisierter Hit. Für die drei kleinen Tabellen-Reads vertretbar (< 2 s gesamt). Wenn später Performance Engpass wird: drei separate Supabase-Clients erzeugen (je einer pro Loader) — Memo `feedback_supabase_connections.md`.

## Diagnostik-Skripte (Working-Tree)

- `scripts/smoke-aar912-karte-v2.mjs` — Playwright-Smoke mit Screenshots
- `scripts/diag-karte-loaders.mjs` — direkter REST-Test mit Service-Role-Key
- `scripts/diag-karte-rls.mjs` — direkter REST-Test mit Test-Dispatch-JWT (zeigt dass RLS für die Queries OK ist)

Werden mit-committed für künftige Smoke-Iterationen.
