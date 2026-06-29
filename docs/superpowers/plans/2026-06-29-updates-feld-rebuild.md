# Updates-Feld Rebuild — Implementation Plan (Phase 1 + Phase 0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das in-app „Updates"-Feld auf ein DB-getriebenes Action-Modell umbauen — diese erste Plan-Hälfte liefert die additive Grundlage: alle Rollen-Coverage geschlossen (Phase 1) + die abgeleitete Action-Worklist-Funktion + Read-API (Phase 0).

**Architecture:** Action-Worklist wird aus DB-Feld-State **abgeleitet** (Postgres-Funktion `get_updates_action`, UNION benannter Action-Sources) statt imperativ materialisiert → keine Coverage-Lücken, Auto-Resolve gratis. Info-Feed + externe Kanäle bleiben event-getrieben. Read-API merged Action + Info zum einheitlichen Item.

**Tech Stack:** Next.js 16 · Supabase (Postgres + RLS) · TypeScript · vitest. Spec: `docs/superpowers/specs/2026-06-29-updates-feld-rebuild-design.md`.

## Global Constraints

- **Regel 1:** Nie direkt auf `main`/`staging` pushen — Feature-Branch + PR. (Dieser Plan: Branch `kitta/updates-feld-rebuild-spec` oder neuer.)
- **Regel 2:** DDL **ausschließlich** via `mcp__plugin_supabase_supabase__apply_migration` → `list_migrations` (Version ablesen) → File `supabase/migrations/<V>_<name>.sql` exakt nach getrackter Version benennen → `execute_sql` (READ) zum Verifizieren. Nie raw `execute_sql` mit DDL.
- **7-Punkte-Audit** im Commit-Body (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression).
- **Umlaute** in UI-Strings (echte ä/ö/ü/ß).
- **Koordination:** berührt geteilte Infra (`ROLE_MAP`, `mitteilungen`, perspektivisch `UpdatesNav`) — viele aktive Sessions. Phase 1+0 sind **additiv** (neue Spalte, neue Funktion, ROLE_MAP-Erweiterung) → kollisionsarm. Marker schreiben.
- **Verifizierte Schemas (29.06.):** `tasks(status,zugewiesen_an,empfaenger_user_id,claim_id,prioritaet,titel,beschreibung,created_at)` · `pflichtdokumente(status,pflicht,dokument_typ,begruendung,claim_id,created_at)` · `claims(geschaedigter_user_id)` = Kunde · `nachrichten(gelesen,empfaenger_id,nachricht,claim_id,created_at)` · `profiles(rolle)` (kein last_seen).

## File Structure

- `src/lib/mitteilungen/types.ts` — `EmpfaengerRolle`-Type (+`werkstatt`).
- `src/lib/notifications/channels/in-app.ts` — `ROLE_MAP` (+dispatch/kanzlei/werkstatt + leadbearbeiter-Alias).
- `supabase/migrations/<V>_updates_last_seen.sql` — `profiles.updates_last_seen_at`.
- `supabase/migrations/<V>_get_updates_action.sql` — Derive-Funktion.
- `src/lib/updates/get-updates.ts` — Read-API (merged Action + Info → Item[]).
- `src/lib/updates/types.ts` — `UpdateItem`-Type.
- `src/lib/updates/__tests__/get-updates.test.ts` — vitest.

---

## Task 1: Rollen-Coverage schließen (Phase 1 — Quick-Win, sichtbar)

**Files:**
- Modify: `src/lib/mitteilungen/types.ts` (EmpfaengerRolle)
- Modify: `src/lib/notifications/channels/in-app.ts` (ROLE_MAP)
- Test: `src/lib/notifications/channels/__tests__/role-map.test.ts`

**Interfaces:**
- Produces: `ROLE_MAP` deckt alle 9 Profil-Rollen ab (leadbearbeiter→dispatch); `EmpfaengerRolle` enthält `werkstatt`.

