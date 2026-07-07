# Stripe `im_einzug`-Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein SEPA-`processing`-Einzug wird als neuer Status `im_einzug` verbucht (statt fälschlich `fehlgeschlagen` + Fehlalarm), löst sich per Webhook nach `bezahlt`/`fehlgeschlagen` auf, und wird nirgends gemahnt/erneut eingezogen.

**Architecture:** Neuer erlaubter `text`-CHECK-Wert `im_einzug`. Ein reiner Mapper `einzugBranchFuerPiStatus(status) → 'paid'|'im_einzug'|'fehlgeschlagen'` (Sibling von `piStatusToEinzugAction`) wird von Cron **und** manuellem Retry konsumiert. Der Webhook schließt die `payment_intent.payment_failed`→Abrechnung-Lücke (in eine testbare Funktion extrahiert). Dunning/Reminder + UI schließen `im_einzug` konsistent aus/ein.

**Tech Stack:** Next.js 15 (App Router, Route Handlers, Server Actions), Supabase (`text`+CHECK, `apply_migration`/MCP), Stripe (PaymentIntents, Webhooks), vitest (TDD), Tailwind v4 (semantic `info`-Token).

## Global Constraints

- **Regel 1:** Kein Direct-Push auf `main`. Arbeit auf `kitta/stripe-im-einzug-status` (bereits off `origin/staging` angelegt), PR gegen `staging`.
- **Regel 2:** DDL NUR über `mcp__plugin_supabase_supabase__apply_migration` (project_id `paizkjajbuxxksdoycev`). Danach `list_migrations` → getrackte Version `<V>` ablesen → Migration-File exakt `supabase/migrations/<V>_abrechnungen_status_im_einzug.sql` benennen. `execute_sql` nur READ.
- **Worktree:** Alle Pfade absolut unter `C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2\.claude\worktrees\bug-audit-sweep-0706\`. NIE in den Main-Checkout schreiben (fremder Branch).
- **Server-Actions:** Result-Object (`{ success, error? }`), kein throw; `revalidatePath` bei Writes. Non-critical Sends (Email/Alert) in `try/catch`.
- **Umlaute:** nutzersichtbare Strings (Badge-Label „Im Einzug", Fehlermeldungen im Admin-UI) mit echten Umlauten. Backend/Logs/Comments ASCII egal.
- **Ratchets:** `token-audit` / `component-set` / `status-registry` / `knip` 0-neu. `info`-Token (`bg-info-soft`/`text-info-strong`/`bg-info`) ist etabliert (globals.css) → kein Ratchet-Treffer.
- **Audit:** 7-Punkte-Audit im finalen PR-Commit-Body. `abrechnungen` ist auf Prod leer → kein Backfill.

---

### Task 1: DB-Migration — `im_einzug` in CHECK-Constraint

**Files:**
- Create: `supabase/migrations/<V>_abrechnungen_status_im_einzug.sql` (Name nach getrackter Version)

**Interfaces:**
- Produces: erlaubter Status-Wert `'im_einzug'` in `public.abrechnungen.status`.

- [ ] **Step 1: Migration via MCP applizieren**

`mcp__plugin_supabase_supabase__apply_migration({ project_id: 'paizkjajbuxxksdoycev', name: 'abrechnungen_status_im_einzug', query: <SQL> })`

```sql
ALTER TABLE public.abrechnungen DROP CONSTRAINT abrechnungen_status_check;
ALTER TABLE public.abrechnungen ADD CONSTRAINT abrechnungen_status_check
  CHECK (status = ANY (ARRAY[
    'entwurf'::text, 'versendet'::text, 'bezahlt'::text, 'ueberfaellig'::text,
    'storniert'::text, 'fehlgeschlagen'::text, 'im_einzug'::text]));
