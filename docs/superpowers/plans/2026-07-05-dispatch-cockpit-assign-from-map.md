# Dispatch-Cockpit V1: Assign-from-Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dispatcher weist einem offenen, unzugewiesenen Lead direkt aus `/dispatch/karte` den räumlich-besten SV zu — Klick auf Lead-Pin → Drawer mit Top-SVs (Distanz/ETA/Score/Slots) → SV+Slot wählen → `reserveSvTerminForLead`.

**Architecture:** Reine Wiederverwendung der Dispatch-Kanonik (`getSvSuggestionsWithSlots`, `reserveSvTerminForLead`) in einem neuen Client-Drawer, plus räumliche UX in `LiveOpsMap` (Kandidaten-Halo + Verbindungslinie). Keine neue Matching-/Schreib-Logik.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase, Mapbox GL, Tailwind v4 + Claimondo-Tokens, Vitest.

## Global Constraints

- **Kanonik NICHT neu bauen:** `getSvSuggestionsWithSlots(leadId, { slotsPerSv, maxSvs, slotDauerMin })` → `{ success, suggestions?: Array<SvSuggestion & { slots: SlotCandidate[] }>, error? }`; `reserveSvTerminForLead(leadId, svId, startIso, durationMin=45)` → `{ success, terminId?, error? }`. Beide `'use server'`, client-aufrufbar (Barrel `@/app/dispatch/leads/[id]/actions`).
- **Slot-ISO = `slot.start`** (Feld heißt `start`, nicht `startIso`). Reserve-Arg = `slot.start`. Dauer = `45`.
- **Kandidat-Feld = `svSuggestion.svId`** (nicht `.id`).
- **Result-Object-Pattern:** `if (r.success) … else toast(r.error)`. Kein `try/catch` um Server-Actions, kein `throw`.
- **GeoJSON-Koordinaten immer `[lng, lat]`.**
- **Nur `role ∈ {admin, dispatch}`** sehen den Assign-Einstieg. KB nie (Layer/Buttons im `if (role !== 'kundenbetreuer')`-Guard bzw. `role === 'admin' || role === 'dispatch'`).
- **Bestätigungs-Schritt Pflicht** vor `reserveSvTerminForLead` (feuert SV-Benachrichtigung).
- **Highlight/Linie an `standortLat/Lng`** (nicht Live-Position) — Konsistenz mit `findBestSV`-Ranking.
- **Umlaute** in allen UI-Strings (`ä/ö/ü/ß`). **Design-Tokens** (`claimondo-*`, `rounded-ios-*`, `primitives/*` + `shared/*`), kein bracket-hex, keine raw Status-Scales.
- **Nach erfolgreichem Assign:** `onRefresh?.()` (die Karte re-lädt via `router.refresh()` im Page-Wrapper → Lead ist dann zugewiesen).

---

## Task 1: `LeadPin.hasActiveTermin` (Datenschicht)

**Files:**
- Modify: `src/lib/live-ops/types.ts` (LeadPin-Typ)
- Modify: `src/lib/live-ops/get-leads.ts` (Ableitung + reiner Helper)
- Test: `src/lib/live-ops/get-leads.test.ts` (neu, falls nicht vorhanden)

**Interfaces:**
- Produces: `LeadPin.hasActiveTermin: boolean` — `true`, wenn der Lead einen nicht-stornierten `gutachter_termine`-Eintrag hat (= bereits einem SV zugewiesen).
- Produces: `export function applyHasActiveTermin(pins: LeadPin[], activeLeadIds: Set<string>): LeadPin[]`

- [ ] **Step 1: LeadPin-Typ erweitern** — in `types.ts` das `LeadPin`-Objekt um ein Feld ergänzen:

```typescript
export type LeadPin = {
  id: string
  name: string
  status: string
  lat: number
  lng: number
  ort: string | null
  kanal: string | null
  erstelltAm: string
  hasActiveTermin: boolean
}
```

- [ ] **Step 2: Failing test für den reinen Helper** — `get-leads.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyHasActiveTermin } from './get-leads'
import type { LeadPin } from './types'

const base: Omit<LeadPin, 'id' | 'hasActiveTermin'> = {
  name: 'X', status: 'neu', lat: 52, lng: 13, ort: null, kanal: null, erstelltAm: '2026-01-01T00:00:00Z',
}

describe('applyHasActiveTermin', () => {
  it('markiert Leads mit aktivem Termin', () => {
    const pins: LeadPin[] = [
      { ...base, id: 'a', hasActiveTermin: false },
      { ...base, id: 'b', hasActiveTermin: false },
    ]
    const out = applyHasActiveTermin(pins, new Set(['a']))
    expect(out.find((p) => p.id === 'a')?.hasActiveTermin).toBe(true)
    expect(out.find((p) => p.id === 'b')?.hasActiveTermin).toBe(false)
  })
})
```