- [ ] **Step 1: Failing test** — `src/lib/notifications/channels/__tests__/role-map.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { ROLE_MAP } from '../in-app'

const PROFILE_ROLES = ['kunde','sachverstaendiger','admin','kanzlei','leadbearbeiter','dispatch','kundenbetreuer','makler','werkstatt'] as const

describe('ROLE_MAP — vollständige Rollen-Coverage (#updates-rebuild)', () => {
  it('mappt JEDE Profil-Rolle (keine leere Bell)', () => {
    for (const r of PROFILE_ROLES) expect(ROLE_MAP[r], `Rolle ${r} fehlt`).toBeDefined()
  })
  it('leadbearbeiter ist Alias auf dispatch (gleiche logische Rolle)', () => {
    expect(ROLE_MAP['leadbearbeiter']).toBe('dispatch')
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run src/lib/notifications/channels/__tests__/role-map.test.ts`
Expected: FAIL (dispatch/kanzlei/werkstatt/leadbearbeiter `undefined`).

- [ ] **Step 3: EmpfaengerRolle +werkstatt** — `src/lib/mitteilungen/types.ts`

Im `EmpfaengerRolle`-Union `| 'werkstatt'` ergänzen (hinter `'makler'`).

- [ ] **Step 4: ROLE_MAP erweitern** — `src/lib/notifications/channels/in-app.ts`

```ts
const ROLE_MAP: Record<string, EmpfaengerRolle> = {
  kunde: 'kunde',
  sachverstaendiger: 'sachverstaendiger',
  makler: 'makler',
  kundenbetreuer: 'kundenbetreuer',
  admin: 'admin',
  dispatch: 'dispatch',
  kanzlei: 'kanzlei',
  werkstatt: 'werkstatt',
  leadbearbeiter: 'dispatch', // toter Enum-Wert, 0 Code/User -> ist der Dispatcher
}
```

- [ ] **Step 5: Run — verify PASS** + `npx tsc --noEmit` grün (auf den Files).

- [ ] **Step 6: Commit**

```bash
git add src/lib/mitteilungen/types.ts src/lib/notifications/channels/in-app.ts src/lib/notifications/channels/__tests__/role-map.test.ts
git commit -m "feat(updates): ROLE_MAP deckt alle 9 Rollen ab (dispatch/kanzlei/werkstatt + leadbearbeiter-Alias)"
```

---

## Task 2: `updates_last_seen_at`-Spalte (Phase 0)

**Files:** Create migration `supabase/migrations/<V>_updates_last_seen.sql`

**Interfaces:** Produces: `profiles.updates_last_seen_at timestamptz` (Read-Marker für den Info-Feed).

- [ ] **Step 1: DDL via Plugin**

`apply_migration({ name: "updates_last_seen", query: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updates_last_seen_at timestamptz;" })`

- [ ] **Step 2: Version ablesen + File committen**

`list_migrations` → Version `<V>` ablesen → File `supabase/migrations/<V>_updates_last_seen.sql` mit exakt der DDL anlegen (Dateiname == `<V>`).

- [ ] **Step 3: Verifizieren (READ)**

`execute_sql("SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='updates_last_seen_at'")` → 1 Zeile.

- [ ] **Step 4: Commit** `git add supabase/migrations/<V>_updates_last_seen.sql && git commit -m "feat(updates): profiles.updates_last_seen_at"`

---

## Task 3: Derive-Funktion `get_updates_action` (Phase 0 — Herzstück)

**Files:** Create migration `supabase/migrations/<V>_get_updates_action.sql`

**Interfaces:**
- Produces: `get_updates_action(p_user_id uuid, p_rolle text) RETURNS TABLE(id uuid, typ text, modus text, prioritaet text, titel text, inhalt text, kontext_typ text, kontext_id uuid, source text, created_at timestamptz)` — die abgeleitete Action-Worklist (Start: 3 Sources). `STABLE`, `SECURITY DEFINER` mit gesetztem `search_path=public`.

- [ ] **Step 1: DDL via Plugin** — `apply_migration({ name: "get_updates_action", query: <unten> })`

