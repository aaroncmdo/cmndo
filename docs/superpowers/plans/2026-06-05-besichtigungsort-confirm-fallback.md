# Besichtigungsort-Bestätigung & Korrektur (Fallback-Layer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proaktives, getracktes Sicherheitsnetz für den Geocoding-Kernpunkt — Kunde (Tracking-Token) + SV (Feldmodus) bestätigen/korrigieren den geocodeten besichtigungsort eines Termins; jede Korrektur schreibt geocodete Coords.

**Architecture:** Eine Engine-Schreibstelle (`besichtigungsort-write.ts`) auf `gutachter_termine.besichtigungsort_*` + `_bestaetigt_*`; dünne Auth-Wrapper (Kunde token-basiert via `verifyToken`, SV via owns-Guard). UI reuse `GooglePlaceAutocomplete`. Die tote `updateBesichtigungsortVomKunden` wird gelöscht (kein paralleler Write).

**Tech Stack:** Next.js 16 Server Actions · Supabase Admin-Client (service_role) · vitest · next-intl · Google Places (`GooglePlaceAutocomplete`).

**Spec:** `docs/superpowers/specs/2026-06-05-besichtigungsort-confirm-fallback-design.md`

---

## File-Struktur
| Pfad | Aktion | Verantwortung |
|---|---|---|
| `supabase/migrations/<V>_besichtigungsort_bestaetigt_columns.sql` | NEU (Plugin) | 2 Spalten |
| `src/lib/termine/engine/besichtigungsort-write.ts` | NEU | Engine-Primitive (einzige Schreibstelle) |
| `src/lib/termine/engine/besichtigungsort-write.test.ts` | NEU | vitest |
| `src/lib/termine/engine/index.ts` | MODIFY | Export |
| `src/app/kunde/termin/[token]/actions.ts` | MODIFY | 2 Token-Actions |
| `src/lib/termine/actions.ts` | MODIFY | SV-Action |
| `src/app/kunde/faelle/[id]/_actions/besichtigungsort.ts` | DELETE | tot (0 Caller) |
| `src/app/kunde/termin/[token]/BesichtigungsortCheck.tsx` | NEU | Confirm/Correct-Card (beide States) |
| `src/app/kunde/termin/[token]/KundeTrackingClient.tsx` | MODIFY | Einbau Card |
| `src/app/kunde/termin/[token]/page.tsx` | MODIFY | Props: besichtigungsort/bestaetigt/kanal |
| SV-Feldmodus-Termin-View (Task 5) | MODIFY | Affordance + Trust-Signal |
| messages (de + aktive Locales) | MODIFY | i18n-Keys |

---

### Task 1: DDL — bestaetigt-Spalten (Controller, Regel 2)

**Files:** Create `supabase/migrations/<recorded>_besichtigungsort_bestaetigt_columns.sql`

- [ ] **Step 1: DDL via Plugin** — `apply_migration({ name: "besichtigungsort_bestaetigt_columns", query: <unten> })`
```sql
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS besichtigungsort_bestaetigt_am timestamptz,
  ADD COLUMN IF NOT EXISTS besichtigungsort_bestaetigt_von text
    CHECK (besichtigungsort_bestaetigt_von IN ('kunde','sv'));
```
- [ ] **Step 2: Recorded Version** — `list_migrations` → vergebene Version `<V>` ablesen.
- [ ] **Step 3: File committen** als `supabase/migrations/<V>_besichtigungsort_bestaetigt_columns.sql` (exakt obige DDL). **Voller Worktree-Pfad beim Write** (Twin-Drift-Lehre).
- [ ] **Step 4: Verify (READ)** — `execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_name='gutachter_termine' AND column_name LIKE 'besichtigungsort_bestaetigt%';` → Erwartet 2 Zeilen.
- [ ] **Step 5: Types regen** — `generate_typescript_types` → in `src/lib/supabase/database.types.ts` übernehmen (oder aufschieben bis Task 2 referenziert — dann jetzt).
- [ ] **Step 6: Commit** `git add supabase/migrations/<V>_*.sql src/lib/supabase/database.types.ts && git commit -m "feat(termin-engine): besichtigungsort_bestaetigt_am/von auf gutachter_termine (Mig <V>)"`