```

- [ ] **Step 2: Getrackte Version ablesen**

`mcp__plugin_supabase_supabase__list_migrations({ project_id: 'paizkjajbuxxksdoycev' })` → die neueste Version `<V>` für `abrechnungen_status_im_einzug` notieren.

- [ ] **Step 3: Verifizieren (READ)**

`mcp__plugin_supabase_supabase__execute_sql({ project_id: 'paizkjajbuxxksdoycev', query: "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.abrechnungen'::regclass AND conname='abrechnungen_status_check';" })`
Expected: Constraint-Def enthält `'im_einzug'`.

- [ ] **Step 4: Migration-File schreiben (Name == `<V>`)**

Datei `supabase/migrations/<V>_abrechnungen_status_im_einzug.sql` mit dem SQL aus Step 1 + Header-Kommentar:
```sql
-- 2026-07-07: abrechnungen.status um 'im_einzug' erweitern (SEPA-Lastschrift in-flight).
-- Additiv (erweitert erlaubte Werte). Angewandt via apply_migration, Version == Dateiname.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_abrechnungen_status_im_einzug.sql
git commit -m "feat(finance): abrechnungen.status um im_einzug erweitern (CHECK)"
```

---

### Task 2: Reiner Mapper `einzugBranchFuerPiStatus` + Tests (TDD)

**Files:**
- Modify: `src/lib/finance/einzug-retry.ts` (Funktion + Doc anhängen)
- Test: `src/lib/finance/einzug-retry.test.ts` (existiert; falls nicht → anlegen)

**Interfaces:**
- Produces: `einzugBranchFuerPiStatus(status: string): 'paid' | 'im_einzug' | 'fehlgeschlagen'`
  - `succeeded → 'paid'`; `processing → 'im_einzug'`; alles andere → `'fehlgeschlagen'`.
  - **Abgrenzung zu `piStatusToEinzugAction`** (Sibling): jenes entscheidet beim *Retrieve* eines bestehenden PI, ob re-charged wird (`paid|pending|retry`); dieses klassifiziert einen *frisch erstellten* PI in einen DB-Status.

- [ ] **Step 1: Failing test schreiben**

In `src/lib/finance/einzug-retry.test.ts` ergänzen (oder Datei mit `import { einzugBranchFuerPiStatus } from './einzug-retry'` + `import { describe, it, expect } from 'vitest'` anlegen):

```ts
describe('einzugBranchFuerPiStatus — frisch erstellter PI → DB-Status', () => {
  it('succeeded → paid', () => expect(einzugBranchFuerPiStatus('succeeded')).toBe('paid'))
  it('processing (SEPA) → im_einzug', () => expect(einzugBranchFuerPiStatus('processing')).toBe('im_einzug'))
  it('requires_payment_method → fehlgeschlagen', () => expect(einzugBranchFuerPiStatus('requires_payment_method')).toBe('fehlgeschlagen'))
  it('requires_action → fehlgeschlagen (off_session nicht abschliessbar)', () => expect(einzugBranchFuerPiStatus('requires_action')).toBe('fehlgeschlagen'))
  it('canceled → fehlgeschlagen', () => expect(einzugBranchFuerPiStatus('canceled')).toBe('fehlgeschlagen'))
  it('unbekannt → fehlgeschlagen (fail-safe)', () => expect(einzugBranchFuerPiStatus('irgendwas')).toBe('fehlgeschlagen'))
})
```

- [ ] **Step 2: Test läuft & schlägt fehl**

Run: `npx vitest run src/lib/finance/einzug-retry.test.ts`
Expected: FAIL — `einzugBranchFuerPiStatus is not a function`.

- [ ] **Step 3: Implementieren**

An `src/lib/finance/einzug-retry.ts` anhängen:

```ts
export type EinzugCreateBranch = 'paid' | 'im_einzug' | 'fehlgeschlagen'

/**
 * Klassifiziert den Status eines FRISCH ERSTELLTEN Einzugs-PaymentIntent in
 * einen abrechnungen.status-Wert. Anders als piStatusToEinzugAction (Retrieve/
 * Re-Charge-Entscheidung) entscheidet dies nach dem confirm-Aufruf:
 *   - succeeded  -> 'paid'          (Karte sofort durch)
 *   - processing -> 'im_einzug'     (SEPA eingereicht, settled asynchron; KEIN Fehler)
 *   - sonst      -> 'fehlgeschlagen'(requires_action/-payment_method/canceled/unbekannt)
 */
