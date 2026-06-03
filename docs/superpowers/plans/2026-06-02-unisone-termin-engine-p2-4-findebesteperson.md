# P2.4 — `findeBestePerson` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine assignee-generische Engine-Funktion `findeBestePerson`, die die beste buchbare Person (konkret: Sachverständiger) für einen Schadenort findet, einen erreichbaren freien Slot wählt und ihn race-sicher reserviert — als ein Einstiegspunkt für Dispatch-Auto-Matching und Self-Service-„egal wer".

**Architecture:** Das bewährte SV-Ranking aus `lib/dispatch/findBestSV` wird in die Engine **portiert** (pure `matching-score.ts`), aber Verfügbarkeit/Slot/Buchung nutzen die vorhandenen Engine-Primitive (`freieSlots`, `reserviere`) statt findBestSVs Bespoke-Slot-/Reachability-Code — echte Konsolidierung statt Copy. `findBestSV` bleibt in P2.4 unangetastet (Phase-3-Repoint macht es später zum Thin-Wrapper, additiv, 0 Dispatch-Regression). Business-Logik (Aaron 02.06.): „Pakete voll bekommen" (Paket-Prio + Rest-Kapazität) + „wer zuerst eingetreten hat im Zweifelsfall Vorrang" (Tenure-Tie-Break).

**Tech Stack:** TypeScript, Supabase (`sachverstaendige`-Pool, `v_belegung` via freieSlots, race-sicherer Exclusion-Constraint via reserviere), Mapbox Matrix (ETA Büro→Schadenort), Vitest (pure Units), tsx Live-Verify (Orchestrierung).

**Scope-Entscheidungen (Aaron, brainstorming 02.06.):**
- **Scoring:** findBestSV-Ranking in die Engine portieren (saubere End-Form).
- **Org-Scope:** thin `organisationId`-Pass-Through-Filter; `gebiet_exklusivitaeten`-Isochron-Enforcement + `rolle_in_organisation`-Whitelist **deferred** (live 0 Orgs / 0 Mitglieder / 0 Gebiete → YAGNI), dokumentierter Extension-Point.
- **Business:** „Pakete voll bekommen" = `paketPrio` (höheres Paket zuerst) + `−kontingentGenutzt` (Unterauslastung bevorzugt). „Wer zuerst eingetreten" = **Tenure-Tie-Break** (`partner_seit` → `created_at` → `id`) bei Score-Differenz im selben `SCORE_BUCKET`. Tenure überschreibt also keinen klar näheren/höheren SV.
- **Nicht-SV-Typen** (sv_lead/kundenbetreuer/kanzlei) → `code:'nicht_unterstuetzt'` (konsistent zu `freieSlots`). Skelett bleibt generisch.

**Live verifizierte DB-Fakten (02.06., Projekt paizkjajbuxxksdoycev):**
- `sachverstaendige`: 10 Zeilen, alle mit Standort; Mitgliedschaft = Spalte `organisation_id` (uuid) + `rolle_in_organisation` (text); Tenure = `partner_seit` (date, überall gesetzt, unterscheidbar 2026-04-22…05-13, 4× gleicher Tag → Sekundär-Tie-Break `created_at`). Paket-Felder: `paket`, `paket_faelle_gesamt/genutzt`, `paket_umkreis_km`, `ablehnungen_30_tage`, `urlaub_von/bis`, `isochrone_polygon`, `offene_faelle`.
- `organisationen` 0 Zeilen, `gebiet_exklusivitaeten` 0 Zeilen → Org-Maschinerie aktuell ungenutzt.
- `applyDispatchableFilter` (`@/lib/sv/queries`) = `ist_aktiv=true ∧ portal_zugang_freigeschaltet=true ∧ gesperrt_seit IS NULL ∧ geloescht_am IS NULL`.

---

## File Structure

- **Create** `src/lib/termine/engine/matching-score.ts` — pure: Score-Formel, Tenure-Tie-Break, Gebiet-Geometrie (haversine/point-in-polygon), Kontingent-Gate, Slot-Auswahl. Keine I/O.
- **Create** `src/lib/termine/engine/matching.ts` — `findeBestePerson` (I/O-Orchestrierung: Pool-Query, Mapbox-ETA, freieSlots, reserviere) + privates `waehleSlot`.
- **Create** `src/lib/termine/engine/__tests__/matching-score.test.ts` — Vitest für die pure Logik.
- **Create** `scripts/verify-engine-matching.mts` — Live-Verify gegen die echten 10 SVs (nurVorschlag seiteneffektfrei + echte Reservierung mit Cleanup).
- **Modify** `src/lib/termine/engine/index.ts` — Exports ergänzen.

**Pre-flight (frischer Worktree, einmalig):** `npm ci` im Worktree-Root (kein `node_modules` → sonst false `TS2307`; Junction laut Memory unzuverlässig).

---

## Task 1: Pure Ranking-Logik (`matching-score.ts`) — TDD

**Files:**
- Create: `src/lib/termine/engine/__tests__/matching-score.test.ts`
- Create: `src/lib/termine/engine/matching-score.ts`

- [ ] **Step 1: Pre-flight — Dependencies im Worktree installieren**

Run (Worktree-Root): `npm ci`
Expected: installiert ohne Fehler (dauert ein paar Minuten).

- [ ] **Step 2: Failing test schreiben**

