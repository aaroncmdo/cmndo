# SV-Termine kanonische Quelle — Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SV-Kalender + Tagesroute + zwei Cron/Notification-Surfaces + Admin-Kalender lesen Termine kanonisch aus `gutachter_termine` (via `assignee_id`), statt aus den stale `sv_termin`/`aktueller_termin_*`-Spalten von `v_faelle_mit_aktuellem_termin`.

**Architecture:** Ein neuer reiner Helper `svTermine()` kapselt die kanonische `gutachter_termine`-Query (assignee-gescoped). Kalender + Tagesroute konsumieren ihn; die Crons/Admin lesen `gutachter_termine` direkt. `v_claim_base`/`v_faelle_mit_aktuellem_termin` werden NICHT verändert (contested). Rein Query-/Display-Code, kein DDL.

**Tech Stack:** Next.js 15 (App Router, RSC, Route Handlers), Supabase (`gutachter_termine`, `v_claim_full` für Enrichment), vitest (TDD).

## Global Constraints

- **Regel 1:** kein Direct-Push auf main; Branch `kitta/sv-termine-canonical-source` (off staging), PR gegen staging.
- **Kein DDL / kein View-Change.** `v_claim_base`/`v_faelle_mit_aktuellem_termin` NICHT anfassen (contested — payment-ledger #3795). Nur Consumer.
- **Kanonik:** SV-Termine = `gutachter_termine` `WHERE assignee_id=svId AND assignee_typ='sachverstaendiger'`. NIE `sv_termin`/`aktueller_termin_*` aus der View für Termin-Daten.
- **Enrichment:** Fall-/Claim-Daten via `v_claim_full` (Muster: `heute/page.tsx`), Leads via admin-client, Kunde via `claim_parties`. Bezug-native Termine (fall_id NULL) über `effektiveBezugIds` (`lib/termine/effektive-bezug-ids.ts`).
- **Umlaute** in nutzersichtbaren Strings. **Ratchets** 0-neu. **TDD.** Voller 7-Punkte-Audit im PR.
- **EXCLUDE (Phase 1b, Aaron-gated):** `monatsabrechnung` + `storno-actions`-Vertragsstrafe. NICHT in diesem PR.

---

### Task 1: Helper `svTermine` (kanonische SV-Termin-Query) + Tests

**Files:**
- Create: `src/lib/termine/sv-termine.ts`
- Test: `src/lib/termine/sv-termine.test.ts`

**Interfaces:**
- Produces: `svTermine(db, svId: string, opts: { statuses: string[]; from?: string; to?: string }): Promise<SvTerminRow[]>` where `SvTerminRow = { id, fall_id, lead_id, claim_id, bezug_typ, bezug_id, start_zeit, end_zeit, status, final_verbindlich_ab, gesehen_am, besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_place_id }`
- Also produces the query-builder seam `buildSvTermineQuery(qb, svId, opts)` for source-testability.

- [ ] **Step 1: Write the failing test** — `src/lib/termine/sv-termine.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildSvTermineQuery } from './sv-termine'

function fakeQb() {
  const calls: any[] = []
  const qb: any = {}
  for (const m of ['select','eq','in','gte','lt','order']) qb[m] = vi.fn((...a: any[]) => { calls.push({ m, a }); return qb })
  qb._calls = calls
  return qb
}

describe('buildSvTermineQuery', () => {
  it('filtert assignee_id + assignee_typ=sachverstaendiger + status IN + Fenster', () => {
    const qb = fakeQb()
    buildSvTermineQuery(qb, 'sv-1', { statuses: ['reserviert','bestaetigt'], from: '2026-07-01T00:00:00Z', to: '2026-08-01T00:00:00Z' })
    const eqs = qb._calls.filter((c: any) => c.m === 'eq').map((c: any) => c.a)
    expect(eqs).toContainEqual(['assignee_id', 'sv-1'])
    expect(eqs).toContainEqual(['assignee_typ', 'sachverstaendiger'])
    expect(qb._calls.some((c: any) => c.m === 'in' && c.a[0] === 'status')).toBe(true)
    expect(qb._calls.some((c: any) => c.m === 'gte' && c.a[0] === 'start_zeit')).toBe(true)
    expect(qb._calls.some((c: any) => c.m === 'lt' && c.a[0] === 'start_zeit')).toBe(true)
  })
  it('ohne Fenster keine gte/lt', () => {
    const qb = fakeQb()
    buildSvTermineQuery(qb, 'sv-1', { statuses: ['bestaetigt'] })
    expect(qb._calls.some((c: any) => c.m === 'gte')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** — `npx vitest run src/lib/termine/sv-termine.test.ts` → `buildSvTermineQuery is not a function`.

- [ ] **Step 3: Implement** — `src/lib/termine/sv-termine.ts`

```ts
// Kanonische SV-Termin-Quelle: gutachter_termine via assignee_id (CMM-49).
// v_faelle_mit_aktuellem_termin.sv_termin/aktueller_termin_* sind stale (claim-scoped,
// claim_id meist NULL) — NICHT fuer Termine nutzen. Siehe Spec 2026-07-07-sv-termine-canonical-source.
import type { SupabaseClient } from '@supabase/supabase-js'

export type SvTerminRow = {
  id: string; fall_id: string | null; lead_id: string | null; claim_id: string | null
  bezug_typ: string | null; bezug_id: string | null
  start_zeit: string; end_zeit: string | null; status: string
  final_verbindlich_ab: string | null; gesehen_am: string | null
  besichtigungsort_adresse: string | null; besichtigungsort_lat: number | null
  besichtigungsort_lng: number | null; besichtigungsort_place_id: string | null
}
export type SvTermineOpts = { statuses: string[]; from?: string; to?: string }

const SELECT = 'id, fall_id, lead_id, claim_id, bezug_typ, bezug_id, start_zeit, end_zeit, status, final_verbindlich_ab, gesehen_am, besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_place_id'

export function buildSvTermineQuery(qb: any, svId: string, opts: SvTermineOpts) {
  let q = qb.select(SELECT)
    .eq('assignee_id', svId)
    .eq('assignee_typ', 'sachverstaendiger')
    .in('status', opts.statuses)
  if (opts.from) q = q.gte('start_zeit', opts.from)
  if (opts.to) q = q.lt('start_zeit', opts.to)
  return q.order('start_zeit', { ascending: true })
}

export async function svTermine(
  db: SupabaseClient, svId: string, opts: SvTermineOpts,
): Promise<SvTerminRow[]> {
  const { data, error } = await buildSvTermineQuery(db.from('gutachter_termine'), svId, opts)
  if (error) { console.error('[sv-termine] query:', error.message); return [] }
  return (data ?? []) as SvTerminRow[]
}
```

- [ ] **Step 4: Run — expect PASS** — `npx vitest run src/lib/termine/sv-termine.test.ts` → 2/2.

- [ ] **Step 5: Commit** — `git add src/lib/termine/sv-termine.ts src/lib/termine/sv-termine.test.ts && git commit -m "feat(termine): svTermine helper - kanonische gutachter_termine.assignee_id-Quelle + tests"`

---

### Task 2: SV-Kalender auf `svTermine` umstellen

**Files:**
- Modify: `src/app/gutachter/kalender/page.tsx` (the `faelle`/`termine` loading, lines ~59-132)
- (read `src/app/gutachter/kalender/SVKalenderClient.tsx` for the exact `Fall`/`GutachterTermin` prop shapes — already known: `Fall = {id, claim_nummer, sv_termin, status, schadens_ort, schadens_adresse, lead_id, gutachter_termin_status}`, `GutachterTermin = {id, fall_id, status, final_verbindlich_ab}`)

**Interfaces:**
- Consumes: `svTermine` (Task 1), `effektiveBezugIds` (`@/lib/termine/effektive-bezug-ids`).

- [ ] **Step 1: Replace the stale view query + termine query** — in `page.tsx`, DELETE the `faelle` block (`.from('v_faelle_mit_aktuellem_termin')…`) AND the `termine` block (`.from('gutachter_termine')…in('fall_id', fallIds)`), and load canonically:

```ts
  // KANONISCH: SV-Termine aus gutachter_termine (assignee_id) — nicht die stale View.
  const { svTermine } = await import('@/lib/termine/sv-termine')
  const now = new Date()
  const fensterVon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
  const fensterBis = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 35).toISOString()
  const svTermineRows = await svTermine(supabase, sv.id, {
    statuses: ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt', 'gegenvorschlag'],
    from: fensterVon, to: fensterBis,
  })
