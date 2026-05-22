# matelso Call-Tracking Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public webhook `POST /api/webhooks/matelso/inbound` that ingests matelso call-tracking events from the kfzgutachter Ads landing page, auto-creates/matches a lead, notifies dispatch, and records each call in a new `matelso_calls` table.

**Architecture:** A thin Next.js route handler does auth (`?secret=`) + IO glue; all decision logic (status normalization, dedup key, notification text/link) lives in pure functions in `src/lib/matelso/process-call.ts` that are unit-tested in isolation. Payload validation is a Zod schema mirroring the `aircall-event.ts` pattern. Persistence is a dedicated `matelso_calls` table created via a supabase-CLI migration. matelso replaces Aircall for the LP number; the Aircall path (`aircall_calls`) is untouched.

**Tech Stack:** Next.js 16.2.1 (App Router, route handlers) · TypeScript · Zod v4 · Vitest · Supabase (service-role admin client) · supabase CLI for DDL.

**Spec:** `docs/superpowers/specs/2026-05-22-matelso-call-tracking-webhook-design.md`

---

## Prerequisites (run once in this worktree)

- [ ] **P1: Install dependencies** (worktrees do not share `node_modules`)

Run: `npm install`
Expected: completes without error; `node_modules/` populated.

- [ ] **P2: Confirm supabase CLI is linked**

Run: `npx supabase migration list --linked`
Expected: prints a table of local vs remote migrations. If it errors with "not linked", STOP and ask the user to run `npx supabase link` (needs project ref) — do not guess credentials.

- [ ] **P3: Confirm baseline build/types are green before changing anything**

Run: `npx tsc --noEmit`
Expected: exits 0 (no errors). If it fails on pre-existing errors unrelated to matelso, report and ask before proceeding.

---

## Task 1: matelso payload Zod schema (TDD)

**Files:**
- Create: `src/lib/schemas/matelso-event.ts`
- Test: `src/lib/schemas/__tests__/matelso-event.test.ts`

**Design note:** All fields are optional + `.passthrough()`. We deliberately do NOT require `anrufer_nummer` — suppressed-number calls must still be accepted (they produce a call record + notification without a lead). `z.object` still rejects non-object bodies (string/array/null), which is the 400 case. `dauer_sekunden` accepts string or number because matelso sends it as a string (`"120"`). This refines spec §6 ("Pflicht nur anrufer_nummer"): tolerance wins so anonymous calls don't 400.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/schemas/__tests__/matelso-event.test.ts
import { describe, it, expect } from 'vitest'
import { MatelsoEventSchema } from '../matelso-event'

