# SV-Live-Ops-Karte — Design-Spec (Admin / Dispatch / KB)

**Datum:** 2026-07-04
**Status:** Design freigegeben (Brainstorming), Spec zur Review.
**Kontext:** Ersetzt die aktuelle Admin-SV-Karte (`/admin/sachverstaendige`, aktuell Google Maps, AAR-690) durch eine **Mapbox Live-Operations-Karte**, die live zeigt, wo SVs unterwegs sind, welche Termine offen sind, welche Routen laufen — und die Dead-Pin-Akquise voll integriert. Geteilt über **Admin + Dispatch + KB**, vollständig DB-getrieben.

---

## 1 · Ziel & Nicht-Ziele

**Ziel:** Eine Karten-View, die *alles* Operative rund um SVs an einem Ort zeigt und bedienbar macht:
1. SV-Standorte + Einsatzgebiet (Isochrone)
2. **Live-Autos** — wo SVs gerade fahren (klickbar)
3. Offene Termine (Pins am Besichtigungsort)
4. Route eines Unterwegs-SV zum Ziel
5. Tagesrouten je SV (default aus)
6. **Dead-Pins** (`sv_leads`) anzeigen **und voll verwalten** (die bisherige `/admin/sv-leads`-Verwaltung wandert hierher + wird verbessert)

