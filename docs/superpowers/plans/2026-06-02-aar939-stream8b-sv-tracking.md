# AAR-939 Stream 8b — SV-Tracking-Integration · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SVs verbinden Monika-Anfrage-/Termin-Events mit ihrem eigenen GA4 / Google Ads über einen HMAC-signierten Server-Webhook, konfigurierbar + testbar + beobachtbar im SV-Portal.

**Architecture:** Ein pure, testbarer Kern (`tracking-webhook-core.ts`: Payload-Bau, HMAC-Signatur, Retry) + ein server-only Orchestrator (`tracking-webhook.ts`: Resolver lead/termin→gfa, embed-B-Gate, DB-Last-Status). Drei Feuer-Punkte (anfrage_eingegangen / termin_vereinbart / termin_durchgefuehrt) rufen fire-and-forget (non-fatal). Portal-UX: Wizard-Step + Test-Button + Doku-Page (3 Tabs) + Monitoring-Kachel.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (service_role admin client), `node:crypto` (HMAC), vitest, `@sentry/nextjs`, Base-UI Tabs (`@/components/ui/tabs`), Komponenten-Set (`primitives`/`shared`).

**Spec:** `docs/superpowers/specs/2026-06-02-aar939-stream8b-sv-tracking-design.md`

**Worktree:** `.claude/worktrees/aar-939-stream8b-sv-tracking` · Branch `kitta/aar-939-stream8b-sv-tracking` (von `origin/staging`).

**Konventionen (AGENTS.md):** Migration nur via Supabase-Plugin (Regel 2, File-Name == getrackte Version). Server-Actions Result-Object `{ ok, error? }`. Non-critical Sends in try/catch. `revalidatePath` bei Writes. Umlaute in UI-Strings. Keine Inline-Hex. 7-Punkte-Audit im Commit-Body. Tests: `npm run test` (= `vitest run`), einzeln `npx vitest run <pfad>`.

**Verifizierte Realität (gegen Live-DB + staging-Code):**
- gfa-Spalten existieren: `gclid, utm_source/medium/campaign/term/content, ga_client_id, embed_site_id, source, variante, vorname, nachname, konvertiert_zu_lead_id`.
- `embed_sites.tracking_webhook_url/secret/ga4_measurement_id/gads_customer_id` existieren (8b.1 ✓). `einzelpreis_eur` Default 70.
- `notifyAnfrage({ anfrageId, payload, variante, site })` läuft im `after()` von `/api/anfrage-from-lp`.
- `reserveSvTerminForLead(leadId, svId, startIso)` ist der Booking-Punkt.
- `closeNurGutachterTerminAlsDurchgefuehrt(db, { terminId, claimId, byUserId, grund })` setzt `durchgefuehrt_am` (kanonischer Anker).
- Sentry: `import * as Sentry from '@sentry/nextjs'` → `Sentry.captureMessage(msg, { level, extra })`.

---

# PR1 — Sender + Schema + Wiring + Tests (Backend-only)

Branch-Commits sammeln, am Ende PR1 gegen `staging`.

---

## Task 1: Migration — Monitoring-Spalten auf `embed_sites`

**Files:**
- Create: `supabase/migrations/<getrackte-version>_aar939_embed_tracking_webhook_monitoring.sql`

- [ ] **Step 1: DDL via Supabase-Plugin anwenden**

Tool: `mcp__plugin_supabase_supabase__apply_migration`
```json
{
  "name": "aar939_embed_tracking_webhook_monitoring",
  "query": "ALTER TABLE public.embed_sites\n  ADD COLUMN IF NOT EXISTS tracking_webhook_last_status text,\n  ADD COLUMN IF NOT EXISTS tracking_webhook_last_at     timestamptz,\n  ADD COLUMN IF NOT EXISTS tracking_webhook_last_error  text;\n\nCOMMENT ON COLUMN public.embed_sites.tracking_webhook_last_status IS 'AAR-939 8b: HTTP-Status des letzten Tracking-Webhook-Sends als Text (z.B. 200) bzw. timeout/error.';"
}
```

- [ ] **Step 2: Getrackte Version ablesen**

Tool: `mcp__plugin_supabase_supabase__list_migrations`
Notiere die vom Plugin vergebene Version `<V>` für `aar939_embed_tracking_webhook_monitoring` (eigener Timestamp — NICHT raten).

- [ ] **Step 3: Migration-File committen (Name == getrackte Version)**

Create `supabase/migrations/<V>_aar939_embed_tracking_webhook_monitoring.sql` mit exakt dem DDL aus Step 1 (ohne das JSON-Escaping, echte Zeilenumbrüche):
```sql
-- AAR-939 Stream 8b: Monitoring-Spalten fuer den SV-Tracking-Webhook.
-- "Letzter Send"-Status (8b.6) auf embed_sites. RLS erbt die bestehende
-- owner_select-Policy; Writes nur via service_role (Sender).
ALTER TABLE public.embed_sites
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_status text,
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_at     timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_webhook_last_error  text;

COMMENT ON COLUMN public.embed_sites.tracking_webhook_last_status IS 'AAR-939 8b: HTTP-Status des letzten Tracking-Webhook-Sends als Text (z.B. 200) bzw. timeout/error.';
```

- [ ] **Step 4: Verifizieren (READ)**

Tool: `mcp__plugin_supabase_supabase__execute_sql`
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='embed_sites'
  AND column_name LIKE 'tracking_webhook_last%' ORDER BY column_name;
```
Expected: 3 Zeilen (`tracking_webhook_last_at` timestamptz, `tracking_webhook_last_error` text, `tracking_webhook_last_status` text).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/
git commit -m "feat(AAR-939): 8b Migration -- embed_sites tracking-webhook last_* Monitoring-Spalten"
```

---

## Task 2: Pure Core-Modul + Tests (TDD)

**Files:**
- Create: `src/lib/embed/tracking-webhook-core.ts`
- Test: `src/lib/embed/__tests__/tracking-webhook-core.test.ts`

- [ ] **Step 1: Failing-Test schreiben**