```

- [ ] **Step 2: Enrich fall/claim data (v_claim_full) + leads, build `faelle` + `termine` props**

```ts
  const { effektiveBezugIds } = await import('@/lib/termine/effektive-bezug-ids')
  const fallIds = [...new Set(svTermineRows.map(t => t.fall_id).filter(Boolean) as string[])]
  const fallMap = new Map<string, { claim_nummer: string | null; schadenort_ort: string | null; schadenort_adresse: string | null; lead_id: string | null; fall_status: string | null }>()
  if (fallIds.length) {
    const { data: faelleFlat } = await supabase
      .from('v_claim_full')
      .select('fall_id, claim_nummer, schadenort_ort, schadenort_adresse, lead_id, fall_status')
      .in('fall_id', fallIds)
    for (const f of (faelleFlat ?? []) as Array<Record<string, unknown>>) {
      fallMap.set(f.fall_id as string, {
        claim_nummer: (f.claim_nummer as string) ?? null,
        schadenort_ort: (f.schadenort_ort as string) ?? null,
        schadenort_adresse: (f.schadenort_adresse as string) ?? null,
        lead_id: (f.lead_id as string) ?? null,
        fall_status: (f.fall_status as string) ?? null,
      })
    }
  }
  // Lead-Namen (auch fuer bezug-native/pre-flowlink Termine)
  const leadIds = [...new Set(svTermineRows.map(t => t.fall_id ? (fallMap.get(t.fall_id)?.lead_id ?? null) : effektiveBezugIds(t).leadId).filter(Boolean) as string[])]
  const leadMap: Record<string, string> = {}
  if (leadIds.length) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data: leads } = await createAdminClient().from('leads').select('id, vorname, nachname').in('id', leadIds)
    for (const l of leads ?? []) leadMap[l.id] = `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() || '—'
  }
  // faelle-Prop: 1 Eintrag pro Termin (SVKalenderClient rendert sv_termin je Eintrag)
  const faelle = svTermineRows.map(t => {
    const f = t.fall_id ? fallMap.get(t.fall_id) : null
    const eff = effektiveBezugIds(t)
    return {
      id: (t.fall_id ?? '') as string,
      claim_nummer: f?.claim_nummer ?? null,
      sv_termin: t.start_zeit,
      status: f?.fall_status ?? t.status,
      schadens_ort: f?.schadenort_ort ?? null,
      schadens_adresse: f?.schadenort_adresse ?? t.besichtigungsort_adresse ?? null,
      lead_id: (f?.lead_id ?? eff.leadId) ?? null,
      gutachter_termin_status: t.status,
    }
  })
  const termine = svTermineRows.map(t => ({ id: t.id, fall_id: (t.fall_id ?? '') as string, status: t.status, final_verbindlich_ab: t.final_verbindlich_ab }))
```

