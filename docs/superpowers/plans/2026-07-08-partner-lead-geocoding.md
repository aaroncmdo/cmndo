# Partner-Lead Geocoding (⑤) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder `partner_leads`-Eingang wird sofort mit Google Maps geokodiert (lat/lng + place_id), unvollständige Adressen werden erkannt, und der Convert nach werkstatt/makler blockt hart ohne Koordinaten (sonst fehlt der Partner auf Karte/Finder).

**Architecture:** Ein geteilter Helper `geocodePartnerLead()` (wrapt das bestehende `geocodeAddress`, baut den Adress-String, erzwingt Vollständigkeit) wird an allen Intakes aufgerufen und schreibt `partner_leads.lat/lng/google_place_id` beim Insert. `convertPartnerLead` liest die Koordinaten, blockt werkstatt/makler ohne sie und reicht sie an `anlegePartnerKern` durch → Rollen-Row bekommt lat/lng.

**Tech Stack:** Next.js (Server-Actions), Supabase (partner_leads), `@/lib/google-geocoding/geocode-address`, vitest.

## Global Constraints
- Server-Actions liefern `{ ok, error? }` (kein throw); `revalidatePath('/admin/partner-leads')` bei Writes.
- DDL NUR via Supabase-Plugin `apply_migration`, dann File `supabase/migrations/<recorded-version>_<name>.sql` committen (Regel 2).
- Non-critical Sub-Ops (geocode-Fehler beim Intake) brechen den Insert NICHT — Lead wird trotzdem erfasst, nur ohne Koordinaten (Convert ist das harte Gate).
- Umlaute in UI-Strings. Ratchets 0-neu. Reuse `geocodeAddress` — kein zweiter Geocoder.

**Reuse-Referenz** (`src/lib/google-geocoding/geocode-address.ts`):
```ts
export type GeocodeResult = { lat: number; lng: number; formatted_address: string; place_id: string | null }
export type GeocodeReturn = { ok: true; data: GeocodeResult } | { ok: false; error: string }
export async function geocodeAddress(rawAddress: string): Promise<GeocodeReturn>
```

---

### Task 1: DDL — partner_leads Geo-Spalten

**Files:**
- Migration via `apply_migration({ name: 'partner_leads_geo_spalten', query })`
- Create (nach recorded version): `supabase/migrations/<V>_partner_leads_geo_spalten.sql`

**Interfaces:**
- Produces: `partner_leads.lat double precision null`, `.lng double precision null`, `.strasse text null`, `.google_place_id text null`

- [ ] **Step 1: DDL anwenden**
```sql
ALTER TABLE public.partner_leads
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS strasse text,
  ADD COLUMN IF NOT EXISTS google_place_id text;
```
Via `apply_migration({ name: 'partner_leads_geo_spalten', query: <oben> })`.