- [ ] **Step 3: Test läuft rot** — `npx vitest run src/lib/live-ops/get-leads.test.ts` → FAIL (`applyHasActiveTermin` nicht exportiert).

- [ ] **Step 4: Helper implementieren** — in `get-leads.ts` exportieren:

```typescript
export function applyHasActiveTermin(pins: LeadPin[], activeLeadIds: Set<string>): LeadPin[] {
  return pins.map((p) => ({ ...p, hasActiveTermin: activeLeadIds.has(p.id) }))
}
```

- [ ] **Step 5: In der Loader-Query verdrahten** — im `LeadPin`-Builder-Block (`pins.push({...})`) `hasActiveTermin: false` als Default ergänzen. Danach, VOR dem `return`, einen zweiten READ fahren + anwenden:

```typescript
// Aktive Termine (bereits zugewiesen) — separater READ, kein Join (Cardinality-sauber).
const leadIds = pins.map((p) => p.id)
const activeLeadIds = new Set<string>()
if (leadIds.length > 0) {
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('lead_id, status')
    .in('lead_id', leadIds)
    .not('status', 'in', '("storniert","abgesagt","abgelehnt")')
  for (const t of termine ?? []) if (t.lead_id) activeLeadIds.add(t.lead_id as string)
}
return applyHasActiveTermin(pins, activeLeadIds)
```

**VOR Finalisierung:** die Cancel-Status-Werte gegen die DB verifizieren (`supabase` MCP: `select distinct status from gutachter_termine`). Falls das Enum andere Storno-Werte hat, die `NOT IN`-Liste anpassen — Ziel: „nicht-storniert = zugewiesen".

- [ ] **Step 6: Test grün** — `npx vitest run src/lib/live-ops/get-leads.test.ts` → PASS. Dann `npx tsc --noEmit` → 0.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(dispatch-cockpit): LeadPin.hasActiveTermin (Datenschicht)"`

---

## Task 2: Geo-Builder `candidateHaloFC` + `assignLineFC` (rein, TDD)

**Files:**
- Modify: `src/components/live-ops/geo.ts`
- Test: `src/components/live-ops/geo.test.ts`

**Interfaces:**
- Consumes: `SvLiveOps` (`standortLat`/`standortLng`), `LeadPin`.
- Produces: `candidateHaloFC(svs: SvLiveOps[], candidateIds: string[]): GeoJSON.FeatureCollection` — Punkte NUR der Kandidaten-SVs (an `standortLat/Lng`), `properties.__id`/`__type: 'candidate'`/`svId`.
- Produces: `assignLineFC(from: [number, number] | null, to: [number, number] | null): GeoJSON.FeatureCollection` — 0 oder 1 LineString `[from, to]` (`[lng,lat]`).

- [ ] **Step 1: Failing tests** — in `geo.test.ts` ergänzen:

```typescript
import { candidateHaloFC, assignLineFC } from './geo'
// (SvLiveOps-Fixture analog zu den bestehenden svPinsFC-Tests im File)

describe('candidateHaloFC', () => {
  it('nimmt nur Kandidaten mit standort, [lng,lat]', () => {
    const svs = [
      { id: 's1', standortLat: 52, standortLng: 13 },
      { id: 's2', standortLat: 48, standortLng: 11 },
      { id: 's3', standortLat: null, standortLng: null },
    ] as any
    const fc = candidateHaloFC(svs, ['s1', 's3'])
    expect(fc.features).toHaveLength(1) // s1 (s3 ohne standort raus, s2 kein Kandidat)
    expect(fc.features[0].geometry).toMatchObject({ type: 'Point', coordinates: [13, 52] })
    expect(fc.features[0].properties?.__id).toBe('s1')
    expect(fc.features[0].properties?.__type).toBe('candidate')
  })
})

describe('assignLineFC', () => {
  it('baut 1 LineString aus 2 Punkten', () => {
    const fc = assignLineFC([13, 52], [14, 53])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry).toMatchObject({ type: 'LineString', coordinates: [[13, 52], [14, 53]] })
  })
  it('leer wenn ein Punkt fehlt', () => {
    expect(assignLineFC(null, [14, 53]).features).toHaveLength(0)
    expect(assignLineFC([13, 52], null).features).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rot** — `npx vitest run src/components/live-ops/geo.test.ts` → FAIL.

- [ ] **Step 3: Builder implementieren** — in `geo.ts` (Muster exakt wie `leadsFC`/`svPinsFC`):

```typescript
export function candidateHaloFC(svs: SvLiveOps[], candidateIds: string[]): GeoJSON.FeatureCollection {
  const set = new Set(candidateIds)
  return {
    type: 'FeatureCollection',
    features: svs
      .filter((s) => set.has(s.id) && s.standortLat != null && s.standortLng != null)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.standortLng as number, s.standortLat as number] },
        properties: { __id: s.id, __type: 'candidate', svId: s.id },
      })),
  }
}

