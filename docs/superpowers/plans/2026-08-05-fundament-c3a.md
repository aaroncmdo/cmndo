# Fundament C3a — Notification-Outbox (enqueue + Worker + Retry→Task) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine additive `notifications_outbox`-Tabelle + eine `enqueue()`-API geben den nicht-durablen System-2-Sends (`sendFallCommunication`, heute fire-and-forget) strukturellen **Dedup**, **Cron-Retry** und einen **sichtbaren Fehler-Task**; als Proof wird die J1-Statuswechsel-Kommunikation (`dispatch-fall-actions.ts`) durch die Outbox gehoben.

**Architecture:** Die Outbox liegt **davor** (enqueue → outbox → Worker → `sendFallCommunication`); `notification_deliveries` (System 1) bleibt intern unverändert (DECISIONS §8). `COMMUNICATION_REGISTRY` bleibt **Template-Layer UNTER** der Outbox — der Worker ruft `sendFallCommunication(claimId, template, payload)`, die ~50 WA/Email-Templates werden **nicht** umgeschrieben (DECISIONS §6#2). Dedup via `dedup_key TEXT UNIQUE` + `INSERT … ON CONFLICT (dedup_key) DO NOTHING`. Retry-Backoff `[1,5,30,120]`min → Dead-Letter → `createLinkedTask` (dispatch-sichtbar, schließt Verfassung §8 / P1b). Der Worker spiegelt den bewährten Event-Worker (`/api/notifications/process`): Claim-Lease gegen Doppel-Send, `*/5min`-Cron + Immediate-Drain-Trigger (Latenz-Erhalt gegenüber dem heute synchronen Send).

**Tech Stack:** Next.js 15 App-Router (Route-Handler), Supabase (`createAdminClient` = service_role, RLS-Bypass), TypeScript, vitest (CI-Job `check:vitest`).

## Global Constraints

- **DDL NUR via Supabase-MCP `apply_migration`** (AGENTS.md Regel 2) — nie CLI/`db push`, nie raw `execute_sql` mit DDL. Nach dem Apply die vom Plugin vergebene Version via `list_migrations` ablesen und das committete File exakt `supabase/migrations/<V>_notifications_outbox.sql` nennen (Schritt 3+4, sonst Twin-Drift). Types danach regenerieren **und** committen (`src/lib/supabase/database.types.ts`).
- **0 node_modules lokal** → kein lokaler `build`/`tsc`/`vitest`. Verifikations-Gate = **CI** (`build` + `check:vitest`). Abschluss-Beweis = **Regel-4-Prod-Smoke** (nach Deploy).
- **Server-Action-Pattern:** Result-Objects (`{ ok: boolean; error?: string }`), kein `throw`; Non-critical Sends in lokalem `try/catch`.
- **Outbox = service_role-only** (`createAdminClient`). Tabelle: `ENABLE ROW LEVEL SECURITY`, **keine** Policies, **keine** `anon`/`authenticated`-Grants → die Reachability-/Anon-Grant-/RLS-Policy-Ratchets bleiben unberührt (Baseline 0). Kein `claims.operative_status`-Write → Operative-Status-Gate n/a.
- **Umlaute** in nutzersichtbaren Strings (Task-Titel/Beschreibung, die im Dispatch-Board erscheinen).
- **Gate erfüllt:** C1a (#4935) ist gemergt (03.08.) — die Engine emittiert die Status-Events sauber (Prep §5).
- **Branch:** `kitta/fundament-c3-outbox` (bereits off `origin/staging`, 0 ahead / 0 behind).

---

## File Structure

- **Create** `supabase/migrations/<V>_notifications_outbox.sql` — die additive Tabelle (via MCP appliziert, File nach getrackter Version benannt). Verantwortung: Schema + Index + RLS-enable (keine Policy).
- **Create** `src/lib/notifications/outbox.ts` — `enqueue()`-API + `buildDedupKey()` + Typen (`OutboxChannel`, `OutboxEnqueueInput`, `OutboxEnqueueResult`). Verantwortung: der **einzige** Schreib-Eingang in die Outbox (Dedup-Key-Pflicht per Typ).
- **Create** `src/lib/notifications/outbox.test.ts` — pure vitest (dedup-key-Builder + Input-Validierung; kein DB-Zugriff). Verantwortung: die reine Logik absichern (läuft im CI-`check:vitest`).
- **Create** `src/lib/notifications/outbox-worker.ts` — `processOutboxBatch()` + `drainSingleOutbox(dedupKey)` + `nextOutboxRetryAt()`. Verantwortung: Claim-Lease → `sendFallCommunication` → `sent`/Retry/Dead-Letter+Task.
- **Modify** `src/app/api/notifications/process/route.ts` — GET (Cron) drant zusätzlich die Outbox; POST behandelt `{ outboxDedupKey }` für den Immediate-Drain. Verantwortung: die Outbox an den bestehenden `*/5min`-Worker andocken (keine neue Cron-Registrierung nötig).
- **Modify** `src/lib/actions/dispatch-fall-actions.ts` — die 8 J1-Statuswechsel-`sendFallCommunication(…).catch()` → `enqueue()`. Verantwortung: der Proof-Consumer.
- **Docs** `docs/fundament/journeys/j01-*.md` — J1-Delta (Statuswechsel-Comms jetzt durable+dedupliziert) VOR dem Code (D1-Zyklus). `docs/fundament/DECISIONS.md` — die adoptierten Entscheidungen (§8-Architektur, §6#2, §6#1-Verifikationspflicht, §6#3-Defer) loggen.

**Task-Reihenfolge & Abhängigkeit:** T1 (DDL) → T2 (enqueue, braucht Typen aus T1) → T3 (Worker, braucht T2-Row-Shape) → T4 (Task+Cron-Andockung, braucht T3) → T5 (Consumer-Wiring + J1-Delta + DoD, braucht T2+T4). T1-T4 sind **C1a-unabhängige Infrastruktur**; T5 ist der C1a-gegatete Proof (Gate ist erfüllt).

---

### Task 1: `notifications_outbox`-Tabelle (DDL via MCP) + Types

**Files:**
- Create (via MCP + committen): `supabase/migrations/<V>_notifications_outbox.sql`
- Modify (regenerieren): `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: Tabelle `public.notifications_outbox` mit Spalten `id, dedup_key, kanal, template, claim_id, empfaenger_user_id, empfaenger_rolle, payload, status, versuche, next_retry_at, fehler, created_at, sent_at`. `status ∈ ('pending','sending','sent','failed')`. `dedup_key` UNIQUE. Getypte Row in `Database['public']['Tables']['notifications_outbox']`.

- [ ] **Step 1: `list_tables` prüfen (Regel 2 Vorlauf)**

`mcp__plugin_supabase_supabase__list_tables({ schemas: ['public'] })` — bestätigen, dass `notifications_outbox` **nicht** existiert (Ist-Erhebung 05.08.: frei). Falls doch vorhanden → STOP, ein anderer Lane hat sie angelegt; abgleichen statt neu anlegen.

- [ ] **Step 2: DDL applizieren (MCP)**

```
mcp__plugin_supabase_supabase__apply_migration({
  name: 'notifications_outbox',
  query: `
    CREATE TABLE public.notifications_outbox (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dedup_key          text NOT NULL UNIQUE,
      kanal              text NOT NULL CHECK (kanal IN ('whatsapp','email','sms','in_app')),
      template           text NOT NULL,
      claim_id           uuid REFERENCES public.claims(id) ON DELETE CASCADE,
      empfaenger_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      empfaenger_rolle   text,
      payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
      status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
      versuche           integer NOT NULL DEFAULT 0,
      next_retry_at      timestamptz,
      fehler             text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      sent_at            timestamptz
    );

    -- Worker-Claim-Index: nur die reclaimbaren Zeilen (pending/failed/abgelaufenes sending).
    CREATE INDEX idx_notifications_outbox_claimable
      ON public.notifications_outbox (status, next_retry_at)
      WHERE status IN ('pending','sending','failed');

    -- service_role-only: RLS an, keine Policy (anon/authenticated bekommen nichts;
    -- der admin-Client bypasst RLS). Kein Grant noetig -> Reachability-Ratchets unberuehrt.
    ALTER TABLE public.notifications_outbox ENABLE ROW LEVEL SECURITY;

    COMMENT ON TABLE public.notifications_outbox IS
      'C3a Fundament: durable Outbox fuer System-2/3-Sends. enqueue() schreibt, der */5min-Worker drant. dedup_key UNIQUE = strukturelle Doppel-Send-Bremse.';
  `
})
```

- [ ] **Step 3: Getrackte Version ablesen + File committen (Regel 2 Schritt 3+4)**

`mcp__plugin_supabase_supabase__list_migrations()` → die neu vergebene `<V>` ablesen. Das exakte DDL aus Step 2 als `supabase/migrations/<V>_notifications_outbox.sql` speichern (Dateiname == `<V>`). **Nicht** raten — die vom Plugin gesetzte Version nehmen.

- [ ] **Step 4: Verifizieren (READ)**

```
mcp__plugin_supabase_supabase__execute_sql({
  query: `SELECT column_name, data_type, is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND table_name='notifications_outbox' ORDER BY ordinal_position;`
})
```
Expected: 14 Spalten wie oben; `dedup_key` NOT NULL; `status`/`kanal` mit CHECK.

- [ ] **Step 5: Types regenerieren + committen**

```
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript \
  --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
```
(Reine LESE-Generierung — fällt nicht unter das CLI-DDL-Verbot.) Falls MCP-Output nicht truncatet, alternativ `generate_typescript_types`. Danach `npm run check:query-drift -- --update-baseline`, falls die Baseline schrumpft.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<V>_notifications_outbox.sql src/lib/supabase/database.types.ts
git commit -m "feat(fundament-C3a): notifications_outbox-Tabelle (durable Outbox, service_role-only)"
```

---

### Task 2: `enqueue()`-API + Dedup-Key-Builder (TDD)

**Files:**
- Create: `src/lib/notifications/outbox.ts`
- Test: `src/lib/notifications/outbox.test.ts`

**Interfaces:**
- Consumes: `Database`-Typ aus Task 1; `createAdminClient` aus `@/lib/supabase/admin`.
- Produces:
  - `type OutboxChannel = 'whatsapp' | 'email' | 'sms' | 'in_app'`
  - `type OutboxEnqueueInput = { dedupKey: string; kanal: OutboxChannel; template: string; claimId?: string | null; empfaengerUserId?: string | null; empfaengerRolle?: string | null; payload?: Record<string, string> }`
  - `type OutboxEnqueueResult = { ok: boolean; enqueued: boolean; error?: string }` (`enqueued=false` = Dedup-Konflikt schluckte den Insert, trotzdem `ok:true`)
  - `function buildDedupKey(parts: { template: string; claimId: string; empfaenger?: string; fenster?: string }): string`
  - `async function enqueue(input: OutboxEnqueueInput): Promise<OutboxEnqueueResult>`

- [ ] **Step 1: Failing test schreiben**

```typescript
// src/lib/notifications/outbox.test.ts
import { describe, it, expect } from 'vitest'
import { buildDedupKey } from './outbox'

describe('buildDedupKey', () => {
  it('baut <template>:<claimId> ohne optionale Teile', () => {
    expect(buildDedupKey({ template: 'termin_bestaetigt', claimId: 'c1' }))
      .toBe('termin_bestaetigt:c1')
  })
  it('haengt empfaenger + fenster deterministisch an', () => {
    expect(buildDedupKey({ template: 'reminder', claimId: 'c1', empfaenger: 'kunde', fenster: '2026-08-05' }))
      .toBe('reminder:c1:kunde:2026-08-05')
  })
  it('ist stabil bei gleichem Input (Doppel-enqueue -> gleicher Key)', () => {
    const a = buildDedupKey({ template: 't', claimId: 'x' })
    const b = buildDedupKey({ template: 't', claimId: 'x' })
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Test laufen lassen — FAIL erwartet**

CI-Kontext (0 node_modules lokal): der Test failt mit „buildDedupKey is not a function" bis Step 3 steht. (Lokal nicht ausführbar; die Verifikation läuft im CI-`check:vitest`-Job. Bis dahin: Logik per Review prüfen.)

- [ ] **Step 3: `outbox.ts` implementieren**

```typescript
// src/lib/notifications/outbox.ts
// C3a Fundament: der einzige Schreib-Eingang in die notifications_outbox.
// enqueue() erzwingt einen dedup_key (Typ) und schreibt ON CONFLICT DO NOTHING ->
// doppeltes enqueue = 1 Row = 1 Versand (schliesst P1a strukturell).
import { createAdminClient } from '@/lib/supabase/admin'

export type OutboxChannel = 'whatsapp' | 'email' | 'sms' | 'in_app'

export type OutboxEnqueueInput = {
  dedupKey: string
  kanal: OutboxChannel
  template: string
  claimId?: string | null
  empfaengerUserId?: string | null
  empfaengerRolle?: string | null
  payload?: Record<string, string>
}

export type OutboxEnqueueResult = { ok: boolean; enqueued: boolean; error?: string }

/**
 * Dedup-Key-Konvention (Prep §2): <template>:<claimId>[:<empfaenger>][:<fenster>].
 * Verallgemeinert das erstelleVsDispatchTask-Muster (task_code + Existenz-Check)
 * auf alle Sends. Der Key MUSS stabil sein: gleicher Anlass -> gleicher Key -> 1 Send.
 */
export function buildDedupKey(parts: {
  template: string
  claimId: string
  empfaenger?: string
  fenster?: string
}): string {
  return [parts.template, parts.claimId, parts.empfaenger, parts.fenster]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(':')
}

export async function enqueue(input: OutboxEnqueueInput): Promise<OutboxEnqueueResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('notifications_outbox')
    .upsert(
      {
        dedup_key: input.dedupKey,
        kanal: input.kanal,
        template: input.template,
        claim_id: input.claimId ?? null,
        empfaenger_user_id: input.empfaengerUserId ?? null,
        empfaenger_rolle: input.empfaengerRolle ?? null,
        payload: input.payload ?? {},
        status: 'pending',
      },
      { onConflict: 'dedup_key', ignoreDuplicates: true },
    )
    .select('id')

  if (error) {
    console.error('[outbox] enqueue failed', input.dedupKey, error)
    return { ok: false, enqueued: false, error: error.message }
  }

  // ignoreDuplicates=true -> bei Konflikt kommt eine leere Row-Liste zurueck (nichts eingefuegt).
  const enqueued = Array.isArray(data) && data.length > 0

  // Immediate-Drain fire-and-forget (Latenz-Erhalt): nur wenn wir wirklich eingefuegt haben.
  if (enqueued) {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000'
    const fullUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
    fetch(`${fullUrl}/api/notifications/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.CRON_SECRET ?? '' },
      body: JSON.stringify({ outboxDedupKey: input.dedupKey }),
    }).catch((e) => console.error('[outbox] immediate-drain trigger failed (Cron nimmt es auf):', e))
  }

  return { ok: true, enqueued }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications/outbox.ts src/lib/notifications/outbox.test.ts
git commit -m "feat(fundament-C3a): enqueue() + buildDedupKey (Dedup-Key-Pflicht, ON CONFLICT DO NOTHING)"
```

---

### Task 3: Worker-Drain `outbox-worker.ts` (Claim-Lease → send → Retry)

**Files:**
- Create: `src/lib/notifications/outbox-worker.ts`

**Interfaces:**
- Consumes: `enqueue`-Row-Shape (Task 1/2); `sendFallCommunication` aus `@/lib/communications/send-fall` (`(fallId, triggerName, extraData?) => Promise<{ sent: boolean; reason?: string }>`); `createAdminClient`.
- Produces:
  - `async function processOutboxBatch(): Promise<{ processed: number; failed: number }>`
  - `async function drainSingleOutbox(dedupKey: string): Promise<{ processed: number; failed: number }>`

- [ ] **Step 1: Worker implementieren**

```typescript
// src/lib/notifications/outbox-worker.ts
// C3a Fundament: drant notifications_outbox. Spiegelt den Event-Worker
// (/api/notifications/process): Zwei-Schritt-Claim mit Lease gegen Doppel-Send,
// Retry-Backoff [1,5,30,120]min -> Dead-Letter. Der eigentliche Versand delegiert
// an sendFallCommunication (COMMUNICATION_REGISTRY = Template-Layer UNTER der Outbox).
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFallCommunication } from '@/lib/communications/send-fall'

const BATCH_SIZE = 25
const BACKOFF_MINUTES = [1, 5, 30, 120]
const LEASE_MINUTES = 10

type OutboxRow = {
  id: string
  dedup_key: string
  template: string
  claim_id: string | null
  payload: Record<string, string> | null
  versuche: number
}

export function nextOutboxRetryAt(versuche: number): string | null {
  if (versuche >= BACKOFF_MINUTES.length) return null
  return new Date(Date.now() + BACKOFF_MINUTES[versuche] * 60 * 1000).toISOString()
}

async function sendOne(row: OutboxRow): Promise<void> {
  const supabase = createAdminClient()
  // Template-Layer: der Registry-Trigger rendert Empfaenger/Kanal selbst. Pre-claim-Sends
  // (claim_id NULL) sind C3c -> hier defensiv als Fehler behandeln, damit nichts still verschwindet.
  if (!row.claim_id) {
    await supabase.from('notifications_outbox')
      .update({ status: 'failed', fehler: 'kein claim_id (pre-claim-Send = C3c, noch nicht unterstuetzt)', next_retry_at: null })
      .eq('id', row.id)
    return
  }
  try {
    const res = await sendFallCommunication(row.claim_id, row.template, row.payload ?? undefined)
    if (res.sent) {
      await supabase.from('notifications_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id)
      return
    }
    // sent=false ist ein "sauberer" Nicht-Versand (kein Telefon etc.) — kein Retry-Grund,
    // aber als failed mit Grund festhalten (sichtbar, nicht still).
    await supabase.from('notifications_outbox')
      .update({ status: 'failed', fehler: `nicht gesendet: ${res.reason ?? 'unbekannt'}`, next_retry_at: null })
      .eq('id', row.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const next = nextOutboxRetryAt(row.versuche + 1)
    await supabase.from('notifications_outbox')
      .update({
        status: next ? 'failed' : 'failed',
        versuche: row.versuche + 1,
        next_retry_at: next,
        fehler: next ? msg : `[dead-letter nach ${row.versuche + 1} Versuchen] ${msg}`,
      })
      .eq('id', row.id)
    // Der Dead-Letter-Task wird in Task 4 (createDeadLetterTask) angehaengt.
  }
}

async function claimOutboxRows(ids?: string[]): Promise<OutboxRow[]> {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const leaseIso = new Date(Date.now() + LEASE_MINUTES * 60 * 1000).toISOString()
  // Claimbar: pending | (failed & retry-due) | (sending & Lease abgelaufen).
  const claimFilter =
    `status.eq.pending,` +
    `and(status.eq.failed,next_retry_at.lte.${nowIso}),` +
    `and(status.eq.sending,next_retry_at.lte.${nowIso})`

  let q = supabase.from('notifications_outbox').select('id').or(claimFilter).order('created_at', { ascending: true }).limit(BATCH_SIZE)
  if (ids && ids.length) q = supabase.from('notifications_outbox').select('id').in('id', ids).or(claimFilter)
  const { data: candidates } = await q
  const candidateIds = (candidates ?? []).map((r) => r.id as string)
  if (candidateIds.length === 0) return []

  const { data: claimed, error } = await supabase
    .from('notifications_outbox')
    .update({ status: 'sending', next_retry_at: leaseIso })
    .in('id', candidateIds)
    .or(claimFilter)
    .select('id, dedup_key, template, claim_id, payload, versuche')
  if (error) { console.error('[outbox-worker] claim failed', error); return [] }
  return (claimed ?? []) as OutboxRow[]
}

export async function processOutboxBatch(): Promise<{ processed: number; failed: number }> {
  const rows = await claimOutboxRows()
  for (const row of rows) await sendOne(row)
  const failed = 0 // Detailzaehler in Task 4 via Rueckgabe von sendOne verfeinern falls noetig.
  return { processed: rows.length, failed }
}

export async function drainSingleOutbox(dedupKey: string): Promise<{ processed: number; failed: number }> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('notifications_outbox').select('id').eq('dedup_key', dedupKey).maybeSingle()
  if (!data) return { processed: 0, failed: 0 }
  const rows = await claimOutboxRows([data.id as string])
  for (const row of rows) await sendOne(row)
  return { processed: rows.length, failed: 0 }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notifications/outbox-worker.ts
git commit -m "feat(fundament-C3a): outbox-worker (Claim-Lease + Retry-Backoff, delegiert an sendFallCommunication)"
```

---

### Task 4: Dead-Letter → sichtbarer Task + Cron/Immediate-Drain-Andockung

**Files:**
- Modify: `src/lib/notifications/outbox-worker.ts` (Dead-Letter-Task)
- Modify: `src/app/api/notifications/process/route.ts` (GET drant Outbox mit; POST `{outboxDedupKey}`)

**Interfaces:**
- Consumes: `createLinkedTask` aus `@/lib/tasks/create-task` (Muster: `erstelleVsDispatchTask` — `task_code`-Existenz-Check + `empfaenger_rolle:'dispatch'`, `entity_type:'fall'`).
- Produces: bei erschöpftem Retry (`next_retry_at=null`) genau **ein** offener Dispatch-Task pro `dedup_key`.

- [ ] **Step 1: Dead-Letter-Task in `sendOne` einhängen**

Im `catch`-Zweig von `sendOne` (Task 3), **nach** dem `update` auf `failed` mit `next=null`, den Task anlegen (dedupliziert per `task_code`, Muster `erstelleVsDispatchTask`):

```typescript
// in outbox-worker.ts, oben ergaenzen:
import { createLinkedTask } from '@/lib/tasks/create-task'

async function createDeadLetterTask(row: OutboxRow, fehler: string): Promise<void> {
  const supabase = createAdminClient()
  const taskCode = `outbox_dead_letter:${row.dedup_key}`
  const { data: vorhanden } = await supabase
    .from('tasks').select('id').eq('task_code', taskCode).in('status', ['offen', 'in-bearbeitung']).maybeSingle()
  if (vorhanden) return
  await createLinkedTask({
    titel: `Benachrichtigung nicht zustellbar: ${row.template}`,
    beschreibung: `Die automatische Benachrichtigung „${row.template}" konnte nach mehreren Versuchen nicht zugestellt werden. Bitte manuell nachfassen.\n\nDetail: ${fehler}`,
    prioritaet: 'dringend',
    empfaenger_rolle: 'dispatch',
    claim_id: row.claim_id, // in createDeadLetterTask nur mit claim_id != null aufrufen
    fall_id: row.claim_id,
    entity_type: 'fall',
    entity_id: row.claim_id ?? undefined,
    typ: 'benachrichtigung_fehler',
    task_code: taskCode,
    trigger_event: 'outbox_dead_letter',
    auto_erstellt: true,
  })
}
```
Dann im `catch` von `sendOne`: `if (!next && row.claim_id) await createDeadLetterTask(row, msg)`.
**Vor dem Bau verifizieren (§10):** `createLinkedTask`-Signatur + dass `tasks.typ` den Wert `'benachrichtigung_fehler'` erlaubt (Flag-Drift-CHECK; sonst Silent-Reject!) — falls nicht im CHECK, zuerst per MCP-Migration ergänzen ODER einen bestehenden erlaubten `typ` nehmen (z.B. `'vs_meldung'`-Analogon). `entity_type:'fall'` ist bewusst (kein `'benachrichtigung'` im CHECK — s. `dispatch-task.ts`-Kommentar).

- [ ] **Step 2: Route-Handler andocken**

In `src/app/api/notifications/process/route.ts`:
- oben: `import { processOutboxBatch, drainSingleOutbox } from '@/lib/notifications/outbox-worker'`
- **GET** (Cron `*/5min`): nach `const result = await processBatch()` zusätzlich `const outbox = await processOutboxBatch()` und `return NextResponse.json({ ok: true, ...result, outbox })`.
- **POST**: den Body um `outboxDedupKey` erweitern; wenn gesetzt → `drainSingleOutbox(body.outboxDedupKey)` statt der Event-Zweige.

```typescript
// POST-Body-Typ + Verzweigung:
let body: { eventId?: string; outboxDedupKey?: string } = {}
try { body = await req.json() } catch { body = {} }
const result = body.outboxDedupKey
  ? await drainSingleOutbox(body.outboxDedupKey)
  : body.eventId
    ? await processSingleById(body.eventId)
    : await processBatch()
```
(Auth-Block unverändert lassen — `x-internal-token`/`Bearer CRON_SECRET`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/outbox-worker.ts src/app/api/notifications/process/route.ts
git commit -m "feat(fundament-C3a): Dead-Letter->Dispatch-Task + Cron/Immediate-Drain-Andockung"
```

---

### Task 5: J1-Statuswechsel-Sends durch die Outbox heben (Proof) + J1-Delta + DoD

**Files:**
- Modify: `src/lib/actions/dispatch-fall-actions.ts` (8 Sends → `enqueue()`)
- Docs: `docs/fundament/journeys/j01-*.md` (J1-Delta VOR dem Code) + `docs/fundament/DECISIONS.md`

**Interfaces:**
- Consumes: `enqueue`, `buildDedupKey` (Task 2). Kanal je Trigger aus `COMMUNICATION_REGISTRY` (der Registry-Eintrag kennt den Default-Kanal — beim Bau ablesen, meist `'whatsapp'`).

- [ ] **Step 1 (§10 Fresh-Verify + D1-Soll-zuerst):** Die 8 Call-Sites in `dispatch-fall-actions.ts` gegen den **dann-aktuellen** Code re-verifizieren (Lane `aar-956` ist heiss, das File wird angefasst — Zeilennummern driften). Bestätigen, dass jeder Send einen Statuswechsel begleitet. **Zuerst** das J1-Delta schreiben (D1-Zyklus: Soll vor Bau) — Abschnitt in `docs/fundament/journeys/j01-*.md`: „Statuswechsel-Benachrichtigungen laufen über die Outbox (dedupliziert je `<trigger>:<claimId>`, Retry, Fehler→Dispatch-Task)."

- [ ] **Step 2: Jeden Send umschreiben** (Muster, identisch für alle 8):

```typescript
// vorher:
sendFallCommunication(fallId, 'termin_bestaetigt').catch(() => {})
// nachher:
await enqueue({
  dedupKey: buildDedupKey({ template: 'termin_bestaetigt', claimId: fallId }),
  kanal: 'whatsapp', // aus COMMUNICATION_REGISTRY['termin_bestaetigt'].kanal verifizieren
  template: 'termin_bestaetigt',
  claimId: fallId,
})
```
Trigger-Liste (Stand 05.08., §10-verifizieren): `sv_losgefahren`, `termin_bestaetigt`, `regulierung_angekuendigt`, `fall_abgeschlossen`, `kanzlei_uebergabe`, `as_gesendet`, `zahlung_eingegangen`, `termin_storniert`. Import `sendFallCommunication` entfernen, falls danach ungenutzt (Dead-Code-Check).

- [ ] **Step 3: DECISIONS.md loggen** (Format Fundament §8, append-only): vier Blöcke — **§8-Architektur** (Outbox davor, `notification_deliveries` bleibt intern) · **§6#2** (COMMUNICATION_REGISTRY bleibt Template-Layer unter der Outbox) · **§6#1** (Doppel-Send-Verifikationspflicht: `gutachten_fertig` in `gutachter/fall/actions.ts` beim Wiring prüfen — C3b) · **§6#3** (FM/Kanzlei-WA/Email-Kanäle → C3b-Defer, In-App bleibt vorerst).

- [ ] **Step 4: 7-Punkte-Audit + Commit**

```bash
git add src/lib/actions/dispatch-fall-actions.ts docs/fundament/journeys/ docs/fundament/DECISIONS.md
git commit -m "feat(fundament-C3a): J1-Statuswechsel-Sends -> Outbox (Proof) + J1-Delta + DECISIONS"
```

- [ ] **Step 5: PR + CI-Gate**

PR gegen `staging`. CI muss grün sein: `build` + `check:vitest` (outbox.test) + alle Ratchets. Bei rot → fixen, nicht mergen.

- [ ] **Step 6: DoD / Regel-4-Prod-Smoke** (nach Deploy, Test-Konten `telefon=NULL`):
  1. **Dedup:** Eine Dispatch-Action, die einen Status-Send auslöst, **zweimal** triggern → `SELECT count(*) FROM notifications_outbox WHERE dedup_key = '<trigger>:<claimId>'` = **1**.
  2. **Versand:** Row-Status → `sent`, `sent_at` gesetzt (SQL-Stichprobe); der Kunde (Test-Konto) sieht die Nachricht.
  3. **Fehler→Task:** Ein Send auf ein Konto ohne Kanal → nach Retry `status='failed'`, `next_retry_at=NULL`, **genau ein** offener Dispatch-Task `outbox_dead_letter:<key>`.
  Ergebnis (grün/rot + SQL-Ausgaben) im PR/Marker dokumentieren. Rot → Fix-PR, **nicht** als erledigt markieren.

---

## Self-Review

- **Spec-Coverage (Prep §4 C3a):** Tabelle (T1) · enqueue+Dedup (T2) · Worker-Versand (T3) · Retry→Task (T4) · transitionClaim-Sends gehoben (T5) · Proof = Dedup/Versand/Fehler-Task (T5 Step 6). ✓ Alle C3a-Punkte haben eine Task.
- **Placeholder-Scan:** keine „TBD"; jede Code-Step hat echten Code. Die einzigen bewussten Execution-Verifikationen (§10) sind explizit als solche markiert (Call-Site-Zeilen, `tasks.typ`-CHECK, Registry-Kanal) — das ist Regel-2/§10-Disziplin, kein Placeholder.
- **Typ-Konsistenz:** `enqueue`/`buildDedupKey`/`OutboxEnqueueInput` (T2) werden in T3-Import-Shape (`OutboxRow`) und T5 identisch benutzt; `sendFallCommunication`-Signatur `(fallId, trigger, extra?) => {sent, reason?}` konsistent in T3.
- **DECISIONS-Kandidaten adressiert:** §8 + §6#1/#2/#3 in T5 Step 3 geloggt (Adopt §8/§6#2; Defer §6#1/#3 an C3b mit Verifikationspflicht).
- **Ratchet-Sicherheit:** service_role-only Tabelle (keine Grants/Policies) → anon-/reachability-/rls-policy-Ratchets unberührt; kein `operative_status`-Write; `tasks.typ`/`entity_type` gegen Flag-Drift-CHECK verifizieren (T4 Step 1). ✓

## Execution Handoff

Nach Aaron-Review (Prep §6/§8 — v.a. die §8-Architektur „Outbox davor" + die `notifications_outbox`-DDL + §6#2) → Ausführung. Empfehlung: **Subagent-Driven** (superpowers:subagent-driven-development), fresh Subagent je Task, Review zwischen den Tasks. T1 (DDL via MCP) und T5 (Consumer-Wiring in `dispatch-fall-actions.ts`, Lane-heiss) sind die riskantesten — dort §10-Fresh-Verify vor dem Bau.