### Task 2: Engine-Primitive (TDD)

**Files:** Create `src/lib/termine/engine/besichtigungsort-write.ts` · Test `src/lib/termine/engine/besichtigungsort-write.test.ts` · Modify `src/lib/termine/engine/index.ts`

- [ ] **Step 1: Failing test** (`besichtigungsort-write.test.ts`)
```ts
import { describe, it, expect, vi } from 'vitest'
import { korrigiereBesichtigungsort, bestaetigeBesichtigungsort } from './besichtigungsort-write'

function fakeDb(captures: Record<string, unknown>[]) {
  return {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => { captures.push(patch); return { error: null } },
      }),
      insert: async () => ({ error: null }),
    }),
  } as never
}

describe('korrigiereBesichtigungsort', () => {
  it('schreibt geocodete Coords + bestaetigt_von/am', async () => {
    const caps: Record<string, unknown>[] = []
    const r = await korrigiereBesichtigungsort('t1', { adresse: 'Domkloster 4', lat: 50.94, lng: 6.96 }, 'kunde', { db: fakeDb(caps) })
    expect(r.ok).toBe(true)
    const patch = caps[0]
    expect(patch.besichtigungsort_adresse).toBe('Domkloster 4')
    expect(patch.besichtigungsort_lat).toBe(50.94)
    expect(patch.besichtigungsort_bestaetigt_von).toBe('kunde')
    expect(patch.besichtigungsort_bestaetigt_am).toBeTruthy()
  })
  it('lehnt fehlende Coords ab', async () => {
    const r = await korrigiereBesichtigungsort('t1', { adresse: 'x', lat: null as never, lng: null as never }, 'sv', { db: fakeDb([]) })
    expect(r.ok).toBe(false)
  })
})

describe('bestaetigeBesichtigungsort', () => {
  it('setzt nur bestaetigt_*, keine Coords', async () => {
    const caps: Record<string, unknown>[] = []
    const r = await bestaetigeBesichtigungsort('t1', 'kunde', { db: fakeDb(caps) })
    expect(r.ok).toBe(true)
    expect(caps[0].besichtigungsort_bestaetigt_von).toBe('kunde')
    expect(caps[0].besichtigungsort_adresse).toBeUndefined()
  })
})
```
- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/termine/engine/besichtigungsort-write.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implement** (`besichtigungsort-write.ts`)
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient
export type BestaetigtVon = 'kunde' | 'sv'

async function db(opts?: { db?: AdminClient }): Promise<AdminClient> {
  return opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
}

/** Korrigiert das geocodete Vor-Ort-Ziel + markiert es als bestaetigt (durch den Korrigierenden). */
export async function korrigiereBesichtigungsort(
  terminId: string,
  ort: { adresse: string; lat: number; lng: number },
  von: BestaetigtVon,
  opts?: { db?: AdminClient },
): Promise<{ ok: boolean; error?: string }> {
  if (!ort.adresse?.trim()) return { ok: false, error: 'Adresse fehlt' }
  if (ort.lat == null || ort.lng == null) return { ok: false, error: 'Koordinaten fehlen — bitte Vorschlag aus der Liste wählen.' }
  const client = await db(opts)
  const now = new Date().toISOString()
  const { error } = await client.from('gutachter_termine').update({
    besichtigungsort_adresse: ort.adresse,
    besichtigungsort_lat: ort.lat,
    besichtigungsort_lng: ort.lng,
    besichtigungsort_bestaetigt_am: now,
    besichtigungsort_bestaetigt_von: von,
  }).eq('id', terminId)
  if (error) return { ok: false, error: error.message }
  // Audit (non-critical)
  try {
    const { data: t } = await client.from('gutachter_termine').select('fall_id').eq('id', terminId).maybeSingle()
    const fid = (t as { fall_id?: string | null } | null)?.fall_id ?? null
    if (fid) await client.from('timeline').insert({ fall_id: fid, typ: 'system', titel: `Besichtigungsort korrigiert (${von})`, beschreibung: ort.adresse })
  } catch { /* non-critical */ }
  return { ok: true }
}

