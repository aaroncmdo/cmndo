# Dispatcher-Karte v2 — Design-Spec

**Datum:** 2026-05-14
**Autor:** Aaron + Claude (brainstorming-Skill)
**Vorgänger:** AAR-894 (Dispatcher-Karte v1, gemerged in PR #1080)
**Folge-Linear-Ticket:** AAR-912 (anzulegen)

## Ziel

Dispatcher-Karte um zwei zusätzliche Pin-Layer erweitern:

1. **SVs-Layer** — alle aktiven Sachverständigen als Pins an ihrer Büro-Adresse
2. **Termine-Layer** — heutige Termine als Pins mit Status-Farbcodierung

Plus globale UI:

3. **Layer-Toggle-Chips** — drei Floating-Chips zum Ein-/Ausblenden der Layer
4. **Cluster-Rendering** — Pins werden ab Pin-Dichte zusammengefasst (Mapbox-Cluster)

## Out of Scope (v3+)

- Self-Dispatch-Anfragen-Layer
- Awareness/Triage-Modi (Preset-Toggle für mehrere Layer auf einmal)
- Drag-to-assign-SV direkt aus Karte
- Live-GPS-Tracking-Layer (SV-Bewegung)
- Geo-Backfill-Job für Bestands-Leads ohne lat/lng
- Heatmap-Layer (Lead-Dichte als Hitze statt einzelne Pins)

## Datenmodell-Findings

**`sachverstaendige`-Tabelle (verifiziert via `database.types.ts`):**
- `standort_lat / standort_lng` (number | null) — Büro-Geo
- `standort_adresse / standort_plz` (string | null) — Adress-Strings
- `ist_aktiv` (boolean | null)
- `portal_zugang_freigeschaltet` (boolean)

**`gutachter_termine`-Tabelle:**
- `gps_lat_ankunft / gps_lng_ankunft` (number | null) — Live-GPS bei SV-Ankunft
- `start_zeit` (string, ISO)
- `status` (string | null)
- `lead_id`, `fall_id`, `sv_id` (FK-Joins)

**Termin-Position-Auflösung (Priorität in dieser Reihenfolge):**
1. `gps_lat_ankunft / gps_lng_ankunft` (wenn `in_progress` / SV vor Ort)
2. `leads.besichtigungsort_lat / besichtigungsort_lng` (via `lead_id`-Join)
3. `sachverstaendige.standort_lat / standort_lng` (via `sv_id`-Notnagel)
4. PLZ-Centroid via `plz_geo` (über `leads.kunde_plz` / `halter_plz`)
5. Sonst → in `unlocalized`-Sidebar (wie v1)

## Architektur

### Data-Layer (Server-Components)

Drei separate Loader, gewrappt in einem gemeinsamen `getKarteSnapshot()`:

```typescript
// src/lib/dispatch/karte/types.ts (erweitert)
export type LayerKey = 'leads' | 'svs' | 'termine'

export type SVPin = {
  id: string
  vorname: string | null
  nachname: string | null
  firma_name: string | null
  paket: string | null
  stadt: string | null
  spezifikationen_top3: string[]
  bewertungs_durchschnitt: number | null
  lat: number
  lng: number
}

export type TerminPin = {
  id: string
  start_zeit: string
  status: 'vorgeschlagen' | 'bestaetigt' | 'sv_unterwegs' | 'sv_angekommen' | string
  kunde_name: string | null
  sv_initialen: string | null
  fall_nummer: string | null
  lat: number
  lng: number
  geoSource: 'gps_ankunft' | 'lead_besichtigung' | 'sv_standort' | 'plz_centroid'
}

export type KarteSnapshot = {
  leads: TriageLeadPin[]
  svs: SVPin[]
  termine: TerminPin[]
  unlocalized: UnlocalizedLead[]
}
```

Neue Loader:

- `src/lib/dispatch/karte/get-active-svs.ts` → liest `sachverstaendige` mit `ist_aktiv = true AND portal_zugang_freigeschaltet = true AND standort_lat IS NOT NULL`. Joins `bewertungen` für Durchschnitt + Anzahl, `sv_spezifikationen` für Top-3.
- `src/lib/dispatch/karte/get-termine-today.ts` → liest `gutachter_termine` mit `start_zeit::date = CURRENT_DATE`. Joins `leads` für Kunden-Name, `sachverstaendige` für SV-Initialen. Position-Auflösung in JS via Priority-Chain.
- `src/lib/dispatch/karte/get-karte-snapshot.ts` → kombiniert die 3 Loader + bestehenden `getTriageLeads`.

### Client-Layer

`DispatchKarteClient` wird erweitert um:

- `layerVisibility` State: `{ leads: boolean; svs: boolean; termine: boolean }` (default alle `true`)
- Drei separate Marker-Sets im Map (`leadsMarkersRef`, `svMarkersRef`, `termineMarkersRef`)
- Mapbox-Cluster via `addSource({ type: 'geojson', cluster: true, clusterMaxZoom: 8, clusterRadius: 50 })` pro Layer
- Pin-Render-Logik liest `layerVisibility[key]` und mountet/unmountet entsprechend

Neue Sub-Komponenten:

- `src/app/dispatch/karte/LayerChipBar.tsx` — Floating `absolute top-3 left-3` mit 3 Toggle-Chips
- `src/app/dispatch/karte/SVPopup.tsx` — Popup für SV-Pin (Name, Stadt, Paket, Specs, Bewertung) + 2 CTAs
- `src/app/dispatch/karte/TerminPopup.tsx` — Popup für Termin-Pin (Zeit, Kunde, SV-Initialen, Status, Fall-Nr) + Detail-Link

### UI: Layer-Chip-Bar

Position: `absolute top-3 left-3 z-20` (über Map, unter Mapbox-Controls).

```
[🧑 Leads · 12]  [🛠 SVs · 62]  [📅 Termine · 8]
```

- Chip = `primitives.Button` mit `variant="ghost"` + Token-Tones (claimondo-navy aktiv / claimondo-bg/40 inaktiv)
- Klick toggelt entsprechend `layerVisibility[key]`
- Count-Badge zeigt aktuelle Pin-Anzahl pro Layer (Realtime-aktualisiert)

### Pin-Click-Verhalten

| Layer | Click → |
|---|---|
| Leads | LeadPopup (existing) — Name + Schadenstyp + Detail-Link `/dispatch/leads/[id]` |
| SVs | SVPopup — Stamm + zwei CTAs: `Details` (zu `/dispatch/sachverstaendige/[id]`) + `SV-Termin einplanen` (zu `/dispatch/kalender?sv_id=[id]&mode=create`) |
| Termine | TerminPopup — Zeit + Kunde + Status + Fall-Detail-Link `/dispatch/leads/[lead_id]` oder `/admin/faelle/[fall_id]` |

### Termin-Status-Farbschema

- `vorgeschlagen` → `bg-amber-500` (semantic warning)
- `bestaetigt` → `bg-emerald-500` (semantic success)
- `sv_unterwegs` + `sv_angekommen` → `bg-claimondo-shield` (Brand)
- Andere/unbekannt → `bg-claimondo-ondo` (Brand fallback)

### SV-Pin-Visual

Größerer Pin als Lead-Pins, damit visuell unterscheidbar:
- 18px statt 14px Durchmesser
- Border `2px solid #fff`
- Inner-Color = `var(--map-pin-exact, #0D1B3E)` (whitelabel-fähig via AAR-906)
- Optional: kleines Paket-Badge unten rechts (P/S für pro/standard)

### Realtime

Bestehender `useTriageRealtime`-Hook wird erweitert um Subscriptions auf:
- `gutachter_termine` (INSERT/UPDATE/DELETE) — neue Termine, Status-Wechsel
- `sachverstaendige` (UPDATE auf `ist_aktiv`, `portal_zugang_freigeschaltet`, `standort_lat/lng`) — SV-Aktivierung/Deaktivierung

Bei jeder Änderung: `refetchKarteSnapshot()` Server-Action.

### Cluster

Pro Layer eigene GeoJSONSource mit:
- `cluster: true`
- `clusterMaxZoom: 8` (= bis zoom 8 wird geclustert, ab 9 einzelne Pins)
- `clusterRadius: 50` (Pixel)

Cluster-Layer rendert kreisförmige Badges mit Count, Click zoomt auf Cluster-Bounds. Cluster-Color = Layer-spezifisch (Lead-Cluster navy, SV-Cluster shield, Termin-Cluster mixed).

## Akzeptanzkriterien

- [ ] `/dispatch/karte` zeigt 3 Pin-Layer mit korrekten Counts
- [ ] LayerChipBar oben links, Klick toggelt Visibility
- [ ] SV-Pins erscheinen an `sachverstaendige.standort_lat/lng` für alle aktiven, freigeschalteten SVs
- [ ] Termin-Pins erscheinen an Position-Priority-Chain für alle heutigen Termine
- [ ] Termin-Pin-Farbe entspricht Status-Schema
- [ ] SV-Pin-Click → Popup mit Details-CTA + SV-Termin-einplanen-CTA
- [ ] Termin-Pin-Click → Popup mit Detail-Link zum Fall
- [ ] Bei `>20` Pins in einer Region: Cluster-Badges sichtbar bis Zoom 8
- [ ] Realtime: neuer Termin / SV-Aktivierung → Pin erscheint ohne Reload
- [ ] Whitelabel: alle Pin-Farben respektieren `--map-pin-*` CSS-Vars (AAR-906)
- [ ] Build + Lint + alle 3 Audit-Ratchets grün

## Migration / Risiken

- **Keine** DB-Migration nötig — alle Spalten existieren
- **Performance:** ~190 Pins mit Cluster ist Mapbox-trivial, keine Sorge
- **Realtime-Channel:** 3 Tabellen-Subs in einem Channel via `useId()`-Pattern (siehe AAR-892)
- **Geo-Fallback:** Termine ohne lat/lng + ohne Lead-Adresse + ohne SV-Standort → in `unlocalized`-Sidebar zusammen mit Lead-Unlocalized

## Test-Plan

1. Unit: `resolveTerminGeo()` Pure-Function mit 4 Position-Quellen + Priority-Chain — 8 Test-Cases (alle Quellen + Mix)
2. Integration: `getKarteSnapshot()` Server-Loader mit Mock-Daten
3. Visual: Playwright-Smoke `/dispatch/karte` als test-admin → screenshot mit allen 3 Layern an, dann je einen Layer aus + Vergleich
4. Realtime: Test-Lead/Termin via Supabase-Studio insertieren → Karte aktualisiert ohne Reload