Create `src/lib/termine/engine/__tests__/matching-score.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  bewerteSvKandidat, vergleicheTenure, sortiereKandidaten,
  istKontingentBlockiert, haversineKm, pointInPolygon, ersterFreierSlot,
  type RankbarerKandidat,
} from '../matching-score'
import type { TagVerfuegbarkeit } from '../types'

describe('istKontingentBlockiert', () => {
  it('basic nie blockiert', () => { expect(istKontingentBlockiert('basic', 0)).toBe(false) })
  it('nicht-basic ohne frei blockiert', () => { expect(istKontingentBlockiert('pro', 0)).toBe(true) })
  it('nicht-basic mit frei nicht blockiert', () => { expect(istKontingentBlockiert('pro', 3)).toBe(false) })
})

describe('bewerteSvKandidat', () => {
  it('höheres Paket → höherer Score', () => {
    const base = { kontingentGenutzt: 0, ablehnungen30d: 0, etaVomBueroMin: 10, distanzKm: 5 }
    expect(bewerteSvKandidat({ ...base, paket: 'pro' })).toBeGreaterThan(bewerteSvKandidat({ ...base, paket: 'standard' }))
  })
  it('mehr genutzt → niedriger Score (Pakete-voll-bekommen: Unterauslastung bevorzugt)', () => {
    const base = { paket: 'pro', ablehnungen30d: 0, etaVomBueroMin: 10, distanzKm: 5 }
    expect(bewerteSvKandidat({ ...base, kontingentGenutzt: 0 })).toBeGreaterThan(bewerteSvKandidat({ ...base, kontingentGenutzt: 5 }))
  })
  it('weitere ETA → niedriger Score', () => {
    const base = { paket: 'pro', kontingentGenutzt: 0, ablehnungen30d: 0, distanzKm: 5 }
    expect(bewerteSvKandidat({ ...base, etaVomBueroMin: 5 })).toBeGreaterThan(bewerteSvKandidat({ ...base, etaVomBueroMin: 40 }))
  })
  it('null ETA → Haversine-km als Penalty', () => {
    const s = bewerteSvKandidat({ paket: 'standard', kontingentGenutzt: 0, ablehnungen30d: 0, etaVomBueroMin: null, distanzKm: 20 })
    expect(s).toBe(1 * 100 - 20) // paketPrio(standard=1)*100 - distanzKm
  })
})

describe('vergleicheTenure', () => {
  const mk = (partnerSeit: string | null, createdAt: string | null, id: string) => ({ partnerSeit, createdAt, id })
  it('früheres partner_seit gewinnt', () => {
    expect(vergleicheTenure(mk('2026-04-22', null, 'a'), mk('2026-05-01', null, 'b'))).toBeLessThan(0)
  })
  it('gleiches partner_seit → created_at entscheidet', () => {
    expect(vergleicheTenure(mk('2026-04-22', '2026-04-22T08:00:00Z', 'a'), mk('2026-04-22', '2026-04-22T09:00:00Z', 'b'))).toBeLessThan(0)
  })
  it('null-Tenure landet hinten', () => {
    expect(vergleicheTenure(mk(null, null, 'a'), mk('2026-04-22', null, 'b'))).toBeGreaterThan(0)
  })
})

describe('sortiereKandidaten', () => {
  const mk = (score: number, partnerSeit: string, id: string): RankbarerKandidat => ({ score, partnerSeit, createdAt: null, id })
  it('klar höherer Score gewinnt (überschreibt Tenure)', () => {
    const r = sortiereKandidaten([mk(100, '2026-01-01', 'alt'), mk(250, '2026-09-01', 'neu')])
    expect(r[0].id).toBe('neu')
  })
  it('gleicher Bucket ("Zweifelsfall") → früherer Partner gewinnt', () => {
    const r = sortiereKandidaten([mk(200, '2026-09-01', 'neu'), mk(202, '2026-01-01', 'alt')])
    expect(r[0].id).toBe('alt')
  })
})

describe('ersterFreierSlot', () => {
  const tag = (datum: string, slots: { uhrzeit: string; dauer: number }[]): TagVerfuegbarkeit =>
    ({ datum, wochentag: 'Mo', frei: slots.length > 0, anzahl_slots: slots.length, slots })
  it('frühester Tag mit Slot', () => {
    const r = ersterFreierSlot([tag('2026-06-10', []), tag('2026-06-11', [{ uhrzeit: '09:00', dauer: 45 }, { uhrzeit: '10:30', dauer: 45 }])])
    expect(r).toEqual({ datum: '2026-06-11', uhrzeit: '09:00', dauerMin: 45 })
  })
  it('keine Slots → null', () => {
    expect(ersterFreierSlot([tag('2026-06-10', [])])).toBeNull()
  })
})

describe('haversineKm + pointInPolygon', () => {
  it('haversine ~0 für identische Punkte', () => { expect(haversineKm(52.5, 13.4, 52.5, 13.4)).toBeCloseTo(0, 5) })
  it('pointInPolygon: drin/draußen', () => {
    const quad: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]]
    expect(pointInPolygon([5, 5], quad)).toBe(true)
    expect(pointInPolygon([15, 5], quad)).toBe(false)
  })
})
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/termine/engine/__tests__/matching-score.test.ts`
Expected: FAIL — „Cannot find module '../matching-score'".

