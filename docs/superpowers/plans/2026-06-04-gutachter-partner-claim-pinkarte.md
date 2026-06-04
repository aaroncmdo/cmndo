# gutachter-partner Claim-Flow live + Pin-Karte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Belebe die `gutachter-partner`-Karte (`claimondo.de`/`:3006`) mit anonymen, klickbaren Pins der offenen DAT-Cold-Leads; Pin-Klick befüllt den Standort im schon-gemergten `SvClaimClient`-Claim-Flow vor — ohne Identitäts-Leak.

**Architecture:** Drei Bausteine am gemeinsamen Parent `GutachterPartnerClient`: (1) neue Service-Role-Action liefert anon-safe `{id,lat,lng}`-Pins; (2) `SvClaimClient` bekommt zwei optionale Props (`initialQuery`, `onPlzChange`) für die Karte↔Claim-Bindung; (3) der Parent rendert klickbare Pins, hält `aktivePlz` als Single Source und verdrahtet beides bidirektional. Der Claim-Flow selbst ist schon auf `staging`/`main` — live geht er per (Aaron-)Deploy.

**Tech Stack:** Next 16 (claimondo-marketing, standalone), React 19, mapbox-gl 3.24, Supabase (service-role admin client), next-intl. **Kein Unit-Test-Runner in dieser App** (`package.json`-Scripts: `build`/`typecheck`/`lint`/`smoke`) → Verifikation = `npm run typecheck` + `npm run build` + Playwright-Browser-Smoke mit Screenshots. TDD ist hier auf „Verify-Gate nach jedem Schritt" adaptiert (Mapbox-Client-UI ist nicht isoliert unit-testbar; es gibt kein vitest).

**Branch / Worktree:** `kitta/gutachter-partner-pinkarte` (off `origin/staging`) in `…/claimondo-v2/.claude/worktrees/gutachter-partner-pinkarte`. Marktplatz-App-Root für alle Pfade unten: `claimondo-marketing/`.

**Deploy:** :3006 ohne CI, `deploy-marketing-vps.py` fragil → **Deploy macht Aaron** (siehe Task 4 Handoff). Build/Smoke = ich.

---

## File Structure

| Datei | Verantwortung | Änderung |
|---|---|---|
| `claimondo-marketing/lib/sv-basic/claim-actions.ts` | SV-Basic Server-Actions | **Modify** — neue Action `ladeClaimbarePinLeads()` (anon-safe Pin-Projektion) anhängen |
| `claimondo-marketing/app/[locale]/gutachter-partner/SvClaimClient.tsx` | 4-Schritt Claim-Flow | **Modify** — optionale Props `initialQuery` + `onPlzChange`; in `SucheSchritt` + `NeuSchritt` threaden |
| `claimondo-marketing/app/[locale]/gutachter-partner/GutachterPartnerClient.tsx` | Parent: Claim-Flow + Karte | **Replace** — Pins laden+rendern, Pin-Klick, Reverse-Geocode, `aktivePlz`-Lift, bidirektionale Wiring, `mapbox-gl.css`-Import, `void`-Dead-Code raus |
| `claimondo-marketing/scripts/_smoke-partner-pins.mjs` | lokaler Browser-Smoke | **Create** (temporär, nicht committen) — Playwright-Probe |

**Out of scope (NICHT anfassen):** `gutachter-finden/*`, `gutachter-finder-actions.ts` (`ladeSvLeads` bleibt anon/whole-pool), `sucheSvLeadKandidaten`/`beanspracheSvLead`/`registriereSvBasicNeu`.

---

## Task 1: Pin-Daten-Action `ladeClaimbarePinLeads()`

**Files:**
- Modify: `claimondo-marketing/lib/sv-basic/claim-actions.ts` (append at end of file)

- [ ] **Step 1: Filter gegen die Live-DB verifizieren (READ-only)**