export function einzugBranchFuerPiStatus(status: string): EinzugCreateBranch {
  if (status === 'succeeded') return 'paid'
  if (status === 'processing') return 'im_einzug'
  return 'fehlgeschlagen'
}
```

- [ ] **Step 4: Test läuft & besteht**

Run: `npx vitest run src/lib/finance/einzug-retry.test.ts`
Expected: PASS (alle einzugBranchFuerPiStatus-Cases + bestehende piStatusToEinzugAction-Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/einzug-retry.ts src/lib/finance/einzug-retry.test.ts
git commit -m "feat(finance): einzugBranchFuerPiStatus mapper (processing->im_einzug) + tests"
```

---

### Task 3: Einzugs-Cron — im_einzug-Branch + Retry-Poll + pending-Counter

**Files:**
- Modify: `src/app/api/cron/abrechnung-einzug/route.ts`

**Interfaces:**
- Consumes: `einzugBranchFuerPiStatus` (Task 2).
- Produces: Cron setzt `processing`-PIs auf `status='im_einzug'` (kein Alarm); Retry-Query pollt `im_einzug` als Webhook-Backstop; Response enthält `pending`.

- [ ] **Step 1: Import ergänzen**

In `src/app/api/cron/abrechnung-einzug/route.ts` den bestehenden Import erweitern:
```ts
import { piStatusToEinzugAction, retryFensterStartDatum, pollCooldownCutoff, einzugBranchFuerPiStatus } from '@/lib/finance/einzug-retry'
```

- [ ] **Step 2: Retry-Query um im_einzug erweitern (Webhook-Backstop)**

Im Query (2) die Zeile
```ts
    .eq('status', 'fehlgeschlagen')
```
ersetzen durch
```ts
    .in('status', ['fehlgeschlagen', 'im_einzug'])
```
(Der Idempotenz-Guard unten mappt `processing→'pending'` → kein 2. Charge; `succeeded→'paid'` → markPaid.)

- [ ] **Step 3: pending-Counter deklarieren**

Bei `let success = 0` / `let failed = 0` ergänzen:
```ts
  let pending = 0
```

- [ ] **Step 4: Post-Create-else-Zweig auf Branch-Mapper umstellen**

Den Block
```ts
      if (pi.status === 'succeeded') {
        await markPaid(abr.id, Number(abr.summe_brutto), pi.id)
        success++
      } else {
        // 'requires_action' (3DS) oder 'processing' — Einzug noch offen, Versuch zaehlen
        await db.from('abrechnungen').update({
          einzug_versucht_am: new Date().toISOString(),
          stripe_payment_intent_id: pi.id,
          einzug_fehler: `PaymentIntent status=${pi.status} (3DS oder verzoegert)`,
          status: 'fehlgeschlagen',
          updated_at: new Date().toISOString(),
        }).eq('id', abr.id)
        await alertAaron(abr, `PaymentIntent ${pi.id} im Status ${pi.status} statt 'succeeded' — manuelle Pruefung noetig.`)
        failed++
      }
```
ersetzen durch
```ts
      const branch = einzugBranchFuerPiStatus(pi.status)
      if (branch === 'paid') {
        await markPaid(abr.id, Number(abr.summe_brutto), pi.id)
        success++
      } else if (branch === 'im_einzug') {
        // SEPA-Lastschrift eingereicht — settled asynchron. KEIN Fehler, KEIN Alarm.
        await markImEinzug(abr.id, pi.id)
        pending++
      } else {
        // terminal-nicht-erfolgreich (unerwartet fuer confirm+off_session) -> echter Fehler
        await db.from('abrechnungen').update({
          einzug_versucht_am: new Date().toISOString(),
          stripe_payment_intent_id: pi.id,
          einzug_fehler: `PaymentIntent status=${pi.status}`,
          status: 'fehlgeschlagen',
          updated_at: new Date().toISOString(),
        }).eq('id', abr.id)
        await alertAaron(abr, `PaymentIntent ${pi.id} im Status ${pi.status} statt 'succeeded' — manuelle Pruefung noetig.`)
        failed++
      }
```

- [ ] **Step 5: `markImEinzug`-Helper ergänzen**