/** Bestaetigt das bestehende Ziel ohne Coord-Change (Kunde/SV: „Ja, stimmt"). Idempotent. */
export async function bestaetigeBesichtigungsort(
  terminId: string,
  von: BestaetigtVon,
  opts?: { db?: AdminClient },
): Promise<{ ok: boolean; error?: string }> {
  const client = await db(opts)
  const { error } = await client.from('gutachter_termine').update({
    besichtigungsort_bestaetigt_am: new Date().toISOString(),
    besichtigungsort_bestaetigt_von: von,
  }).eq('id', terminId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
```
- [ ] **Step 4: Export** — in `src/lib/termine/engine/index.ts` ergänzen:
```ts
export { korrigiereBesichtigungsort, bestaetigeBesichtigungsort } from './besichtigungsort-write'
export type { BestaetigtVon } from './besichtigungsort-write'
```
- [ ] **Step 5: Run, verify PASS** — `npx vitest run src/lib/termine/engine/besichtigungsort-write.test.ts` → PASS.
- [ ] **Step 6: Commit** `git add src/lib/termine/engine/besichtigungsort-write.ts src/lib/termine/engine/besichtigungsort-write.test.ts src/lib/termine/engine/index.ts && git commit -m "feat(termin-engine): besichtigungsort-write Engine-Primitive (korrigiere/bestaetige) + vitest"`

### Task 3: Actions (Kunde-Token + SV) + tote Action löschen

**Files:** Modify `src/app/kunde/termin/[token]/actions.ts` · Modify `src/lib/termine/actions.ts` · Delete `src/app/kunde/faelle/[id]/_actions/besichtigungsort.ts`

- [ ] **Step 1: Kunde-Token-Actions** in `src/app/kunde/termin/[token]/actions.ts` ergänzen (nutzt das bestehende `verifyToken(token, terminId)`):
```ts
// Fallback-Layer: Kunde bestaetigt/korrigiert den Besichtigungsort (token-auth).
export async function bestaetigeBesichtigungsortViaToken(token: string, terminId: string): Promise<ActionResult> {
  const auth = await verifyToken(token, terminId)
  if (!auth.ok) return { success: false, error: auth.error }
  const { bestaetigeBesichtigungsort } = await import('@/lib/termine/engine')
  const r = await bestaetigeBesichtigungsort(terminId, 'kunde')
  return r.ok ? { success: true } : { success: false, error: r.error ?? 'Fehler' }
}

export async function korrigiereBesichtigungsortViaToken(
  token: string, terminId: string, ort: { adresse: string; lat: number; lng: number },
): Promise<ActionResult> {
  const auth = await verifyToken(token, terminId)
  if (!auth.ok) return { success: false, error: auth.error }
  const { korrigiereBesichtigungsort } = await import('@/lib/termine/engine')
  const r = await korrigiereBesichtigungsort(terminId, ort, 'kunde')
  return r.ok ? { success: true } : { success: false, error: r.error ?? 'Fehler' }
}
```
- [ ] **Step 2: SV-Action** in `src/lib/termine/actions.ts` ergänzen (owns-Guard wie die anderen SV-Actions dort — `getGutachterForUser` + `termin.sv_id === sv.id`):
```ts
export async function korrigiereBesichtigungsortAlsSv(
  terminId: string, ort: { adresse: string; lat: number; lng: number },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'unauthorized' }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'no_sv' }
  const db = createAdminClient()
  const { data: termin } = await db.from('gutachter_termine').select('id, sv_id, fall_id').eq('id', terminId).eq('sv_id', sv.id).single()
  if (!termin) return { ok: false, error: 'Termin nicht gefunden' }
  const { korrigiereBesichtigungsort } = await import('@/lib/termine/engine')
  const r = await korrigiereBesichtigungsort(terminId, ort, 'sv', { db })
  if (r.ok) { revalidateTerminRoutes(termin.fall_id as string); revalidatePath(`/gutachter/termine/${terminId}`) }
  return r
}
```
- [ ] **Step 3: Tote Action löschen** — `git rm src/app/kunde/faelle/[id]/_actions/besichtigungsort.ts`. Vorher `grep -rn "updateBesichtigungsortVomKunden" src/` → muss 0 Caller bestätigen (außer der Definition).
- [ ] **Step 4: tsc** — `npx tsc --noEmit 2>&1 | tail -20; echo exit ${PIPESTATUS[0]}` → 0, keine Fehler-Zeilen.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(termin-engine): besichtigungsort-Korrektur-Actions (Kunde-Token + SV-Guard) + tote updateBesichtigungsortVomKunden geloescht"`