Vor dem Code die echte `quelle`/`claim_status`-Landschaft prüfen, damit der Filter nicht 0 (oder zu viele) Pins liefert. Über das **Supabase-Plugin** (`mcp__plugin_supabase_supabase__execute_sql`, project `paizkjajbuxxksdoycev`, **nur READ**):

```sql
select quelle, claim_status,
       count(*) as n,
       count(*) filter (where lat is not null and lng is not null) as n_geo
from sv_leads
group by quelle, claim_status
order by n desc;
```

Erwartung: eine Zeile `quelle='dat_expert', claim_status='offen'` mit `n_geo > 0`. Falls die claimbaren Cold-Pins eine **andere** `quelle` tragen (z. B. `dat`/NULL), den Filter in Step 2 entsprechend anpassen (Wert ersetzen). `claim_status` ist `NOT NULL DEFAULT 'offen'` (Mig `20260601194439`) → kein NULL-Handling nötig.

- [ ] **Step 2: Action anhängen**

Ans Ende von `claimondo-marketing/lib/sv-basic/claim-actions.ts` (nutzt das schon importierte `createAdminClient`):

```typescript
// ─── Action 4: Claimbare Cold-Pins fuer die Partner-Karte ─────────────────────
// Privacy: gibt NUR id/lat/lng offener DAT-Cold-Leads zurueck — exakt die anon-
// GRANT-Spalten (#2177/#2208). Kein Name/Firma/PLZ verlaesst den Server.
// Service-Role, weil claim_status NICHT in den anon-Spalten-Grants liegt: ein
// anon-Filter darauf wuerfe "permission denied" und killte den Read (vgl. der
// ist_aktiv-Hinweis in gutachter-finder-actions.ts:ladeAktiveSVs).
export async function ladeClaimbarePinLeads(): Promise<
  { ok: true; data: Array<{ id: string; lat: number; lng: number }> } | { ok: false; error: string }
> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sv_leads')
    .select('id,lat,lng')
    .eq('ist_aktiv', true)
    .eq('claim_status', 'offen')
    .eq('quelle', 'dat_expert')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
  if (error) return { ok: false, error: error.message }
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    lat: Number(r.lat),
    lng: Number(r.lng),
  }))
  return { ok: true, data: rows }
}
```

- [ ] **Step 3: Typecheck**

Run (im Worktree): `cd claimondo-marketing && npm run typecheck`
Expected: PASS (keine neuen Fehler). Falls `node_modules` fehlt, zuerst `npm install` (siehe Task 4 Step 1).

- [ ] **Step 4: Commit**

```bash
git add claimondo-marketing/lib/sv-basic/claim-actions.ts
git commit -m "feat(gutachter-partner): ladeClaimbarePinLeads — anon-safe Cold-Pin-Action (id/lat/lng)"
```

---

## Task 2: `SvClaimClient` — optionale Props `initialQuery` + `onPlzChange`

**Files:**
- Modify: `claimondo-marketing/app/[locale]/gutachter-partner/SvClaimClient.tsx`

Alle Props optional mit Default → `<SvClaimClient />` (ohne Props) bleibt verhaltensgleich (keine Regression).

- [ ] **Step 1: `useEffect` importieren**

Ersetze Zeile 8:
```typescript
import { useState, useTransition } from 'react'
```
mit:
```typescript
import { useEffect, useState, useTransition } from 'react'
```

- [ ] **Step 2: `SucheSchritt` — Props + Prefill + PLZ-Report**