- [ ] **Step 3: Keep `externalBusy` + `verlegteSlots` as-is** (those already read `sv_kalender_events_cache` + `gutachter_termine` by `assignee_id` — NOT stale). Update the `terminListe` (Liste-View) + `claimondoTermineByStart` to derive from the new `faelle` (they already read `f.sv_termin` — now populated correctly). No further change needed there since `faelle[].sv_termin` is now the real termin start.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit --skipLibCheck 2>&1 | grep -i "kalender/page"` → no new errors (ignore infra).

- [ ] **Step 5: Empirical prod check (service_role)** — via Supabase MCP: `svTermine`-equivalent query for SV `b52e79df-9318-4c31-bebd-bb7c91d52aa5` returns >0 rows (the 7 termine). Confirms the calendar will populate.

- [ ] **Step 6: Commit** — `git add src/app/gutachter/kalender/page.tsx && git commit -m "fix(termine): SV-Kalender liest Termine aus gutachter_termine (assignee_id) statt stale View.sv_termin"`

---

### Task 3: Tagesroute (`heute`) auf `svTermine` vereinheitlichen

**Files:**
- Modify: `src/app/gutachter/heute/page.tsx` (the `termine` query, ~lines 132-152)

**Interfaces:** Consumes `svTermine` (Task 1). Behavior identical (same assignee_id filter, today window, same status set).

- [ ] **Step 1: Replace the inline gutachter_termine query with the helper** — the current query already uses `assignee_id`/`assignee_typ`/status/today; swap it for the helper to unify the source:

```ts
  const { svTermine } = await import('@/lib/termine/sv-termine')
  const svTermineRows = await svTermine(supabase, sv.id, {
    statuses: ['reserviert', 'bestaetigt', 'vorschlag', 'abgeschlossen', 'verlegung_pending', 'verlegt'],
    from: todayStart.toISOString(), to: tomorrowStart.toISOString(),
  })
  // Downstream verwendet `termine` mit bezug_typ/bezug_id/gesehen_am — svTermine liefert alle.
  const termine = svTermineRows