export function assignLineFC(
  from: [number, number] | null,
  to: [number, number] | null,
): GeoJSON.FeatureCollection {
  if (!from || !to) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [from, to] },
      properties: {},
    }],
  }
}
```

(Stelle sicher, dass `SvLiveOps` + `LeadPin` oben im File importiert sind — `svPinsFC` importiert `SvLiveOps` bereits.)

- [ ] **Step 4: Grün** — `npx vitest run src/components/live-ops/geo.test.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** — `git commit -am "feat(dispatch-cockpit): candidateHaloFC + assignLineFC geo-builder (TDD)"`

---

## Task 3: `AssignFromMapDrawer`-Komponente

**Files:**
- Create: `src/components/live-ops/AssignFromMapDrawer.tsx`

**Interfaces:**
- Consumes: `getSvSuggestionsWithSlots`, `reserveSvTerminForLead` (aus `@/app/dispatch/leads/[id]/actions`), Typen `SvSuggestion`/`SlotCandidate`.
- Props:
```typescript
interface AssignFromMapDrawerProps {
  leadId: string
  leadName: string
  onCandidates: (svIds: string[]) => void   // nach Laden: alle Kandidaten-svIds -> Karte hebt hervor
  onPreviewSv: (svId: string | null) => void // Hover eines Kandidaten -> Linie zeichnen
  onAssigned: () => void                      // nach erfolgreichem Reserve
  onClose: () => void
}
```

- [ ] **Step 1: Grundgerüst** (`'use client'`) — Drawer analog `DeadPinDrawer` (gleiches Shell/`primitives`-Muster; schau in `DeadPinDrawer.tsx` für den Sheet-Rahmen). State: `suggestions: (SvSuggestion & { slots: SlotCandidate[] })[] | null`, `loading`, `error`, `pending` (useTransition), `toast`.

- [ ] **Step 2: Laden beim Mount** — `useEffect(() => { getSvSuggestionsWithSlots(leadId, { slotsPerSv: 3, maxSvs: 3, slotDauerMin: 45 }).then(r => { if (r.success) { const s = r.suggestions ?? []; setSuggestions(s); onCandidates(s.map(x => x.svId)) } else setError(r.error ?? 'SV-Suche fehlgeschlagen') }).catch(e => setError(String(e))).finally(() => setLoading(false)) }, [leadId])`. Beim Unmount `onCandidates([])` + `onPreviewSv(null)` (Cleanup-Return).

- [ ] **Step 3: Kandidaten-Karten rendern** — je `sv`: Name, `<StatusBadge>{sv.paket}</StatusBadge>`, Meta-Zeile `{sv.distanzKm.toFixed(1)} km · {sv.etaFromBueroMin != null ? `~${sv.etaFromBueroMin} Min` : '—'} · {sv.kontingentFrei} frei · Score {sv.score.toFixed(1)}`, `sv.reasons` als kleine Liste. `onMouseEnter={() => onPreviewSv(sv.svId)} onMouseLeave={() => onPreviewSv(null)}`. (Muster: `SvCard` in `SvDispatchPanel.tsx` Z.809–878 — schlank nachbauen, NICHT importieren.)