Ersetze die `SucheSchritt`-Signatur + den Anfang des Bodies (aktuell Zeilen 44–55) …
```typescript
function SucheSchritt({
  onKandidatGewaehlt,
  onNeuEintragen,
}: {
  onKandidatGewaehlt: (k: Kandidat) => void
  onNeuEintragen: () => void
}) {
  const [query, setQuery] = useState('')
```
… durch:
```typescript
function SucheSchritt({
  initialQuery = '',
  onKandidatGewaehlt,
  onNeuEintragen,
  onPlzChange,
}: {
  initialQuery?: string
  onKandidatGewaehlt: (k: Kandidat) => void
  onNeuEintragen: () => void
  onPlzChange?: (plz: string) => void
}) {
  const [query, setQuery] = useState(initialQuery)

  // Sync, wenn der Parent eine neue PLZ reinschiebt (Pin-Klick auf der Karte).
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery)
  }, [initialQuery])

  // Getippte 5-stellige PLZ an die Karte melden (treibt den Radius live).
  function handleQueryChange(v: string) {
    setQuery(v)
    const trimmed = v.trim()
    if (/^\d{5}$/.test(trimmed)) onPlzChange?.(trimmed)
  }
```

- [ ] **Step 3: `SucheSchritt` — Input an `handleQueryChange` hängen**

Ersetze (aktuell Zeile 92) `onChangeText={setQuery}` im Such-`<Input>` durch:
```typescript
              onChangeText={handleQueryChange}
```

- [ ] **Step 4: `NeuSchritt` — `initialPlz`-Prop**

Ersetze die `NeuSchritt`-Signatur (aktuell Zeilen 285–297, bis inkl. `const [plz, setPlz] = useState('')`) …
```typescript
function NeuSchritt({
  onErfolg,
  onZurueck,
}: {
  onErfolg: (email: string, emailSent: boolean) => void
  onZurueck: () => void
}) {
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [adresse, setAdresse] = useState('')
  const [plz, setPlz] = useState('')
```
… durch (nur Signatur + `plz`-Default geändert, restliche `useState` unverändert):
```typescript
function NeuSchritt({
  initialPlz = '',
  onErfolg,
  onZurueck,
}: {
  initialPlz?: string
  onErfolg: (email: string, emailSent: boolean) => void
  onZurueck: () => void
}) {
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [adresse, setAdresse] = useState('')
  const [plz, setPlz] = useState(initialPlz)
```

- [ ] **Step 5: Haupt-Komponente — Props annehmen + durchreichen**

Ersetze die `SvClaimClient`-Signatur (aktuell Zeile 523):
```typescript
export function SvClaimClient() {
```
durch:
```typescript
export function SvClaimClient({
  initialQuery = '',
  onPlzChange,
}: {
  initialQuery?: string
  onPlzChange?: (plz: string) => void
} = {}) {
```

Ersetze den `suche`-Render-Zweig (aktuell Zeilen 548–555):
```typescript
  if (schritt === 'suche') {
    return (
      <SucheSchritt
        onKandidatGewaehlt={handleKandidatGewaehlt}
        onNeuEintragen={handleNeuEintragen}
      />
    )
  }
```
durch:
```typescript
  if (schritt === 'suche') {
    return (
      <SucheSchritt
        initialQuery={initialQuery}
        onKandidatGewaehlt={handleKandidatGewaehlt}
        onNeuEintragen={handleNeuEintragen}
        onPlzChange={onPlzChange}
      />
    )
  }
```

Ersetze den `neu`-Render-Zweig (aktuell Zeilen 567–574):
```typescript
  if (schritt === 'neu') {
    return (
      <NeuSchritt
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
      />
    )
  }
```
durch:
```typescript
  if (schritt === 'neu') {
    return (
      <NeuSchritt
        initialPlz={/^\d{5}$/.test(initialQuery) ? initialQuery : ''}
        onErfolg={handleErfolg}
        onZurueck={handleZurueckZurSuche}
      />
    )
  }
```

- [ ] **Step 6: Typecheck**

Run: `cd claimondo-marketing && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "claimondo-marketing/app/[locale]/gutachter-partner/SvClaimClient.tsx"
git commit -m "feat(gutachter-partner): SvClaimClient initialQuery + onPlzChange (Karte<->Claim-Bindung)"
```

---

## Task 3: `GutachterPartnerClient` — Pins, Pin-Klick, bidirektionale Karte, CSS-Fix