- [ ] **Step 4: Implementierung schreiben**

Create `src/lib/termine/engine/matching-score.ts`:

```ts
// P2.4 — Pure SV-Ranking-Logik der Termin-Engine (portiert aus lib/dispatch/findBestSV).
// KEINE I/O. Score-Formel, Tenure-Tie-Break, Gebiet-Geometrie, Slot-Auswahl — rein,
// testbar, an EINER Stelle tunebar. Business (Aaron 02.06.):
//   - "Pakete voll bekommen": paketPrio (höheres Paket zuerst) + Rest-Kapazität (-genutzt).
//   - "Wer zuerst eingetreten hat im Zweifelsfall Vorrang": Tenure-Tie-Break bei ~gleichem Score.
import type { TagVerfuegbarkeit } from './types'

export const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
  basic: 0,
}

// Score-Gewichte (höher = besser). Mirror der findBestSV-Formel; hier die eine Quelle.
export const W_PAKET = 100
export const W_KONTINGENT_GENUTZT = 2
export const W_ABLEHNUNG = 2
export const W_ETA_MIN = 0.5
// "Zweifelsfall"-Granularität: Kandidaten im selben Score-Bucket gelten als gleich gut
// → Tenure entscheidet. 5 ≈ 10 ETA-Minuten Unterschied. Tunebar.
export const SCORE_BUCKET = 5

/** Basic-SVs (paket='basic') haben kein Fall-Kontingent — rein kalenderbasiert, nie blockiert. */
export function istKontingentBlockiert(paket: string, kontingentFrei: number): boolean {
  if (paket === 'basic') return false
  return kontingentFrei <= 0
}

export interface SvKandidatFeatures {
  paket: string
  kontingentGenutzt: number
  ablehnungen30d: number
  /** echte Mapbox-ETA Büro→Schadenort in Minuten; null → Haversine-km als Fallback-Penalty. */
  etaVomBueroMin: number | null
  distanzKm: number
}

/** Reiner SV-Score (höher = besser). "Pakete voll bekommen" = paketPrio + Rest-Kapazität bevorzugt. */
export function bewerteSvKandidat(f: SvKandidatFeatures): number {
  const paketPrio = PAKET_PRIO[f.paket] ?? 1
  const distanzPenalty = f.etaVomBueroMin != null ? f.etaVomBueroMin * W_ETA_MIN : f.distanzKm
  return paketPrio * W_PAKET
    - f.kontingentGenutzt * W_KONTINGENT_GENUTZT
    - f.ablehnungen30d * W_ABLEHNUNG
    - distanzPenalty
}

export interface TenureInfo {
  partnerSeit: string | null
  createdAt: string | null
  id: string
}

/**
 * Tenure-Tie-Break (Aaron: "wer zuerst eingetreten ist hat im Zweifelsfall Vorrang").
 * < 0 = a vor b. Frühestes partner_seit zuerst → dann created_at → dann id (deterministisch).
 * Unbekannte Tenure (null) landet hinten.
 */
export function vergleicheTenure(a: TenureInfo, b: TenureInfo): number {
  const pa = a.partnerSeit ?? a.createdAt
  const pb = b.partnerSeit ?? b.createdAt
  if (pa && pb) { if (pa !== pb) return pa < pb ? -1 : 1 }
  else if (pa) return -1
  else if (pb) return 1
  const ca = a.createdAt, cb = b.createdAt
  if (ca && cb) { if (ca !== cb) return ca < cb ? -1 : 1 }
  else if (ca) return -1
  else if (cb) return 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export interface RankbarerKandidat extends TenureInfo {
  score: number
}

/**
 * Sortiert absteigend nach Score-Bucket; bei gleichem Bucket ("Zweifelsfall") entscheidet
 * Tenure. Proper total order (transitiv über Bucket-Quantisierung) → deterministisch.
 */
export function sortiereKandidaten<T extends RankbarerKandidat>(kandidaten: T[]): T[] {
  const bucket = (s: number) => Math.round(s / SCORE_BUCKET)
  return [...kandidaten].sort((a, b) => {
    const ba = bucket(a.score), bb = bucket(b.score)
    if (ba !== bb) return bb - ba
    return vergleicheTenure(a, b)
  })
}

/** Haversine-Distanz in km (mirror findBestSV; Engine-eigen für Gebiet-Check + Fallback-Penalty). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Point-in-Polygon (ray-casting). polygon = [lng,lat][] (parseIsochrone-Format). */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Frühester freier Slot aus freieSlots-Ergebnis (Wall-Clock-Teile, TZ-stabil). null = keiner. */
export function ersterFreierSlot(
  tage: TagVerfuegbarkeit[],
): { datum: string; uhrzeit: string; dauerMin: number } | null {
  for (const t of tage) {
    if (t.slots.length > 0) {
      const s = t.slots[0]
      return { datum: t.datum, uhrzeit: s.uhrzeit, dauerMin: s.dauer }
    }
  }
  return null
}
```