**Nicht-Ziele (YAGNI):**
- Kein neues Mobile-App-UI (nur die Server-seitige Tracking-Pipeline funktional machen).
- Keine historische Routen-Wiedergabe/Playback (nur „heute" + live).
- Keine Dispatch-Zuweisung-Neubau (bestehende Matching-/Zuweisungs-Actions bleiben).
- Kein 3D/Cesium (das crasht Public-Bundle; nur `mapbox-gl` 2D).

---

## 2 · Datenlage (Audit-Befund, live gegen Prod verifiziert)

| Quelle | Zweck | Realität heute |
|--------|-------|----------------|
| `sv_live_location` | „aktuelle Position" (1 Zeile/SV, Realtime, `lat,lng,accuracy,eta_minuten,claim_id,fall_id,updated_at`) | 2 Zeilen, heute aktualisiert — **richtige Live-Quelle** |
| `sv_live_position` | Roh-Feed (`lat,lng,heading,speed_kmh,accuracy_m,captured_at,route_polyline`) | 218 Zeilen, **nur 2 SVs, letzte 08.05.**, **`heading` nie befüllt** → Pipeline eingeschlafen |
| `sachverstaendige.live_tracking_enabled` | Master-Schalter | ~14 SVs an, keiner pusht |
| `gutachter_termine` | Termine + Ziel `besichtigungsort_lat/lng` + `losgefahren_am`/`sv_unterwegs_seit`/`status`/`sv_eta_minuten` | genutzt |
| `sv_leads` | Dead-Pins (Akquise) | genutzt (`/admin/sv-leads`) |
| `sachverstaendige` | Standort, Isochrone, Verifizierung, Paket, Auslastung, Sperre | genutzt |

**Konsequenz:** Echtes Live-GPS fließt aktuell **nicht**. Deshalb Ansatz **(C)**: Autos werden **DB-getrieben** aus `sv_live_location` gespeist **wenn frisch** (Cutoff z. B. 5 Min), sonst **termin-abgeleitet** (SV mit `status ∈ {losgefahren, unterwegs}` bzw. `losgefahren_am != null` → Auto am/Richtung `besichtigungsort`). Sobald die Mobile-Pipeline pusht, werden dieselben Autos automatisch „echt" — **kein UI-Umbau**.

**Wiederverwendbares Toolkit (existiert):** `@/lib/mapbox/client` (`ensureMapboxInitialized`, ENV `NEXT_PUBLIC_MAPBOX_TOKEN`), `@/lib/mapbox/sv-marker` (`addSvCarMarker(map, lngLat, {heading, bodyColor})` — Top-Down-PKW-SVG, heading-Rotation, **ohne** CSS-transition), `@/lib/mapbox/route-layer` (`upsertRouteLayer`/`removeRouteLayer`), `@/lib/mapbox/directions` (`fetchDrivingRoute`), Isochrone-Layer-Muster (`FinderMap.tsx:459-494`), React-Popup-Muster (`DispatchKarteClient.openPopup:113-158`), `resolve-termin-geo.ts` (Ziel-Koord-Fallback-Kette), `get-termine-today.ts` (Heute-Termine-Loader), `useGeoTracking.ts` (Realtime-Channel-Muster auf `sv_live_location`).

---

## 3 · Architektur (vollständig DB-getrieben, role-scoped)

Zwei Bausteine, beide role-agnostisch mit Rollen-Parameter:

### 3a · Datenschicht — `src/lib/live-ops/*`
Pro Layer ein **Loader** (Server, `createClient()` → RLS greift; Admin-Client nur wo RLS fehlt). Rollen-Scoping über RLS + einen `role`/`scope`-Filter:
- `getLiveOpsSvs(scope)` → SV-Pins: `sachverstaendige` (Standort, Isochrone, gutachter_typ, verifiziert, Paket, Auslastung, Sperre, `live_tracking_enabled`) + join jüngste `sv_live_location` (frisch?) + `sv_live_position.heading` (jüngste). Sichtbarkeit: `portalZugang && !gesperrt && lat/lng`.
- `getOffeneTermine(scope)` → Termin-Pins: `gutachter_termine` offen/heute (reuse `get-termine-today` + `resolve-termin-geo`), status-farbig, mit SV + Kunde + ETA.
- `getUnterwegsRouten(scope)` → für SVs mit `status ∈ {losgefahren, unterwegs}`: Auto-Position (GPS frisch → `sv_live_location`; sonst Ziel/Interpolation) + Route (`route_polyline` aus `sv_live_position` sonst `fetchDrivingRoute(svPos, ziel)`).
- `getTagesrouten(scope)` → pro SV die heutigen Termine sortiert nach `start_zeit` → geordnete Stops (Polyline optional via directions).
- `getDeadPins(scope)` → `sv_leads` (Status offen/beansprucht/konvertiert/abgelehnt) mit Koordinaten.
- **Rollen-Scope:** Admin = alle; Dispatch = Pool (bestehende Dispatch-Filter); KB = betreute Fälle/SVs (über `v_faelle_mit_aktuellem_termin`/KB-Zuordnung). Scope wird EINMAL aufgelöst und an alle Loader gereicht.

**DB-Views/RPCs:** wo ein Loader komplex joint (Live-SVs = sachverstaendige × sv_live_location × sv_live_position), eine **View** `v_live_ops_sv` (DEFINER, RLS-gated via `is_staff()`/scope) statt Client-seitigem Multi-Query. Migration nur via Supabase-Plugin (Regel 2).

### 3b · Komponente — `src/components/live-ops/LiveOpsMap.tsx` (+ Sub-Komponenten)
`'use client'`, baut auf `@/lib/mapbox/*`. Props: `{ role, initialData, scope }`. Rendert die 6 Layer, verwaltet Toggle-State, Realtime, Popups/Drawer. **Ein** vollständiger Teardown (`map.remove()`, Marker/Listener/Roots). Sub-Komponenten: `LayerPanel`, `SidebarList`, `SvPopup`, `TerminPopup`, `DeadPinDrawer` (volle Verwaltung), `StatBar`.

### 3c · Realtime
Supabase-Channel auf `sv_live_location` (+ ggf. `gutachter_termine`-Status) nach dem `useGeoTracking`-Muster → Autos/ETA aktualisieren ohne Reload. Marker **ohne** CSS-transition (Aaron-Spec).

---

## 4 · Die Layer (das „alles", einzeln togglebar)

| Layer | Default | Marker/Style | Klick |
|-------|---------|--------------|-------|
| SV-Standorte + Isochrone | an | typ-farbiger Pin + fill/line-Polygon | SvPopup |
| Live-Autos | an | `addSvCarMarker` (heading; GPS=voll, termin-abgeleitet=gedimmt/ohne heading) | SvPopup + Route-Toggle |
| Offene Termine | an | status-farbiger Pin am Besichtigungsort | TerminPopup |
| Routen (Unterwegs) | an | `upsertRouteLayer` SV→Ziel | — |
| Tagesrouten | **aus** | dünne Polyline je SV, Stops nummeriert | Stop → TerminPopup |
| Dead-Pins | an | Akquise-Pin (Status-Farbe) | DeadPinDrawer (volle Verwaltung) |
| **Leads** *(role-scoped: Dispatch/Admin)* | an (Dispatch) | Kunden-Anfrage-Pin + Cluster | LeadPopup → SV zuweisen |

Farb-Hex nur in Mapbox-Paint/Marker (legitim, `// Token-Audit-Skip`-Header, AAR-198). Der **Leads-Layer** ist role-scoped und existiert v. a. für die `/dispatch/karte`-Vollersetzung (s. §12) — bestehende Dispatch-Leads/-Popups/-Cluster müssen 1:1 abgedeckt sein.

---

## 5 · Layout / UX

Vollflächige Karte, StatBar oben (live · unterwegs · offene Termine · Dead-Pins offen), links Layer-/Filter-Panel (Typ, Verifizierung, „nur unterwegs", Suche), rechts einklappbare Live-Liste (Unterwegs-SVs zuerst, dann heutige Termine). Klick auf Karten-Objekt hebt das Listen-Item hervor (Hover-Sync in beide Richtungen). Detail-Interaktion via Popup (SV/Termin) bzw. **Drawer** (Dead-Pin-Verwaltung — mehr Platz). „+ Neuer SV" + „+ Dead-Pin" im Header.

---

## 6 · Live-Autos-Logik (DB-getrieben)

Pro SV bestimmt der Loader eine `carState`:
1. **`live`** — `sv_live_location.updated_at` < 5 Min → Position=GPS, `heading`=jüngste `sv_live_position.heading` (falls vorhanden), Route=`route_polyline`/directions zum aktuellen Termin-Ziel.
2. **`unterwegs_derived`** — kein frisches GPS, aber Termin `status ∈ {losgefahren, unterwegs}` oder `losgefahren_am != null` → Auto am `besichtigungsort` (gedimmt, „geschätzt"-Badge), Route Büro→Ziel via directions.
3. **kein Auto** — SV ohne aktiven Termin/GPS → nur Standort-Pin (Layer 1).

Der Zustandsübergang von `unterwegs_derived` zu `live` passiert automatisch, sobald die Pipeline echte Positionen liefert.

---

## 7 · Dead-Pins — volle Verwaltung in der Karte

Die bisherige `/admin/sv-leads`-Verwaltung (Client `SvLeadsClient` + `sv-leads/actions.ts`, sauberstes File des Audits, Result-Object) wird als **`DeadPinDrawer`** in die Karte integriert und verbessert:
- **Anzeigen** als Layer + in der Liste (Filter Status).
- **Verwalten** (volle Aktionen, bestehende Actions wiederverwenden): Neuer Dead-Pin (Karte-Klick setzt Koordinate direkt!), Bearbeiten, **Einladen** (einzeln + „alle offenen"), **Beanspruchen**, **Konvertieren**, **Ablehnen**, Bulk-Import CSV, DAT-Sync.
- **Verbesserung ggü. alt:** Koordinate per Karten-Klick statt nur Autocomplete; räumlicher Kontext (Dead-Pin neben bestehenden SVs/Isochrone sichtbar → Lücken erkennen); Status-Filter direkt am Layer.
- `/admin/sv-leads` bleibt als Redirect/Deep-Link erhalten (Bookmarks), zeigt aber auf die Karte.

---

## 8 · Fundament — Mobile-Tracking-Pipeline funktional machen

Eigener Chunk, parallel. Audit + Fix:
- **`/api/sv/position-batch`** (AAR-388) + **`trackPosition()`** (KFZ-158): schreiben aktuell in `sv_live_position` (Roh). **Prüfen/reparieren:** wird `sv_live_location` (die „aktuelle Position") daraus **upserted**? (Trigger/Action?) — falls nein, den Upsert ergänzen (1 Zeile/SV, mit `eta_minuten`/`claim_id`/`fall_id` aus dem aktiven Termin).
- **`heading`**: aktuell nie gesetzt. Fix: aus dem Mobile-Payload durchreichen (position-batch hat `heading` im Input) **oder** server-seitig aus zwei aufeinanderfolgenden Positionen berechnen (`bearing(prev, curr)`).
- **Audit-Deliverable:** kurze Bestandsaufnahme aller SV-Mobile-Endpoints (`/api/sv/*`) — welche funktional, welche tot/ungenutzt — als Teil dieses Chunks (Aaron: „audite die api für die mobilen … funktional?").
- **Ohne live Mobile-App:** die Pipeline ist dann *bereit*; ein optionaler Sim-Seed (Cron/Script) kann für Demo Positionen entlang der Route interpolieren — **klar als Sim markiert**, kein Fake in Prod-Metriken.

---

## 9 · Rollen-Scoping / RLS

- **Admin:** alle SVs/Termine/Dead-Pins.
- **Dispatch:** Pool (bestehende Dispatch-Sichtbarkeit; `/dispatch/karte` konsolidiert auf `<LiveOpsMap role="dispatch">`).
- **KB:** nur betreute Fälle/SVs/Termine.
- Views/RPCs sind `SECURITY DEFINER` mit `is_staff()`/scope-Gate; Loader filtern zusätzlich. Kein Client sieht Daten außerhalb seines Scopes (verifiziert per Cross-Rollen-JWT-Smoke).

---

## 10 · Error-Handling & Testing

- **Map-Init:** Fehler → ErrorState + Retry (nicht schlucken); kein Token → Hinweis; Loading-Spinner bis `mapReady`.
- **Leere/stale Daten:** „keine Live-Daten"-Zustand explizit (Autos-Layer zeigt Badge „geschätzt"/„keine Fahrten aktiv").
- **Server-Actions:** Result-Object `{ok,error}`; `revalidatePath`.
- **Tests:** Unit für die reinen Loader-Transformationen (carState-Ableitung, resolve-termin-geo-Nutzung, scope-Filter) + Realtime-Reducer; Cross-Rollen-RLS-Smoke (Admin/Dispatch/KB sehen nur ihren Scope); Live-Prod-Smoke der 3 Portale.

---

## 11 · Build-Reihenfolge (3 Chunks → je eigener Plan/PR)

1. **Datenschicht + Pipeline-Fundament**: `src/lib/live-ops/*` Loader + `v_live_ops_sv`-View (Migration via Plugin) + Mobile-Pipeline-Fix (`sv_live_location`-Upsert + heading) + Mobile-API-Audit. Unit-Tests. *Kein UI.*
2. **`<LiveOpsMap>`-Komponente**: Mapbox-Rendering aller Layer + LayerPanel/Sidebar/StatBar + Popups + DeadPinDrawer (volle sv-leads-Verwaltung) + Realtime. Storybook/isoliert testbar mit Chunk-1-Fixtures.
3. **Verdrahtung**: Admin (`/admin/sachverstaendige` → `<LiveOpsMap role="admin">`, ersetzt KarteHubClient) · Dispatch (`/dispatch/karte` aufrüsten/konsolidieren) · KB (neue Route) · `/admin/sv-leads`-Redirect. Live-Smoke je Rolle.

Jeder Chunk = eigener `writing-plans`-Durchlauf + PR gegen staging.

---

## 12 · Offene Punkte / Risiken

- **Dispatch-Karte-Vollersatz (Aaron 04.07.):** `/dispatch/karte` (`DispatchKarteClient`) wird **komplett** durch `<LiveOpsMap role="dispatch">` ersetzt. Voraussetzung: `<LiveOpsMap>` muss ein **Superset** aller bestehenden Dispatch-Layer sein — insbesondere den **Leads-Layer** (eingehende Kunden-Anfragen zur SV-Platzierung) inkl. Cluster + Zuweisen-Aktion mitbringen, sonst Regression. `DispatchKarteClient` + dessen Loader/Popups werden erst **nach** dem Cross-Rollen-Smoke gelöscht (Chunk 3).
- **Kollision:** Parallele Sessions bauen werkstatt/makler-Views (nicht diese Lane), aber `/dispatch/karte` + `sv_leads` + `@/lib/mapbox/*` sind geteilt → Touch-Marker pflegen.
- **Performance:** viele SVs × Isochrone-Polygone × Realtime — Layer-Toggles + Viewport-Filter als Entlastung; Isochrone ggf. nur für sichtbaren Viewport laden.
- **`sv_live_location`-Upsert-Quelle:** falls kein Trigger existiert, muss position-batch/trackPosition den Upsert selbst machen — in Chunk 1 verifizieren.