**Files:**
- Replace: `claimondo-marketing/app/[locale]/gutachter-partner/GutachterPartnerClient.tsx`

Der Parent wird stark umgebaut (Pins, Reverse-Geocode, State-Lift, Dead-Code-Entfernung) → **kompletter Datei-Ersatz** ist sicherer als fragile Teil-Edits.

- [ ] **Step 1: Datei vollständig ersetzen**

Gesamter neuer Inhalt von `claimondo-marketing/app/[locale]/gutachter-partner/GutachterPartnerClient.tsx`:

```tsx
// Token-Audit-Skip: Mapbox-GL-Marker werden via innerHTML aus Template-Literals
//   mit raw hex gebaut (background:#0D1B3E) — analog GutachterFinderMapClient.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useCallback, useState } from 'react'
import { MapPinIcon, ShieldCheckIcon, ClockIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SvClaimClient } from './SvClaimClient'
import { ladeClaimbarePinLeads } from '@/lib/sv-basic/claim-actions'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const COL_NAVY = '#0D1B3E'

type Coord = { lat: number; lng: number }
type SvLeadPin = { id: string; lat: number; lng: number }

// Geocodiert eine PLZ → Koordinaten via Mapbox
async function geocodePlz(plz: string): Promise<Coord | null> {
  if (!MAPBOX_TOKEN || !/^\d{5}$/.test(plz)) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(plz + ' Deutschland')}.json?country=de&types=postcode,place&access_token=${MAPBOX_TOKEN}&limit=1`,
    )
    const json = await res.json() as { features?: Array<{ center: [number, number] }> }
    const f = json.features?.[0]
    if (!f) return null
    return { lat: f.center[1], lng: f.center[0] }
  } catch { return null }
}

// Reverse-Geocode: Koordinaten → 5-stellige PLZ (Pin-Klick → Suchfeld-Prefill).
async function reverseGeocodePlz(lat: number, lng: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?country=de&types=postcode&access_token=${MAPBOX_TOKEN}&limit=1`,
    )
    const json = await res.json() as { features?: Array<{ text?: string }> }
    const plz = json.features?.[0]?.text
    return plz && /^\d{5}$/.test(plz) ? plz : null
  } catch { return null }
}

// Berechnet Isochrone oder fällt auf Kreis zurück
async function fetchIsochrone(coord: Coord, radiusKm: number): Promise<[number, number][] | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/isochrone/v1/mapbox/driving/${coord.lng},${coord.lat}?contours_minutes=${Math.round(radiusKm * 1.5)}&polygons=true&access_token=${MAPBOX_TOKEN}`,
    )
    const json = await res.json() as { features?: Array<{ geometry: { coordinates: [number, number][][] } }> }
    return json.features?.[0]?.geometry?.coordinates?.[0] ?? null
  } catch { return null }
}

function flächeKm2(radiusKm: number): number {
  return Math.round(Math.PI * radiusKm * radiusKm)
}