Create `src/lib/embed/__tests__/tracking-webhook-core.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import {
  buildTrackingPayload,
  signPayload,
  postWithRetry,
  type TrackingGfaRow,
} from '../tracking-webhook-core'

const gfa: TrackingGfaRow = {
  id: 'anf-1',
  vorname: 'Erika',
  nachname: 'Musterfrau',
  gclid: 'gc-123',
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'kfz',
  utm_term: null,
  utm_content: null,
  ga_client_id: 'GA1.2.3',
}

describe('buildTrackingPayload', () => {
  it('mappt gfa-Felder + Name + ts; value_eur nur bei termin_durchgefuehrt', () => {
    const p = buildTrackingPayload({
      event: 'anfrage_eingegangen',
      gfa,
      embedSiteSlug: 'kanzlei-mueller',
      valueEur: null,
      ts: '2026-06-02T10:00:00.000Z',
    })
    expect(p).toEqual({
      event: 'anfrage_eingegangen',
      anfrage_id: 'anf-1',
      embed_site_slug: 'kanzlei-mueller',
      name: 'Erika Musterfrau',
      gclid: 'gc-123',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'kfz',
      utm_term: null,
      utm_content: null,
      ga_client_id: 'GA1.2.3',
      value_eur: null,
      ts: '2026-06-02T10:00:00.000Z',
    })
  })

  it('setzt name null wenn vorname+nachname leer', () => {
    const p = buildTrackingPayload({
      event: 'termin_durchgefuehrt',
      gfa: { ...gfa, vorname: null, nachname: null },
      embedSiteSlug: 's',
      valueEur: 70,
      ts: '2026-06-02T10:00:00.000Z',
    })
    expect(p.name).toBeNull()
    expect(p.value_eur).toBe(70)
  })
})

describe('signPayload', () => {
  it('liefert deterministische sha256-HMAC mit Prefix', () => {
    // HMAC-SHA256("hello", "secret") = 88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b
    expect(signPayload('hello', 'secret')).toBe(
      'sha256=88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b',
    )
  })
})

describe('postWithRetry', () => {
  const noSleep = () => Promise.resolve()

  it('Erfolg beim ersten Versuch → ein fetch-Call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep })
    expect(res).toEqual({ ok: true, status: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('500 dann 200 → Retry, am Ende ok', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep })
    expect(res.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('3x 500 → finaler Fail mit Status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('Netzwerk-Throw → status null, error gesetzt', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep, attempts: 2 })
    expect(res.ok).toBe(false)
    expect(res.status).toBeNull()
    expect(res.error).toContain('ECONNREFUSED')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Test laufen lassen → muss fehlschlagen**

Run: `npx vitest run src/lib/embed/__tests__/tracking-webhook-core.test.ts`
Expected: FAIL (`Cannot find module '../tracking-webhook-core'`).

- [ ] **Step 3: Core-Modul implementieren**

Create `src/lib/embed/tracking-webhook-core.ts`:
```ts
// AAR-939 Stream 8b — Pure Kern des SV-Tracking-Webhooks.
//
// Bewusst KEIN 'server-only': vitest importiert dieses Modul direkt (Payload-Bau,
// HMAC-Signatur, Retry mit injizierbarem fetch/sleep). node:crypto ist im
// Node-/Test-Runtime verfuegbar; dieses Modul wird NUR vom server-only
// Orchestrator (tracking-webhook.ts) + dem Test importiert, nie vom Client.

import { createHmac } from 'node:crypto'

export type TrackingEvent =
  | 'anfrage_eingegangen'
  | 'termin_vereinbart'
  | 'termin_durchgefuehrt'
  | 'test'

/** Die Attributions-Felder der gfa-Zeile, die in den Webhook gehen. */
export interface TrackingGfaRow {
  id: string
  vorname: string | null
  nachname: string | null
  gclid: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  ga_client_id: string | null
}

export interface TrackingPayload {
  event: TrackingEvent
  anfrage_id: string
  embed_site_slug: string
  name: string | null
  gclid: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  ga_client_id: string | null
  value_eur: number | null
  ts: string
}

export function buildTrackingPayload(args: {
  event: TrackingEvent
  gfa: TrackingGfaRow
  embedSiteSlug: string
  valueEur: number | null
  ts: string
}): TrackingPayload {
  const { event, gfa, embedSiteSlug, valueEur, ts } = args
  const name = [gfa.vorname, gfa.nachname].filter(Boolean).join(' ').trim() || null
  return {
    event,
    anfrage_id: gfa.id,
    embed_site_slug: embedSiteSlug,
    name,
    gclid: gfa.gclid,
    utm_source: gfa.utm_source,
    utm_medium: gfa.utm_medium,
    utm_campaign: gfa.utm_campaign,
    utm_term: gfa.utm_term,
    utm_content: gfa.utm_content,
    ga_client_id: gfa.ga_client_id,
    value_eur: valueEur,
    ts,
  }
}

/** HMAC-SHA256 ueber den Roh-Body, Prefix "sha256=" (GitHub-Webhook-Konvention). */
export function signPayload(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

export interface PostResult {
  ok: boolean
  status: number | null
  error?: string
}

/**
 * POST mit n Versuchen + Backoff. fetch/sleep injizierbar (Test). Erfolg = 2xx.
 * Wirft NIE — liefert immer ein PostResult (letzter Versuch).
 */
export async function postWithRetry(
  url: string,
  body: string,
  signature: string,
  opts?: {
    attempts?: number
    backoffMs?: number[]
    fetchImpl?: typeof fetch
    sleep?: (ms: number) => Promise<void>
    timeoutMs?: number
  },
): Promise<PostResult> {
  const attempts = opts?.attempts ?? 3
  const backoff = opts?.backoffMs ?? [0, 1000, 4000]
  const doFetch = opts?.fetchImpl ?? fetch
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const timeoutMs = opts?.timeoutMs ?? 8000

  let last: PostResult = { ok: false, status: null, error: 'no_attempt' }
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(backoff[i] ?? backoff[backoff.length - 1] ?? 1000)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Claimondo-Signature': signature },
        body,
        signal: ctrl.signal,
      })
      last = { ok: resp.ok, status: resp.status }
      if (resp.ok) return last
    } catch (err) {
      last = { ok: false, status: null, error: err instanceof Error ? err.message : String(err) }
    } finally {
      clearTimeout(timer)
    }
  }
  return last
}
```

- [ ] **Step 4: Test laufen lassen → muss bestehen**

Run: `npx vitest run src/lib/embed/__tests__/tracking-webhook-core.test.ts`
Expected: PASS (4 Tests, alle grün). Falls der HMAC-Known-Vector abweicht: den erwarteten Hash aus dem Test-Fehler übernehmen (Node `createHmac('sha256','secret').update('hello').digest('hex')` ist deterministisch — der oben angegebene Wert ist korrekt).

- [ ] **Step 5: Commit**
```bash
git add src/lib/embed/tracking-webhook-core.ts src/lib/embed/__tests__/tracking-webhook-core.test.ts
git commit -m "feat(AAR-939): 8b tracking-webhook-core -- Payload + HMAC + Retry (TDD)"
```

---

## Task 3: Server-Orchestrator `tracking-webhook.ts`

**Files:**
- Create: `src/lib/embed/tracking-webhook.ts`

- [ ] **Step 1: Orchestrator implementieren**

Create `src/lib/embed/tracking-webhook.ts`:
```ts
import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type TrackingEvent,
  type TrackingGfaRow,
  type PostResult,
  buildTrackingPayload,
  signPayload,
  postWithRetry,
} from './tracking-webhook-core'