- [ ] **Step 5: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/lib/termine/engine/__tests__/matching-score.test.ts`
Expected: PASS (alle ~15 Assertions grün).

- [ ] **Step 6: `</content>`-Artefakt-Scan + Commit**

Scan beide neuen Dateien auf ein literales `</content>` am Ende (Write-Tool-Bug, siehe Memory) und entferne es falls vorhanden.

```bash
git add src/lib/termine/engine/matching-score.ts src/lib/termine/engine/__tests__/matching-score.test.ts
git commit -m "feat(termin-engine): P2.4 Teil 1 — pure SV-Ranking (Score + Tenure-Tie-Break) portiert"
```

---

## Task 2: Orchestrierung (`matching.ts` + index) — Implementierung + Stub-Test

> **Test-Stil (Strecke-Konvention, Handoff):** DB-Orchestrierung wird per **Live-Verify** (Task 3) bewiesen, nicht per Vitest-Mock. Hier nur ein schlanker Stub-Test für den seiteneffektfreien Frühausstieg + `tsc`.

**Files:**
- Create: `src/lib/termine/engine/matching.ts`
- Modify: `src/lib/termine/engine/index.ts`
- Modify: `src/lib/termine/engine/__tests__/matching-score.test.ts` (Stub-Test anhängen)

- [ ] **Step 1: Implementierung schreiben**

Create `src/lib/termine/engine/matching.ts`:

```ts
// P2.4 — findeBestePerson: assignee-generische Org-/Region-Level-Buchung.
// Pickt die beste buchbare Person (Score + Tenure-Tie-Break), wählt einen erreichbaren
// freien Slot (engine freieSlots) und reserviert ihn (engine reserviere, race-sicher).
// Konkret implementiert für assignee_typ='sachverstaendiger' (Pool sachverstaendige);
// andere Typen → 'nicht_unterstuetzt' (wie freieSlots).
//
// Port-Hinweis (Aaron 02.06.): das SV-Ranking ist aus lib/dispatch/findBestSV in die Engine
// portiert (matching-score.ts). findBestSV bleibt vorerst unangetastet; der Phase-3-Repoint
// macht es zum Thin-Wrapper. parseIsochrone/mapboxEtaMatrix werden als stabile pure Utils
// importiert (kein Re-Derive).
//
// Org-Scope (P2.4): nur thin organisationId-Pass-Through. gebiet_exklusivitaeten +
// rolle_in_organisation sind DEFERRED (live 0 Orgs/0 Gebiete) — Extension-Point unten markiert.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, BezugTyp } from './types'
import { reserviere, type Quelle, type TerminTyp } from './writes'
import { pruefeBelegungStrict } from './belegung'
import { freieSlots } from './slots'
import {
  bewerteSvKandidat, sortiereKandidaten, istKontingentBlockiert,
  haversineKm, pointInPolygon, ersterFreierSlot, type RankbarerKandidat,
} from './matching-score'
import { applyDispatchableFilter } from '@/lib/sv/queries'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'

const DEFAULT_FENSTER_TAGE = 28

export interface FindeBestePersonInput {
  schadenort: { lat: number; lng: number }
  bezug: { typ: BezugTyp; id: string }
  quelle: Quelle
  wunschterminIso?: string | null
  dauerMin?: number
  fensterTage?: number
  /** Thin Org-Hook: schränkt den Pool auf sachverstaendige.organisation_id ein. */
  organisationId?: string | null
  excludeAssigneeIds?: string[]
  topN?: number
  /** true = Rangliste + Slot-Vorschlag OHNE reserviere (Dispatch-"Vorschlagen"). */
  nurVorschlag?: boolean
  typ?: TerminTyp
  assigneeTyp?: 'sachverstaendiger'
  db?: SupabaseClient
}

export interface PersonKandidat {
  assignee: Assignee
  name: string
  score: number
  distanzKm: number
  etaVomBueroMin: number | null
  slotVon: string | null
  slotBis: string | null
  reasons: string[]
}

export type FindeBestePersonResult =
  | {
      ok: true; gebucht: true
      assignee: Assignee; terminId: string; reserviertBis: string
      slotVon: string; slotBis: string
      kandidat: PersonKandidat; alternativen: PersonKandidat[]
    }
  | { ok: true; gebucht: false; kandidaten: PersonKandidat[] }
  | { ok: false; code: 'kein_kandidat' | 'kein_slot' | 'belegt' | 'db' | 'nicht_unterstuetzt'; error: string }

interface SvRow {
  id: string
  profile_id: string | null
  paket: string | null
  standort_lat: number | null
  standort_lng: number | null
  isochrone_polygon: unknown
  paket_umkreis_km: number | null
  paket_faelle_gesamt: number | null
  paket_faelle_genutzt: number | null
  offene_faelle: number | null
  ablehnungen_30_tage: number | null
  urlaub_von: string | null
  urlaub_bis: string | null
  partner_seit: string | null
  created_at: string | null
  profiles:
    | { vorname: string | null; nachname: string | null }
    | { vorname: string | null; nachname: string | null }[]
    | null
}

