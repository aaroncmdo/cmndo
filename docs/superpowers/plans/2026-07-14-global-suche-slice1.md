# Globale Fuzzy-Suche — Slice 1 (Fundament) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein unified `search_global`-RPC (pg_trgm, SECURITY INVOKER) ersetzt die zwei bestehenden Substring-Such-Endpoints und macht Admin- + SV-Suche tippfehler-tolerant — Fundament für den späteren Rollout auf alle Portale.

**Architecture:** Ein `SECURITY INVOKER` Postgres-RPC fächert role-gated über Fall/Fahrzeug→Fall/Person→Fall/Lead (pg_trgm-Similarity, RLS scoped die Zeilen). Ein `/api/search`-Endpoint ruft ihn über den User-Client; ein rollen-agnostisches `<GlobalSearch/>` (verschmilzt die 2 Spotlight-Wrapper) rendert gruppierte, per Claim-`id` deduplizierte Treffer und routet via `routeForEntity` in die Detail-View.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres (pg_trgm), vitest, das bestehende `Spotlight`-Primitive.

## Global Constraints

- DDL **nur** über das Supabase-Plugin (`apply_migration`); Migration-File exakt nach getrackter Version benannt (Regel 2).
- RPC = **`SECURITY INVOKER`**, `SET search_path = public`; **nur RLS-geschützte Tabellen** (claims/vehicles/leads/personen/claim_parties/profiles — alle RLS-on ✓ verifiziert 2026-07-14).
- Endpoint nutzt den **User-Client** (`@/lib/supabase/server`), Result-Object / graceful `[]` — **nie** Service-Client für die Suche.
- `Spotlight` wiederverwenden (Komponenten-Set-Policy); Umlaute in UI-Strings; Ratchets (component-set/token-audit/knip) 0-neu.
- `user_role`-Enum-Werte exakt: `admin, dispatch, flottenmanager, kanzlei, kunde, kundenbetreuer, leadbearbeiter, makler, sachverstaendiger, werkstatt`.

---

## File Structure

- **`supabase/migrations/<V>_search_global_pg_trgm.sql`** (neu) — pg_trgm-Extension + GIN-Indizes + `search_global`-Funktion. Via Plugin appliziert, File nach getrackter Version benannt.
- **`src/lib/search/types.ts`** (neu) — `SearchHit`, `SearchGroup`, `EntityType`.
- **`src/lib/search/route-for-entity.ts`** (neu) — `routeForEntity(entityType, id, rolle)` (pure).
- **`src/lib/search/parse-results.ts`** (neu) — `dedupeAndGroup(hits)` (pure: Claim-`id`-Dedup + Gruppierung).
- **`src/app/api/search/route.ts`** (ersetzt) — ruft `search_global` über User-Client.
- **`src/components/shared/search/GlobalSearch.tsx`** (neu) — rollen-agnostischer Wrapper um `Spotlight`.
- **Gelöscht:** `src/app/gutachter/_components/SVSpotlight.tsx`, `src/app/api/gutachter/search/route.ts`, `src/components/Spotlight.tsx` (admin-Wrapper) — durch `GlobalSearch` ersetzt.
- **`src/components/shared/Spotlight.tsx`** — bleibt (Primitive), evtl. Props-Anpassung.

---

## Task 1: pg_trgm-Migration (Extension + GIN-Indizes)

**Files:**
- Create: `supabase/migrations/<V>_search_global_pg_trgm.sql`

**Interfaces:**
- Produces: pg_trgm-Extension + Trigram-GIN-Indizes auf allen in Task 2 gematchten Spalten.