- [ ] **Step 4: Slot-Buttons + Bestätigung** — je `slot` von `sv.slots`: Button zeigt Datum/Zeit aus `slot.start`/`slot.end` (`toLocaleString('de-DE', { timeZone: 'Europe/Berlin', … })`), optional Match-Badge (`slot.matchType`). Klick → **Bestätigungs-UI** (z.B. inline „Wirklich {SV} für {Datum} zuweisen?" + „Zuweisen"/„Abbrechen") → bei „Zuweisen":

```typescript
startTransition(async () => {
  const r = await reserveSvTerminForLead(leadId, sv.svId, slot.start, 45)
  if (r.success) { setToast('SV zugewiesen — Termin reserviert'); onAssigned() }
  else setToast(r.error ?? 'Zuweisung fehlgeschlagen')
})
```

- [ ] **Step 5: Zustände** — Loading (Skeleton/Spinner), Error (Text + evtl. Retry), Empty (`suggestions.length === 0` → „Kein passender SV gefunden"). Umlaute überall.

- [ ] **Step 6: Build-Check** — `npx tsc --noEmit` → 0. `npm run check:token-audit` + `check:component-set -- --ratchet` → 0 neue. (Kein Unit-Test: reiner Client+Server-Action-Glue; die reinen Teile sind in Task 1/2 getestet, der Reserve-Pfad über den bestehenden Panel-Flow.)

- [ ] **Step 7: Commit** — `git commit -am "feat(dispatch-cockpit): AssignFromMapDrawer (getSvSuggestionsWithSlots + reserveSvTerminForLead)"`

---

## Task 4: `LeadPopup` — „SV zuweisen"-Button

**Files:**
- Modify: `src/components/live-ops/LeadPopup.tsx`

**Interfaces:**
- Consumes: `LeadPin.hasActiveTermin` (Task 1).
- Props erweitern: `onAssign?: (leadId: string) => void`.

- [ ] **Step 1: Prop ergänzen** — `LeadPopupProps` um `onAssign?: (leadId: string) => void` erweitern.

- [ ] **Step 2: Button rendern** — im `kannLeadOeffnen`-Block (`role === 'admin' || role === 'dispatch'`), direkt unter dem bestehenden „Lead öffnen →"-`<a>`, NUR wenn `onAssign && !lead.hasActiveTermin`:

```tsx
{onAssign && !lead.hasActiveTermin && (
  <div style={{ marginTop: 4 }}>
    <button
      type="button"
      onClick={() => onAssign(lead.id)}
      style={{
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        color: '#ffffff', background: 'var(--brand-primary, #0D1B3E)',
        border: 'none', borderRadius: 8, padding: '4px 10px',
      }}
    >
      SV zuweisen
    </button>
  </div>
)}
```

(LeadPopup nutzt inline-`style` mit `var(--brand-*)` — siehe bestehenden Detail-Link; das ist hier das etablierte Muster, kein Token-Audit-Verstoß. Falls die Datei einen `// Token-Audit-Skip`-Header hat, bleibt er gültig.)

- [ ] **Step 3: Build** — `npx tsc --noEmit` → 0. `npm run check:token-audit` → 0 neue (inline-hex nur mit `var(--brand-*)`-Fallback).

- [ ] **Step 4: Commit** — `git commit -am "feat(dispatch-cockpit): LeadPopup SV-zuweisen-Button (dispatch/admin, unzugewiesen)"`

---

## Task 5: `LiveOpsMap`-Verdrahtung (Drawer + Halo + Linie)

**Files:**
- Modify: `src/components/live-ops/LiveOpsMap.tsx`

**Interfaces:**
- Consumes: `AssignFromMapDrawer` (Task 3), `candidateHaloFC`/`assignLineFC` (Task 2), `LeadPopup.onAssign` (Task 4).

- [ ] **Step 1: State + Konstanten** — oben bei den anderen `useState`: `const [assignLeadId, setAssignLeadId] = useState<string | null>(null)`, `const [candidateSvIds, setCandidateSvIds] = useState<string[]>([])`, `const [previewSvId, setPreviewSvId] = useState<string | null>(null)`. Neue Layer-Konstanten bei den anderen: `const SRC_CAND = 'lo-cand-halo'`, `const LAYER_CAND = 'lo-cand-halo-circle'`, `const SRC_ASSIGN_LINE = 'lo-assign-line'`, `const LAYER_ASSIGN_LINE = 'lo-assign-line-line'`.

- [ ] **Step 2: Halo- + Linien-Layer anlegen** — im Map-Init, innerhalb `if (role !== 'kundenbetreuer')` (nach dem Leads-Layer): `addSource(SRC_CAND, { type:'geojson', data: candidateHaloFC([], []) })` + `addLayer({ id: LAYER_CAND, type:'circle', source: SRC_CAND, paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': /* claimondo-Akzent, z.B. dein bestehender Token-Wert */, 'circle-stroke-width': 3, 'circle-opacity': 0.9 } })` (Halo = großer Ring um den SV-Pin). Analog `SRC_ASSIGN_LINE` + `addLayer` `type:'line'` mit `assignLineFC(null,null)` + dünner gestrichelter Linie (`'line-dasharray':[2,1]`). **Kein** expliziter Teardown nötig (`map.remove()` räumt Sources/Layer ab).

- [ ] **Step 3: Rebuild-Effekte** — analog dem bestehenden Leads-Rebuild-Effekt (der `setData` bei Datenänderung macht):

```typescript
useEffect(() => {
  const map = mapRef.current
  const src = map?.getSource(SRC_CAND) as mapboxgl.GeoJSONSource | undefined
  if (src) src.setData(candidateHaloFC(data.svs, candidateSvIds))
}, [candidateSvIds, data.svs])

useEffect(() => {
  const map = mapRef.current
  const src = map?.getSource(SRC_ASSIGN_LINE) as mapboxgl.GeoJSONSource | undefined
  if (!src) return
  const sv = data.svs.find((s) => s.id === previewSvId)
  const lead = leadsRef.current.find((l) => l.id === assignLeadId)
  const from = sv?.standortLat != null && sv.standortLng != null ? [sv.standortLng, sv.standortLat] as [number, number] : null
  const to = lead ? [lead.lng, lead.lat] as [number, number] : null
  src.setData(assignLineFC(from, to))
}, [previewSvId, assignLeadId, data.svs])
```

- [ ] **Step 4: `openLeadPopup` → `onAssign` durchreichen** — im `root.render` den Prop ergänzen:

```tsx
root.render(<LeadPopup lead={lead} role={role} onAssign={(leadId) => {
  setAssignLeadId(leadId)
  popup.remove()
}} />)
```

(`popup` ist im Scope; `popup.remove()` schließt das Popup, `setAssignLeadId` öffnet den Drawer. `openLeadPopup`-Dependencies um die Setter erweitern falls nötig — Setter sind stabil, `role` bleibt die einzige echte Dep.)

- [ ] **Step 5: Drawer rendern** — im JSX (neben `DeadPinDrawer`), bedingt:

```tsx
{assignLeadId && (
  <AssignFromMapDrawer
    leadId={assignLeadId}
    leadName={leadsRef.current.find((l) => l.id === assignLeadId)?.name ?? 'Lead'}
    onCandidates={setCandidateSvIds}
    onPreviewSv={setPreviewSvId}
    onAssigned={() => { setAssignLeadId(null); setCandidateSvIds([]); setPreviewSvId(null); onRefresh?.() }}
    onClose={() => { setAssignLeadId(null); setCandidateSvIds([]); setPreviewSvId(null) }}
  />
)}
```

- [ ] **Step 6: Voll-Verifikation** — `npx tsc --noEmit` → 0. `npx vitest run src/lib/live-ops src/components/live-ops` → grün. `npm run check:token-audit` + `check:component-set -- --ratchet` + `check:knip -- --ratchet` → 0 neue. `npm run build` (`NODE_OPTIONS=--max-old-space-size=8192`) → grün (Route-Validator; bei Font-Offline-Fehler notieren, CI autoritativ).

- [ ] **Step 7: Commit** — `git commit -am "feat(dispatch-cockpit): LiveOpsMap-Verdrahtung — Assign-Drawer + Kandidaten-Halo + Verbindungslinie"`

---

## Abschluss (nach Task 5)

- Finaler Whole-Branch-Review (opus) via requesting-code-review.
- Post-Deploy-Smoke: dispatch-Login → `/dispatch/karte` → offener unzugewiesener Lead → „SV zuweisen" → Kandidat+Slot → Zuweisen → per DB-READ `gutachter_termine` (neuer `reserviert`-Eintrag mit `lead_id`+`assignee_id`) verifizieren (Test-Lead, keine echten Partner).
- PR gegen staging (stacked ist nicht nötig — dieses Branch ist off staging).

## Selbst-Review des Plans (writing-plans)

- **Spec-Coverage:** Assign-Flow (T3/T4/T5), Kandidaten-Highlight (T2/T5), Linie (T2/T5), unzugewiesen-Gate (T1/T4), dispatch/admin-Gate (T4/T5), Bestätigung (T3), ETA aus `etaFromBueroMin` (T3). ✓
- **Platzhalter:** keine — Cancel-Status-Enum ist als „gegen DB verifizieren"-Schritt markiert (kein Raten).
- **Typ-Konsistenz:** `slot.start` (nicht startIso), `sv.svId` (nicht id), `hasActiveTermin` durchgängig, Layer-Konstanten eindeutig. ✓