export default function GutachterPartnerClient() {
  const t = useTranslations('gutachter_partner')
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const pinMarkersRef = useRef<mapboxgl.Marker[]>([])

  const [radiusKm] = useState(30)
  const [coord, setCoord] = useState<Coord | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [pins, setPins] = useState<SvLeadPin[]>([])
  const [aktivePlz, setAktivePlz] = useState('')

  // Mapbox initialisieren
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN
      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [10.4515, 51.1657],
        zoom: 5.5,
        attributionControl: false,
      })
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))
      map.on('load', () => {
        map.addSource('radius-fill', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius-fill', paint: { 'fill-color': COL_NAVY, 'fill-opacity': 0.12 } })
        map.addLayer({ id: 'radius-stroke', type: 'line', source: 'radius-fill', paint: { 'line-color': '#4573A2', 'line-width': 2, 'line-dasharray': [4, 2] } })
        mapRef.current = map
        setMapReady(true)
      })
      return () => { map.remove() }
    })
  }, [])

  // Offene DAT-Cold-Pins laden (anon-safe: nur id/lat/lng).
  useEffect(() => {
    let cancelled = false
    ladeClaimbarePinLeads().then((res) => {
      if (!cancelled && res.ok) setPins(res.data)
    })
    return () => { cancelled = true }
  }, [])

  // Radius + Marker an einem Punkt zeichnen (shared: PLZ-Suche + Pin-Klick).
  const drawRadius = useCallback(async (c: Coord) => {
    const map = mapRef.current
    if (!map) return
    setCoord(c)
    const mapboxgl = (await import('mapbox-gl')).default
    if (markerRef.current) markerRef.current.remove()
    markerRef.current = new mapboxgl.Marker({ color: COL_NAVY }).setLngLat([c.lng, c.lat]).addTo(map)
    map.flyTo({ center: [c.lng, c.lat], zoom: 9, duration: 1200 })

    const iso = await fetchIsochrone(c, radiusKm)
    const src = map.getSource('radius-fill') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    if (iso) {
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [iso] }, properties: {} }] })
    } else {
      const pts: [number, number][] = []
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI
        const dlat = (radiusKm / 111) * Math.cos(angle)
        const dlng = (radiusKm / (111 * Math.cos(c.lat * Math.PI / 180))) * Math.sin(angle)
        pts.push([c.lng + dlng, c.lat + dlat])
      }
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} }] })
    }
  }, [radiusKm])

  // PLZ-Eingabe (aus dem Claim-Suchfeld) → Karte nachziehen.
  const updateMap = useCallback(async (plz: string) => {
    if (!mapReady) return
    const c = await geocodePlz(plz)
    if (c) await drawRadius(c)
  }, [mapReady, drawRadius])

  // Claim → Karte: SvClaimClient meldet getippte PLZ hoch.
  const handleClaimPlz = useCallback((plz: string) => {
    setAktivePlz(plz)
    void updateMap(plz)
  }, [updateMap])

  // Pin-Klick → Karte zentrieren + Radius + PLZ ins Suchfeld (kein Auto-Submit).
  const handlePinClick = useCallback(async (lat: number, lng: number) => {
    await drawRadius({ lat, lng })
    const plz = await reverseGeocodePlz(lat, lng)
    if (plz) setAktivePlz(plz)
  }, [drawRadius])

  // Pin-Klick-Handler via Ref, damit der Marker-Render-Effekt nicht an der
  // Callback-Identitaet haengt (Marker werden genau einmal gesetzt).
  const onPinClickRef = useRef<(lat: number, lng: number) => void>(() => {})
  onPinClickRef.current = (lat, lng) => { void handlePinClick(lat, lng) }

  // Klickbare Cold-Pins rendern, sobald Karte + Pins bereit sind.
  useEffect(() => {
    if (!mapReady || !mapRef.current || pins.length === 0) return
    let cancelled = false
    const store = pinMarkersRef.current
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !mapRef.current) return
      for (const p of pins) {
        const el = document.createElement('div')
        el.style.cursor = 'pointer'
        el.setAttribute('role', 'button')
        el.setAttribute('aria-label', 'Diesen Standort beanspruchen')
        el.innerHTML = `<div style="width:18px;height:18px;display:grid;place-items:center;border-radius:50%;background:${COL_NAVY};box-shadow:0 2px 6px rgba(13,27,62,0.30);border:2px solid #fff"><span style="font-family:Montserrat,system-ui,sans-serif;font-size:9px;font-weight:900;color:#fff;line-height:1;letter-spacing:-.02em">C</span></div>`
        el.addEventListener('click', () => onPinClickRef.current(p.lat, p.lng))
        const m = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(mapRef.current!)
        store.push(m)
      }
    })
    return () => {
      cancelled = true
      store.forEach((m) => m.remove())
      pinMarkersRef.current = []
    }
  }, [mapReady, pins])

  return (
    <div className="min-h-screen bg-claimondo-bg">
      {/* Hero */}
      <div className="bg-claimondo-navy text-white px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-6">
          <ShieldCheckIcon className="w-4 h-4 text-claimondo-light-blue" />
          {t('hero.badge')}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4 max-w-2xl mx-auto">
          {t('hero.headline')}
        </h1>
        <p className="text-claimondo-light-blue max-w-xl mx-auto text-base leading-relaxed">
          {t('hero.subheadline')}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          {([
            { icon: ClockIcon, key: 'hero.feature_auftraege' as const },
            { icon: ShieldCheckIcon, key: 'hero.feature_verifiziert' as const },
            { icon: MapPinIcon, key: 'hero.feature_radius' as const },
          ] as const).map(({ icon: Icon, key }) => (
            <div key={key} className="flex items-center gap-2 text-white/70">
              <Icon className="w-4 h-4 text-claimondo-light-blue" />
              {t(key)}
            </div>
          ))}
        </div>
      </div>

      {/* SV-Claim-Flow + Karte */}
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Linke Seite — SV-Claim-Flow (Karte<->Claim bidirektional verdrahtet) */}
        <SvClaimClient initialQuery={aktivePlz} onPlzChange={handleClaimPlz} />

        {/* Rechte Seite — Karte */}
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="bg-white rounded-3xl shadow-claimondo-md overflow-hidden">
            <div className="px-5 py-4 border-b border-claimondo-navy/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-claimondo-navy tracking-[-.018em]">{t('map.heading')}</h3>
                {coord ? (
                  <p className="text-xs text-claimondo-ondo mt-0.5">{t('map.radius_hint', { radius: radiusKm, ort: '' })}</p>
                ) : (
                  <p className="text-xs text-claimondo-ondo/60 mt-0.5">{t('map.plz_prompt')}</p>
                )}
              </div>
              {coord && (
                <div className="text-right">
                  <span className="text-lg font-bold text-claimondo-navy">~{flächeKm2(radiusKm).toLocaleString('de-DE')}</span>
                  <span className="text-xs text-claimondo-ondo ml-1">{t('map.flaeche_einheit')}</span>
                </div>
              )}
            </div>
            <div ref={mapContainer} style={{ height: 360 }} className="w-full" />
            {!MAPBOX_TOKEN && (
              <div className="absolute inset-0 flex items-center justify-center bg-claimondo-bg text-sm text-claimondo-ondo/60">
                {t('map.no_token')}
              </div>
            )}
          </div>

          <div className="bg-claimondo-navy/[0.04] border border-claimondo-navy/[0.08] rounded-2xl px-5 py-4 text-xs text-claimondo-ondo leading-relaxed">
            <strong className="text-claimondo-navy block mb-1">{t('map.standardgebiet', { radius: radiusKm, flaeche: flächeKm2(radiusKm).toLocaleString('de-DE') })}</strong>
            {t('map.standardgebiet_mehr')}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd claimondo-marketing && npm run typecheck`
Expected: PASS. (Häufige Stolpersteine: fehlender `mapbox-gl.css`-Pfad → ist in `mapbox-gl` enthalten; `mapboxgl.Map`/`Marker`-Typen kommen aus dem ambient `@types/mapbox-gl`.)

- [ ] **Step 3: Commit**

```bash
git add "claimondo-marketing/app/[locale]/gutachter-partner/GutachterPartnerClient.tsx"
git commit -m "feat(gutachter-partner): klickbare Cold-Pins + Pin-Klick-Standort-Vorbefuellung + mapbox-gl.css-Fix"
```

---

## Task 4: Build, Browser-Smoke, Deploy-Handoff

**Files:**
- Create (temporär, **nicht** committen): `claimondo-marketing/scripts/_smoke-partner-pins.mjs`

- [ ] **Step 1: Deps + Build-Gate**

```bash
cd claimondo-marketing
npm install --no-audit --no-fund        # Worktree hat keine node_modules
npm run typecheck                        # tsc --noEmit → PASS
npm run build                            # Next-16-Build → PASS (findet Route/Action-Validator-Fehler)
```
Expected: `typecheck` + `build` grün. Token-Audit ist in dieser App nicht als Script verdrahtet, aber der Skip-Header in `GutachterPartnerClient.tsx` deckt die raw-hex-Marker ab.

- [ ] **Step 2: Smoke-Script schreiben** (Playwright aus der Haupt-App `claimondo-v2` nutzen — die Marketing-App hat kein Playwright)

Datei `claimondo-marketing/scripts/_smoke-partner-pins.mjs`:

```javascript
import { chromium } from 'playwright'