export async function findeBestePerson(input: FindeBestePersonInput): Promise<FindeBestePersonResult> {
  const {
    schadenort, bezug, quelle,
    wunschterminIso = null,
    dauerMin = TERMIN_DAUER_MIN,
    fensterTage = DEFAULT_FENSTER_TAGE,
    organisationId = null,
    excludeAssigneeIds = [],
    topN = 3,
    nurVorschlag = false,
    typ = 'sv_begutachtung',
    assigneeTyp = 'sachverstaendiger',
  } = input

  if (assigneeTyp !== 'sachverstaendiger') {
    return { ok: false, code: 'nicht_unterstuetzt', error: `findeBestePerson: assignee_typ '${assigneeTyp}' noch nicht unterstuetzt (P2.4: nur sachverstaendiger)` }
  }
  const db: SupabaseClient = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()

  // 1. Pool: dispatchable SVs (+ optional Org-Filter, thin Hook).
  // DEFERRED Extension-Point: hier später rolle_in_organisation-Whitelist +
  // gebiet_exklusivitaeten-Isochron-Intersection einhängen (live 0 Daten → YAGNI).
  let query = db.from('sachverstaendige').select(
    'id, profile_id, paket, standort_lat, standort_lng, isochrone_polygon, paket_umkreis_km, '
    + 'paket_faelle_gesamt, paket_faelle_genutzt, offene_faelle, ablehnungen_30_tage, '
    + 'urlaub_von, urlaub_bis, partner_seit, created_at, '
    + 'profiles!sachverstaendige_profile_id_fkey(vorname, nachname)',
  )
  if (organisationId) query = query.eq('organisation_id', organisationId)
  const { data: svRaw, error: svErr } = await applyDispatchableFilter(query)
  if (svErr) return { ok: false, code: 'db', error: svErr.message }
  const exclude = new Set(excludeAssigneeIds)
  const pool = ((svRaw ?? []) as unknown as SvRow[]).filter(
    (sv) => !exclude.has(sv.id) && sv.standort_lat != null && sv.standort_lng != null,
  )
  if (pool.length === 0) return { ok: false, code: 'kein_kandidat', error: 'Keine buchbaren SVs im Pool' }

  // 2. Gebiet-Filter (Isochrone ODER Radius) + Kontingent — billige Geo/Logik VOR Mapbox.
  type ImGebiet = { sv: SvRow; distanzKm: number; reasons: string[] }
  const imGebiet: ImGebiet[] = []
  for (const sv of pool) {
    const paket = sv.paket || 'standard'
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    if (istKontingentBlockiert(paket, kontingentGesamt - kontingentGenutzt)) continue
    const distanzKm = haversineKm(Number(sv.standort_lat), Number(sv.standort_lng), schadenort.lat, schadenort.lng)
    const polygon = parseIsochrone(sv.isochrone_polygon)
    const radius = Number(sv.paket_umkreis_km) || 40
    const reasons: string[] = []
    let drin = false
    if (polygon && pointInPolygon([schadenort.lng, schadenort.lat], polygon)) { drin = true; reasons.push('im Einsatzgebiet (Isochrone)') }
    if (!drin && distanzKm <= radius) { drin = true; reasons.push(`${Math.round(distanzKm)}km (max ${radius}, Radius)`) }
    if (drin) imGebiet.push({ sv, distanzKm, reasons })
  }
  if (imGebiet.length === 0) return { ok: false, code: 'kein_kandidat', error: 'Kein SV im Einsatzgebiet' }

  // 3. Mapbox-ETA Büro→Schadenort (eine Matrix-Call) nur für in-Gebiet-SVs.
  const etaArr = await mapboxEtaMatrix(
    { lat: schadenort.lat, lng: schadenort.lng },
    imGebiet.map((g) => ({ lat: Number(g.sv.standort_lat), lng: Number(g.sv.standort_lng) })),
  )

  // 4. Score + Tenure-Felder.
  type Bewertet = PersonKandidat & RankbarerKandidat & { sv: SvRow }
  const bewertet: Bewertet[] = imGebiet.map((g, i) => {
    const sv = g.sv
    const paket = sv.paket || 'standard'
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const ablehnungen30d = Number(sv.ablehnungen_30_tage) || 0
    const etaVomBueroMin = etaArr[i] ?? null
    const score = bewerteSvKandidat({ paket, kontingentGenutzt, ablehnungen30d, etaVomBueroMin, distanzKm: g.distanzKm })
    const profile = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
    const reasons = [...g.reasons, `Paket: ${paket}`]
    if (etaVomBueroMin != null) reasons.push(`${etaVomBueroMin} min Fahrt vom Büro`)
    return {
      assignee: { typ: 'sachverstaendiger', id: sv.id },
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : '—',
      score, distanzKm: Math.round(g.distanzKm * 10) / 10, etaVomBueroMin,
      slotVon: null, slotBis: null, reasons,
      partnerSeit: sv.partner_seit, createdAt: sv.created_at, id: sv.id, sv,
    }
  })

  // 5. Sortieren (Score-Bucket + Tenure-Tie-Break), Top-N je einen Slot via freieSlots wählen.
  const sortiert = sortiereKandidaten(bewertet)
  const fensterVonIso = new Date().toISOString()
  const fensterBisIso = new Date(Date.now() + fensterTage * 24 * 60 * 60_000).toISOString()
  const mitSlot: PersonKandidat[] = []
  for (const k of sortiert.slice(0, Math.max(topN, 1))) {
    const slot = await waehleSlot(k.assignee, k.sv, wunschterminIso, dauerMin, fensterVonIso, fensterBisIso, schadenort, db)
    mitSlot.push({
      assignee: k.assignee, name: k.name, score: k.score, distanzKm: k.distanzKm,
      etaVomBueroMin: k.etaVomBueroMin, reasons: k.reasons,
      slotVon: slot?.von ?? null, slotBis: slot?.bis ?? null,
    })
  }

  if (nurVorschlag) return { ok: true, gebucht: false, kandidaten: mitSlot }

  // 6. reserviere auf den ersten Kandidaten mit Slot; bei 'belegt' (Race) den nächsten.
  const buchbar = mitSlot.filter((k) => k.slotVon && k.slotBis)
  if (buchbar.length === 0) return { ok: false, code: 'kein_slot', error: 'Kein freier Slot im Fenster' }
  let letzterFehler = 'Slot belegt'
  for (const k of buchbar) {
    const res = await reserviere({ assignee: k.assignee, von: k.slotVon!, bis: k.slotBis!, quelle, typ, bezug, db })
    if (res.ok) {
      return {
        ok: true, gebucht: true, assignee: k.assignee, terminId: res.terminId, reserviertBis: res.reserviertBis,
        slotVon: k.slotVon!, slotBis: k.slotBis!, kandidat: k,
        alternativen: mitSlot.filter((x) => x.assignee.id !== k.assignee.id),
      }
    }
    if (res.code !== 'belegt') return { ok: false, code: 'db', error: res.error }
    letzterFehler = res.error
  }
  return { ok: false, code: 'belegt', error: letzterFehler }
}