### Task 4: Kunde-UI — BesichtigungsortCheck + Einbau

**Files:** Create `src/app/kunde/termin/[token]/BesichtigungsortCheck.tsx` · Modify `KundeTrackingClient.tsx` · Modify `page.tsx`

- [ ] **Step 1: Page-Props erweitern** (`page.tsx`): im `gutachter_termine`-Select (Z. ~31) ergänzen: `besichtigungsort_lat, besichtigungsort_lng, besichtigungsort_bestaetigt_am, besichtigungsort_bestaetigt_von, kanal`. An `<KundeTrackingClient ...>` durchreichen:
```tsx
besichtigungsortAdresse={(termin as { besichtigungsort_adresse?: string | null }).besichtigungsort_adresse ?? null}
besichtigungsortBestaetigtVon={(termin as { besichtigungsort_bestaetigt_von?: string | null }).besichtigungsort_bestaetigt_von ?? null}
kanal={(termin as { kanal?: string | null }).kanal ?? null}
```
- [ ] **Step 2: BesichtigungsortCheck-Component** (`BesichtigungsortCheck.tsx`) — Client, reuse `GooglePlaceAutocomplete` (Pattern: `DispatchPlaceField.tsx`). Props: `{ token, terminId, adresse, bestaetigt, variant: 'card' | 'link' }`. „Ja, stimmt" → `bestaetigeBesichtigungsortViaToken`; „Ort korrigieren" → öffnet `GooglePlaceAutocomplete`, `onSelect({adresse,lat,lng})` → `korrigiereBesichtigungsortViaToken`. Nach Erfolg lokalen State „bestätigt ✓". i18n via `useTranslations('kunde.tracking.besichtigungsort')`. (Vollcode beim Execute aus dem `DispatchPlaceField`-Muster ableiten — Card-Variante mit 2 Buttons + autocomplete-Inline.)
- [ ] **Step 3: Einbau in `KundeTrackingClient`** — neue Props in Signatur (`besichtigungsortAdresse`, `besichtigungsortBestaetigtVon`, `kanal`). Render:
  - „vorbereitet"-State (`!losgefahren`), nur wenn **kein** offener Vorschlag (nach Annahme) **und** `kanal` nicht in `('video','telefon')`: `<BesichtigungsortCheck variant="card" ... />` unter dem Termin-Block.
  - „unterwegs"-State: `<BesichtigungsortCheck variant="link" ... />` im Footer neben der Adresse; nicht bei `isAngekommen`/`besichtigungLaeuft`.
- [ ] **Step 4: tsc** — grün (PIPESTATUS).
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(fallback-ui): Kunde besichtigungsort bestaetigen/korrigieren auf Tracking-Seite"`

### Task 5: SV-Feldmodus — Affordance + Trust-Signal

**Files:** Modify den SV-Feldmodus-Termin-View. **Erst lesen:** `grep -rn "besichtigungsort" src/app/gutachter/feldmodus src/app/gutachter/termine/[id]` → die Stelle finden, wo die Termin-Adresse dem SV angezeigt wird (Kandidaten: `gutachter/feldmodus/SvFallakteView.tsx`, `gutachter/termine/[id]/page.tsx`/`TerminDetailActions.tsx`).

