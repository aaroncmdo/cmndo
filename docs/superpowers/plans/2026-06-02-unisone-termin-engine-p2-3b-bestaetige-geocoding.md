# Unisone Termin-Engine — Phase 2.3b (bestaetige + Geocoding-Garantie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) oder executing-plans. Steps mit Checkbox (`- [ ]`). **0 DDL** (reiner Code). Verify-RUN braucht volle node_modules (`npm ci`) + Geocoding-ENV (mapbox/google Keys aus `.env.local`).

**Goal:** Der **Kern-Auftrag** (Aaron): „der SV muss verlässlich am Besichtigungsort ankommen." `bestaetige(terminId)` **resolved + geocodet** das Vor-Ort-Ziel und cached Koordinaten am Termin — **ohne geocodebares Ziel wird NICHT bestätigt** (Result-Error, Dispatch sieht's). Remote-Termine (`kanal IN (video,telefon)`) ausgenommen. Plus CMM-73-Daten-Fix (erstgutachten-Auftrag) — ohne `v_claim_phase`-Umbau.

**Architecture:** Reiner Code, eigene Files (unabhängig von P2.3a `writes.ts`/#2240 — das ist noch nicht auf staging). `engine/geocode.ts` = `geocodeMitFallback` (mapbox `geocodeAdresse` bevorzugt → google `geocodeAddress` Fallback; **injizierbar** für Unit-Tests). `engine/besichtigungsort.ts` = `resolveBesichtigungsort` (Auflösungs-Kette Termin → Lead/Fall/Claim, bevorzugt vorhandene lat/lng, geocodet Adress-Strings). `engine/bestaetige.ts` = `bestaetige` (geocode-or-refuse → status=bestaetigt + final_verbindlich_ab → CMM-73 erstgutachten best-effort → Timeline). **Notifications (WA T4/Email S-E6/SLA) bewusst NICHT hier** — die laufen weiter über `bestaetigung.ts:bestaetigeTermin` bis Phase-3-Repoint die Caller umstellt + den Notifier portiert (sonst doppelte Sends). `bestaetige` ist NICHT verdrahtet.

**Tech Stack:** TypeScript/Next.js 16, Vitest (injizierte Geocoder/db = keine externen Calls im Unit-Test), tsx-Verify (live Geocoding). Build-Gate `npx tsc --noEmit`. **Keine Migration.**

---

## ⚠️ Koordination

- **Regel 1** PR gegen staging · **Regel 3** kein Stash. **Keine DDL** → Regel 2 n/a.
- **Branch:** `kitta/termin-engine-p2-3b`, frisch aus `origin/staging`. Nutzt nur Staging-Vorhandenes (Engine P2.1a/b/c gemergt, besichtigungsort_*-Spalten live, `auftrag/create.ts`, Geocoding-Libs). `index.ts`-Export-Zeile kann mit #2240 (P2.3a) leicht kollidieren (beide ergänzen Exports) → trivialer Merge-Resolve.
- **Geocoding-Provider:** mapbox bevorzugt (= Routing/ETA-Backbone, findBestSV nutzt `geocodeAdresse` → Koordinaten-Konsistenz), google als Fallback (oft genauer für DE) → maximiert die Garantie. ENV: `MAPBOX_TOKEN`/`NEXT_PUBLIC_MAPBOX_TOKEN` + `GOOGLE_MAPS_SERVER_KEY`/`NEXT_PUBLIC_GOOGLE_MAPS_KEY`.
- 7-Punkte-Audit je Commit. **[[Write-Tool </content>-Artefakt]]** nach jedem Write scannen.

---

## Live-Grounding (02.06.2026, verifiziert)

- **Geocoding-Funktionen:** `src/lib/mapbox/geocode.ts` `geocodeAdresse(adresse:string): Promise<{lat,lng,formatted,placeId}|null>` (null bei Fehler/leer/kein-Token, 5s-Timeout, country=de). `src/lib/google-geocoding/geocode-address.ts` `geocodeAddress(rawAddress:string): Promise<{ok:true,data:{lat,lng,formatted_address,place_id}}|{ok:false,error}>` (region=de).
- **Ziel-Spalten (Schema verifiziert):** `gutachter_termine`: `besichtigungsort_lat/lng/adresse/place_id`. `leads`: `besichtigungsort_*`, `fahrzeug_standort_lat/lng/adresse`, `kunde_adresse/strasse/plz`. `faelle`: `besichtigungsort_*`, `kunde_adresse/strasse/plz`. `claims`: `schadenort_lat/lng/adresse`.
- **CMM-73-Helper:** `src/lib/auftrag/create.ts` `createErstgutachtenAuftragWennNoetig(admin, fallId, svId, terminIds): {auftragId, error?}` — **idempotent** (prüft existing per fall_id+typ), inserted `auftraege(fall_id, sv_id, typ='erstgutachten', status='termin', reihenfolge:1)`, hängt terminIds an. `claim_id` füllt ein Sync-Trigger (auftraege.claim_id NOT NULL). `auftraege.fall_id` ist **NOT NULL** → erstgutachten-Anlage ist fall_id-gebunden (best-effort wenn fall_id+sv_id vorhanden). status-CHECK `termin/besichtigung/gutachten/abgeschlossen`; typ-CHECK `erstgutachten/nachbesichtigung/stellungnahme`.
- **CMM-73 Daten-Fix reicht** (Handoff `docs/01.06.2026/HANDOFF-cmm73-…`): `auftraege(erstgutachten, status=termin)` → `v_claim_phase` derivt korrekt; **kein View-Umbau, keine geteilte-View-Koordination**.
- **Heutiges `bestaetigeTermin`** (`bestaetigung.ts`, `'use server'`, throw-Pattern): status=bestaetigt + final_verbindlich_ab(24h) + Timeline + completeSla('termin_bestaetigung') + WA T4 + Email S-E6. **Kein Geocoding, kein Auftrag.** Engine-`bestaetige` = Superset für die Garantie + Auftrag; Notifier-Port = Phase 3.
- `gutachter_termine.kanal`-CHECK: `telefon/video` (oder NULL). Remote-Ausnahme = `kanal IN (video,telefon)`.

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/lib/termine/engine/geocode.ts` | `Geocoder`-Typ + `geocodeMitFallback` (mapbox→google) | Create |
| `src/lib/termine/engine/besichtigungsort.ts` | `resolveBesichtigungsort` (Kette) + `ResolvedOrt` | Create |
| `src/lib/termine/engine/bestaetige.ts` | `bestaetige` (geocode-or-refuse + status + CMM-73 + Timeline) | Create |
| `src/lib/termine/engine/besichtigungsort.test.ts` | Vitest: Kette mit injiziertem db+geocoder (Termin-Coords / Lead-fahrzeug_standort / geocode-Adresse / kein-Ziel→null / Remote-Skip) | Create |
| `src/lib/termine/engine/index.ts` | `bestaetige`/`resolveBesichtigungsort`/`geocodeMitFallback` + Typen exportieren | Modify |
| `scripts/verify-engine-p2-3b-bestaetige.mts` | Live-Verify: bezug-Adresse→geocodet+bestätigt+Auftrag · remote→bestätigt ohne Geo · kein-Ziel→refuse · Cleanup | Create |

---

## Task 1: `geocodeMitFallback` (Code, Subagent + TDD)

**Files:** Create `engine/geocode.ts`

- [ ] **Step 1: Test** (`besichtigungsort.test.ts`, gemeinsame Test-Datei) — Fallback-Orchestrierung mit injizierten Backends:
```typescript
import { describe, it, expect } from 'vitest'
import { makeGeocodeMitFallback } from './geocode'
describe('geocodeMitFallback', () => {
  it('nimmt mapbox wenn es liefert', async () => {
    const g = makeGeocodeMitFallback(async () => ({ lat: 1, lng: 2, adresse: 'M', placeId: 'm1' }), async () => { throw new Error('google darf nicht') })
    expect(await g('x')).toEqual({ lat: 1, lng: 2, adresse: 'M', placeId: 'm1' })
  })
  it('fällt auf google zurück wenn mapbox null', async () => {
    const g = makeGeocodeMitFallback(async () => null, async () => ({ lat: 3, lng: 4, adresse: 'G', placeId: 'g1' }))
    expect(await g('x')).toEqual({ lat: 3, lng: 4, adresse: 'G', placeId: 'g1' })
  })
  it('null wenn beide nichts liefern', async () => {
    const g = makeGeocodeMitFallback(async () => null, async () => null)
    expect(await g('x')).toBeNull()
  })
})
```

- [ ] **Step 2: RED** — `npx vitest run src/lib/termine/engine/besichtigungsort.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** `engine/geocode.ts`:
```typescript
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { geocodeAddress } from '@/lib/google-geocoding/geocode-address'

export interface GeoTreffer { lat: number; lng: number; adresse: string | null; placeId: string | null }
export type Geocoder = (adresse: string) => Promise<GeoTreffer | null>

/** Testbare Fabrik: injizierbare mapbox-/google-Backends. */
export function makeGeocodeMitFallback(
  mapbox: (a: string) => Promise<GeoTreffer | null>,
  google: (a: string) => Promise<GeoTreffer | null>,
): Geocoder {
  return async (adresse: string) => (await mapbox(adresse)) ?? (await google(adresse))
}

/** Produktions-Geocoder: mapbox bevorzugt (Routing-Konsistenz), google Fallback. */
export const geocodeMitFallback: Geocoder = makeGeocodeMitFallback(
  async (a) => {
    const r = await geocodeAdresse(a)
    return r ? { lat: r.lat, lng: r.lng, adresse: r.formatted, placeId: r.placeId } : null
  },
  async (a) => {
    const r = await geocodeAddress(a)
    return r.ok ? { lat: r.data.lat, lng: r.data.lng, adresse: r.data.formatted_address, placeId: r.data.place_id } : null
  },
)
```

- [ ] **Step 4: GREEN** — vitest grün. **Commit** (7-Punkt-Audit).

---

## Task 2: `resolveBesichtigungsort` — die Auflösungs-Kette (Code, Subagent + TDD)

**Files:** Create `engine/besichtigungsort.ts`; Modify `besichtigungsort.test.ts`

- [ ] **Step 1: Tests** (injizierter db-Stub + Fake-Geocoder):
```typescript
import { resolveBesichtigungsort } from './besichtigungsort'
const fakeGeo = async (a: string) => (a ? { lat: 50, lng: 7, adresse: a, placeId: 'p' } : null)
const dbStub = (rows: Record<string, unknown>) => ({ from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[t] ?? null }) }) }) }) }) as never

it('nimmt Termin-Koordinaten direkt (kein geocode)', async () => {
  const r = await resolveBesichtigungsort({ besichtigungsort_lat: 48, besichtigungsort_lng: 11, besichtigungsort_adresse: 'X', claim_id: null, fall_id: null, lead_id: null }, dbStub({}), async () => { throw new Error('no geocode') })
  expect(r).toMatchObject({ lat: 48, lng: 11, quelle: 'termin' })
})
it('geocodet Lead-fahrzeug_standort_adresse wenn keine Coords', async () => {
  const r = await resolveBesichtigungsort({ besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null, claim_id: null, fall_id: null, lead_id: 'L' },
    dbStub({ leads: { besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null, fahrzeug_standort_lat: null, fahrzeug_standort_lng: null, fahrzeug_standort_adresse: 'Musterstr 1', kunde_adresse: null, kunde_strasse: null, kunde_plz: null } }), fakeGeo)
  expect(r).toMatchObject({ lat: 50, lng: 7, quelle: 'lead' })
})
it('null wenn nichts auflösbar', async () => {
  const r = await resolveBesichtigungsort({ besichtigungsort_lat: null, besichtigungsort_lng: null, besichtigungsort_adresse: null, claim_id: null, fall_id: null, lead_id: null }, dbStub({}), fakeGeo)
  expect(r).toBeNull()
})
```

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implementieren** `engine/besichtigungsort.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { geocodeMitFallback, type Geocoder } from './geocode'

export type OrtQuelle = 'termin' | 'lead' | 'fall' | 'claim'
export interface ResolvedOrt { lat: number; lng: number; adresse: string | null; placeId: string | null; quelle: OrtQuelle }
export interface TerminOrtInput {
  besichtigungsort_lat: number | null; besichtigungsort_lng: number | null; besichtigungsort_adresse: string | null
  claim_id: string | null; fall_id: string | null; lead_id: string | null
}
type Kandidat = [lat: number | null | undefined, lng: number | null | undefined, adresse: string | null | undefined]

function joinAdr(strasse?: string | null, plz?: string | null): string | null {
  const s = [strasse, plz].filter(Boolean).join(', ').trim()
  return s.length ? s : null
}
/** Erster Kandidat mit Coords; sonst erste geocodebare Adresse. */
async function ausKandidaten(kand: Kandidat[], geocode: Geocoder, quelle: OrtQuelle): Promise<ResolvedOrt | null> {
  for (const [lat, lng, adr] of kand) {
    if (lat != null && lng != null) return { lat, lng, adresse: adr ?? null, placeId: null, quelle }
  }
  for (const [, , adr] of kand) {
    if (adr) { const g = await geocode(adr); if (g) return { ...g, quelle } }
  }
  return null
}

/**
 * Auflösungs-Kette fürs Vor-Ort-Ziel: Termin-Coords → Termin-Adresse(geocode) →
 * bezug claim(schadenort) > fall(besichtigungsort>kunde) > lead(besichtigungsort>
 * fahrzeug_standort>kunde). Bevorzugt vorhandene Koordinaten, geocodet sonst.
 */
export async function resolveBesichtigungsort(
  t: TerminOrtInput, db: SupabaseClient, geocode: Geocoder = geocodeMitFallback,
): Promise<ResolvedOrt | null> {
  if (t.besichtigungsort_lat != null && t.besichtigungsort_lng != null)
    return { lat: t.besichtigungsort_lat, lng: t.besichtigungsort_lng, adresse: t.besichtigungsort_adresse, placeId: null, quelle: 'termin' }
  if (t.besichtigungsort_adresse) { const g = await geocode(t.besichtigungsort_adresse); if (g) return { ...g, quelle: 'termin' } }

  if (t.claim_id) {
    const { data: c } = await db.from('claims').select('schadenort_lat, schadenort_lng, schadenort_adresse').eq('id', t.claim_id).maybeSingle()
    const r = await ausKandidaten([[c?.schadenort_lat, c?.schadenort_lng, c?.schadenort_adresse]], geocode, 'claim'); if (r) return r
  }
  if (t.fall_id) {
    const { data: f } = await db.from('faelle').select('besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_adresse, kunde_adresse, kunde_strasse, kunde_plz').eq('id', t.fall_id).maybeSingle()
    const r = await ausKandidaten([
      [f?.besichtigungsort_lat, f?.besichtigungsort_lng, f?.besichtigungsort_adresse],
      [null, null, f?.kunde_adresse ?? joinAdr(f?.kunde_strasse, f?.kunde_plz)],
    ], geocode, 'fall'); if (r) return r
  }
  if (t.lead_id) {
    const { data: l } = await db.from('leads').select('besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_adresse, fahrzeug_standort_lat, fahrzeug_standort_lng, fahrzeug_standort_adresse, kunde_adresse, kunde_strasse, kunde_plz').eq('id', t.lead_id).maybeSingle()
    const r = await ausKandidaten([
      [l?.besichtigungsort_lat, l?.besichtigungsort_lng, l?.besichtigungsort_adresse],
      [l?.fahrzeug_standort_lat, l?.fahrzeug_standort_lng, l?.fahrzeug_standort_adresse],
      [null, null, l?.kunde_adresse ?? joinAdr(l?.kunde_strasse, l?.kunde_plz)],
    ], geocode, 'lead'); if (r) return r
  }
  return null
}
```

- [ ] **Step 4: GREEN + tsc.** **Commit.**

---

## Task 3: `bestaetige` — geocode-or-refuse + Status + CMM-73 (Code, Subagent + TDD)

**Files:** Create `engine/bestaetige.ts`; Modify `index.ts`

- [ ] **Step 1: Tests** (injizierter db + geocoder) — Kernverhalten:
  - Remote (`kanal='video'`) → `ok:true`, KEIN geocode aufgerufen, status-Patch ohne besichtigungsort.
  - Vor-Ort ohne auflösbares Ziel → `ok:false, code:'kein_ziel'`, KEIN status-Update.
  - Vor-Ort mit Termin-Coords → `ok:true`, status=bestaetigt + besichtigungsort gecacht.
  (db-Stub muss `.update().eq()` + `.select().eq().maybeSingle()` + `.insert()` mocken; Auftrag-Helper via try/catch-Import → im Test fall_id/sv_id weglassen, damit der Import-Pfad nicht geladen wird.)

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implementieren** `engine/bestaetige.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBesichtigungsort, type OrtQuelle } from './besichtigungsort'
import { geocodeMitFallback, type Geocoder } from './geocode'

export type BestaetigeResult =
  | { ok: true; terminId: string; besichtigungsortLat: number | null; besichtigungsortLng: number | null; quelle: OrtQuelle | 'remote' }
  | { ok: false; error: string; code: 'kein_ziel' | 'not_found' | 'db' }

/**
 * Bestätigt einen Termin MIT Geocoding-Garantie: das Vor-Ort-Ziel wird aufgelöst +
 * geocodet + auf gutachter_termine.besichtigungsort_lat/lng gecacht. OHNE geocodebares
 * Ziel KEIN 'bestätigt' (code:'kein_ziel'). Remote (kanal video/telefon) ausgenommen.
 * CMM-73: legt best-effort den erstgutachten-Auftrag an. Notifications (WA/Email/SLA)
 * laufen bis Phase-3-Repoint weiter über bestaetigung.ts:bestaetigeTermin (kein Doppel-Send).
 */
export async function bestaetige(
  terminId: string, opts?: { db?: SupabaseClient; geocode?: Geocoder },
): Promise<BestaetigeResult> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const geocode = opts?.geocode ?? geocodeMitFallback

  const { data: t, error } = await db.from('gutachter_termine')
    .select('id, kanal, sv_id, fall_id, claim_id, lead_id, besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_adresse, start_zeit')
    .eq('id', terminId).maybeSingle()
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!t) return { ok: false, error: 'Termin nicht gefunden', code: 'not_found' }

  const remote = t.kanal === 'video' || t.kanal === 'telefon'
  let ort = null as Awaited<ReturnType<typeof resolveBesichtigungsort>> | null
  if (!remote) {
    ort = await resolveBesichtigungsort(t, db, geocode)
    if (!ort) return { ok: false, error: 'Kein geocodebares Besichtigungsort-Ziel — Termin nicht bestätigt', code: 'kein_ziel' }
  }

  const finalVerbindlichAb = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const patch: Record<string, unknown> = { status: 'bestaetigt', final_verbindlich_ab: finalVerbindlichAb }
  if (ort) {
    patch.besichtigungsort_lat = ort.lat
    patch.besichtigungsort_lng = ort.lng
    if (ort.adresse) patch.besichtigungsort_adresse = ort.adresse
    if (ort.placeId) patch.besichtigungsort_place_id = ort.placeId
  }
  const { error: upErr } = await db.from('gutachter_termine').update(patch).eq('id', terminId)
  if (upErr) return { ok: false, error: upErr.message, code: 'db' }

  // CMM-73 (best-effort, non-critical): erstgutachten-Auftrag → v_claim_phase derivt korrekt.
  if (t.fall_id && t.sv_id) {
    try {
      const { createErstgutachtenAuftragWennNoetig } = await import('@/lib/auftrag/create')
      await createErstgutachtenAuftragWennNoetig(db, t.fall_id as string, t.sv_id as string, [terminId])
    } catch (e) { console.error('[bestaetige] erstgutachten:', e instanceof Error ? e.message : e) }
  }
  // Timeline (non-critical).
  if (t.fall_id) {
    try {
      await db.from('timeline').insert({ fall_id: t.fall_id, typ: 'termin', titel: 'Termin bestätigt',
        beschreibung: `Termin bestätigt; verbindlich ab ${new Date(finalVerbindlichAb).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.` })
    } catch { /* non-critical */ }
  }

  return { ok: true, terminId, besichtigungsortLat: ort?.lat ?? null, besichtigungsortLng: ort?.lng ?? null, quelle: ort?.quelle ?? 'remote' }
}
```

- [ ] **Step 4: GREEN + tsc.** `index.ts`: `bestaetige`, `resolveBesichtigungsort`, `geocodeMitFallback` + Typen (`BestaetigeResult`, `ResolvedOrt`, `OrtQuelle`, `Geocoder`, `GeoTreffer`) exportieren. **Commit.**

---

## Task 4: Live-Verify (Controller)

**Files:** Create `scripts/verify-engine-p2-3b-bestaetige.mts`

- [ ] **Step 1: Script** (Muster `verify-engine-belegung.mts`) — gegen die echte DB + echte Geocoder:
  - **(A) Vor-Ort mit Adresse:** Termin (real sv) mit `besichtigungsort_adresse='Domkloster 4, 50667 Köln'`, ohne lat/lng, status='reserviert' anlegen → `bestaetige(id)` → `{ok:true, quelle:'termin'}`, DB-Row hat jetzt `besichtigungsort_lat/lng != null` (geocodet), status='bestaetigt'.
  - **(B) Remote:** Termin `kanal='video'`, kein Ort → `bestaetige` → `{ok:true, quelle:'remote'}`, status='bestaetigt', lat/lng bleiben null.
  - **(C) Kein Ziel:** Termin ohne besichtigungsort + ohne bezug (claim/fall/lead null) → `bestaetige` → `{ok:false, code:'kein_ziel'}`, status bleibt 'reserviert'.
  - Cleanup try/finally (terminId-Liste). VERDICT GRUEN nur wenn A.geocodet+bestätigt && B.remote-bestätigt && C.refused.
  - **Run:** `npm ci` (frischer Worktree) + `cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-p2-3b-bestaetige.mts && rm -f .env.local`. ENV braucht mapbox/google-Keys (sind in `.env.local`).

- [ ] **Step 2: Ausführen** → VERDICT GRUEN. (Falls Geocoding-Keys in der ENV fehlen → mit Aaron klären; NICHT mocken im Live-Verify.) **Commit.**

---

## Task 5: Build-Gate + PR

- [ ] **Step 1:** `npm ci` + `npx tsc --noEmit` grün + `npx vitest run src/lib/termine/engine/` grün.
- [ ] **Step 2:** `git status` clean, `git stash list` leer.
- [ ] **Step 3:** `git push -u origin kitta/termin-engine-p2-3b` + `gh pr create --base staging` (Body: Audit + Verify-VERDICT (A/B/C) + „Geocoding-Garantie aktiv: ohne Ziel kein bestätigt" + „bestaetige NICHT verdrahtet, Notifier-Port = Phase 3" + CMM-73-Daten-Fix-Hinweis).
- [ ] **Step 4:** Post-Merge: Verify gegen staging.

---

## Self-Review

**Spec-Coverage (Handoff §2 P2.3 — bestaetige + Geocoding):** `bestaetige` resolved+geocodet Vor-Ort-Ziel + cached auf besichtigungsort_lat/lng ✓; ohne geocodebares Ziel kein bestätigt ✓ (`code:'kein_ziel'`); Remote ausgenommen ✓. Auflösungs-Kette Termin→Lead/Fall/Claim ✓ (bevorzugt Coords, geocodet sonst). CMM-73-Daten-Fix ✓ (reuse `createErstgutachtenAuftragWennNoetig`, kein View-Umbau). **Bewusst verschoben:** Notifier (WA/Email/SLA) = Phase-3-Repoint (kein Doppel-Send); fail-closed pruefeBelegung in bestaetige n/a (Bestätigung re-checkt Belegung nicht — der Slot ist gehalten). `reserviere` = P2.3a (#2240). `sageAb`/`verlege` = P2.3c.

**Placeholder-Scan:** keine TBD; Code/Tests/Verify vollständig.

**Typ-Konsistenz:** `OrtQuelle`/`ResolvedOrt`/`Geocoder`/`GeoTreffer` über die Files konsistent; bestaetige-Patch-Spalten == DB (`besichtigungsort_lat/lng/adresse/place_id`, `status`, `final_verbindlich_ab`); status='bestaetigt' ∈ CHECK; Remote-kanal == kanal-CHECK (video/telefon).

**Risiko:** reiner Code, 0 DDL, 0 Consumer (bestaetige/Resolver/geocode nicht verdrahtet) → kein Live-Flow betroffen. Geocoding-Garantie ist additiv (neue Op). CMM-73 best-effort + non-critical (try/catch) → kein Bestätigungs-Bruch wenn auftraege-Anlage scheitert. Injizierbare Geocoder/db → Unit-Tests ohne externe Calls; Live-Verify beweist die echten Provider.

---

## Roadmap (danach)
- **P2.3c — `sageAb` + `verlege`** (konsolidiert storno-actions + AAR-864-Verlegungs-State-Machine; Result-Object).
- **P2.4** `findeBestePerson` (Org-Dedup #2232 merged) · **P2.5** `syncTerminToExternalCalendar`.
- **Phase 3** Consumer-Repoint: `bestaetigeTermin`→`bestaetige` (+ Notifier portieren), `reserviereSlot`→`reserviere` (fixt typ:'vor_ort'-Bug), Dispatch/Self-Service/KB/Kanzlei, `cache-busy`→`v_belegung`, `freieSlots`-Repoint, dann sv_id/lead_id-Kompat droppen + Normalize-Trigger entfernen. **Fallback-Layer (Aaron):** Kunde-Tracking (`kunde_tracking_token`, `sv_eta_minuten`) + SV-Feldmodus (`sv_unterwegs_seit`/`sv_eta_minuten`/`sv_angekommen_am`) — Ziel-Korrektur durch Kunde/SV MUSS `besichtigungsort_*` (geocodet) aktualisieren.