describe('MatelsoEventSchema', () => {
  it('akzeptiert den Mail-Beispiel-Payload (alle Felder Strings)', () => {
    const r = MatelsoEventSchema.safeParse({
      call_id: 'mtl-abc-123',
      anrufer_nummer: '+491701234567',
      angerufene_nummer: '+4922125906530',
      anruf_status: 'answered',
      dauer_sekunden: '120',
      quelle: 'Google Ads Kampagne X',
      zeitpunkt: '2026-05-22T10:15:00Z',
    })
    expect(r.success).toBe(true)
  })

  it('akzeptiert leeres Objekt (unterdrueckte Nummer / fehlende DDD-Keys)', () => {
    const r = MatelsoEventSchema.safeParse({})
    expect(r.success).toBe(true)
  })

  it('akzeptiert dauer_sekunden als number', () => {
    const r = MatelsoEventSchema.safeParse({ anrufer_nummer: '+4915112345678', dauer_sekunden: 42 })
    expect(r.success).toBe(true)
  })

  it('akzeptiert unbekannte Felder (passthrough — matelso darf erweitern)', () => {
    const r = MatelsoEventSchema.safeParse({ anrufer_nummer: '+49170', neues_matelso_feld: 'x' })
    expect(r.success).toBe(true)
  })

  it('lehnt nicht-Objekt-Body ab (string)', () => {
    const r = MatelsoEventSchema.safeParse('just-a-string')
    expect(r.success).toBe(false)
  })

  it('lehnt Array-Body ab', () => {
    const r = MatelsoEventSchema.safeParse([{ anrufer_nummer: '+49170' }])
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/schemas/__tests__/matelso-event.test.ts`
Expected: FAIL — cannot resolve `../matelso-event` (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/schemas/matelso-event.ts
// Zentrales Zod-Schema fuer den matelso-Inbound-Webhook.
// Muster wie aircall-event.ts: .passthrough() damit neue matelso-Felder
// nicht sofort 400en. Alle Felder optional — auch anrufer_nummer, weil
// unterdrueckte Nummern akzeptiert werden (Call-Record ohne Lead).
// dauer_sekunden kommt von matelso als String ("120"), daher union.
import { z } from 'zod'

export const MatelsoEventSchema = z
  .object({
    call_id: z.string().optional(),
    anrufer_nummer: z.string().optional(),
    angerufene_nummer: z.string().optional(),
    anruf_status: z.string().optional(),
    dauer_sekunden: z.union([z.string(), z.number()]).optional(),
    quelle: z.string().optional(),
    zeitpunkt: z.string().optional(),
  })
  .passthrough()

export type MatelsoEvent = z.infer<typeof MatelsoEventSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/schemas/__tests__/matelso-event.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/matelso-event.ts src/lib/schemas/__tests__/matelso-event.test.ts
git commit -m "feat(matelso): zod schema for matelso webhook payload

Audit:
- Build: tsc green (schema only)
- UI: n/a (backend)
- Redundanz: mirrors aircall-event.ts pattern
- Dead-Code: none
- Spec: implements design spec section 6 (refines anrufer_nummer to optional for anonymous calls)
- Inkonsistenz: zod v4, passthrough like aircall
- Regression: new file, no consumers yet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure call-processing logic (TDD)

**Files:**
- Create: `src/lib/matelso/process-call.ts`
- Test: `src/lib/matelso/__tests__/process-call.test.ts`

These are pure functions — no DB, no HTTP — so they are fully unit-testable. The route (Task 4) imports them.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/matelso/__tests__/process-call.test.ts
import { describe, it, expect } from 'vitest'
import {
  normalizeMatelsoStatus,
  buildDedupKey,
  pickNotificationLink,
  buildCallNotificationText,
} from '../process-call'

describe('normalizeMatelsoStatus', () => {
  it('mappt answered/completed/connected -> answered', () => {
    expect(normalizeMatelsoStatus('answered')).toBe('answered')
    expect(normalizeMatelsoStatus('COMPLETED')).toBe('answered')
    expect(normalizeMatelsoStatus('connected')).toBe('answered')
  })
  it('mappt no-answer/noanswer/missed/cancel/reject -> missed', () => {
    expect(normalizeMatelsoStatus('no-answer')).toBe('missed')
    expect(normalizeMatelsoStatus('NOANSWER')).toBe('missed')
    expect(normalizeMatelsoStatus('missed')).toBe('missed')
    expect(normalizeMatelsoStatus('cancelled')).toBe('missed')
    expect(normalizeMatelsoStatus('rejected')).toBe('missed')
  })
  it('mappt voicemail/mailbox -> voicemail', () => {
    expect(normalizeMatelsoStatus('voicemail')).toBe('voicemail')
    expect(normalizeMatelsoStatus('mailbox')).toBe('voicemail')
  })
  it('mappt busy/failed -> failed', () => {
    expect(normalizeMatelsoStatus('busy')).toBe('failed')
    expect(normalizeMatelsoStatus('failed')).toBe('failed')
  })
  it('mappt unbekannt/leer -> other', () => {
    expect(normalizeMatelsoStatus('hangup-xyz')).toBe('other')
    expect(normalizeMatelsoStatus('')).toBe('other')
    expect(normalizeMatelsoStatus(undefined)).toBe('other')
  })
})

describe('buildDedupKey', () => {
  it('nutzt call_id wenn vorhanden', () => {
    expect(buildDedupKey({ callId: 'abc', from: '+49170', zeitpunkt: 't' })).toBe('matelso:abc')
  })
  it('faellt auf hash(from|zeitpunkt) zurueck wenn keine call_id', () => {
    const k1 = buildDedupKey({ from: '+49170', zeitpunkt: '2026-05-22T10:00:00Z' })
    const k2 = buildDedupKey({ from: '+49170', zeitpunkt: '2026-05-22T10:00:00Z' })
    expect(k1).toBe(k2) // stabil -> Idempotenz
    expect(k1.startsWith('matelso:fallback:')).toBe(true)
  })
  it('erzeugt einmaligen Schluessel wenn weder call_id noch from+zeitpunkt', () => {
    const k1 = buildDedupKey({})
    const k2 = buildDedupKey({})
    expect(k1).not.toBe(k2) // keine Idempotenz moeglich, aber kein Unique-Clash
    expect(k1.startsWith('matelso:nokey:')).toBe(true)
  })
})

describe('pickNotificationLink', () => {
  it('Lead gewinnt vor Fall', () => {
    expect(pickNotificationLink('lead-1', 'fall-1')).toBe('/dispatch/leads/lead-1')
  })
  it('nur Fall -> Fall-Link', () => {
    expect(pickNotificationLink(null, 'fall-1')).toBe('/faelle/fall-1')
  })
  it('weder noch -> undefined', () => {
    expect(pickNotificationLink(null, null)).toBeUndefined()
  })
})

describe('buildCallNotificationText', () => {
  it('mit Nummer', () => {
    const r = buildCallNotificationText({ fromNumber: '+491701234567', quelle: 'Google Ads', status: 'answered', duration: 120 })
    expect(r.titel).toBe('Eingehender Anruf von +491701234567')
    expect(r.beschreibung).toBe('Google Ads · Status: answered · Dauer: 120s')
  })
  it('ohne Nummer (unterdrueckt)', () => {
    const r = buildCallNotificationText({ fromNumber: '', quelle: null, status: 'other', duration: null })
    expect(r.titel).toBe('Eingehender Anruf mit unterdrückter Nummer')
    expect(r.beschreibung).toBe('Quelle unbekannt · Status: other · Dauer: 0s')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matelso/__tests__/process-call.test.ts`
Expected: FAIL — cannot resolve `../process-call`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/matelso/process-call.ts
// Reine Logik fuer den matelso-Webhook — kein DB-/HTTP-Zugriff, voll testbar.
import crypto from 'node:crypto'

export type MatelsoCallStatus = 'answered' | 'missed' | 'voicemail' | 'failed' | 'other'

/**
 * Normalisiert matelsos callStatus (Werte tarifabhaengig) auf eine kleine
 * Menge. Das Original wird separat in matelso_calls.status_raw gespeichert,
 * daher ist diese Abbildung best-effort und darf nie werfen.
 */
export function normalizeMatelsoStatus(raw: string | undefined | null): MatelsoCallStatus {
  const s = (raw ?? '').toLowerCase().trim()
  if (!s) return 'other'
  if (s.includes('voicemail') || s.includes('mailbox')) return 'voicemail'
  if (s.includes('no') && s.includes('answer')) return 'missed' // no-answer, noanswer
  if (s.includes('miss') || s.includes('cancel') || s.includes('reject') || s.includes('abandon')) return 'missed'
  if (s.includes('busy') || s.includes('fail')) return 'failed'
  if (s.includes('answer') || s.includes('complete') || s.includes('connect')) return 'answered'
  return 'other'
}

/**
 * Idempotenz-Schluessel fuer matelso_calls.external_call_id (UNIQUE).
 * Prio: matelso call_id. Fallback: stabiler Hash aus from+zeitpunkt.
 * Letzter Fallback: zufaellig (keine Idempotenz, aber kein UNIQUE-Clash).
 */
export function buildDedupKey(input: { callId?: string | null; from?: string | null; zeitpunkt?: string | null }): string {
  const callId = (input.callId ?? '').trim()
  if (callId) return `matelso:${callId}`
  const from = (input.from ?? '').trim()
  const zeitpunkt = (input.zeitpunkt ?? '').trim()
  if (from && zeitpunkt) {
    const h = crypto.createHash('sha256').update(`${from}|${zeitpunkt}`).digest('hex').slice(0, 24)
    return `matelso:fallback:${h}`
  }
  return `matelso:nokey:${crypto.randomUUID()}`
}

/** Notification-Ziel: Lead-Detail vor Fall-Detail. */
export function pickNotificationLink(leadId: string | null, fallId: string | null): string | undefined {
  if (leadId) return `/dispatch/leads/${leadId}`
  if (fallId) return `/faelle/${fallId}`
  return undefined
}

/** Titel + Beschreibung der Dispatch-Notification (nutzersichtbar — Umlaute). */
export function buildCallNotificationText(args: {
  fromNumber: string
  quelle: string | null
  status: string
  duration: number | null
}): { titel: string; beschreibung: string } {
  const titel = args.fromNumber
    ? `Eingehender Anruf von ${args.fromNumber}`
    : 'Eingehender Anruf mit unterdrückter Nummer'
  const beschreibung = [args.quelle ?? 'Quelle unbekannt', `Status: ${args.status}`, `Dauer: ${args.duration ?? 0}s`].join(' · ')
  return { titel, beschreibung }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/matelso/__tests__/process-call.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/matelso/process-call.ts src/lib/matelso/__tests__/process-call.test.ts
git commit -m "feat(matelso): pure call-processing helpers + tests

Audit:
- Build: tsc green; vitest green
- UI: notification text is user-facing -> correct umlaut (unterdrückter)
- Redundanz: pure helpers, reused by route (Task 4)
- Dead-Code: none
- Spec: implements design spec section 8 (status map, dedup, link, text)
- Inkonsistenz: status NOT strictly checked (matelso values differ from aircall)
- Regression: new files, no consumers yet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `matelso_calls` table migration

**Files:**
- Create: `supabase/migrations/<generated-timestamp>_matelso_calls_table.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `matelso_calls` table type)

**Coordination note:** This runs against the SHARED prod Supabase DB while other sessions are doing CMM-44 column drops. `CREATE TABLE matelso_calls` is purely additive and cannot collide with their `faelle`/`claims` work. Still: check `migration list` before push, and watch the connection pool (do not run while a `db reset`/heavy query is in flight).

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new matelso_calls_table`
Expected: prints `Created new migration at supabase/migrations/<ts>_matelso_calls_table.sql`.

- [ ] **Step 2: Write the SQL into the generated file**

```sql
-- matelso Call-Tracking: dedizierte Tabelle fuer eingehende Anruf-Events
-- der kfzgutachter Ads-LP. Spiegel von aircall_calls, aber matelso-spezifisch.
-- status hat BEWUSST keinen strikten CHECK (matelso callStatus-Werte weichen
-- von aircall ab; ein Insert mit unbekanntem Status darf nicht 500en).
CREATE TABLE IF NOT EXISTS matelso_calls (
  id                BIGSERIAL PRIMARY KEY,
  external_call_id  TEXT UNIQUE NOT NULL,
  direction         TEXT NOT NULL DEFAULT 'inbound',
  status            TEXT,
  status_raw        TEXT,
  from_number       TEXT,
  to_number         TEXT,
  duration          INTEGER,
  quelle            TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  fall_id           UUID REFERENCES faelle(id) ON DELETE SET NULL,
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matelso_calls_lead_id    ON matelso_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_fall_id    ON matelso_calls(fall_id);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_started_at ON matelso_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_matelso_calls_from_num   ON matelso_calls(from_number);

ALTER TABLE matelso_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'matelso_calls_staff' AND tablename = 'matelso_calls') THEN
    CREATE POLICY "matelso_calls_staff" ON matelso_calls
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.rolle IN ('admin','kundenbetreuer','leadbearbeiter','dispatch')
        )
      );
  END IF;
END $$;
```

- [ ] **Step 3: Check pending migrations before push**

Run: `npx supabase migration list --linked`
Expected: the only LOCAL-without-REMOTE row is the new `<ts>_matelso_calls_table`. If OTHER unexpected local-only migrations appear (from a stale branch), STOP and reconcile with the user before pushing — do not push someone else's pending DDL.

- [ ] **Step 4: Apply the migration**

Run: `npx supabase db push --linked`
Expected: `Applying migration <ts>_matelso_calls_table.sql...` then success. No errors.

- [ ] **Step 5: Verify the table exists**

Run: `npx supabase migration list --linked`
Expected: `<ts>_matelso_calls_table` now shows in BOTH local and remote columns (applied).

- [ ] **Step 6: Add the table type to `database.types.ts`**

Insert this block into the `Tables` object of `src/lib/supabase/database.types.ts`, in alphabetical position (after the table that alphabetically precedes `matelso_calls`, e.g. just before `nachrichten`). The `Json` type alias already exists at the top of the file.

```typescript
      matelso_calls: {
        Row: {
          created_at: string | null
          direction: string
          duration: number | null
          external_call_id: string
          fall_id: string | null
          from_number: string | null
          id: number
          lead_id: string | null
          quelle: string | null
          raw_payload: Json | null
          started_at: string
          status: string | null
          status_raw: string | null
          to_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          direction?: string
          duration?: number | null
          external_call_id: string
          fall_id?: string | null
          from_number?: string | null
          id?: number
          lead_id?: string | null
          quelle?: string | null
          raw_payload?: Json | null
          started_at?: string
          status?: string | null
          status_raw?: string | null
          to_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          duration?: number | null
          external_call_id?: string
          fall_id?: string | null
          from_number?: string | null
          id?: number
          lead_id?: string | null
          quelle?: string | null
          raw_payload?: Json | null
          started_at?: string
          status?: string | null
          status_raw?: string | null
          to_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matelso_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matelso_calls_fall_id_fkey"
            columns: ["fall_id"]
            isOneToOne: false
            referencedRelation: "faelle"
            referencedColumns: ["id"]
          },
        ]
      }
```

**Fallback:** if `npx tsc --noEmit` later complains the hand-written block doesn't match (e.g. a `__InternalSupabase` wrapper), regenerate instead: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`, then `git checkout origin/staging -- src/lib/supabase/database.types.ts` is NOT done — keep the regen but be aware the diff is large; re-run gen after rebasing on staging at merge time.

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/ src/lib/supabase/database.types.ts
git commit -m "feat(matelso): matelso_calls table migration + types

Audit:
- Build: tsc green
- UI: n/a
- Redundanz: mirrors aircall_calls; own table per design decision
- Dead-Code: none
- Spec: implements design spec section 7 (additive, RLS staff-only)
- Inkonsistenz: DDL via supabase CLI (AGENTS.md Regel 2); status no CHECK
- Regression: additive table, no existing readers/writers affected

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Webhook route handler

**Files:**
- Create: `src/app/api/webhooks/matelso/inbound/route.ts`

This is glue: auth + parse + the pure helpers (Task 2) + DB writes via `createAdminClient`, reusing `matchInboundToFall`, `createLead`, `createNotification`. Verified functionally by the smoke script (Task 5), consistent with how the Aircall route is verified (no mocked route unit test in this codebase).

- [ ] **Step 1: Write the route handler**

```typescript
// matelso Inbound-Webhook — Call-Events + Auto-Lead fuer die kfzgutachter Ads-LP.
// Ersetzt Aircall als Call-Tracker fuer die LP-Nummer; aircall_calls bleibt unberuehrt.
// Spec: docs/superpowers/specs/2026-05-22-matelso-call-tracking-webhook-design.md
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { createNotification } from '@/lib/notifications'
import { matchInboundToFall } from '@/lib/inbound/match-fall'
import { MatelsoEventSchema } from '@/lib/schemas/matelso-event'
import {
  normalizeMatelsoStatus,
  buildDedupKey,
  pickNotificationLink,
  buildCallNotificationText,
} from '@/lib/matelso/process-call'

export const dynamic = 'force-dynamic'

function secretValid(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // 1. Auth — ?secret= gegen MATELSO_WEBHOOK_SECRET (timing-safe).
  const secret = process.env.MATELSO_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  if (!secretValid(req.nextUrl.searchParams.get('secret'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse + Validate.
  const body = await req.text()
  let rawJson: unknown
  try {
    rawJson = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = MatelsoEventSchema.safeParse(rawJson)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: 'Invalid matelso payload', detail: `${first?.path.join('.')}: ${first?.message}` },
      { status: 400 },
    )
  }
  const event = parsed.data

  const admin = createAdminClient()
  const fromNumber = (event.anrufer_nummer ?? '').trim()
  const toNumber = (event.angerufene_nummer ?? '').trim()
  const status = normalizeMatelsoStatus(event.anruf_status)
  const duration = event.dauer_sekunden != null ? Number(event.dauer_sekunden) : null
  const quelle = event.quelle ?? null
  const parsedTime = event.zeitpunkt ? new Date(event.zeitpunkt) : null
  const startedAtIso =
    parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime.toISOString() : new Date().toISOString()
  const externalCallId = buildDedupKey({ callId: event.call_id, from: fromNumber, zeitpunkt: event.zeitpunkt })

  // 3. Idempotenz — bekannter Call? -> nur aktualisieren, kein 2. Lead/Notification.
  const { data: existing } = await admin
    .from('matelso_calls')
    .select('id, lead_id, fall_id')
    .eq('external_call_id', externalCallId)
    .maybeSingle()

  if (existing) {
    await admin
      .from('matelso_calls')
      .update({
        status,
        status_raw: event.anruf_status ?? null,
        duration,
        quelle,
        raw_payload: event as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('external_call_id', externalCallId)
    return NextResponse.json({ ok: true, deduped: true, lead_id: existing.lead_id, fall_id: existing.fall_id })
  }

  // 4. Match auf bestehenden Lead/Fall.
  let leadId: string | null = null
  let fallId: string | null = null
  let isNewLead = false

  if (fromNumber) {
    const match = await matchInboundToFall(admin, fromNumber)
    leadId = match.leadId
    fallId = match.fallId

    // 5. Auto-Lead nur wenn weder Lead noch Fall gematcht (wie Aircall).
    if (!leadId && !fallId) {
      const nowBerlin = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
      const created = await createLead(
        admin,
        { source_channel: 'matelso-call', status: 'neu', telefon: fromNumber, vorname: 'Unbekannt', nachname: 'Anrufer' },
        {
          qualifizierungs_phase: 'neu',
          notiz: `Auto-erstellt durch matelso-Anruf am ${nowBerlin} · Quelle: ${quelle ?? 'unbekannt'} · Status: ${status} · Dauer: ${duration ?? 0}s`,
        },
      )
      leadId = created.ok ? created.leadId : null
      isNewLead = created.ok
    }
  }

  // 6. Notification an Dispatch+Admin bei JEDEM Anruf (fire-and-forget).
  try {
    const { data: staff } = await admin.from('profiles').select('id').in('rolle', ['dispatch', 'admin'])
    const { titel, beschreibung } = buildCallNotificationText({ fromNumber, quelle, status, duration })
    const link = pickNotificationLink(leadId, fallId)
    for (const s of staff ?? []) {
      createNotification(s.id, 'eingehender-anruf', titel, beschreibung, link).catch(() => {})
    }
  } catch {
    // non-critical — darf den Status nicht brechen
  }

  // 7. Call-Record speichern.
  const { error: insertError } = await admin.from('matelso_calls').insert({
    external_call_id: externalCallId,
    direction: 'inbound',
    status,
    status_raw: event.anruf_status ?? null,
    from_number: fromNumber || null,
    to_number: toNumber || null,
    duration,
    quelle,
    started_at: startedAtIso,
    lead_id: leadId,
    fall_id: fallId,
    raw_payload: event as unknown as Record<string, unknown>,
  })
  if (insertError) {
    return NextResponse.json({ error: 'DB insert failed', detail: insertError.message }, { status: 500 })
  }

  // 8. OK.
  return NextResponse.json({ ok: true, lead_id: leadId, fall_id: fallId, is_new_lead: isNewLead })
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: exits 0. (If `matelso_calls` is unknown to the client type, Task 3 Step 6 was not applied — fix that first.)

- [ ] **Step 3: Verify the full build validates the route**

Run: `npm run build`
Expected: build succeeds; `/api/webhooks/matelso/inbound` appears in the route manifest output. (Next 16 validates route handlers at build time.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/matelso/inbound/route.ts
git commit -m "feat(matelso): inbound webhook route handler

POST /api/webhooks/matelso/inbound — secret-auth, zod-validate, dedup,
match-or-create lead, notify dispatch on every call, record in matelso_calls.

Audit:
- Build: npm run build green (route validated); tsc green
- UI: n/a (backend); notification text via helper (umlauts ok)
- Redundanz: reuses matchInboundToFall/createLead/createNotification/createAdminClient
- Dead-Code: none
- Spec: implements design spec sections 4,5,8,9
- Inkonsistenz: result/status-code pattern like aircall/lexdrive webhooks; non-critical notify in try/catch
- Regression: new route, /api is public-path in updateSession; aircall path untouched

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Smoke script (integration verification)

**Files:**
- Create: `scripts/smoke-matelso-webhook.mjs`

Posts realistic payloads to a running server and verifies DB rows via the service client. Run against local dev or staging.

- [ ] **Step 1: Write the smoke script**

```javascript
// scripts/smoke-matelso-webhook.mjs
// Smoke: matelso-Webhook. Postet 4 Szenarien und verifiziert DB-Zeilen.
// Run lokal:   npm run dev  (in einem zweiten Terminal), dann
//   node --env-file=.env.local scripts/smoke-matelso-webhook.mjs http://localhost:3000
// Run staging: node --env-file=.env.local scripts/smoke-matelso-webhook.mjs https://app.staging.claimondo.de
//   (Staging-Slot hat Basic-Auth -> BASIC_AUTH="user:pass" als Env mitgeben)
import { createClient } from '@supabase/supabase-js'

const base = process.argv[2] ?? 'http://localhost:3000'
const secret = process.env.MATELSO_WEBHOOK_SECRET
if (!secret) {
  console.error('MATELSO_WEBHOOK_SECRET fehlt in der Env. Abbruch.')
  process.exit(1)
}
const url = `${base}/api/webhooks/matelso/inbound?secret=${encodeURIComponent(secret)}`

const basicAuth = process.env.BASIC_AUTH
  ? { Authorization: 'Basic ' + Buffer.from(process.env.BASIC_AUTH).toString('base64') }
  : {}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function post(payload, { withSecret = true } = {}) {
  const target = withSecret ? url : `${base}/api/webhooks/matelso/inbound`
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...basicAuth },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function assert(cond, msg) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('  ✓', msg)
  }
}

const stamp = Date.now()
const answered = {
  call_id: `smoke-answered-${stamp}`,
  anrufer_nummer: `+4915100${String(stamp).slice(-6)}`,
  angerufene_nummer: '+4922125906530',
  anruf_status: 'answered',
  dauer_sekunden: '95',
  quelle: 'SMOKE Google Ads',
  zeitpunkt: new Date().toISOString(),
}

console.log(`\n== matelso smoke vs ${base} ==`)

console.log('\n[1] answered -> neuer Lead + Call-Record')
let r = await post(answered)
assert(r.status === 200 && r.json.ok, `200 ok (got ${r.status} ${JSON.stringify(r.json)})`)
assert(r.json.is_new_lead === true, 'is_new_lead=true')
assert(!!r.json.lead_id, 'lead_id gesetzt')

console.log('\n[2] retry (gleiche call_id) -> deduped, kein 2. Lead')
let r2 = await post(answered)
assert(r2.status === 200 && r2.json.deduped === true, `deduped=true (got ${JSON.stringify(r2.json)})`)
assert(r2.json.lead_id === r.json.lead_id, 'gleiche lead_id wie [1]')

console.log('\n[3] missed, unterdrueckte Nummer -> Call-Record, kein Lead')
let r3 = await post({ call_id: `smoke-missed-${stamp}`, anruf_status: 'no-answer', dauer_sekunden: '0', quelle: 'SMOKE direct' })
assert(r3.status === 200 && r3.json.ok, `200 ok (got ${r3.status})`)
assert(!r3.json.lead_id && !r3.json.fall_id, 'kein Lead/Fall (anonym)')

console.log('\n[4] falsches Secret -> 401')
let r4 = await post(answered, { withSecret: false })
assert(r4.status === 401, `401 (got ${r4.status})`)

console.log('\n[5] kaputtes JSON -> 400')
const r5raw = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...basicAuth }, body: '{not json' })
assert(r5raw.status === 400, `400 (got ${r5raw.status})`)