- [ ] **Step 1: DDL schreiben** (in eine Datei zum Applizieren via Plugin)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_trgm_claims_claim_nummer   ON public.claims   USING gin (claim_nummer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_claims_schadenort_ort ON public.claims   USING gin (schadenort_ort gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_claims_polizei_az     ON public.claims   USING gin (polizei_aktenzeichen gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_vehicles_kennzeichen  ON public.vehicles USING gin (kennzeichen_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_vorname         ON public.leads    USING gin (vorname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_nachname        ON public.leads    USING gin (nachname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_kennzeichen     ON public.leads    USING gin (kennzeichen gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_leads_lead_nummer     ON public.leads    USING gin (lead_nummer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_personen_vorname      ON public.personen USING gin (vorname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_personen_nachname     ON public.personen USING gin (nachname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_personen_firma        ON public.personen USING gin (firma gin_trgm_ops);
```

- [ ] **Step 2: Applizieren via Plugin** — `apply_migration({ name: "search_global_pg_trgm", query: <DDL oben ohne die Funktion> })`. (Funktion kommt in Task 2 — ODER beide in einer Migration; hier getrennt für kleinere Review-Einheiten.)
- [ ] **Step 3: Getrackte Version ablesen** — `list_migrations` → `<V>`. File als `supabase/migrations/<V>_search_global_pg_trgm.sql` committen (Regel 2 Schritt 3+4).
- [ ] **Step 4: Verifizieren (READ)** — `execute_sql`: `SELECT extname FROM pg_extension WHERE extname='pg_trgm';` → 1 Row; `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_trgm_%';` → 11 Rows.
- [ ] **Step 5: Commit** — `git add supabase/migrations/<V>_search_global_pg_trgm.sql && git commit -m "feat(suche): pg_trgm extension + trigram GIN indexes"`

---

## Task 2: `search_global`-RPC (SECURITY INVOKER)

**Files:**
- Modify/Append: `supabase/migrations/<V2>_search_global_function.sql`

**Interfaces:**
- Produces: `search_global(q text, limit_per_type int DEFAULT 6) RETURNS TABLE(entity_type text, id uuid, label text, sub text, status text, score real)`. Consumed by Task 5 (`/api/search`).

- [ ] **Step 1: RLS-Leak-Verifikations-Query vorbereiten** (der Test = Live-SQL gegen prod/preview, da RLS nicht mockbar ist). Als authentifizierter Test-Kunde A (JWT via `request.jwt.claims`), erwartet: nur A's Fall.

- [ ] **Step 2: Funktion schreiben + via Plugin applizieren**

```sql
CREATE OR REPLACE FUNCTION public.search_global(q text, limit_per_type int DEFAULT 6)
RETURNS TABLE (entity_type text, id uuid, label text, sub text, status text, score real)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_role user_role;
BEGIN
  IF length(coalesce(q,'')) < 2 THEN RETURN; END IF;
  SELECT rolle INTO v_role FROM profiles WHERE id = auth.uid();

  -- Fall: claim_nummer / schadenort_ort / polizei_aktenzeichen (alle Rollen, RLS scoped)
  RETURN QUERY SELECT * FROM (
    SELECT 'claim'::text, c.id,
           c.claim_nummer::text,
           coalesce(c.schadenort_ort, c.polizei_aktenzeichen)::text,
           c.operative_status::text,
           GREATEST(similarity(coalesce(c.claim_nummer,''), q),
                    similarity(coalesce(c.schadenort_ort,''), q),
                    similarity(coalesce(c.polizei_aktenzeichen,''), q))::real AS s
    FROM claims c
    WHERE c.claim_nummer % q OR c.schadenort_ort % q OR c.polizei_aktenzeichen % q
    ORDER BY s DESC LIMIT limit_per_type
  ) x;

  -- Fahrzeug -> Fall (Kennzeichen; alle Rollen, RLS via claims)
  RETURN QUERY SELECT * FROM (
    SELECT 'claim'::text, c.id, v.kennzeichen_aktuell::text, c.claim_nummer::text,
           c.operative_status::text, similarity(coalesce(v.kennzeichen_normalized,''), q)::real AS s
    FROM vehicles v JOIN claims c ON c.vehicle_id = v.id
    WHERE v.kennzeichen_normalized % q
    ORDER BY s DESC LIMIT limit_per_type
  ) x;

  -- Person -> Fall (Name/Firma via claim_parties; alle Rollen, RLS via claims)
  RETURN QUERY SELECT * FROM (
    SELECT 'claim'::text, c.id, concat_ws(' ', p.vorname, p.nachname)::text, c.claim_nummer::text,
           c.operative_status::text,
           GREATEST(similarity(coalesce(p.vorname,''), q),
                    similarity(coalesce(p.nachname,''), q),
                    similarity(coalesce(p.firma,''), q))::real AS s
    FROM personen p
    JOIN claim_parties cp ON cp.person_id = p.id AND cp.ist_aktiv
    JOIN claims c ON c.id = cp.claim_id
    WHERE p.vorname % q OR p.nachname % q OR p.firma % q
    ORDER BY s DESC LIMIT limit_per_type
  ) x;

  -- Lead (nur admin/kundenbetreuer/dispatch/leadbearbeiter/makler)
  IF v_role = ANY(ARRAY['admin','kundenbetreuer','dispatch','leadbearbeiter','makler']::user_role[]) THEN
    RETURN QUERY SELECT * FROM (
      SELECT 'lead'::text, l.id, concat_ws(' ', l.vorname, l.nachname)::text,
             coalesce(l.kennzeichen, l.lead_nummer)::text, l.status::text,
             GREATEST(similarity(coalesce(l.vorname,''), q),
                      similarity(coalesce(l.nachname,''), q),
                      similarity(coalesce(l.kennzeichen,''), q),
                      similarity(coalesce(l.lead_nummer,''), q))::real AS s
      FROM leads l
      WHERE l.vorname % q OR l.nachname % q OR l.kennzeichen % q OR l.lead_nummer % q
      ORDER BY s DESC LIMIT limit_per_type
    ) x;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_global(text, int) TO authenticated;
```

- [ ] **Step 3: Getrackte Version ablesen + File committen** (`<V2>_search_global_function.sql`, Regel 2).
- [ ] **Step 4: Fuzzy + Min-Länge (READ)** — `execute_sql`: `SELECT * FROM search_global('Schmit');` als Service liefert (ohne auth.uid → v_role NULL → nur claim/vehicle/person-Zweige, RLS je nach Kontext) — hier primär prüfen: kein Fehler, `<2`-Zeichen → 0 Rows (`SELECT * FROM search_global('a')` → leer).
- [ ] **Step 5: RLS-Leak-Smoke dokumentieren** — Prod-Regel-4-Smoke (Task 8): als Test-Kunde suchen → nur eigener Fall. Hier vermerken.
- [ ] **Step 6: Commit** — `git add supabase/migrations/<V2>_* && git commit -m "feat(suche): search_global RPC (SECURITY INVOKER, pg_trgm, role-gated)"`

---

## Task 3: `routeForEntity` (pure Helper)

**Files:**
- Create: `src/lib/search/types.ts`, `src/lib/search/route-for-entity.ts`
- Test: `src/lib/search/route-for-entity.test.ts`

**Interfaces:**
- Produces: `type EntityType = 'claim' | 'lead'`; `routeForEntity(entityType: EntityType, id: string, rolle: string): string | null`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { routeForEntity } from './route-for-entity'

describe('routeForEntity', () => {
  it('routet claim rollen-bewusst', () => {
    expect(routeForEntity('claim', 'c1', 'kunde')).toBe('/kunde/faelle/c1')
    expect(routeForEntity('claim', 'c1', 'sachverstaendiger')).toBe('/gutachter/fall/c1')
    expect(routeForEntity('claim', 'c1', 'makler')).toBe('/makler/akten/c1')
    expect(routeForEntity('claim', 'c1', 'admin')).toBe('/faelle/c1')
  })
  it('routet lead nach dispatch', () => {
    expect(routeForEntity('lead', 'l1', 'dispatch')).toBe('/dispatch/leads/l1')
  })
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/search/route-for-entity.test.ts` (Cannot find module).
- [ ] **Step 3: Implement**

```typescript
// src/lib/search/types.ts
export type EntityType = 'claim' | 'lead'
export interface SearchHit { entity_type: EntityType; id: string; label: string; sub: string | null; status: string | null; score: number }
export interface SearchGroup { entityType: EntityType; hits: SearchHit[] }
```

```typescript
// src/lib/search/route-for-entity.ts
import type { EntityType } from './types'

// Spiegelt routeForKontext (src/lib/updates/split.ts) — rollen-bewusste Detail-Route.
export function routeForEntity(entityType: EntityType, id: string, rolle: string): string | null {
  if (!id) return null
  if (entityType === 'claim') {
    switch (rolle) {
      case 'kunde': return `/kunde/faelle/${id}`
      case 'sachverstaendiger': return `/gutachter/fall/${id}`
      case 'makler': return `/makler/akten/${id}`
      default: return `/faelle/${id}` // admin/dispatch/kundenbetreuer/leadbearbeiter/kanzlei/werkstatt/flottenmanager
    }
  }
  if (entityType === 'lead') return `/dispatch/leads/${id}`
  return null
}
```

- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** — `git add src/lib/search/ && git commit -m "feat(suche): routeForEntity + search types"`

---

## Task 4: `dedupeAndGroup` (pure Helper)

**Files:**
- Create: `src/lib/search/parse-results.ts`
- Test: `src/lib/search/parse-results.test.ts`

**Interfaces:**
- Consumes: `SearchHit[]` (aus dem RPC). Produces: `dedupeAndGroup(hits: SearchHit[]): SearchGroup[]` — dedupliziert Claims per `id` (höchster score gewinnt), gruppiert nach `entity_type`, Gruppen + Hits nach score sortiert.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { dedupeAndGroup } from './parse-results'
import type { SearchHit } from './types'

const hit = (o: Partial<SearchHit>): SearchHit => ({ entity_type: 'claim', id: 'x', label: 'l', sub: null, status: null, score: 0.5, ...o })

describe('dedupeAndGroup', () => {
  it('dedupliziert denselben Fall (claim_nummer + kennzeichen), höchster score', () => {
    const groups = dedupeAndGroup([hit({ id: 'c1', score: 0.4 }), hit({ id: 'c1', score: 0.9 })])
    const claims = groups.find(g => g.entityType === 'claim')!
    expect(claims.hits).toHaveLength(1)
    expect(claims.hits[0].score).toBe(0.9)
  })
  it('gruppiert nach entity_type und sortiert je Gruppe nach score', () => {
    const groups = dedupeAndGroup([hit({ id: 'c1', score: 0.3 }), hit({ entity_type: 'lead', id: 'l1', score: 0.8 })])
    expect(groups.map(g => g.entityType)).toContain('lead')
    expect(groups.find(g => g.entityType === 'claim')!.hits[0].id).toBe('c1')
  })
})
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/lib/search/parse-results.ts
import type { SearchHit, SearchGroup, EntityType } from './types'

const ORDER: EntityType[] = ['claim', 'lead']

export function dedupeAndGroup(hits: SearchHit[]): SearchGroup[] {
  const best = new Map<string, SearchHit>()
  for (const h of hits) {
    const key = `${h.entity_type}:${h.id}`
    const prev = best.get(key)
    if (!prev || h.score > prev.score) best.set(key, h)
  }
  const byType = new Map<EntityType, SearchHit[]>()
  for (const h of best.values()) {
    const arr = byType.get(h.entity_type) ?? []
    arr.push(h)
    byType.set(h.entity_type, arr)
  }
  return ORDER.filter(t => byType.has(t)).map(t => ({
    entityType: t,
    hits: byType.get(t)!.sort((a, b) => b.score - a.score),
  }))
}
```

- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** — `git add src/lib/search/parse-results* && git commit -m "feat(suche): dedupeAndGroup search results"`

---

## Task 5: `/api/search`-Endpoint (User-Client → RPC)

**Files:**
- Replace: `src/app/api/search/route.ts`
- Test: `src/app/api/search/route.test.ts`

**Interfaces:**
- Consumes: `search_global`-RPC (Task 2), `dedupeAndGroup` (Task 4). Produces: `GET /api/search?q=…` → `{ ok: true, groups: SearchGroup[] }` / `{ ok: false }`.

- [ ] **Step 1: Failing test** (mockt den Supabase-User-Client + `dedupeAndGroup`)

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    rpc: vi.fn(async () => ({ data: [{ entity_type: 'claim', id: 'c1', label: 'CLM-1', sub: null, status: 'offen', score: 0.9 }], error: null })),
  })),
}))

describe('GET /api/search', () => {
  it('gibt gruppierte Treffer zurück', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('http://x/api/search?q=CLM'))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.groups[0].entityType).toBe('claim')
  })
  it('leerer/zu kurzer Query → leere Gruppen', async () => {
    const { GET } = await import('./route')
    const res = await GET(new Request('http://x/api/search?q=a'))
    const body = await res.json()
    expect(body.groups).toEqual([])
  })
})
```

- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/app/api/search/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dedupeAndGroup } from '@/lib/search/parse-results'
import type { SearchHit } from '@/lib/search/types'

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ ok: true, groups: [] })
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_global', { q, limit_per_type: 6 })
  if (error) return NextResponse.json({ ok: false, groups: [] }, { status: 200 })
  return NextResponse.json({ ok: true, groups: dedupeAndGroup((data ?? []) as SearchHit[]) })
}
```

- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** — `git add src/app/api/search/ && git commit -m "feat(suche): unified /api/search via search_global RPC"`

---

## Task 6: `<GlobalSearch/>` (Spotlight-Wrapper) + Admin/SV-Verdrahtung

**Files:**
- Create: `src/components/shared/search/GlobalSearch.tsx`
- Modify: `src/app/admin/layout.tsx` (ersetze `<Spotlight/>`), SV-Layout (ersetze `SVSpotlight`)
- Test: `src/components/shared/search/GlobalSearch.test.tsx` (Render + Ergebnis-Klick → `routeForEntity`)

**Interfaces:**
- Consumes: `/api/search` (Task 5), `routeForEntity` (Task 3), `Spotlight` (bestehend). Produces: `<GlobalSearch rolle={string} />`.

- [ ] **Step 1: Bestehende Wrapper lesen** — `src/components/shared/Spotlight.tsx` (Props: `searchEndpoint`, `parseResponse`, `navigate`), `src/components/Spotlight.tsx` + `SVSpotlight.tsx` als Vorlage.
- [ ] **Step 2: Failing test** (Render, mock fetch `/api/search`, Klick eines Treffers ruft `router.push(routeForEntity(...))`).

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
// ... mock global.fetch → { ok:true, groups:[{entityType:'claim',hits:[{id:'c1',label:'CLM-1',...}]}] }

// GlobalSearch öffnet (Cmd+K), tippt 'CLM', klickt Treffer → push('/faelle/c1') für admin
```

- [ ] **Step 3: Implement `GlobalSearch.tsx`** — nutzt `Spotlight` mit `searchEndpoint="/api/search"`, `parseResponse` = `res.groups.flatMap(g => g.hits.map(h => ({...h, group: g.entityType})))`, `navigate` = `(h) => router.push(routeForEntity(h.entity_type, h.id, rolle) ?? '#')`. Gruppierte Anzeige über die `group`-Property.
- [ ] **Step 4: Verdrahten** — `admin/layout.tsx`: `<GlobalSearch rolle="admin" />`; SV-Layout: `<GlobalSearch rolle="sachverstaendiger" />` (Rolle aus dem bestehenden Layout-Kontext/Session).
- [ ] **Step 5: Run tests → PASS**
- [ ] **Step 6: Commit** — `git add src/components/shared/search/ src/app/admin/layout.tsx <sv-layout> && git commit -m "feat(suche): unified GlobalSearch wrapper, wired into admin + SV"`

---

## Task 7: Dead-Code entfernen + Build

**Files:**
- Delete: `src/app/gutachter/_components/SVSpotlight.tsx`, `src/app/api/gutachter/search/route.ts`, `src/components/Spotlight.tsx`

**Interfaces:**
- Consumes: alle vorherigen Tasks.

- [ ] **Step 1: Konsumenten prüfen** — `grep -rn "SVSpotlight\|api/gutachter/search\|from '@/components/Spotlight'" src/` → nur die zu ersetzenden Stellen (in Task 6 bereits umgestellt).
- [ ] **Step 2: Löschen** der drei Dateien.
- [ ] **Step 3: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` grün; `npm run build` compiled; Ratchets `npm run check:token-audit` / `check:component-set -- --ratchet` / `check:knip -- --ratchet` 0-neu (knip: gelöschte Files senken evtl. Baseline → `--update-baseline`).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "chore(suche): remove superseded SVSpotlight + per-portal search endpoints"`

---

## Task 8: Prod-Regel-4-Smoke (RLS-Leak + Fuzzy)

**Nach Deploy** (staging→prod via Release-Lane). Kein Code — Verifikation.

- [ ] **Step 1: Fuzzy** — als Admin `Schmit` suchen → findet `Schmidt`-Fall; Kennzeichen mit Tippfehler → findet den Fall.
- [ ] **Step 2: RLS-Leak (kritisch)** — als **Test-Kunde** (`telefon=NULL`) suchen → **nur eigener Fall**, nie fremde; als SV → nur eigene Fälle.
- [ ] **Step 3: Rollen-Menge** — Kunde-Suche liefert **keine** Leads; Dispatch-Suche liefert Leads.
- [ ] **Step 4:** Ergebnis (grün/rot + Screenshots) im PR/Marker dokumentieren. Rot → Fix nachziehen.

---

## Self-Review

**Spec-Coverage:** pg_trgm (T1) · RPC INVOKER role-gated (T2) · routeForEntity (T3) · Dedup/Gruppierung (T4) · /api/search User-Client (T5) · GlobalSearch-Unify + admin/SV (T6) · Dead-Code (T7) · RLS-Leak-Test (T8). Slice-1-Spec-Punkte alle abgedeckt. **Bewusst NICHT in Slice 1:** neue Portale (Slice 2), SV/Werkstatt/Makler/Versicherung/Rückruf als eigene Entitäten (Slice 3) — Person ist als Fall-Surrogat drin, standalone-Person später.

**Type-Konsistenz:** `EntityType='claim'|'lead'`, `SearchHit`, `SearchGroup` einheitlich über T3-T6; RPC-Spalten (entity_type,id,label,sub,status,score) = `SearchHit`-Felder.

**Verifizierte DB-Fakten:** `claims.vehicle_id`, `claims.operative_status`, `leads.status`, `claim_parties(person_id,claim_id,ist_aktiv)`, `user_role`-Enum inkl. `leadbearbeiter` — alle 2026-07-14 gegen prod geprüft.

**Offen (kein Blocker für T1-T2, im Task vermerkt):** `pg_trgm.similarity_threshold` Default ~0.25 (in T2/T8 tunen, ggf. `SET LOCAL pg_trgm.similarity_threshold`).