Direkt nach der `markPaid`-Helper-Funktion einfügen:
```ts
  async function markImEinzug(abrId: string, piId: string) {
    const nowIso = new Date().toISOString()
    await db.from('abrechnungen').update({
      einzug_versucht_am: nowIso,
      stripe_payment_intent_id: piId,
      einzug_fehler: null,
      status: 'im_einzug',
      updated_at: nowIso,
    }).eq('id', abrId)
  }
```

- [ ] **Step 6: Response + Log um pending erweitern**

```ts
  console.log(`[KFZ-149 einzug] success=${success} pending=${pending} failed=${failed} total_pruefung=${faellig?.length ?? 0}`)
  return NextResponse.json({ ok: true, success, pending, failed, total: faellig?.length ?? 0 })
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "abrechnung-einzug"` (PowerShell) — Expected: keine Fehler in dieser Datei.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cron/abrechnung-einzug/route.ts
git commit -m "feat(finance): einzug-cron verbucht SEPA-processing als im_einzug (kein Fehlalarm) + poll-backstop"
```

---

### Task 4: Manueller Retry — Guard gegen Doppelabbuchung + im_einzug-Branch

**Files:**
- Modify: `src/app/admin/abrechnungen/actions.ts` (`retryEinzug`)

**Interfaces:**
- Consumes: `einzugBranchFuerPiStatus` (Task 2).
- Produces: `retryEinzug` lehnt `im_einzug`-Zeilen ab (kein 2. PI) und verbucht `processing` als `im_einzug`.

- [ ] **Step 1: Import + status ins Select**

Oben ergänzen:
```ts
import { einzugBranchFuerPiStatus } from '@/lib/finance/einzug-retry'
```
Select (Zeile ~42) um `status` erweitern:
```ts
    .select('id, abrechnungs_nr, empfaenger_typ, empfaenger_id, summe_brutto, bezahlt_am, status')
```

- [ ] **Step 2: Guard nach dem bezahlt-Check**

Nach `if (abr.bezahlt_am) return { success: false, error: 'Abrechnung ist bereits bezahlt' }` einfügen:
```ts
  if (abr.status === 'im_einzug') return { success: false, error: 'Abrechnung ist bereits im Einzug (SEPA wird verarbeitet) — bitte abwarten.' }
```

- [ ] **Step 3: else-Zweig (Zeilen ~175-183) auf Branch umstellen**

Den Block
```ts
    await db.from('abrechnungen').update({
      einzug_versucht_am: new Date().toISOString(),
      einzug_fehler: `PaymentIntent status=${pi.status}`,
      stripe_payment_intent_id: pi.id,
      status: 'fehlgeschlagen',
      updated_at: new Date().toISOString(),
    }).eq('id', abr.id)
    revalidatePath('/admin/finance/abrechnungen', 'page')
    return { success: false, error: `PaymentIntent ist im Status '${pi.status}' (kein 'succeeded'). PaymentIntent-ID: ${pi.id}` }
```
ersetzen durch
```ts
    if (einzugBranchFuerPiStatus(pi.status) === 'im_einzug') {
      const nowIso = new Date().toISOString()
      await db.from('abrechnungen').update({
        einzug_versucht_am: nowIso,
        einzug_fehler: null,
        stripe_payment_intent_id: pi.id,
        status: 'im_einzug',
        updated_at: nowIso,
      }).eq('id', abr.id)
      revalidatePath('/admin/finance/abrechnungen', 'page')
      return { success: true, payment_intent_id: pi.id }
    }

    await db.from('abrechnungen').update({
      einzug_versucht_am: new Date().toISOString(),
      einzug_fehler: `PaymentIntent status=${pi.status}`,
      stripe_payment_intent_id: pi.id,
      status: 'fehlgeschlagen',
      updated_at: new Date().toISOString(),
    }).eq('id', abr.id)
    revalidatePath('/admin/finance/abrechnungen', 'page')
    return { success: false, error: `PaymentIntent ist im Status '${pi.status}' (kein 'succeeded'). PaymentIntent-ID: ${pi.id}` }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "abrechnungen.actions"` — Expected: keine Fehler in dieser Datei.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/abrechnungen/actions.ts
git commit -m "fix(finance): manueller Retry lehnt im_einzug ab (Doppelabbuchung) + processing->im_einzug"
```