const URL = process.env.SMOKE_URL || 'http://localhost:3010/gutachter-partner'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
const pii = []
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && r.url().includes('/gutachter-partner')) {
    try { const b = await r.text(); if (/"firma"|"vorname"|"telefon"|"adresse"/.test(b)) pii.push(r.url()) } catch {}
  }
})

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
const before = await page.evaluate(() => document.querySelectorAll('.mapboxgl-marker').length)
console.log('PINS', before)
await page.screenshot({ path: 'docs/04.06.2026/gutachter-pinkarte-smoke/01-pins.png', fullPage: true })

// Pin klicken → Suchfeld muss eine 5-stellige PLZ bekommen
const marker = page.locator('.mapboxgl-marker').first()
await marker.click({ force: true })
await page.waitForTimeout(3500)
const searchVal = await page.locator('input[aria-label="Name, Firma, PLZ oder DAT-Nummer"]').inputValue()
console.log('SEARCH_AFTER_PIN', JSON.stringify(searchVal))
await page.screenshot({ path: 'docs/04.06.2026/gutachter-pinkarte-smoke/02-pin-click-prefill.png', fullPage: true })

// PLZ tippen → Karte muss einen Radius-Marker zeigen
await page.locator('input[aria-label="Name, Firma, PLZ oder DAT-Nummer"]').fill('42103')
await page.waitForTimeout(3500)
await page.screenshot({ path: 'docs/04.06.2026/gutachter-pinkarte-smoke/03-plz-type-map.png', fullPage: true })