/**
 * Wählt einen buchbaren Slot: Wunschtermin (exakte Belegungsprüfung) bevorzugt, sonst
 * frühester erreichbarer freier Slot via freieSlots. Urlaub wird als zusaetzlicheBelegung
 * injiziert (freieSlots kennt nur v_belegung).
 */
async function waehleSlot(
  assignee: Assignee, sv: SvRow, wunschterminIso: string | null, dauerMin: number,
  fensterVonIso: string, fensterBisIso: string, schadenort: { lat: number; lng: number }, db: SupabaseClient,
): Promise<{ von: string; bis: string } | null> {
  const urlaub = sv.urlaub_von && sv.urlaub_bis ? [{ start: sv.urlaub_von, end: sv.urlaub_bis }] : []
  // Wunschtermin bevorzugt: exakte Belegungsprüfung (final race-sicher via reserviere).
  if (wunschterminIso) {
    const wunsch = new Date(wunschterminIso)
    const inUrlaub = !!sv.urlaub_von && !!sv.urlaub_bis
      && wunsch.getTime() >= new Date(sv.urlaub_von).getTime()
      && wunsch.getTime() <= new Date(sv.urlaub_bis).getTime()
    const wunschIso = Number.isNaN(wunsch.getTime()) ? null : wunsch.toISOString()
    if (wunschIso && !inUrlaub && wunschIso >= fensterVonIso && wunschIso <= fensterBisIso) {
      const bisIso = new Date(wunsch.getTime() + dauerMin * 60_000).toISOString()
      const pre = await pruefeBelegungStrict(assignee, wunschIso, bisIso, db)
      if (pre.ok && pre.frei) return { von: wunschIso, bis: bisIso }
    }
  }
  // Sonst: frühester erreichbarer freier Slot.
  const tage = await freieSlots(assignee, fensterVonIso, fensterBisIso, { schadenort, zusaetzlicheBelegung: urlaub }, db)
  const slot = ersterFreierSlot(tage)
  if (!slot) return null
  const [h, m] = slot.uhrzeit.split(':').map(Number)
  const von = new Date(`${slot.datum}T00:00:00`)
  von.setHours(h, m, 0, 0)
  return { von: von.toISOString(), bis: new Date(von.getTime() + slot.dauerMin * 60_000).toISOString() }
}
```

- [ ] **Step 2: Exports in `index.ts` ergänzen**

Append to `src/lib/termine/engine/index.ts`:

```ts
// P2.4 — findeBestePerson (Org-/Region-Level-Matching + Auto-Reservierung).
export { findeBestePerson } from './matching'
export type { FindeBestePersonInput, FindeBestePersonResult, PersonKandidat } from './matching'
export {
  bewerteSvKandidat, sortiereKandidaten, vergleicheTenure, istKontingentBlockiert,
  haversineKm, pointInPolygon, ersterFreierSlot,
  PAKET_PRIO, W_PAKET, W_KONTINGENT_GENUTZT, W_ABLEHNUNG, W_ETA_MIN, SCORE_BUCKET,
} from './matching-score'
export type { SvKandidatFeatures, TenureInfo, RankbarerKandidat } from './matching-score'
```

- [ ] **Step 3: Stub-Test anhängen (seiteneffektfreier Frühausstieg, injizierte DB)**

Append to `src/lib/termine/engine/__tests__/matching-score.test.ts`:

```ts
import { findeBestePerson } from '../matching'