```sql
CREATE OR REPLACE FUNCTION get_updates_action(p_user_id uuid, p_rolle text)
RETURNS TABLE (id uuid, typ text, modus text, prioritaet text, titel text,
               inhalt text, kontext_typ text, kontext_id uuid, source text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- offene_aufgabe (alle Rollen)
  SELECT t.id, 'task', 'action', COALESCE(t.prioritaet,'normal'),
         t.titel, t.beschreibung, 'claim', t.claim_id, 'offene_aufgabe', t.created_at
  FROM tasks t
  WHERE t.status NOT IN ('erledigt','canceled','blockiert')
    AND (t.zugewiesen_an = p_user_id OR t.empfaenger_user_id = p_user_id)
  UNION ALL
  -- dok_fehlt (nur kunde)
  SELECT pd.id, 'event', 'action', 'hoch',
         'Dokument fehlt: ' || pd.dokument_typ, pd.begruendung, 'claim', pd.claim_id, 'dok_fehlt', pd.created_at
  FROM pflichtdokumente pd
  JOIN claims c ON c.id = pd.claim_id
  WHERE pd.status = 'ausstehend' AND pd.pflicht = true
    AND p_rolle = 'kunde' AND c.geschaedigter_user_id = p_user_id
  UNION ALL
  -- unbeantw_nachricht (alle Rollen)
  SELECT n.id, 'message', 'action', 'normal',
         'Neue Nachricht', left(n.nachricht, 140), 'claim', n.claim_id, 'unbeantw_nachricht', n.created_at
  FROM nachrichten n
  WHERE n.gelesen = false AND n.empfaenger_id = p_user_id;
$$;
```

- [ ] **Step 2: Version ablesen + File committen** (`list_migrations` → `<V>` → `supabase/migrations/<V>_get_updates_action.sql`).

- [ ] **Step 3: Verifizieren mit echtem User** — `execute_sql` mit einem `tasks.zugewiesen_an`-User:

`SELECT count(*) FROM get_updates_action('<echte-user-uuid>','admin');` → erwartet >0 wenn der User offene Tasks hat. Plus Smoke: `SELECT * FROM get_updates_action('<kunde-user>','kunde') LIMIT 5;`.

- [ ] **Step 4: Commit** `git add supabase/migrations/<V>_get_updates_action.sql && git commit -m "feat(updates): get_updates_action Derive-Funktion (3 Action-Sources)"`

---

## Task 4: Read-API `getUpdates` (Phase 0)

**Files:**
- Create: `src/lib/updates/types.ts`, `src/lib/updates/get-updates.ts`
- Test: `src/lib/updates/__tests__/get-updates.test.ts`

**Interfaces:**
- Consumes: `get_updates_action`-RPC (Task 3), `mitteilungen` (Info-Items, `kategorie`-basiert bis Phase 2 das Schema migriert).
- Produces: `getUpdates(db, userId, rolle): Promise<UpdateItem[]>` — gemergt (Action zuerst nach prio, dann Info nach created_at). `UpdateItem = { id; typ; modus: 'info'|'action'; prioritaet; titel; inhalt: string|null; kontextTyp: string|null; kontextId: string|null; routeUrl: string|null; source: string; createdAt: string }`.

- [ ] **Step 1: Failing test** — `src/lib/updates/__tests__/get-updates.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const h = vi.hoisted(() => {
  const state = { rpc: [] as unknown[], info: [] as unknown[] }
  const db = {
    rpc: (_fn: string, _args: unknown) => Promise.resolve({ data: state.rpc, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () =>
      Promise.resolve({ data: state.info, error: null }) }) }) }) }) }),
  }
  return { state, db }
})
import { getUpdates } from '../get-updates'

beforeEach(() => { h.state.rpc = []; h.state.info = [] })

describe('getUpdates (#updates-rebuild)', () => {
  it('Action-Items aus der Derive-RPC kommen mit modus=action, Info zuletzt', async () => {
    h.state.rpc = [{ id: 'a1', typ: 'task', modus: 'action', prioritaet: 'dringend', titel: 'T', inhalt: null, kontext_typ: 'claim', kontext_id: 'c1', source: 'offene_aufgabe', created_at: '2026-06-29T10:00:00Z' }]
    h.state.info = [{ id: 'i1', kategorie: 'update', titel: 'Info', inhalt: null, kontext_typ: 'claim', kontext_id: 'c2', route_url: '/x', prioritaet: 'normal', created_at: '2026-06-29T09:00:00Z' }]
    const items = await getUpdates(h.db as never, 'u1', 'admin')
    expect(items[0]).toMatchObject({ modus: 'action', source: 'offene_aufgabe' })
    expect(items.at(-1)).toMatchObject({ modus: 'info', id: 'i1' })
  })
})
```