console.log('PII_LEAK_HITS', pii.length, pii)
await browser.close()
console.log('SMOKE_DONE')
```

- [ ] **Step 3: Marketing-Dev-Server starten + Smoke fahren**

Terminal A (im Worktree): `cd claimondo-marketing && PORT=3010 npm run dev`
Terminal B (in der **Haupt**-`claimondo-v2` mit Playwright-`node_modules`):
`node "<WORKTREE>/claimondo-marketing/scripts/_smoke-partner-pins.mjs"`
(`<WORKTREE>` = `…/.claude/worktrees/gutachter-partner-pinkarte`. Screenshot-Pfade liegen relativ zum Smoke-cwd — ggf. absolute Pfade setzen.)

Expected:
- `PINS` > 0 (Karte zeigt Cold-Pins).
- `SEARCH_AFTER_PIN` = eine 5-stellige PLZ (Pin-Klick hat vorbefüllt).
- 3. Screenshot zeigt nach `42103`-Eingabe einen Radius/Marker (Claim→Karte).
- `PII_LEAK_HITS` = 0 (keine `firma/vorname/telefon/adresse` in der Action-Response).

**Screenshots im selben Turn auswerten** (Memory: Smoke = Screenshot-Pflicht): Pins sichtbar? Pin-Klick zentriert + Radius + PLZ im Feld? PLZ-Eingabe zieht Karte?

- [ ] **Step 4: Smoke-Artefakt aufräumen + Doku**

Temp-Script entfernen, Screenshots als Beleg behalten:
```bash
rm claimondo-marketing/scripts/_smoke-partner-pins.mjs
git add docs/04.06.2026/gutachter-pinkarte-smoke/
git commit -m "docs(gutachter-partner): Pin-Karte Smoke-Screenshots (Pins, Pin-Klick-Prefill, PLZ->Karte)"
```

- [ ] **Step 5: PR gegen staging**

```bash
git push -u origin kitta/gutachter-partner-pinkarte
gh pr create --base staging --head kitta/gutachter-partner-pinkarte \
  --title "feat(gutachter-partner): Claim-Flow-Pin-Karte (Standort-Vorbefuellung)" \
  --body "Belebt die gutachter-partner-Karte mit anonymen, klickbaren Cold-Pins (id/lat/lng, anon-GRANT-safe #2177/#2208). Pin-Klick -> Karte zentriert + Radius + PLZ ins Claim-Suchfeld (kein Auto-Submit, kein Identitaets-Leak). Bidirektional + mapbox-gl.css-Fix + void-Dead-Code raus. Spec/Plan: docs/superpowers/{specs,plans}/2026-06-04-gutachter-partner-claim-pinkarte*. Claim-Flow selbst ist schon auf main — geht per Deploy live.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 6: Deploy-Handoff an Aaron** (kein Code-Task — Memory-Regel: :3006-Deploy = Aaron)