describe('findeBestePerson — Frühausstiege (Stub-DB, kein Netzwerk)', () => {
  // Minimaler Supabase-Stub: select-Kette endet in einem awaitable mit { data: [] }.
  const leererPoolDb = {
    from: () => ({
      select: () => ({
        eq: function () { return this },
        is: function () { return this },
        not: function () { return this },
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      }),
    }),
  } as unknown as Parameters<typeof findeBestePerson>[0]['db']

  it('leerer Pool → kein_kandidat (ohne Mapbox/Netzwerk)', async () => {
    const r = await findeBestePerson({
      schadenort: { lat: 52.5, lng: 13.4 },
      bezug: { typ: 'lead', id: '00000000-0000-0000-0000-000000000000' },
      quelle: 'dispatch',
      db: leererPoolDb,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('kein_kandidat')
  })

  it('nicht unterstützter assignee_typ → nicht_unterstuetzt', async () => {
    const r = await findeBestePerson({
      schadenort: { lat: 52.5, lng: 13.4 },
      bezug: { typ: 'lead', id: '00000000-0000-0000-0000-000000000000' },
      quelle: 'dispatch',
      // @ts-expect-error — bewusst ungültiger Typ für den Guard-Test
      assigneeTyp: 'kanzlei',
      db: leererPoolDb,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('nicht_unterstuetzt')
  })
})
```

- [ ] **Step 4: Tests laufen lassen — grün**

Run: `npx vitest run src/lib/termine/engine/__tests__/matching-score.test.ts`
Expected: PASS (pure Units + 2 Stub-Tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Fehler (`**/*.mts` ist im tsconfig-Scope; matching.ts + Tests typen sauber).

- [ ] **Step 6: `</content>`-Scan + Commit**

Scan `matching.ts` + `index.ts` auf literales `</content>` am Ende, entfernen falls vorhanden.

```bash
git add src/lib/termine/engine/matching.ts src/lib/termine/engine/index.ts src/lib/termine/engine/__tests__/matching-score.test.ts
git commit -m "feat(termin-engine): P2.4 Teil 2 — findeBestePerson (Pool→Score→freieSlots→reserviere) + Org-thin-Hook"
```

---

## Task 3: Live-Verify (`scripts/verify-engine-matching.mts`)

**Files:**
- Create: `scripts/verify-engine-matching.mts`

- [ ] **Step 1: Verify-Script schreiben**

Create `scripts/verify-engine-matching.mts`:

```ts
// P2.4 Verify: findeBestePerson live gegen die echten dispatchbaren SVs. Nutzt EINEN
// SV-Standort als Schadenort (Distanz 0 → garantiert im Gebiet), prüft nurVorschlag
// (seiteneffektfrei) UND eine echte Reservierung (mit Cleanup). JSON-VERDICT.
// Run (Worktree-Root): cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-matching.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { findeBestePerson } = await import('@/lib/termine/engine')
const db = createAdminClient()

const out: Record<string, unknown> = {}
let createdTerminId: string | null = null
try {
  // Ankerpunkt: ein dispatchbarer SV-Standort als Schadenort (Distanz 0 → im Gebiet).
  const { data: sv } = await db.from('sachverstaendige')
    .select('id, standort_lat, standort_lng')
    .eq('ist_aktiv', true).eq('portal_zugang_freigeschaltet', true)
    .is('gesperrt_seit', null).is('geloescht_am', null)
    .not('standort_lat', 'is', null).limit(1).maybeSingle()
  const { data: lead } = await db.from('leads').select('id').limit(1).maybeSingle()

  if (!sv?.standort_lat || !lead?.id) {
    out.VERDICT = 'SKIPPED (kein dispatchbarer SV mit Standort oder kein lead vorhanden)'
  } else {
    const schadenort = { lat: Number(sv.standort_lat), lng: Number(sv.standort_lng) }
    const bezug = { typ: 'lead' as const, id: lead.id as string }

    // (1) nurVorschlag — seiteneffektfrei.
    const vorschlag = await findeBestePerson({ schadenort, bezug, quelle: 'dispatch', nurVorschlag: true, db })
    const vorschlagOk = vorschlag.ok && vorschlag.gebucht === false && vorschlag.kandidaten.length > 0
    out.vorschlag = {
      ok: vorschlag.ok,
      n: vorschlag.ok && !vorschlag.gebucht ? vorschlag.kandidaten.length : 0,
      top: vorschlag.ok && !vorschlag.gebucht ? vorschlag.kandidaten[0] : null,
    }

    // (2) echte Reservierung + Cleanup.
    const real = await findeBestePerson({ schadenort, bezug, quelle: 'dispatch', db })
    let realOk = false
    if (real.ok && real.gebucht) {
      createdTerminId = real.terminId
      realOk = true
      out.gebucht = { assignee: real.assignee, terminId: real.terminId, slotVon: real.slotVon, reserviertBis: real.reserviertBis }
    } else {
      out.gebucht = real
    }
    out.VERDICT = vorschlagOk && realOk ? 'GRUEN' : 'FEHLER'
  }
} finally {
  if (createdTerminId) {
    const { error } = await db.from('gutachter_termine').delete().eq('id', createdTerminId)
    out.cleanup = error ? `FEHLER: ${error.message}` : `geloescht ${createdTerminId}`
  }
}
console.log(JSON.stringify(out, null, 2))
```

- [ ] **Step 2: Verify laufen lassen (Controller, gegen Prod-DB)**

Run (Worktree-Root, git-bash): `cp "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local" .env.local && npx tsx scripts/verify-engine-matching.mts && rm -f .env.local`
(PowerShell-Variante: `Copy-Item "C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\.env.local" .env.local; npx tsx scripts/verify-engine-matching.mts; Remove-Item .env.local`)
Expected: JSON mit `"VERDICT": "GRUEN"`, `vorschlag.n >= 1`, `gebucht.terminId` gesetzt, `cleanup: "geloescht …"`.

- [ ] **Step 3: tsc inkl. .mts**

Run: `npx tsc --noEmit`
Expected: 0 Fehler (Verify-Script ist im tsconfig-Scope).

- [ ] **Step 4: `</content>`-Scan + Commit**

Scan das Script auf literales `</content>` am Ende, entfernen falls vorhanden.

```bash
git add scripts/verify-engine-matching.mts
git commit -m "test(termin-engine): P2.4 Verify — findeBestePerson live (Vorschlag + echte Reservierung + Cleanup)"
```

---

## Task 4: 7-Punkte-Audit + PR gegen `staging`

**Files:** keine Code-Änderung — Audit + Push.

- [ ] **Step 1: Build-Gate final**

Run: `npx tsc --noEmit`
Expected: 0 Fehler. (Voller `next build` nicht nötig — kein Routen-/Layout-/Server-Action-Change; reine lib + script.)

- [ ] **Step 2: Regression-/Redundanz-Check dokumentieren**

- Konsumenten von `findeBestePerson`: **noch keine** (additiv; Phase-3-Repoint verdrahtet Dispatch/Self-Service). `findBestSV` unverändert → 0 Dispatch-Regression.
- Redundanz: Score/Geo bewusst in `matching-score.ts` zentralisiert; `parseIsochrone`/`mapboxEtaMatrix` importiert statt re-derived; `haversine`/`pointInPolygon` spiegeln findBestSV (DRY-Konsolidierung Phase 3, dokumentiert).
- Run zum Beleg: `git -C . grep -n "findeBestePerson" src/ | cat` → nur Engine-intern + index.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin kitta/termin-engine-p2-4
gh pr create --base staging --title "feat(termin-engine): P2.4 — findeBestePerson (Org-/Region-Matching + Auto-Reservierung)" --body "<Audit-Body, Format siehe unten>"
```

PR-Body Audit-Block:
```
Audit:
- Build: grün (npx tsc --noEmit; kein Routen-Change → kein next build nötig)
- UI: n/a (Engine-lib, kein UI-Change; Einstiegspunkt kommt mit Phase-3-Repoint)
- Redundanz: Score/Geo in matching-score.ts zentral; parseIsochrone/mapbox importiert; findBestSV unangetastet
- Dead-Code: nichts gelöscht; nur additiv (3 neue Files + index-Export)
- Spec: findeBestePerson §5/§6d des Strecke-Designs; Scoring=Port, Org=thin-Hook (Aaron-Entscheidung 02.06.); gebiet_exklusivitaeten/rolle deferred (0 Daten)
- Inkonsistenz: Result-Object {ok,code}; DB-Spalten live verifiziert (partner_seit/paket_*/urlaub_*); Umlaute in Kommentaren ok
- Regression: 0 Consumer (additiv); findBestSV/Dispatch unberührt; Live-Verify GRUEN (Vorschlag + Reservierung + Cleanup)
```

- [ ] **Step 4: NICHT mergen**

Diese Session ist **nicht die Merge-Session** → PR offen lassen, Aaron/Merge-Session reviewt + merged.

---

## Self-Review (Plan gegen Spec)

**Spec-Coverage** (Strecke-Design §5/§6d + Handoff §P2.4):
- „pickt beste verfügbare Person (Auslastung + Distanz + Verfügbarkeit) → reserviere" → Task 2 (Score + freieSlots + reserviere). ✓
- „Filter: nur buchbare Rollen / nur exklusives Gebiet" → Gebiet via Isochrone/Radius ✓; `rolle_in_organisation`/`gebiet_exklusivitaeten` **bewusst deferred** (0 Daten, Aaron-Entscheidung) — Extension-Point markiert. ✓
- „Org-Modell organisationen" → thin `organisationId`-Filter ✓.
- „Reachability/ETA first-class" → freieSlots(`{schadenort}`) liefert nur erreichbare Slots + Mapbox-ETA im Score ✓.
- „Deckt Dispatch-Auto-Matching (findBestSV) + Self-Service-'egal wer'" → gleiche Pool-/Score-Logik portiert; `nurVorschlag` für Dispatch-„Vorschlagen", direkt-reservieren für „egal wer" ✓.
- Business (Aaron 02.06.): „Pakete voll bekommen" (paketPrio + Kapazität) + Tenure-Tie-Break ✓ (Task 1).

**Placeholder-Scan:** kein TBD/TODO; jeder Step hat realen Code + Run-Command + erwartete Ausgabe. ✓

**Typ-Konsistenz:** `SvKandidatFeatures`/`RankbarerKandidat`/`TenureInfo` aus Task 1 == in Task 2 importiert; `FindeBestePersonResult`-Diskriminanten (`gebucht`, `code`) konsistent zwischen matching.ts, Stub-Test, Verify-Script. `ersterFreierSlot`-Rückgabe `{datum,uhrzeit,dauerMin}` == waehleSlot-Nutzung. ✓

**Bekannte, bewusste Grenzen (dokumentiert, kein Plan-Fehler):**
- Wunschtermin mit beliebiger Minute → exakte `pruefeBelegungStrict`-Prüfung (kein separater Reachability-Check auf dem Wunschtermin; Fallback-Slot ist reachability-gefiltert). Verfeinerung beim Phase-3-Dispatch-Repoint.
- Urlaub als grobes `[von,bis]`-Fenster (wie findBestSV) via `zusaetzlicheBelegung`.
- Score-Formel temporär doppelt (Engine + findBestSV) bis Phase-3-Repoint sie kollabiert.