/**
 * AAR-939 Stream 8b — Server-Orchestrator des SV-Tracking-Webhooks (Ebene 2).
 *
 * Feuert HMAC-signiert an embed_sites.tracking_webhook_url, sobald eine Monika-
 * Anfrage einen Trackbaren Status erreicht. Fire-and-forget: JEDER Aufruf wird
 * vom Caller in try/catch gewrappt (non-fatal) — ein Webhook-Fail darf nie
 * Anfrage-Insert / Termin-Booking / Termin-Abschluss brechen.
 *
 * Resolver: termin_vereinbart kommt mit leadId, termin_durchgefuehrt mit terminId
 * -> beide werden ueber gfa.konvertiert_zu_lead_id auf die embed-B-Anfrage
 * aufgeloest. anfrage_eingegangen hat die anfrageId direkt.
 *
 * Gate: nur source='sv_embed' mit gesetzter tracking_webhook_url (+ secret) feuert;
 * Cluster-LP / native / A-ohne-URL -> skipped (no-op).
 */

// gfa-Spalten (live verifiziert). embed_sites/gfa tracking-Spalten sind noch nicht
// in database.types -> any-Cast auf den admin client (wie billing-actions/cron).
const GFA_TRACKING_COLUMNS =
  'id, vorname, nachname, gclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ga_client_id, embed_site_id, source, variante'

type FireRef =
  | { event: 'anfrage_eingegangen'; anfrageId: string }
  | { event: 'termin_vereinbart'; leadId: string }
  | { event: 'termin_durchgefuehrt'; terminId: string }