Notiz für Aaron im Abschluss-Report:
1. Ein Deploy bringt **Claim-Flow** (schon auf main) **+ Pins** (dieser Branch nach Merge) zusammen live.
2. Ablauf: Branch → staging → `claimondo-marketing`-Source tarren → `VPS_SSH_PASSWORD=… python scripts/deploy-marketing-vps.py`.
3. **Optional vorher** in der (untracked, lokalen) `scripts/deploy-marketing-vps.py` die Verify-Schleife (Zeile ~84) um `/gutachter-partner` erweitern:
   `for p in / /kfz-gutachter /schaden-melden /gutachter-partner; do`
   So fängt der Deploy-Smoke eine kaputte Partner-Seite. (Datei ist nicht im Git → kein Commit, nur Aarons lokale Kopie.)

---

## Self-Review

**1. Spec coverage** (gegen `…specs/2026-06-04-gutachter-partner-claim-pinkarte-design.md`):
- §3 E1 Pin-Klick=Vorbefüllung → Task 3 `handlePinClick` (kein Submit) ✓
- §3 E2 nur offene DAT-Leads → Task 1 Filter `claim_status='offen' ∧ quelle='dat_expert'` ✓
- §3 E3 bidirektional → Task 3 `handleClaimPlz` (Claim→Karte) + Task 2 `onPlzChange` ✓
- §3 E4 kein Auto-Submit → Task 2 `handleQueryChange` meldet nur, submittet nicht ✓
- §3 E6 kein Clustering → individuelle Marker ✓
- §6 Query/Projektion id/lat/lng → Task 1 ✓
- §7 Privacy (anon nur lat/lng, Identität via Suche) → Task 1 Service-Role-Projektion + Smoke PII-Check ✓
- §8 mapbox-gl.css + void-Dead-Code raus → Task 3 ✓
- §13 Akzeptanzkriterien 1–6 → Task 4 Smoke; #7 (Live) → Deploy-Handoff ✓

**2. Placeholder scan:** keine TBD/TODO; jeder Code-Step zeigt vollen Code; Task-1-Step-1 ist eine konkrete Verify-Query (kein Platzhalter). ✓

**3. Type consistency:** `SvLeadPin = {id,lat,lng}` (Task 3) deckt sich mit Action-Return `{id,lat,lng}` (Task 1). Props `initialQuery: string`, `onPlzChange: (plz:string)=>void` identisch in Task 2 (Definition) + Task 3 (Nutzung). `drawRadius(Coord)`/`updateMap(plz)`/`handlePinClick(lat,lng)`/`handleClaimPlz(plz)` konsistent benannt. ✓

**Adaptation note:** Kein vitest in dieser App → „Verify" = `typecheck`+`build`+Playwright-Smoke statt Unit-Test-First. Bewusst, ehrlich dokumentiert.