---

### Task 5: Dunning + Reminder schließen im_einzug aus + Source-Guard-Test

**Files:**
- Modify: `src/app/api/cron/sv-mahnung-saeumnis/route.ts`
- Modify: `src/app/api/cron/abrechnung-reminder/route.ts`
- Test: `src/app/api/cron/einzug-status-filter.test.ts` (neu)

**Interfaces:**
- Produces: keine `im_einzug`-Zeile wird gemahnt/erinnert (Geld ist unterwegs). `fehlgeschlagen` bleibt drin (korrekt).

- [ ] **Step 1: Failing Source-Guard-Test**

`src/app/api/cron/einzug-status-filter.test.ts` (Muster analog `internal-admin-reads.test.ts` — liest Source, prüft Filter):
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Schuetzt, dass Dunning/Reminder eine laufende Lastschrift (im_einzug) NICHT mahnen.
const files = ['sv-mahnung-saeumnis', 'abrechnung-reminder']
describe('Dunning/Reminder schliessen im_einzug aus', () => {
  for (const f of files) {
    it(`${f} filtert status != im_einzug`, () => {
      const src = readFileSync(join(process.cwd(), 'src/app/api/cron', f, 'route.ts'), 'utf8')
      expect(src).toMatch(/\.neq\(\s*['"]status['"]\s*,\s*['"]im_einzug['"]\s*\)/)
    })
  }
})
```

- [ ] **Step 2: Test läuft & schlägt fehl**

Run: `npx vitest run src/app/api/cron/einzug-status-filter.test.ts`
Expected: FAIL (beide `.neq('status','im_einzug')` fehlen noch).

- [ ] **Step 3: sv-mahnung-saeumnis filtern**

In `src/app/api/cron/sv-mahnung-saeumnis/route.ts` in der `abrechnungen`-Query direkt nach `.is('bezahlt_am', null)` ergänzen:
```ts
    .neq('status', 'im_einzug')
```

- [ ] **Step 4: abrechnung-reminder filtern**

In `src/app/api/cron/abrechnung-reminder/route.ts` in der `abrechnungen`-Query direkt nach `.is('bezahlt_am', null)` ergänzen:
```ts
    .neq('status', 'im_einzug')
```

- [ ] **Step 5: Test läuft & besteht**

Run: `npx vitest run src/app/api/cron/einzug-status-filter.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/sv-mahnung-saeumnis/route.ts src/app/api/cron/abrechnung-reminder/route.ts src/app/api/cron/einzug-status-filter.test.ts
git commit -m "fix(finance): Dunning/Reminder mahnen keine laufende Lastschrift (im_einzug ausgeschlossen)"
```

---

### Task 6: Webhook `payment_intent.payment_failed` → Abrechnung (testbar extrahiert)

**Files:**
- Create: `src/lib/finance/einzug-webhook.ts`
- Test: `src/lib/finance/einzug-webhook.test.ts`
- Modify: `src/app/api/stripe/webhook/route.ts` (`payment_intent.payment_failed`-Case)

**Interfaces:**
- Produces: `handleEinzugPaymentFailed(db, pi): Promise<{ acted: boolean; abrId?: string; grund?: string; abrechnungsNr?: string; betragBrutto?: number }>` — setzt `status='fehlgeschlagen'` (idempotent `.neq('status','bezahlt')`) für `pi.metadata.abrechnung_id`.

- [ ] **Step 1: Failing test (fakeDb, Muster wie process-case-billing.test.ts)**

`src/lib/finance/einzug-webhook.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { handleEinzugPaymentFailed } from './einzug-webhook'

function fakeDb() {
  const calls: any[] = []
  const chain: any = {}
  chain.update = vi.fn((patch: any) => { calls.push({ op: 'update', patch }); return chain })
  chain.eq = vi.fn((c: string, v: any) => { calls.push({ op: 'eq', c, v }); return chain })
  chain.neq = vi.fn((c: string, v: any) => { calls.push({ op: 'neq', c, v }); return chain })
  const db: any = { from: vi.fn(() => chain), _calls: calls }
  return db
}

describe('handleEinzugPaymentFailed', () => {
  it('setzt fehlgeschlagen idempotent fuer abrechnung_id', async () => {
    const db = fakeDb()
    const r = await handleEinzugPaymentFailed(db, {
      metadata: { abrechnung_id: 'abr-1', abrechnungs_nr: 'R-2026-001' },
      amount: 11900,
      last_payment_error: { message: 'insufficient_funds' },
    })
    expect(r.acted).toBe(true)
    expect(r.abrId).toBe('abr-1')
    expect(r.grund).toBe('insufficient_funds')
    expect(r.betragBrutto).toBe(119)
    const patch = db._calls.find((c: any) => c.op === 'update')?.patch
    expect(patch.status).toBe('fehlgeschlagen')
    expect(db._calls.some((c: any) => c.op === 'neq' && c.c === 'status' && c.v === 'bezahlt')).toBe(true)
  })

  it('no-op ohne abrechnung_id', async () => {
    const db = fakeDb()
    const r = await handleEinzugPaymentFailed(db, { metadata: { gutachter_id: 'g-1' } })
    expect(r.acted).toBe(false)
    expect(db.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test läuft & schlägt fehl**

Run: `npx vitest run src/lib/finance/einzug-webhook.test.ts`
Expected: FAIL — Modul/Funktion fehlt.

- [ ] **Step 3: Implementieren**

`src/lib/finance/einzug-webhook.ts`:
```ts
// Testbare DB-Mutation fuer das Stripe-Webhook-Event payment_intent.payment_failed,
// wenn der PI zu einer Abrechnung gehoert (metadata.abrechnung_id). Setzt die
// Abrechnung idempotent auf 'fehlgeschlagen'. Der Admin-Alert (IO) bleibt im Route-Handler.

type PiLike = {
  metadata?: Record<string, string> | null
  amount?: number | null
  last_payment_error?: { message?: string } | null
}
type DbLike = { from: (t: string) => any }

export async function handleEinzugPaymentFailed(
  db: DbLike,
  pi: PiLike,
): Promise<{ acted: boolean; abrId?: string; grund?: string; abrechnungsNr?: string; betragBrutto?: number }> {
  const meta = (pi.metadata ?? {}) as Record<string, string>
  const abrId = meta.abrechnung_id ?? null
  if (!abrId) return { acted: false }
  const grund = pi.last_payment_error?.message ?? 'Lastschrift fehlgeschlagen'
  await db.from('abrechnungen').update({
    status: 'fehlgeschlagen',
    einzug_fehler: grund,
    updated_at: new Date().toISOString(),
  }).eq('id', abrId).neq('status', 'bezahlt')
  return {
    acted: true,
    abrId,
    grund,
    abrechnungsNr: meta.abrechnungs_nr,
    betragBrutto: Number(pi.amount ?? 0) / 100,
  }
}
```

- [ ] **Step 4: Test läuft & besteht**

Run: `npx vitest run src/lib/finance/einzug-webhook.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Webhook-Route verdrahten**

In `src/app/api/stripe/webhook/route.ts` den `case 'payment_intent.payment_failed'`-Block erweitern — nach dem bestehenden `if (meta.gutachter_id) { ... }` einfügen (vor `break`):
```ts
        // Einzugs-PI (SEPA-Ruecklastschrift days-later): Abrechnung auf fehlgeschlagen.
        const { handleEinzugPaymentFailed } = await import('@/lib/finance/einzug-webhook')
        const einzugFail = await handleEinzugPaymentFailed(db, pi as {
          metadata?: Record<string, string> | null; amount?: number | null; last_payment_error?: { message?: string } | null
        })
        if (einzugFail.acted) {
          try {
            const { render } = await import('@react-email/render')
            const { AdminEinzugFehlgeschlagenEmail, subject } = await import('@/lib/email/google/templates/AdminEinzugFehlgeschlagen')
            const { sendCommunication } = await import('@/lib/communications/send')
            const props = {
              abrechnungsNr: einzugFail.abrechnungsNr ?? (einzugFail.abrId ?? '').slice(0, 8),
              empfaengerName: null,
              betragBrutto: einzugFail.betragBrutto ?? 0,
              fehlerGrund: einzugFail.grund ?? 'Lastschrift fehlgeschlagen',
            }
            await sendCommunication('admin_einzug_failed', {
              email: process.env.ADMIN_ALERT_EMAIL || 'aaron@claimondo.de',
              subject: subject(props),
              html: await render(AdminEinzugFehlgeschlagenEmail(props)),
            })
          } catch (alertErr) {
            console.error('[KFZ-148] einzug-payment_failed Admin-Alert (non-fatal):', alertErr)
          }
        }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "webhook|einzug-webhook"` — Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/einzug-webhook.ts src/lib/finance/einzug-webhook.test.ts src/app/api/stripe/webhook/route.ts
git commit -m "feat(finance): Webhook verbucht async fehlgeschlagene SEPA-Einzuege (abrechnung_id) + Admin-Alert"
```

---

### Task 7: UI — Badge „Im Einzug" + zentrale Labels

**Files:**
- Modify: `src/lib/statusLabels.ts` (ABRECHNUNG-Maps)
- Modify: `src/app/admin/abrechnungen/AbrechnungenListClient.tsx` (Badge, Filter, Counts)

**Interfaces:**
- Produces: `im_einzug`-Zeilen zeigen Badge „Im Einzug" (info/blau), erscheinen im eigenen Filter, und sind aus „offen"/„fällig"-Zählern raus.

- [ ] **Step 1: statusLabels.ts ergänzen**

`ABRECHNUNG_STATUS_LABELS` (um `im_einzug` + fehlendes `fehlgeschlagen`):
```ts
export const ABRECHNUNG_STATUS_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  versendet: 'Versendet',
  im_einzug: 'Im Einzug',
  bezahlt: 'Bezahlt',
  ueberfaellig: 'Überfällig',
  fehlgeschlagen: 'Fehlgeschlagen',
  storniert: 'Storniert',
}
```
`ABRECHNUNG_STATUS_SLOT_MAP` (analog):
```ts
const ABRECHNUNG_STATUS_SLOT_MAP: Record<string, StatusSlot> = {
  entwurf: 'neutral',
  versendet: 'active',
  im_einzug: 'active',
  bezahlt: 'success',
  ueberfaellig: 'danger',
  fehlgeschlagen: 'danger',
  storniert: 'neutral',
}
```

- [ ] **Step 2: statusBadge()-Zweig (AbrechnungenListClient.tsx)**

In `statusBadge(row)` nach der `fehlgeschlagen`-Zeile und **vor** dem `isFaellig`-Check einfügen:
```ts
  if (row.status === 'im_einzug') return { label: 'Im Einzug', bg: 'bg-info-soft', text: 'text-info-strong', dot: 'bg-info' }
```

- [ ] **Step 3: FilterKey + Tab**

`FilterKey`-Type:
```ts
type FilterKey = 'offen' | 'faellig' | 'im_einzug' | 'bezahlt' | 'fehlgeschlagen' | 'alle'
```
`FILTER_TABS` (nach dem `faellig`-Eintrag):
```ts
  { key: 'im_einzug', label: 'Im Einzug' },
```

- [ ] **Step 4: filtered() — im_einzug isolieren, aus offen/faellig raus**

Im `filtered`-`useMemo` die drei Zeilen anpassen/ergänzen:
```ts
      if (filter === 'im_einzug') return r.status === 'im_einzug' && !r.bezahlt_am
      if (filter === 'faellig') return isFaellig(r) && r.status !== 'fehlgeschlagen' && r.status !== 'im_einzug'
      // offen: noch nicht bezahlt, nicht storniert, nicht fehlgeschlagen, nicht im_einzug
      return !r.bezahlt_am && !r.storniert_am && r.status !== 'fehlgeschlagen' && r.status !== 'im_einzug'
```
(Die `im_einzug`-Zeile VOR der `faellig`-Zeile einfügen; `bezahlt`/`fehlgeschlagen`/`alle` unverändert.)

- [ ] **Step 5: counts — im_einzug zählen, aus offen/faellig raus**

```ts
  const counts = useMemo(() => ({
    offen: rows.filter(r => !r.bezahlt_am && !r.storniert_am && r.status !== 'fehlgeschlagen' && r.status !== 'im_einzug').length,
    faellig: rows.filter(r => isFaellig(r) && r.status !== 'fehlgeschlagen' && r.status !== 'im_einzug').length,
    im_einzug: rows.filter(r => r.status === 'im_einzug' && !r.bezahlt_am).length,
    fehlgeschlagen: rows.filter(r => r.status === 'fehlgeschlagen' || (!!r.einzug_fehler && !r.bezahlt_am)).length,
    bezahlt: rows.filter(r => !!r.bezahlt_am).length,
    alle: rows.length,
  }), [rows])
```

- [ ] **Step 6: Typecheck + Ratchets**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "AbrechnungenListClient|statusLabels"` — Expected: keine Fehler.
Run: `npm run check:token-audit; npm run check:status-registry; npm run check:component-set` — Expected: 0-neu (info-Token etabliert, Badge nutzt bestehende StatusBadge).

- [ ] **Step 7: Commit**

```bash
git add src/lib/statusLabels.ts src/app/admin/abrechnungen/AbrechnungenListClient.tsx
git commit -m "feat(finance): Admin-Abrechnungen Badge + Filter 'Im Einzug' (info) + zentrale Labels"
```

---

### Task 8: Voller Audit + PR gegen staging

**Files:** keine (Verifikation + PR)

- [ ] **Step 1: Voller Build**

Run: `npm run build`
Expected: grün. (Bei node_modules-Freshness-Problemen lokal → CI ist autoritativ; im PR notieren.)

- [ ] **Step 2: Gesamte Test-Suite der berührten Bereiche**

Run: `npx vitest run src/lib/finance/ src/app/api/cron/einzug-status-filter.test.ts`
Expected: grün.

- [ ] **Step 3: Ratchets gesamt**

Run: `npm run check:token-audit; npm run check:status-registry; npm run check:component-set; npm run check:knip`
Expected: 0-neu.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin kitta/stripe-im-einzug-status
gh pr create --base staging --title "fix(finance): im_einzug-Status fuer SEPA-Lastschriften (kein Fehlalarm/Fehl-Mahnung)" --body "<7-Punkte-Audit>"
```
PR-Body enthält den 7-Punkte-Audit-Status (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression) + Hinweis: Migration bereits prod-appliziert (additiv), Tabelle leer → kein Backfill.

---

## Self-Review

**1. Spec coverage:**
- Migration (text+CHECK) → Task 1 ✓
- Pure Helper + Tests → Task 2 ✓ (co-located in `einzug-retry.ts` statt `einzug-branch.ts` — bewusste Abweichung: Sibling von `piStatusToEinzugAction`)
- Cron-Branch + Retry-Poll → Task 3 ✓
- Webhook payment_failed→abrechnung → Task 6 ✓ (in testbare `handleEinzugPaymentFailed` extrahiert)
- Dunning/Reminder-Ausschluss → Task 5 ✓
- Manuell-Retry-Guard + Branch → Task 4 ✓
- Badge + Labels → Task 7 ✓
- Kein Backfill / kein Doppelabbuchungs-Change → global constraints ✓
- `analytics/finance.ts`: Spec sagte „verifizieren, erwartet kein Change" — bewusst KEINE Task (rechnet über bezahlt_am/faellig_am, nicht Status; im_einzug zählt korrekt als offen). Falls die Verifikation in Task 8 doch eine Status-Abhängigkeit findet → Ad-hoc-Task ergänzen.

**2. Placeholder scan:** `<V>` in Task 1 = plugin-vergebene Migrationsversion (Regel 2), bewusst. Sonst keine Platzhalter — jeder Step hat konkreten Code/Command.

**3. Type consistency:** `einzugBranchFuerPiStatus` → `'paid'|'im_einzug'|'fehlgeschlagen'` (Task 2) konsistent konsumiert in Task 3 (`branch === 'paid'|'im_einzug'` else) + Task 4 (`=== 'im_einzug'`). `handleEinzugPaymentFailed`-Return (Task 6) konsistent im Route-Handler genutzt (`einzugFail.acted/abrechnungsNr/betragBrutto/grund`). Status-String `'im_einzug'` überall identisch (Migration, Cron, Actions, Crons, UI).