- [ ] **Step 2: recorded version ablesen + File committen**
`list_migrations` → die vom Plugin vergebene Version `<V>`. File `supabase/migrations/<V>_partner_leads_geo_spalten.sql` mit exakt der DDL anlegen (Dateiname == `<V>`). `execute_sql` (READ): `select column_name from information_schema.columns where table_name='partner_leads' and column_name in ('lat','lng','strasse','google_place_id')` → 4 Zeilen.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/*_partner_leads_geo_spalten.sql
git commit -m "feat(partner-crm): DDL partner_leads +lat/lng/strasse/google_place_id (Geocoding)"
```

---

### Task 2: `geocodePartnerLead` Helper (Vollständigkeits-Gate)

**Files:**
- Create: `src/lib/partner/geocode-partner-lead.ts`
- Test: `src/lib/partner/__tests__/geocode-partner-lead.test.ts`

**Interfaces:**
- Consumes: `geocodeAddress` (s. Reuse-Referenz)
- Produces:
```ts
export type PartnerLeadGeoInput = { strasse?: string | null; plz?: string | null; ort?: string | null }
export type PartnerLeadGeo =
  | { ok: true; lat: number; lng: number; place_id: string | null; formatted: string }
  | { ok: false; error: string; unvollstaendig: boolean }
export function baueAdresse(input: PartnerLeadGeoInput): string
export async function geocodePartnerLead(input: PartnerLeadGeoInput): Promise<PartnerLeadGeo>
```

- [ ] **Step 1: Failing test** — `baueAdresse` + Vollständigkeits-Gate (PLZ+Ort Pflicht)
```ts
import { describe, it, expect, vi } from 'vitest'
import { baueAdresse, geocodePartnerLead } from '../geocode-partner-lead'

describe('baueAdresse', () => {
  it('joined strasse/plz/ort mit Komma', () => {
    expect(baueAdresse({ strasse: 'Domstr. 1', plz: '50667', ort: 'Köln' })).toBe('Domstr. 1, 50667 Köln')
  })
  it('ohne strasse nur plz+ort', () => {
    expect(baueAdresse({ plz: '50667', ort: 'Köln' })).toBe('50667 Köln')
  })
})

describe('geocodePartnerLead', () => {
  it('unvollständig wenn plz ODER ort fehlt → kein Geocode-Call', async () => {
    const r = await geocodePartnerLead({ strasse: 'Domstr. 1', ort: 'Köln' }) // plz fehlt
    expect(r).toEqual({ ok: false, error: expect.stringContaining('unvollständig'), unvollstaendig: true })
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/partner/__tests__/geocode-partner-lead.test.ts` → module not found)

- [ ] **Step 3: Implementierung**
```ts
import { geocodeAddress } from '@/lib/google-geocoding/geocode-address'

export type PartnerLeadGeoInput = { strasse?: string | null; plz?: string | null; ort?: string | null }
export type PartnerLeadGeo =
  | { ok: true; lat: number; lng: number; place_id: string | null; formatted: string }
  | { ok: false; error: string; unvollstaendig: boolean }

export function baueAdresse(input: PartnerLeadGeoInput): string {
  const plzOrt = [input.plz?.trim(), input.ort?.trim()].filter(Boolean).join(' ')
  return [input.strasse?.trim(), plzOrt].filter(Boolean).join(', ')
}

export async function geocodePartnerLead(input: PartnerLeadGeoInput): Promise<PartnerLeadGeo> {
  // Vollständigkeit: PLZ + Ort Minimum (Straße empfohlen, aber Google findet auch ohne).
  if (!input.plz?.trim() || !input.ort?.trim()) {
    return { ok: false, error: 'Adresse unvollständig (PLZ + Ort erforderlich).', unvollstaendig: true }
  }
  const res = await geocodeAddress(baueAdresse(input))
  if (!res.ok) return { ok: false, error: res.error, unvollstaendig: false }
  return { ok: true, lat: res.data.lat, lng: res.data.lng, place_id: res.data.place_id, formatted: res.data.formatted_address }
}
```

- [ ] **Step 4: Run → PASS** (geocodeAddress wird für den unvollständig-Test nie erreicht; für den ok-Pfad in Task-Tests mocken via `vi.mock('@/lib/google-geocoding/geocode-address')`).

- [ ] **Step 5: Commit** `git add … && git commit -m "feat(partner-crm): geocodePartnerLead Helper + Vollständigkeits-Gate"`

---

### Task 3: Geocode an Intakes (create / csv / public-form / scrape)

**Files:**
- Modify: `src/app/admin/partner-leads/actions.ts` (`createPartnerLead`, `importCsvLeads`, `importScrapedLeads`)
- Modify: `src/app/werkstatt-partner-werden/actions.ts` (`werkstattPartnerAnfrage`)
- Test: `src/lib/partner/__tests__/geocode-partner-lead.test.ts` (Intake-Anwendung ist dünn; Kernlogik in Task 2 getestet)

**Interfaces:**
- Consumes: `geocodePartnerLead` (Task 2)
- Muster (best-effort, non-critical): vor jedem `partner_leads`-Insert `const geo = await geocodePartnerLead({ strasse, plz, ort })`; bei `geo.ok` `lat/lng/google_place_id/strasse` in den Insert mergen; bei `!geo.ok` Insert OHNE Koordinaten (Lead nicht verlieren).

- [ ] **Step 1:** In `createPartnerLead` vor dem Insert `geocodePartnerLead` aufrufen, bei ok `lat: geo.lat, lng: geo.lng, google_place_id: geo.place_id` in `.insert({...})` ergänzen. (`strasse` aus `input` falls vorhanden.)
- [ ] **Step 2:** In `importCsvLeads` je Row: nach dem Mapping `geocodePartnerLead` (best-effort, sequenziell mit kleinem Concurrency-Limit ~5), Koordinaten in die Insert-Rows mergen.
- [ ] **Step 3:** In `importScrapedLeads`: Scrape liefert schon `formatted_address`/plz/ort — `geocodePartnerLead` ergänzt lat/lng falls der Kandidat keine hat.
- [ ] **Step 4:** In `werkstattPartnerAnfrage` (Public-Form): vor dem Insert `geocodePartnerLead`, Koordinaten mergen (best-effort — öffentliche Bewerbung nie wegen Geocode-Fehler ablehnen).
- [ ] **Step 5:** `npx tsc --noEmit` clean · `npm run build` grün.
- [ ] **Step 6: Commit** `git commit -m "feat(partner-crm): Leads beim Eingang geokodieren (create/csv/scrape/public-form)"`

---

### Task 4: Convert-Block + Koordinaten durchreichen

**Files:**
- Modify: `src/lib/partner/anlege-partner.ts` (`PartnerAnlageInput` +`lat/lng`, in werkstatt/makler-Insert setzen)
- Modify: `src/lib/partner/convert-partner-lead.ts` (`PartnerLeadRow` +`lat/lng`, Load-Select erweitern, `mapLeadZuAnlageInput` reicht lat/lng, Block-Guard)
- Test: `src/lib/partner/__tests__/convert-partner-lead.test.ts` (existiert — Block-Guard-Case ergänzen)

**Interfaces:**
- `PartnerAnlageInput` bekommt `lat: number | null; lng: number | null`.
- `convertPartnerLead`: lädt zusätzlich `lat, lng`; für rolle `werkstatt|makler` gilt: **ohne lat/lng → `{ ok:false, error:'Adresse unvollständig/nicht geokodiert — bitte im Lead ergänzen, dann konvertieren.' }`** (SV ausgenommen, läuft über Isochrone).

- [ ] **Step 1: Failing test** — Convert werkstatt ohne Koordinaten blockt
```ts
it('blockt werkstatt-Convert ohne lat/lng', async () => {
  // admin-mock: lead werkstatt, lat=null → convertPartnerLead → ok:false, error enthält 'Adresse'
})
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3:** `PartnerLeadRow` +`lat/lng`; Load-Select um `lat, lng` erweitern; nach dem Idempotenz-Guard: `if ((typedLead.rolle === 'werkstatt' || typedLead.rolle === 'makler') && (typedLead.lat == null || typedLead.lng == null)) return { ok:false, error:'Adresse unvollständig/nicht geokodiert — bitte im Lead ergänzen, dann konvertieren.' }`. `mapLeadZuAnlageInput` setzt `lat: lead.lat ?? null, lng: lead.lng ?? null`. In `anlegePartnerKern` werkstatt/makler-Insert: `adresse_lat/adresse_lng` bzw. `lat/lng` (Spaltennamen der werkstaetten/makler-Tabelle mit Supabase-MCP verifizieren) aus `input.lat/lng` setzen.
- [ ] **Step 4: Run → PASS**; `npm run build` grün; `npx vitest run src/lib/partner` grün.
- [ ] **Step 5: Commit** `git commit -m "feat(partner-crm): Convert blockt werkstatt/makler ohne geokodierte Adresse + reicht lat/lng durch"`

---

### Task 5: Types-Regen + Ratchets + PR

- [ ] **Step 1:** `partner_leads`-Types um `lat/lng/strasse/google_place_id` ergänzen (surgical in `database.types.ts`, wie beim #3678-Revive — kein 21k-Full-Regen).
- [ ] **Step 2:** Alle 4 Ratchets `-- --ratchet` → 0-neu. `npm run build` grün. `npx vitest run src/lib/partner` grün.
- [ ] **Step 3: PR** gegen staging: „feat(partner-crm): Lead-Geocoding (⑤) — Google-Maps an allen Eingängen + Convert-Block". Body mit DB-Safety (Migration prod-getrackt) + Verifikation.
- [ ] **Step 4: Prod-Smoke** (nach Merge/Deploy): manueller Prospect mit vollständiger Adresse → lat/lng in DB gesetzt (execute_sql-Beweis); Convert werkstatt ohne Adresse → geblockt.

---

## Self-Review
- **Spec-Coverage:** ⑤ vollständig (geocode-Util, alle Intakes, Vollständigkeits-Gate, Convert-Block, on-Convert-Koordinaten). ✓
- **Offene Verifikation zur Implementierzeit:** exakte lat/lng-Spaltennamen von `werkstaetten`/`makler` per Supabase-MCP prüfen (Task 4 Step 3) — nicht raten.
- **Typen-Konsistenz:** `geocodePartnerLead` → `{ok,lat,lng,place_id,formatted}` durchgängig; `PartnerAnlageInput.lat/lng` durchgereicht.

## Follow-on Plans (nach ⑤-Merge, eigene Spec-Tasks)
- **④ CSV Smart-Mapping** — `schlageCsvMappingVor(header, sample)` (LLM) + Mapping-Panel-UI; nutzt ⑤ für Adressen.
- **③ Onboarding-Termine** — admin_termine-DDL (partner_lead_id/kanal/video_link/treffpunkt_*), `legePartnerOnboardingTermin`, Auto-Google-Meet (30min, conferenceData), ICS-Einladung; nutzt ⑤ für treffpunkt-Geocode.