- [ ] **Step 1: Read** der gefundenen View — verstehen wie besichtigungsort + termin geladen/angezeigt werden.
- [ ] **Step 2: Trust-Signal** — wenn `besichtigungsort_bestaetigt_von === 'kunde'`: Badge „Vom Kunden bestätigt ✓" (emerald) neben der Adresse.
- [ ] **Step 3: „Ort korrigieren"-Affordance** — Button/Link öffnet `GooglePlaceAutocomplete` (gleiches Muster wie Task 4) → `korrigiereBesichtigungsortAlsSv(terminId, ort)`.
- [ ] **Step 4: tsc** — grün.
- [ ] **Step 5: Commit** `git commit -m "feat(fallback-ui): SV-Feldmodus besichtigungsort korrigieren + Kunde-bestaetigt-Trust-Signal"`

### Task 6: i18n

**Files:** Modify messages (de zuerst; **erst lesen:** `grep -rn "kunde.tracking" src/messages || ls src/messages` → Locale-Files + bestehende `kunde.tracking`-Struktur finden).

- [ ] **Step 1:** Keys ergänzen unter `kunde.tracking.besichtigungsort.*`: `titel`, `frage` ("Stimmt der Ort?"), `jaStimmt`, `korrigieren`, `bestaetigt`, `korrigiertHinweis`, `coordsFehlen`. Echte UTF-8-Umlaute (Frontend-Pflicht).
- [ ] **Step 2:** Keys `gutachter.feldmodus.besichtigungsort.*`: `korrigieren`, `vomKundenBestaetigt`.
- [ ] **Step 3:** Alle aktiven Locales nachziehen (gleiche Keys; de-Wert als Fallback wenn keine Übersetzung).
- [ ] **Step 4: Build-Gate** — `npx tsc --noEmit` grün; (next-intl Key-Check falls vorhanden).
- [ ] **Step 5: Commit** `git commit -m "i18n(fallback-ui): besichtigungsort-confirm Keys (kunde.tracking + gutachter.feldmodus)"`

### Task 7: Live-Verify + Abschluss

- [ ] **Step 1: Live-Verify-Script** (`scripts/verify-besichtigungsort-confirm.mts`, tsx, `createAdminClient`, `.env.local` aus Main, try/finally-Cleanup): echten/Seed-Termin → `korrigiereBesichtigungsort(..,'kunde')` + `bestaetigeBesichtigungsort(..,'sv')` → `execute_sql` prüft `besichtigungsort_*`/`bestaetigt_*` gesetzt → 0 Residue. JSON-VERDICT.
- [ ] **Step 2: tsc** final grün (PIPESTATUS).
- [ ] **Step 3: 7-Punkte-Audit** im finalen Commit-Body (AGENTS.md).
- [ ] **Step 4: PR** `--base staging` (Branch `kitta/termin-engine-besichtigungsort-confirm`, der schon den Spec trägt) — Draft auf Ready setzen. Staging-Browser-Smoke (Tracking-Seite + Feldmodus) post-merge.

## Self-Review (Plan-Autor)
- **Spec-Coverage:** DDL✓(T1) Engine✓(T2) Actions+Delete✓(T3) Kunde-UI✓(T4) SV-UI✓(T5) i18n✓(T6) Testing✓(T2/T7). Alle Spec-Abschnitte abgedeckt.
- **Typen:** `BestaetigtVon='kunde'|'sv'` konsistent (Engine→Actions→DDL-CHECK). `{adresse,lat,lng}`-Shape konsistent (GooglePlaceAutocomplete `PlaceResult`→Action→Engine).
- **Reuse:** GooglePlaceAutocomplete/DispatchPlaceField (T4/T5), verifyToken (T3), Engine-index (T2). Tote Action gelöscht (T3).