export type FireResult = { ok: boolean; status?: number | null; skipped?: boolean; error?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/** Loest die referenzierte embed-B-Anfrage-ID auf (oder null = nicht trackbar). */
async function resolveAnfrageId(db: AnyDb, ref: FireRef): Promise<string | null> {
  if (ref.event === 'anfrage_eingegangen') return ref.anfrageId

  let leadId: string | null = null
  if (ref.event === 'termin_vereinbart') {
    leadId = ref.leadId
  } else {
    const { data: termin } = await db
      .from('gutachter_termine')
      .select('lead_id, claim_id')
      .eq('id', ref.terminId)
      .maybeSingle()
    leadId = (termin?.lead_id as string | null) ?? null
    if (!leadId && termin?.claim_id) {
      const { data: claim } = await db
        .from('claims')
        .select('lead_id')
        .eq('id', termin.claim_id as string)
        .maybeSingle()
      leadId = (claim?.lead_id as string | null) ?? null
    }
  }
  if (!leadId) return null

  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id')
    .eq('konvertiert_zu_lead_id', leadId)
    .eq('source', 'sv_embed')
    .eq('variante', 'B')
    .maybeSingle()
  return (gfa?.id as string | null) ?? null
}

async function writeLastStatus(db: AnyDb, embedSiteId: string, res: PostResult): Promise<void> {
  try {
    await db
      .from('embed_sites')
      .update({
        tracking_webhook_last_status: res.status != null ? String(res.status) : res.error ? 'error' : 'unknown',
        tracking_webhook_last_at: new Date().toISOString(),
        tracking_webhook_last_error: res.ok ? null : res.error ?? `HTTP ${res.status}`,
      })
      .eq('id', embedSiteId)
  } catch (err) {
    console.error('[AAR-939 8b] last_* write failed:', err instanceof Error ? err.message : err)
  }
}

export async function fireTrackingWebhook(ref: FireRef): Promise<FireResult> {
  const db = createAdminClient() as AnyDb

  const anfrageId = await resolveAnfrageId(db, ref)
  if (!anfrageId) return { ok: true, skipped: true }

  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select(GFA_TRACKING_COLUMNS)
    .eq('id', anfrageId)
    .maybeSingle()
  if (!gfa || gfa.source !== 'sv_embed' || !gfa.embed_site_id) return { ok: true, skipped: true }

  const { data: site } = await db
    .from('embed_sites')
    .select('slug, tracking_webhook_url, tracking_webhook_secret, einzelpreis_eur')
    .eq('id', gfa.embed_site_id as string)
    .maybeSingle()
  if (!site?.tracking_webhook_url || !site?.tracking_webhook_secret) return { ok: true, skipped: true }

  const valueEur =
    ref.event === 'termin_durchgefuehrt' ? Number(site.einzelpreis_eur ?? 70) : null
  const payload = buildTrackingPayload({
    event: ref.event as TrackingEvent,
    gfa: gfa as TrackingGfaRow,
    embedSiteSlug: site.slug as string,
    valueEur,
    ts: new Date().toISOString(),
  })
  const body = JSON.stringify(payload)
  const signature = signPayload(body, site.tracking_webhook_secret as string)

  const res = await postWithRetry(site.tracking_webhook_url as string, body, signature)
  await writeLastStatus(db, gfa.embed_site_id as string, res)

  if (!res.ok) {
    Sentry.captureMessage('Monika tracking-webhook failed', {
      level: 'warning',
      extra: { anfrageId, event: ref.event, status: res.status, error: res.error },
    })
  }
  return { ok: res.ok, status: res.status, error: res.error }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (kein neuer Fehler in `src/lib/embed/tracking-webhook.ts`).

- [ ] **Step 3: Commit**
```bash
git add src/lib/embed/tracking-webhook.ts
git commit -m "feat(AAR-939): 8b tracking-webhook orchestrator -- Resolver + embed-B-Gate + last_status"
```

---

## Task 4: Feuer-Punkt `anfrage_eingegangen` in `notifyAnfrage`

**Files:**
- Modify: `src/lib/embed/anfrage.ts` (Import oben + Aufruf am Ende von `notifyAnfrage`)

- [ ] **Step 1: Import ergänzen**

In `src/lib/embed/anfrage.ts` nach der bestehenden Import-Gruppe (nach `import type { EmbedAnfrageInput } ...`) einfügen:
```ts
import { fireTrackingWebhook } from '@/lib/embed/tracking-webhook'
```

- [ ] **Step 2: Aufruf am Ende von `notifyAnfrage` ergänzen**

In `src/lib/embed/anfrage.ts`, am ENDE der Funktion `notifyAnfrage` (direkt vor der schließenden `}` der Funktion, nach dem Cluster-LP-WA-Block) einfügen:
```ts
  // AAR-939 8b: SV-Tracking-Webhook (Ebene 2). No-op fuer Cluster-LP / native /
  // A-ohne-URL. Non-fatal — der Insert steht bereits, ein Webhook-Fail darf den
  // Anfrage-Flow nicht beruehren.
  try {
    await fireTrackingWebhook({ event: 'anfrage_eingegangen', anfrageId })
  } catch (err) {
    console.error('[AAR-939 8b] tracking anfrage_eingegangen fehlgeschlagen:', err)
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/lib/embed/anfrage.ts
git commit -m "feat(AAR-939): 8b feuere anfrage_eingegangen-Tracking-Webhook in notifyAnfrage"
```

---

## Task 5: Feuer-Punkt `termin_vereinbart` in `reserveSvTerminForLead`

**Files:**
- Modify: `src/app/dispatch/leads/[id]/_actions/sv-termin.ts` (nach erfolgreichem Insert in `reserveSvTerminForLead`)

- [ ] **Step 1: Tracking-Aufruf nach erfolgreicher Reservierung ergänzen**

In `src/app/dispatch/leads/[id]/_actions/sv-termin.ts`, in `reserveSvTerminForLead`, **direkt vor** `revalidatePath(\`/dispatch/leads/${leadId}\`)` (am Ende der Funktion, nach dem SV-WhatsApp-Notify-try/catch) einfügen:
```ts
  // AAR-939 8b: SV-Tracking-Webhook termin_vereinbart. Dynamic import (server-only
  // Modul). No-op wenn der Lead nicht aus einer embed-B-Anfrage stammt. Non-fatal.
  try {
    const { fireTrackingWebhook } = await import('@/lib/embed/tracking-webhook')
    await fireTrackingWebhook({ event: 'termin_vereinbart', leadId })
  } catch (err) {
    console.warn('[AAR-939 8b] tracking termin_vereinbart fehlgeschlagen:', err)
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add "src/app/dispatch/leads/[id]/_actions/sv-termin.ts"
git commit -m "feat(AAR-939): 8b feuere termin_vereinbart-Tracking-Webhook bei SV-Termin-Reservierung"
```

---

## Task 6: Feuer-Punkt `termin_durchgefuehrt` in `closeNurGutachterTerminAlsDurchgefuehrt`

**Files:**
- Modify: `src/lib/termine/close-nur-gutachter-termin.ts` (nach Schritt 1, dem `durchgefuehrt_am`-Write)

- [ ] **Step 1: Tracking-Aufruf nach `durchgefuehrt_am`-Write ergänzen**

In `src/lib/termine/close-nur-gutachter-termin.ts`, in `closeNurGutachterTerminAlsDurchgefuehrt`, **direkt nach** dem `if (terminErr) return { ok: false, error: terminErr.message }` (also nach dem erfolgreichen Schritt 1, vor Schritt 2 „Claim terminal schließen") einfügen:
```ts
  // AAR-939 8b: SV-Tracking-Webhook termin_durchgefuehrt (value_eur = einzelpreis).
  // Dynamic import — dieses Modul exportiert CLAIM_TERMINAL_STATUSES (evtl.
  // client-importiert), darf also nicht statisch ein 'server-only'-Modul ziehen.
  // No-op wenn der Termin nicht zu einer embed-B-Anfrage gehoert. Non-fatal.
  try {
    const { fireTrackingWebhook } = await import('@/lib/embed/tracking-webhook')
    await fireTrackingWebhook({ event: 'termin_durchgefuehrt', terminId })
  } catch (err) {
    console.error('[AAR-939 8b] tracking termin_durchgefuehrt fehlgeschlagen:', err)
  }
```

- [ ] **Step 2: Typecheck + Tests (Regression)**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run test`
Expected: PASS (inkl. tracking-webhook-core; keine Regression).

- [ ] **Step 3: Commit**
```bash
git add src/lib/termine/close-nur-gutachter-termin.ts
git commit -m "feat(AAR-939): 8b feuere termin_durchgefuehrt-Tracking-Webhook beim nur_gutachter-Abschluss"
```

---

## Task 7: PR1 — Build-Gate + PR gegen staging

- [ ] **Step 1: Voller Build**

Run: `npx tsc --noEmit` und (wenn Heap ok) `npm run build` — bei Worktree-EBUSY-Flake: `rm -rf .next` + retry, sonst `tsc 0` + `✓ Compiled successfully` als Gate-Evidenz (Memory: Worktree-Build-Gate, `NODE_OPTIONS=--max-old-space-size=8192`).
Expected: grün.

- [ ] **Step 2: Push + PR**
```bash
git push
gh pr create --base staging --title "feat(AAR-939): Stream 8b PR1 -- SV-Tracking-Webhook (Sender + Schema + Wiring)" --body "<7-Punkte-Audit + Beschreibung>"
```
Audit-Body: Build grün; UI n/a (Backend); Redundanz = Sender-Shape von push-mandat.ts, core/orchestrator getrennt; Dead-Code keiner; Spec = 8b.1/8b.3 + Feuer-Punkte; Inkonsistenz = Result-Object, gfa-Spalten live verifiziert; Regression = 3 Feuer-Punkte non-fatal, tsc+tests grün.

---

# PR2 — Portal-UX (Wizard + Test-Button + Doku + Monitoring)

---

## Task 8: Write-Pfad + Secret-Generierung

**Files:**
- Modify: `src/lib/embed/site-write.ts` (FormData-Felder + Validierung + emptyForm)
- Modify: `src/app/sv-portal/embed-sites/actions.ts` (buildRow + Secret-Gen in create/update)

- [ ] **Step 1: `EmbedSiteFormData` + Validierung + emptyForm erweitern**

In `src/lib/embed/site-write.ts`:

(a) Interface `EmbedSiteFormData` um zwei Felder ergänzen (nach `agb_akzeptiert: boolean`):
```ts
  // Tracking (8b) — beide optional
  tracking_webhook_url: string
  tracking_ga4_measurement_id: string
```

(b) Neue Validierungs-Helper + Konstante am Dateiende ergänzen:
```ts
/** Webhook-URL muss leer ODER eine https-URL sein. */
export function isValidWebhookUrl(url: string): boolean {
  const t = url.trim()
  if (!t) return true
  try {
    return new URL(t).protocol === 'https:'
  } catch {
    return false
  }
}
```

(c) In `validateBasis` NICHT ändern (Tracking ist optionaler Step). Stattdessen eine eigene Step-Validierung hinzufügen:
```ts
export function validateTracking(form: EmbedSiteFormData): Set<string> {
  const f = new Set<string>()
  if (!isValidWebhookUrl(form.tracking_webhook_url)) f.add('tracking_webhook_url')
  return f
}
```

(d) `emptyEmbedSiteForm()` um die zwei Felder ergänzen (vor der schließenden `}` des return-Objekts):
```ts
    tracking_webhook_url: '',
    tracking_ga4_measurement_id: '',
```

- [ ] **Step 2: `actions.ts` — buildRow + Secret-Generierung**

In `src/app/sv-portal/embed-sites/actions.ts`:

(a) Import oben ergänzen:
```ts
import { randomBytes } from 'crypto'
```
und `isValidWebhookUrl` aus site-write mit importieren (in den bestehenden `import { ... } from '@/lib/embed/site-write'`-Block aufnehmen).

(b) In `buildRow` die zwei Tracking-Felder schreiben (vor `...agb,`):
```ts
    tracking_webhook_url: orNull(form.tracking_webhook_url),
    tracking_ga4_measurement_id: orNull(form.tracking_ga4_measurement_id),
```

(c) In `validateForm` die Webhook-URL prüfen (vor `return null`):
```ts
  if (!isValidWebhookUrl(form.tracking_webhook_url)) return 'Webhook-URL muss mit https:// beginnen.'
```

(d) In `createEmbedSite`: Secret generieren wenn URL gesetzt. Den Insert-Block so anpassen, dass `buildRow(...)` um das Secret erweitert wird:
```ts
  const row = buildRow(form, user.id, sv?.id ?? null)
  const insertRow =
    form.tracking_webhook_url.trim()
      ? { ...row, tracking_webhook_secret: randomBytes(32).toString('hex') }
      : row
  const { data, error } = await db
    .from('embed_sites')
    .insert(insertRow)
    .select('id')
    .single()
```
(ersetzt den bisherigen `.insert(buildRow(form, user.id, sv?.id ?? null))`-Aufruf).

(e) In `updateEmbedSite`: bestehenden Secret laden, nur generieren wenn URL gesetzt UND Secret noch NULL. Vor dem `.update(...)`:
```ts
  // Secret nur einmalig generieren (beim erstmaligen Setzen einer URL).
  let secretPatch: { tracking_webhook_secret?: string } = {}
  if (form.tracking_webhook_url.trim()) {
    const { data: existing } = await db
      .from('embed_sites')
      .select('tracking_webhook_secret')
      .eq('id', id)
      .eq('inhaber_profile_id', user.id)
      .maybeSingle()
    if (!existing?.tracking_webhook_secret) {
      secretPatch = { tracking_webhook_secret: randomBytes(32).toString('hex') }
    }
  }
  const { data, error } = await db
    .from('embed_sites')
    .update({ ...buildRow(form, user.id, sv?.id ?? null), ...secretPatch })
    .eq('id', id)
    .eq('inhaber_profile_id', user.id)
    .select('id')
```
(ersetzt den bisherigen `.update(buildRow(...))`-Aufruf in updateEmbedSite).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/lib/embed/site-write.ts "src/app/sv-portal/embed-sites/actions.ts"
git commit -m "feat(AAR-939): 8b Write-Pfad -- tracking_webhook_url/ga4 + Secret-Gen serverseitig"
```

---

## Task 9: Test-Button-Server-Action `sendTestTrackingWebhook`

**Files:**
- Modify: `src/app/sv-portal/embed-sites/actions.ts` (neue Action am Dateiende)

- [ ] **Step 1: Action implementieren**

In `src/app/sv-portal/embed-sites/actions.ts` am Dateiende ergänzen:
```ts
/**
 * AAR-939 8b: Test-Webhook (event:'test') an die konfigurierte URL der eigenen
 * Site. 1x POST (kein Retry). Ownership ueber inhaber_profile_id. Nutzt den pure
 * Kern fuer Signatur — kein server-only-Import noetig (createHmac via core).
 */
export async function sendTestTrackingWebhook(
  siteId: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: site } = await db
    .from('embed_sites')
    .select('slug, tracking_webhook_url, tracking_webhook_secret')
    .eq('id', siteId)
    .eq('inhaber_profile_id', user.id)
    .maybeSingle()
  if (!site) return { ok: false, error: 'Site nicht gefunden.' }
  if (!site.tracking_webhook_url || !site.tracking_webhook_secret) {
    return { ok: false, error: 'Keine Webhook-URL konfiguriert. Erst URL speichern.' }
  }

  const { buildTrackingPayload, signPayload, postWithRetry } = await import('@/lib/embed/tracking-webhook-core')
  const payload = buildTrackingPayload({
    event: 'test',
    gfa: {
      id: 'test',
      vorname: 'Test',
      nachname: 'Anfrage',
      gclid: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
      ga_client_id: null,
    },
    embedSiteSlug: site.slug as string,
    valueEur: null,
    ts: new Date().toISOString(),
  })
  const body = JSON.stringify(payload)
  const signature = signPayload(body, site.tracking_webhook_secret as string)
  const res = await postWithRetry(site.tracking_webhook_url as string, body, signature, { attempts: 1 })

  await db
    .from('embed_sites')
    .update({
      tracking_webhook_last_status: res.status != null ? String(res.status) : res.error ? 'error' : 'unknown',
      tracking_webhook_last_at: new Date().toISOString(),
      tracking_webhook_last_error: res.ok ? null : res.error ?? `HTTP ${res.status}`,
    })
    .eq('id', siteId)

  revalidatePath(`/sv-portal/embed-sites/${siteId}`)
  if (!res.ok) return { ok: false, status: res.status ?? undefined, error: res.error ?? `HTTP ${res.status}` }
  return { ok: true, status: res.status ?? undefined }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add "src/app/sv-portal/embed-sites/actions.ts"
git commit -m "feat(AAR-939): 8b sendTestTrackingWebhook -- Test-Ping mit event:test"
```

---

## Task 10: Wizard — Tracking-Step (+ Secret/Test/Monitoring im Edit)

**Files:**
- Modify: `src/app/sv-portal/embed-sites/EmbedSiteWizard.tsx`
- Modify: `src/app/sv-portal/embed-sites/[id]/page.tsx` (initial + trackingMeta-Prop)

- [ ] **Step 1: Edit-Page — initial-Felder + trackingMeta-Prop**

In `src/app/sv-portal/embed-sites/[id]/page.tsx`:

(a) Im `initial`-Objekt ergänzen (nach `agb_akzeptiert: ...`):
```ts
    tracking_webhook_url: data.tracking_webhook_url ?? '',
    tracking_ga4_measurement_id: data.tracking_ga4_measurement_id ?? '',
```

(b) Dem `<EmbedSiteWizard ...>` eine neue Prop `trackingMeta` übergeben:
```tsx
        trackingMeta={{
          hasSecret: Boolean(data.tracking_webhook_secret),
          lastStatus: data.tracking_webhook_last_status ?? null,
          lastAt: data.tracking_webhook_last_at ?? null,
          lastError: data.tracking_webhook_last_error ?? null,
        }}
```

- [ ] **Step 2: Wizard — Prop-Typ + STEPS + Tracking-Step + Zusammenfassung**

In `src/app/sv-portal/embed-sites/EmbedSiteWizard.tsx`:

(a) Import ergänzen (zu den bestehenden site-write-Imports `validateTracking` hinzufügen; `createEmbedSite, updateEmbedSite` bleibt; neu `sendTestTrackingWebhook` aus `./actions`):
```ts
import { createEmbedSite, updateEmbedSite, sendTestTrackingWebhook } from './actions'
```
und `validateTracking` in den `from '@/lib/embed/site-write'`-Import aufnehmen.

(b) `STEPS` erweitern:
```ts
const STEPS = ['Basis & Domains', 'Variante & Branding', 'Tracking', 'Zusammenfassung'] as const
```

(c) Prop-Typ + Default ergänzen — die Komponenten-Signatur um `trackingMeta` erweitern:
```ts
  trackingMeta,
}: {
  mode: 'create' | 'edit'
  siteId?: string
  initial: EmbedSiteFormData
  svBrand: SvBrand
  defaultLogo: string
  trackingMeta?: {
    hasSecret: boolean
    lastStatus: string | null
    lastAt: string | null
    lastError: string | null
  }
}) {
```

(d) In `next()` die Tracking-Step-Validierung ergänzen (nach dem `if (step === 1) {...}`-Block):
```ts
    if (step === 2) {
      const f = validateTracking(form)
      setFieldErrors(f)
      if (f.size > 0) {
        setError('Webhook-URL muss mit https:// beginnen.')
        return
      }
    }
```

(e) Test-State + Handler oben in der Komponente (bei den anderen `useState`-Hooks):
```ts
  const [testing, setTesting] = useState(false)

  async function runTest() {
    if (!siteId) return
    setTesting(true)
    const res = await sendTestTrackingWebhook(siteId)
    setTesting(false)
    if (res.ok) toast.success(`Test gesendet — HTTP ${res.status ?? 200}`)
    else toast.error(res.error ?? 'Test fehlgeschlagen')
  }
```

(f) Den neuen STEP 2 (Tracking) **vor** dem bisherigen Zusammenfassungs-Block einfügen. Den bisherigen `{step === 2 && (...) }` (Zusammenfassung) auf `step === 3` ändern. Neuer Tracking-Block:
```tsx
      {/* STEP 2 — Tracking (optional) */}
      {step === 2 && (
        <SectionCard title="Tracking & Conversions (optional)" bodyClassName="space-y-4">
          <p className="text-sm text-claimondo-ondo">
            Verbinde Monika mit deinem GA4 / Google Ads. Wir senden bei Anfrage, vereinbartem und
            durchgeführtem Termin einen HMAC-signierten Webhook an deine URL.
          </p>
          <TextField
            label="Webhook-URL (optional)"
            value={form.tracking_webhook_url}
            onChange={(e) => patch({ tracking_webhook_url: e.target.value })}
            error={err('tracking_webhook_url')}
            hint="Muss mit https:// beginnen. Make.com / Zapier / n8n / eigener Endpoint."
            placeholder="https://hook.make.com/…"
          />
          <TextField
            label="GA4 Measurement-ID (optional)"
            value={form.tracking_ga4_measurement_id}
            onChange={(e) => patch({ tracking_ga4_measurement_id: e.target.value })}
            hint="Für client-seitiges Tracking. Format G-XXXXXXX."
            placeholder="G-XXXXXXX"
          />

          {mode === 'edit' && trackingMeta ? (
            <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-4 py-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-claimondo-ondo">Signatur-Secret</span>
                <span className="text-claimondo-navy">
                  {trackingMeta.hasSecret ? 'gesetzt (wird bei Speichern erzeugt/behalten)' : 'wird beim Speichern erzeugt'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-claimondo-ondo">Letzter Send</span>
                <TrackingStatus status={trackingMeta.lastStatus} at={trackingMeta.lastAt} error={trackingMeta.lastError} />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="navy"
                  size="sm"
                  loading={testing}
                  disabled={!form.tracking_webhook_url.trim()}
                  onClick={runTest}
                >
                  Test-Webhook senden
                </Button>
                <Button variant="ghost" size="sm" onClick={() => router.push(`/sv-portal/embed-sites/${siteId}/tracking-anleitung`)}>
                  Einrichtungs-Anleitung
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border px-4 py-3 text-xs text-claimondo-ondo">
              Signatur-Secret, Test-Button und Anleitung sind nach dem Anlegen der Site verfügbar.
            </div>
          )}
        </SectionCard>
      )}
```

(g) In der Zusammenfassung (jetzt `step === 3`) eine Zeile ergänzen (nach der CC-Zeile):
```tsx
          {form.tracking_webhook_url && <Row label="Tracking-Webhook" value={form.tracking_webhook_url} />}
```

(h) `TrackingStatus`-Helper am Dateiende ergänzen (neben `Row`):
```tsx
function TrackingStatus({ status, at, error }: { status: string | null; at: string | null; error: string | null }) {
  if (!status) return <span className="text-claimondo-ondo">— noch kein Send</span>
  const ok = /^2\d\d$/.test(status)
  const when = at ? new Date(at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
  return (
    <span className={ok ? 'text-emerald-600' : 'text-red-600'}>
      {ok ? '✓' : '✗'} {status}
      {when ? ` · ${when}` : ''}
      {!ok && error ? ` · ${error}` : ''}
    </span>
  )
}
```

- [ ] **Step 3: Typecheck + Build**

Run: `npx tsc --noEmit`
Expected: PASS (Wizard kompiliert mit neuer Prop + Step).

- [ ] **Step 4: Commit**
```bash
git add "src/app/sv-portal/embed-sites/EmbedSiteWizard.tsx" "src/app/sv-portal/embed-sites/[id]/page.tsx"
git commit -m "feat(AAR-939): 8b Wizard-Tracking-Step + Secret/Test/Monitoring im Edit"
```

---

## Task 11: Doku-Page `tracking-anleitung` (3 Tabs)

**Files:**
- Create: `src/app/sv-portal/embed-sites/[id]/tracking-anleitung/page.tsx`

- [ ] **Step 1: Page implementieren**

Create `src/app/sv-portal/embed-sites/[id]/tracking-anleitung/page.tsx`:
```tsx
// AAR-939 · Stream 8b — SV-Tracking-Einrichtungs-Anleitung (3 Tabs).
// Klick-Pfade + Code statt Produkt-Screenshots (extern, nicht generierbar) —
// Screenshot-Plaetze als Kommentar markiert fuer spaetere Ergaenzung.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

export default async function TrackingAnleitungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: site } = await (supabase as any)
    .from('embed_sites')
    .select('slug, tracking_ga4_measurement_id')
    .eq('id', id)
    .maybeSingle()
  if (!site) notFound()

  const ga4 = (site.tracking_ga4_measurement_id as string | null) ?? 'G-XXXXXXX'

  return (
    <div className="py-6 space-y-4">
      <PageHeader title="Tracking einrichten" size="lg" description={`Für Site „${site.slug}"`} />
      <Link href={`/sv-portal/embed-sites/${id}`} className="text-sm text-claimondo-ondo hover:underline">
        ← Zurück zur Site
      </Link>

      <Tabs defaultValue="ga4">
        <TabsList>
          <TabsTrigger value="ga4">GA4</TabsTrigger>
          <TabsTrigger value="ads">Google Ads</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        <TabsContent value="ga4">
          <SectionCard title="Google Analytics 4" bodyClassName="space-y-3 text-sm text-claimondo-navy">
            <p>
              Monika pusht Events in den <code>window.dataLayer</code> deiner Seite — du fängst sie in GA4
              über den Google Tag Manager ab. Kein Code auf deiner Seite nötig außer dem GTM-Container.
            </p>
            <p className="font-medium">Events, die Monika sendet:</p>
            <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto">
{`monika_shown        // Widget sichtbar
monika_open         // Nutzer öffnet das Widget
monika_qualify_yes  // "Hatten Sie einen Unfall?" → Ja
monika_form_shown   // Formular angezeigt
monika_anfrage_submit  // Anfrage abgeschickt`}
            </pre>
            <p className="font-medium">Einrichtung (GTM):</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>GTM → Variablen → „dataLayer-Variable" für <code>event</code> anlegen.</li>
              <li>GTM → Trigger → „Benutzerdefiniertes Ereignis", Ereignisname <code>monika_anfrage_submit</code>.</li>
              <li>GTM → Tag → „GA4-Ereignis", Mess-ID <code>{ga4}</code>, Ereignisname <code>anfrage</code>, Trigger = oben.</li>
              <li>Vorschau + Veröffentlichen.</li>
            </ol>
            {/* SCREENSHOT-PLATZ: GTM-Trigger-Konfiguration */}
          </SectionCard>
        </TabsContent>

        <TabsContent value="ads">
          <SectionCard title="Google Ads" bodyClassName="space-y-3 text-sm text-claimondo-navy">
            <p>Zwei Wege — wähle einen:</p>
            <p className="font-medium">A) Conversion aus GA4-Event (einfach)</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>GA4 → Verwalten → Ereignisse → <code>anfrage</code> als „Schlüsselereignis" markieren.</li>
              <li>Google Ads → Ziele → Conversions → GA4 importieren → <code>anfrage</code> auswählen.</li>
            </ol>
            <p className="font-medium">B) Offline-Conversion via Webhook (genauer, mit gclid)</p>
            <p>
              Unser Webhook (Tab „Webhook") liefert <code>gclid</code> + <code>value_eur</code> beim
              durchgeführten Termin. Leite das über Make.com an den Google-Ads-Conversion-Upload —
              so zählt der echte Auftragswert (70 €), nicht nur der Klick.
            </p>
            {/* SCREENSHOT-PLATZ: Google-Ads-Conversion-Import */}
          </SectionCard>
        </TabsContent>

        <TabsContent value="webhook">
          <SectionCard title="Webhook (Server-zu-Server)" bodyClassName="space-y-3 text-sm text-claimondo-navy">
            <p>
              Hinterlege im Wizard-Schritt „Tracking" eine HTTPS-URL. Wir POSTen JSON mit einer
              HMAC-Signatur im Header <code>X-Claimondo-Signature</code> bei diesen Events:
              <code> anfrage_eingegangen</code>, <code>termin_vereinbart</code>, <code>termin_durchgefuehrt</code>.
            </p>
            <p className="font-medium">Payload:</p>
            <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto">
{`{
  "event": "termin_durchgefuehrt",
  "anfrage_id": "uuid",
  "embed_site_slug": "${site.slug}",
  "name": "Erika Musterfrau",
  "gclid": "...", "utm_source": "...", "ga_client_id": "...",
  "value_eur": 70,
  "ts": "2026-06-02T10:00:00.000Z"
}`}
            </pre>
            <p className="font-medium">Signatur prüfen (Node):</p>
            <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto">
{`import { createHmac } from 'crypto'
const expected = 'sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex')
// zeitkonstant gegen req.headers['x-claimondo-signature'] vergleichen`}
            </pre>
            <p className="text-claimondo-ondo">
              Dein Signatur-Secret steht nach dem Speichern im Wizard-Schritt „Tracking". Mit dem
              „Test-Webhook senden"-Button prüfst du die Verbindung sofort.
            </p>
            {/* SCREENSHOT-PLATZ: Make.com-Szenario */}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + Tabs-API verifizieren**

Run: `npx tsc --noEmit`
Expected: PASS. Falls die Base-UI-Tabs `value`/`defaultValue`-Props anders heißen: an `src/components/ui/tabs.tsx` (TabsPrimitive aus `@base-ui/react/tabs`) ausrichten — `Tabs` nimmt `defaultValue`, `TabsTrigger`/`TabsContent` nehmen `value`.

- [ ] **Step 3: Commit**
```bash
git add "src/app/sv-portal/embed-sites/[id]/tracking-anleitung/page.tsx"
git commit -m "feat(AAR-939): 8b Tracking-Doku-Page -- GA4/Google-Ads/Webhook (Klick-Pfade + Code)"
```

---

## Task 12: Monitoring-Badge in der Sites-Liste

**Files:**
- Modify: `src/app/sv-portal/embed-sites/page.tsx` (Query + Row-Mapping)
- Modify: `src/app/sv-portal/embed-sites/EmbedSitesList.tsx` (Row-Typ + Spalte)

- [ ] **Step 1: Liste-Page — Query + Felder**

In `src/app/sv-portal/embed-sites/page.tsx` die `.select(...)` erweitern:
```ts
    .select('id, name, slug, variante, aktiv, anfragen_gesamt, erstellt_am, tracking_webhook_url, tracking_webhook_last_status')
```

- [ ] **Step 2: Liste-Component — Row-Typ + Spalte**

In `src/app/sv-portal/embed-sites/EmbedSitesList.tsx`:

(a) `EmbedSiteListRow` erweitern (vor `}`):
```ts
  tracking_webhook_url: string | null
  tracking_webhook_last_status: string | null
```

(b) Im Tabellen-Header (`<Thead>`) eine Spalte vor der letzten leeren `<Th>` ergänzen:
```tsx
              <Th>Tracking</Th>
```

(c) In der Zeile (`<ClickableTr>`) eine `<Td>` vor der Toggle-`<Td>` ergänzen:
```tsx
                <Td>
                  {site.tracking_webhook_url ? (
                    <Badge tone={/^2\d\d$/.test(site.tracking_webhook_last_status ?? '') ? 'success' : site.tracking_webhook_last_status ? 'warning' : 'neutral'}>
                      {site.tracking_webhook_last_status
                        ? /^2\d\d$/.test(site.tracking_webhook_last_status)
                          ? 'OK'
                          : site.tracking_webhook_last_status
                        : 'aktiv'}
                    </Badge>
                  ) : (
                    <span className="text-xs text-claimondo-ondo">—</span>
                  )}
                </Td>
```

- [ ] **Step 3: Typecheck + Build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add "src/app/sv-portal/embed-sites/page.tsx" "src/app/sv-portal/embed-sites/EmbedSitesList.tsx"
git commit -m "feat(AAR-939): 8b Monitoring-Badge in der Embed-Sites-Liste"
```

---

## Task 13: PR2 — Build-Gate + Smoke + PR gegen staging

- [ ] **Step 1: Voller Build + Tests**

Run: `npx tsc --noEmit` + `npm run test` + (wenn Heap ok) `npm run build`.
Expected: grün.

- [ ] **Step 2: Staging-Smoke (nach Merge/Deploy durch Merge-Session)**

SV-Portal `app.staging.claimondo.de/sv-portal/embed-sites` → neue Site mit Webhook-URL (z.B. https://webhook.site/<id>) anlegen → Edit → „Test-Webhook senden" → 200 + Payload bei webhook.site sichtbar + Monitoring zeigt „✓ 200". **Screenshot im selben Turn auswerten** (Memory: Smoke = Screenshot-Pflicht).

- [ ] **Step 3: Push + PR**
```bash
git push
gh pr create --base staging --title "feat(AAR-939): Stream 8b PR2 -- SV-Tracking Portal-UX (Wizard + Test + Doku + Monitoring)" --body "<7-Punkte-Audit>"
```

---

## Self-Review-Notiz (gegen die Spec)

- Spec §3.1 Schema → Task 1. §3.2 Sender → Tasks 2+3. §3.3 Feuer-Punkte → Tasks 4/5/6. §3.4 Write+Secret → Task 8. §3.5 Wizard → Task 10. §3.6 Test-Button → Tasks 9+10. §3.7 Doku → Task 11. §3.8 Monitoring → Tasks 10 (Edit) + 12 (Liste). §4 Tests → Task 2. §6 PR-Schnitt → PR1 (1–7) / PR2 (8–13).
- Typ-Konsistenz: `fireTrackingWebhook(FireRef)`, `buildTrackingPayload({event,gfa,embedSiteSlug,valueEur,ts})`, `signPayload(body,secret)`, `postWithRetry(url,body,signature,opts)`, `EmbedSiteFormData.tracking_webhook_url/tracking_ga4_measurement_id`, `validateTracking`, `isValidWebhookUrl`, `sendTestTrackingWebhook(siteId)`, `trackingMeta`-Prop — über alle Tasks identisch.
- Offene Pin-Punkte aus der Spec §7: termin_vereinbart = `reserveSvTerminForLead` (Task 5, bestätigt); termin_durchgefuehrt = `closeNurGutachterTerminAlsDurchgefuehrt` (Task 6, bestätigt); Sentry = `@sentry/nextjs` (Task 3, bestätigt); Monitoring-Badge in Liste = ja (Task 12, bestätigt).