```
Keep everything downstream (`fallIds`, enrichment, `heuteTermine`) unchanged — `svTermineRows` has the same columns the code already reads (`fall_id, lead_id, start_zeit, end_zeit, status, gesehen_am, bezug_typ, bezug_id`).

- [ ] **Step 2: Typecheck** — no new errors in `heute/page`.

- [ ] **Step 3: Commit** — `git add src/app/gutachter/heute/page.tsx && git commit -m "refactor(termine): Tagesroute nutzt kanonischen svTermine-Helper (identische Quelle wie Kalender)"`

---

### Task 4: Cron `gutachter-erinnerungen` — Quelle → `gutachter_termine`

**Files:**
- Modify: `src/app/api/cron/gutachter-erinnerungen/route.ts`

**Interfaces:** Consumes `svTermine` conceptually (uses `gutachter_termine` directly here since it needs the reminder-flag columns `losfahren_erinnerung_gesendet`/`termin_erinnerung_5min_gesendet`/`geschaetzte_fahrzeit_min` which live on `gutachter_termine`).

- [ ] **Step 1: Replace query 1** (`.from('v_faelle_mit_aktuellem_termin')…sv_termin today…`) with a direct `gutachter_termine` read:

```ts
  const { data: termine } = await svc
    .from('gutachter_termine')
    .select('id, assignee_id, start_zeit, fall_id, lead_id, claim_id, bezug_typ, bezug_id, besichtigungsort_adresse, losfahren_erinnerung_gesendet, termin_erinnerung_5min_gesendet, geschaetzte_fahrtzeit_min')
    .eq('assignee_typ', 'sachverstaendiger')
    .in('status', ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt'])
    .gte('start_zeit', todayStart)
    .lt('start_zeit', todayEnd)
```
Note: column is `geschaetzte_fahrtzeit_min` on the table (verify with the schema; the view aliased it `geschaetzte_fahrzeit_min`). Read the reminder flags + address from the termin row directly.

- [ ] **Step 2: Rework the loop** — `termin.start_zeit` (not `sv_termin`); `sv` via `termin.assignee_id` (not `sv_id`); address via `termin.besichtigungsort_adresse` (fallback: enrich from lead/claim if null); write-back the reminder flags to `termin.id` directly (delete the `aktueller_termin_id`/"kein Termin"-skip). Kunde name via `effektiveBezugIds(termin).leadId` → leads.

- [ ] **Step 3: Query 2 (SV-02)** — replace `.from('v_faelle_mit_aktuellem_termin')…status='sv-termin'…sv_termin in [now,+24h]` with `gutachter_termine` `assignee_typ='sachverstaendiger'`, status active, `start_zeit` in [now,+24h]; resolve `fall_id`/`assignee_id`; keep the `triggerSV02` call keyed on the fall.

- [ ] **Step 4: Source-guard test** — `src/app/api/cron/gutachter-erinnerungen/route.test.ts`: assert the file no longer reads `v_faelle_mit_aktuellem_termin` and DOES read `gutachter_termine` with `assignee_typ`.

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const src = readFileSync(join(process.cwd(), 'src/app/api/cron/gutachter-erinnerungen/route.ts'), 'utf8')
describe('gutachter-erinnerungen kanonisch', () => {
  it('liest gutachter_termine, nicht v_faelle', () => {
    expect(src).toMatch(/from\(['"]gutachter_termine['"]\)/)
    expect(src).not.toMatch(/v_faelle_mit_aktuellem_termin/)
  })
})
```

- [ ] **Step 5: Run test + typecheck** — `npx vitest run src/app/api/cron/gutachter-erinnerungen/route.test.ts` PASS; tsc no new errors.

- [ ] **Step 6: Commit** — `git commit -m "fix(cron): gutachter-erinnerungen liest Termine aus gutachter_termine (Reminder feuern wieder)"`

---

### Task 5: Cron `no-show-timeout` — `sv_termin`-Check → `gutachter_termine`

**Files:**
- Modify: `src/app/api/cron/no-show-timeout/route.ts` (line ~50 only)

**Interfaces:** The view query STAYS (fall fields `no_show_gemeldet_am`/`storniert_am`/`re_termin_token_eingelaufen_am` are fine). ONLY the `sv_termin` "neuer Termin?" check migrates.

- [ ] **Step 1: Replace the stale `sv_termin` check** — remove `sv_termin` from the select; replace line 50 (`if (fall.sv_termin && new Date(fall.sv_termin) > gemeldet) continue`) with a per-fall `gutachter_termine` lookup for a newer active termin:

```ts
      // Kanonisch: neuer Termin? -> gutachter_termine (nicht stale View.sv_termin)
      const { data: neuerTermin } = await db
        .from('gutachter_termine')
        .select('start_zeit')
        .eq('fall_id', fall.id)
        .in('status', ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt'])
        .gt('start_zeit', gemeldet.toISOString())
        .limit(1).maybeSingle()
      if (neuerTermin) continue // Neuer Termin existiert -> kein Storno
```

- [ ] **Step 2: Source-guard test** — `no-show-timeout/route.test.ts`: file reads `gutachter_termine` for the new-termin check + no longer selects `sv_termin`.

- [ ] **Step 3: Run test + typecheck.**

- [ ] **Step 4: Commit** — `git commit -m "fix(cron): no-show-timeout prueft neuen Termin via gutachter_termine (kein Fehl-Storno)"`

---

### Task 6: Admin-Kalender + TageskalenderWidget — Quelle → `gutachter_termine`

**Files:**
- Modify: `src/app/admin/kalender/page.tsx`
- Modify: `src/app/admin/_components/TageskalenderWidget.tsx`

**Interfaces:** Direct `gutachter_termine` (admin sees ALL SV termine: `assignee_typ='sachverstaendiger'`, time window), enrich `claim_nummer`/`kennzeichen` via `v_claim_full`.

- [ ] **Step 1: Read both files** to get the exact current `v_faelle_mit_aktuellem_termin` queries + how `sv_termin`/`claim_nummer` are rendered.

- [ ] **Step 2: admin/kalender/page.tsx** — replace `.from('v_faelle_mit_aktuellem_termin').select('id, claim_nummer, sv_termin, sv_id, status').not('sv_termin','is',null)` with `gutachter_termine` (`assignee_typ='sachverstaendiger'`, status active, has `start_zeit`), then enrich `claim_nummer` via `v_claim_full` by `fall_id`. Map to the `KalenderClient` event shape (`start` = `start_zeit`, `title` = claim_nummer).

- [ ] **Step 3: TageskalenderWidget.tsx** — replace `.from('v_faelle_mit_aktuellem_termin')…gte/lte('sv_termin', todayStart/End)` with `gutachter_termine` (`assignee_typ='sachverstaendiger'`, `start_zeit` in [todayStart,todayEnd]), enrich `claim_nummer`/`kennzeichen` via `v_claim_full`.

- [ ] **Step 4: Source-guard test** — `admin/kalender/kalender-source.test.ts`: both files read `gutachter_termine`, not `v_faelle…` for termine.

- [ ] **Step 5: Typecheck + Ratchets** — no new errors; token-audit/component-set/status-registry 0-neu.

- [ ] **Step 6: Commit** — `git commit -m "fix(termine): Admin-Kalender + TageskalenderWidget lesen aus gutachter_termine"`

---

### Task 7: Voller Audit + PR gegen staging

- [ ] **Step 1: `npx vitest run src/lib/termine/ src/app/api/cron/gutachter-erinnerungen src/app/api/cron/no-show-timeout src/app/admin/kalender`** — alle grün.
- [ ] **Step 2: Ratchets** `npm run check:token-audit && npm run check:status-registry && npm run check:component-set && npm run check:knip` — 0-neu.
- [ ] **Step 3: `npm run build`** — grün (bei node_modules-Infra-Fail: CI autoritativ, im PR notieren).
- [ ] **Step 4: Prod-Smoke bis 1+** — als Test-SV Kalender öffnen (Termine sichtbar), Tagesroute starten (routebar). Wenn kein Test-SV mit Termin heute: empirisch via MCP bestätigen (SV `b52e79df` sieht 7 Termine).
- [ ] **Step 5: Push + PR** — `gh pr create --base staging --title "fix(termine): SV-Kalender + Tagesroute + Crons lesen Termine kanonisch aus gutachter_termine (Phase 1a)"` mit 7-Punkte-Audit + Hinweis: v_claim_base unangetastet, Phase 1b (monatsabrechnung/storno-Gebühr) Aaron-gated separat, Phase 2 (fall-detail-Consumer) koordiniert mit status-claim.

---

## Self-Review

**Spec coverage:** Helper (T1) ✓, SV-Kalender (T2) ✓, Tagesroute (T3) ✓, gutachter-erinnerungen (T4) ✓, no-show-timeout (T5) ✓, Admin-Kalender/Widget (T6) ✓, Audit/PR (T7) ✓. Phase 1b (monatsabrechnung/storno) bewusst EXCLUDED. Phase 2 (fall-detail) separat.

**Placeholder scan:** T6 verweist auf „read the file" für exakten Code — bewusst (kleine Display-Swaps, Implementer liest die 2 Files); alle logik-tragenden Tasks (T1-T5) haben konkreten Code. `geschaetzte_fahrtzeit_min` vs `_fahrzeit_min`: T4 Step 1 flaggt die Spaltennamens-Verifikation explizit.

**Type consistency:** `SvTerminRow`/`svTermine`/`buildSvTermineQuery` konsistent (T1→T2→T3). `faelle`/`termine`-Props matchen `SVKalenderClient` (`Fall`/`GutachterTermin`). `effektiveBezugIds(t).leadId` konsistent mit heute/page.tsx.