- [ ] **Step 2: Run — verify FAIL** (`getUpdates` nicht definiert).

- [ ] **Step 3: Types** — `src/lib/updates/types.ts`

```ts
export type UpdateItem = {
  id: string
  typ: 'event' | 'message' | 'call' | 'task'
  modus: 'info' | 'action'
  prioritaet: 'normal' | 'hoch' | 'dringend'
  titel: string
  inhalt: string | null
  kontextTyp: string | null
  kontextId: string | null
  routeUrl: string | null
  source: string
  createdAt: string
}
```

- [ ] **Step 4: Implementation** — `src/lib/updates/get-updates.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UpdateItem } from './types'

export async function getUpdates(db: SupabaseClient, userId: string, rolle: string): Promise<UpdateItem[]> {
  const { data: actionRows } = await db.rpc('get_updates_action', { p_user_id: userId, p_rolle: rolle })
  const actions: UpdateItem[] = (actionRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, typ: r.typ as UpdateItem['typ'], modus: 'action',
    prioritaet: (r.prioritaet as UpdateItem['prioritaet']) ?? 'normal',
    titel: r.titel as string, inhalt: (r.inhalt as string) ?? null,
    kontextTyp: (r.kontext_typ as string) ?? null, kontextId: (r.kontext_id as string) ?? null,
    routeUrl: null, source: r.source as string, createdAt: r.created_at as string,
  }))
  const { data: infoRows } = await db.from('mitteilungen').select('*')
    .eq('empfaenger_id', userId).eq('kategorie', 'update')
    .order('created_at', { ascending: false }).limit(50)
  const infos: UpdateItem[] = (infoRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, typ: 'event', modus: 'info',
    prioritaet: (r.prioritaet as UpdateItem['prioritaet']) ?? 'normal',
    titel: r.titel as string, inhalt: (r.inhalt as string) ?? null,
    kontextTyp: (r.kontext_typ as string) ?? null, kontextId: (r.kontext_id as string) ?? null,
    routeUrl: (r.route_url as string) ?? null, source: 'info', createdAt: r.created_at as string,
  }))
  const prioRank = { dringend: 0, hoch: 1, normal: 2 } as const
  actions.sort((a, b) => prioRank[a.prioritaet] - prioRank[b.prioritaet] || b.createdAt.localeCompare(a.createdAt))
  return [...actions, ...infos]
}
```

- [ ] **Step 5: Run — verify PASS** + `npx tsc --noEmit` (auf den neuen Files).

- [ ] **Step 6: Commit** `git add src/lib/updates && git commit -m "feat(updates): getUpdates Read-API (Action-Derive + Info-Merge)"`

---

## Roadmap — Folge-Pläne (je eigener Plan, wenn Phase erreicht)

- **Phase 2 — Read-Modell:** `mitteilungen` +`typ`/`modus`/`gesehen_am`/`erledigt_am` (Migration), Badge = `get_updates_action`-Count, „alles gesehen" setzt `updates_last_seen_at`, in-app-Channel schreibt nur Info. → eigener Plan `2026-…-updates-read-model.md`.
- **Phase 3 — UI-Rebuild:** `UpdatesNav` auf „Braucht dich"/„Verlauf" + Typ-Filter, `getUpdates` als Datenquelle. → eigener Plan.
- **Phase 4 — Action-Sources:** Fristen/Finanzen/Verifizierung/Re-Termin/Konsultation/Auftrag als weitere UNION-Zweige in `get_updates_action` (je Source: 1 Query + 1 Test). → eigener Plan.
- **Phase 5 — Cleanup:** `gutachter_mitteilungen` retiren, `task`-Kategorie raus, direkte Caller normalisieren, optional `/updates`-Vollseite. → eigener Plan.

## Self-Review-Hinweise (für den Ausführenden)
- Jede neue Action-Source: erst `execute_sql` gegen Live-Schema (Feld/Prädikat), dann UNION-Zweig + Smoke-Count. Falsch-positive Items = nerviger Lärm, falsch-negative = versteckte Arbeit.
- Route-URL-Resolution (`route_url=null` in der RPC) wird in Phase 3 client-/API-seitig aus `kontextTyp/kontextId` + Rolle aufgelöst (analog bestehendem `autoRouteUrl`).