console.log('\n[DB] verifiziere matelso_calls-Zeilen')
const { data: rows } = await db
  .from('matelso_calls')
  .select('external_call_id, status, lead_id, quelle')
  .in('external_call_id', [`matelso:smoke-answered-${stamp}`, `matelso:smoke-missed-${stamp}`])
assert((rows ?? []).length === 2, `2 Call-Records gefunden (got ${(rows ?? []).length})`)

console.log('\n[cleanup] Smoke-Zeilen + Lead entfernen')
await db.from('matelso_calls').delete().in('external_call_id', [`matelso:smoke-answered-${stamp}`, `matelso:smoke-missed-${stamp}`])
if (r.json.lead_id) await db.from('leads').delete().eq('id', r.json.lead_id)

console.log(process.exitCode ? '\nSMOKE FAILED\n' : '\nSMOKE OK\n')
```

- [ ] **Step 2: Run the smoke against local dev**

In terminal A: `npm run dev`
In terminal B (after dev is up): `node --env-file=.env.local scripts/smoke-matelso-webhook.mjs http://localhost:3000`
Expected: every line prints `✓`, ends with `SMOKE OK`. (`.env.local` must contain `MATELSO_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.)

If a check fails, debug the route per the failing assertion before continuing. Do not proceed with red smoke.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-matelso-webhook.mjs
git commit -m "test(matelso): smoke script for inbound webhook (4 scenarios + dedup + auth)

Audit:
- Build: n/a (script); ran green vs local dev
- UI: n/a
- Redundanz: follows scripts/smoke-*.mjs pattern
- Dead-Code: none; self-cleans smoke rows
- Spec: implements design spec section 12 (smoke)
- Inkonsistenz: service-client verify like other smokes
- Regression: read/write only on smoke-prefixed rows, cleans up after

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Datenschutz §10.5 update (Markdown + formale DOCX)

**Files:**
- Modify: `src/content/legal/datenschutz.md` (§10.5 — git-tracked)
- Modify: `content/vertraege/02_Datenschutzerklaerung_DSGVO_Claimondo_v2.docx` (§10.5 — untracked reference in MAIN repo, NOT the worktree; via docx skill)

**Note:** user-facing legal text → correct UTF-8 umlauts mandatory. Final wording goes to Aaron/Legal for review (this task drafts, does not finalize legal sign-off).

- [ ] **Step 1: Replace §10.5 in the markdown**

In `src/content/legal/datenschutz.md`, replace the existing `10.5 Matelso Call Tracking` block (the paragraphs from `Wir nutzen den Call-Tracking-Dienst Matelso …` through `… matelso.com/datenschutz.`) with the approved text from the spec (`docs/superpowers/specs/2026-05-22-matelso-call-tracking-webhook-design.md` §10). Keep the surrounding heading structure/format identical to the neighbouring sections (e.g. §10.4, §11). Verify the `Übermittlung an unser CRM`, `Verarbeitete Daten`, and dual `Rechtsgrundlagen` (Art. 6 (1) a for tracking + Art. 6 (1) b for the CRM lead) paragraphs are present.

- [ ] **Step 2: Verify the markdown renders / no broken structure**

Run: `npx tsc --noEmit` (content is markdown but ensure no import of it broke) and visually diff:
Run: `git diff src/content/legal/datenschutz.md`
Expected: only §10.5 changed; umlauts correct (ä/ö/ü/ß), no `ae/oe/ue/ss` substitutes.

- [ ] **Step 3: Update the formal DOCX**

Use the `docx` skill (Skill tool: `docx`) to open `content/vertraege/02_Datenschutzerklaerung_DSGVO_Claimondo_v2.docx`, locate the `10.5 Matelso Call Tracking` section, and replace its body paragraphs with the same approved text (matching the document's existing heading/paragraph styles). Save in place at the same path. This file is untracked (reference artifact) — it will not appear in `git status`; note in the final report that the updated DOCX is delivered at that path.

- [ ] **Step 4: Commit the markdown change**

```bash
git add src/content/legal/datenschutz.md
git commit -m "docs(legal): datenschutz §10.5 — matelso CRM webhook + Art.6(1)(b) lead-anlage

Audit:
- Build: tsc green
- UI: user-facing legal text -> correct umlauts verified
- Redundanz: n/a
- Dead-Code: none
- Spec: implements design spec section 10 (markdown); DOCX updated separately (untracked)
- Inkonsistenz: aligns matelso clause with §5.3 lead-form legal basis
- Regression: only §10.5 touched; pending Aaron/Legal final review

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Final gate, env handoff, smoke report

**Files:**
- Create: `docs/<DD.MM.YYYY>/matelso-webhook-smoke.md` (smoke/decision report — Memory `smoke_audit_mds`)

- [ ] **Step 1: Full build + typecheck + test suite green**

Run: `npm run build`
Expected: success.
Run: `npx tsc --noEmit`
Expected: exits 0.
Run: `npm test`
Expected: all suites pass (incl. the two new matelso suites). If unrelated pre-existing suites fail, note them but do not let them block — confirm the matelso suites are green.

- [ ] **Step 2: Write the smoke/decision report**

Create `docs/<DD.MM.YYYY>/matelso-webhook-smoke.md` documenting: what was built, the local smoke output (paste the `SMOKE OK` run), the design decisions, and the open external actions (matelso panel config, secret on VPS, DDD-key verification, legal review).

- [ ] **Step 3: Commit the report**

```bash
git add docs/
git commit -m "docs(matelso): smoke + decision report

Audit:
- Build/Test: green (see report)
- Spec: section 12/14 documented
- rest: n/a (docs)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push branch + open PR against staging**

```bash
git push -u origin kitta/matelso-integration
gh pr create --base staging --title "matelso call-tracking webhook (kfzgutachter LP)" --body "<summary + link to spec + open external actions>"
```

PR base MUST be `staging` (never `main`). Do NOT merge — Aaron reviews/tests on staging.

- [ ] **Step 5: Hand the env/deploy steps to Aaron (do NOT run against VPS)**

Report to Aaron, verbatim, the actions only he runs:
1. Add to `/etc/claimondo/.env.local` on the VPS (212.132.119.110): `MATELSO_WEBHOOK_SECRET=<generated-strong-secret>` then `pm2 reload claimondo-v2 --update-env`.
2. Also set `MATELSO_WEBHOOK_SECRET` locally in `.env.local` and on staging for testing.
3. In the matelso Control-Panel: set "Wohin?" = `https://app.claimondo.de/api/webhooks/matelso/inbound?secret=<same-secret>` and "Was?" = the JSON body from spec §6; verify the real DDD-key names for `call_id` and `zeitpunkt`.
4. Run the real end-to-end acceptance: call the matelso number from a foreign SIM → confirm a lead + dispatch notification appear.

---

## Self-Review

**Spec coverage:**
- §2 scope (in/out) — Tasks 1–6 cover in-scope; out-of-scope (frontend snippet, aircall migration, UI) excluded. ✓
- §3 decisions (dedicated table / every-call lead+notify / ?secret / privacy) — Tasks 3, 4, 6. ✓
- §4 data flow — Task 4 route. ✓
- §5 endpoint+auth — Task 4 Step 1 (secretValid). ✓
- §6 payload contract — Task 1 schema. ✓
- §7 matelso_calls — Task 3 migration + types. ✓
- §8 processing logic incl. edge cases — Task 2 helpers + Task 4 route (anonymous handled). ✓
- §9 lead+notification policy — Task 4. ✓
- §10 DSGVO both docs — Task 6. ✓
- §11 config/deploy — Task 7 Step 5. ✓
- §12 testing — Tasks 1,2 (unit), 5 (smoke), 7 (build gate). ✓
- §14 external actions — Task 7 Step 5. ✓

**Placeholder scan:** No "TBD/TODO" in code steps; `<generated-timestamp>` and `<DD.MM.YYYY>` are real runtime/filename values the engineer fills from `migration new` output / today's date; `<summary…>` in the PR body is intentional author content. No code placeholders.

**Type consistency:** Helper names match between Task 2 (definition) and Task 4 (import): `normalizeMatelsoStatus`, `buildDedupKey`, `pickNotificationLink`, `buildCallNotificationText`. Schema export `MatelsoEventSchema` matches Task 1 ↔ Task 4. `matelso_calls` columns match between Task 3 SQL, Task 3 types block, and Task 4 insert (`external_call_id`, `status`, `status_raw`, `from_number`, `to_number`, `duration`, `quelle`, `started_at`, `lead_id`, `fall_id`, `raw_payload`). `createLead(client, base, extra)` and `createNotification(userId, typ, titel, beschreibung, link)` match the verified signatures.
