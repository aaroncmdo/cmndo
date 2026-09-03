# Test-Fixtures-Provisioner Implementation Plan (SP1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein idempotenter tsx-Provisioner (`scripts/test-fixtures/`), der den kanonischen Test-Zustand auf Prod garantiert — 7 Accounts entsperrt/aktiv + 3 Stage-Claims (C1/C2/C3) mit test-kunde=geschädigter — sodass jede Rolle bis zur Kern-CTA smokebar ist.

**Architecture:** Service-role supabase-js, idempotenter `upsert` auf **stabilen `fb…`-Test-UUIDs**. Ein `upsertById`-Helper + `Reporter` (ok/skip/fail) DRYen die Idempotenz. `provision.ts` orchestriert `ensureAccounts → ensureSeedGraph(C2→C1→C3)`, unterstützt `--dry-run`. **Kein DDL.**

**Tech Stack:** TypeScript, `@supabase/supabase-js`, `tsx`, vitest (mocked db, Payload-Assertions).

## Global Constraints

- **Read-safe:** nur `upsert`/`update` auf **stabile Test-UUIDs** (Prefix `fb…`) + die bekannten 7 Account-/1 SV-Sachverständigen-IDs. Nie non-Test-Zeilen anfassen.
- **Kein DDL** (Regel 2 n/a). Reuse bestehender Tabellen/Spalten.
- **test-sv-guard-konform:** Stage-Claim-Leads tragen interne Email (`…@claimondo.de`) → `istInterneIdentitaet=true` → intern→Test-SV-Buchung erlaubt.
- **Idempotenz:** 2. Lauf = alles `[skip]`/identisch, keine Duplikate.
- **Passwort-Grandfathering:** funktionierende `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`-Accounts NICHT resetten (HIBP). test-sv-Passwort bereits `Claimondo-SV-Smoke-2026` (diese Session) — dokumentieren, nicht neu setzen.

### Verified schema facts (Prod 07.07. — verwende diese Werte verbatim)

- **profiles.id (Accounts):** admin `bdfe432b-250e-4dec-8bdd-f5d6ac04d910` · dispatch `7b0787fb-2da1-4f61-aa79-1e56a6d32bf2` · kanzlei `bbbb1111-0000-4000-8000-000000000010` · kb `59bdb155-e283-4fd1-a4ca-222f924a0efa` · kunde `113aebe5-0630-4753-809a-6756df5ba432` · makler `bbbb2222-0000-4000-8000-000000000020` · sv `25a8c28e-b85a-4769-94d4-920e47f64079`.
- **test-sv `sachverstaendige.id` = `1da11741-a406-45ce-a27b-c041576cccbb`** (profile_id=sv). Ist gesperrt: `gesperrt_grund='tester'`, `gesperrt_seit`, `deaktiviert_am`, `deaktiviert_grund='tester'`, `ist_aktiv=false`. Entsperren = diese 4 auf `null` + `ist_aktiv=true` (verifiziert=true, ist_testaccount=true bereits gesetzt).
- **claims** hard-required: `schadentag` (date). Stage via `operative_status` ∈ {`ersterfassung`,`sv-termin`,`kanzlei-uebergeben`,`abgeschlossen`}. Attribution-Spalten: `makler_id`, `kundenbetreuer_id`, `kundenbetreuer_zugewiesen_am`, `sv_id`, `sv_zugewiesen_am`, `lead_id`, `kanzlei_uebergeben_am`, `kanzlei_ansprechpartner_name`, `kanzlei_ansprechpartner_email`.
- **claim_parties** required: `claim_id`, `rolle`, `quelle`. Geschädigter: `rolle='geschaedigter'`, `user_id=<kunde>`, `quelle='seed'`.
- **auftraege** required: `fall_id`(=claim_id post-CMM-49), `sv_id`(=`1da11741…`), `typ`, `status`, `claim_id`. Werte: `typ='erstgutachten'`, `status='termin'`, `technische_stellungnahme_status='angefordert'` (= treibt SV-CTA #3729).
- **leads** hat keine required-ohne-default Spalten. Setze `email` (intern, plus-adressiert), `vorname`, `nachname`, `status='umgewandelt'`.
- **pflichtdokumente** required: `dokument_typ`. Setze `fall_id`(=claim_id), `dokument_typ` ∈ kunde-facing {`fahrzeugschein`,`unfallfotos`,`schadensfotos`}, `sort_order`.
- **kanzlei_faelle** required: `fall_id`(=claim_id), `status` (='versicherungskontakt'), `claim_id`. **kanzleien** required: `name`, `email` (kein Profil-Link → C3-Scoping = Discovery-Step in Task 6).

### Stabile Test-UUIDs (in `ids.ts`)

```
CLAIMS:   c1 fbc10001-0000-4000-8000-000000000001 · c2 fbc10002-0000-4000-8000-000000000002 · c3 fbc10003-0000-4000-8000-000000000003
LEADS:    c1 fb1e0001-… · c2 fb1e0002-… · c3 fb1e0003-… (…-0000-4000-8000-00000000000N)
PARTIES:  c1 fbcp0001-… · c2 fbcp0002-… · c3 fbcp0003-…
AUFTRAG:  c2 fba00002-0000-4000-8000-000000000002
PFLICHTDOK (C1): fbpd0001/0002/0003-…
KANZLEI:  kanzlei fbca0001-… · kanzlei_fall fbca0f01-…
INTERN-EMAILS (guard): test-kunde+c1@claimondo.de / +c2 / +c3
```

---

### Task 1: Scaffolding — `ids.ts` + `lib.ts`

**Files:**
- Create: `scripts/test-fixtures/ids.ts`
- Create: `scripts/test-fixtures/lib.ts`
- Test: `scripts/test-fixtures/__tests__/lib.test.ts`

**Interfaces:**
- Produces: `ACCOUNTS`, `SV_SACHVERSTAENDIGE_ID`, `CLAIMS`, `LEADS`, `PARTIES`, `AUFTRAEGE`, `PFLICHTDOK`, `KANZLEI_ID`, `KANZLEI_FALL_ID`, `internEmail(stage)` (from `ids.ts`); `makeClient()`, `Reporter`, `upsertById(db, table, row, opts)`, `updateById(db, table, id, patch, opts)` (from `lib.ts`).

- [ ] **Step 1: Write `ids.ts`**

```typescript
// Stabile Test-UUIDs (Prefix fb… = fixture) + bekannte Account-IDs.
// Single-Source-of-Truth für Idempotenz; auch von der SP2-Harness importierbar.
export const ACCOUNTS = {
  admin: 'bdfe432b-250e-4dec-8bdd-f5d6ac04d910',
  dispatch: '7b0787fb-2da1-4f61-aa79-1e56a6d32bf2',
  kanzlei: 'bbbb1111-0000-4000-8000-000000000010',
  kb: '59bdb155-e283-4fd1-a4ca-222f924a0efa',
  kunde: '113aebe5-0630-4753-809a-6756df5ba432',
  makler: 'bbbb2222-0000-4000-8000-000000000020',
  sv: '25a8c28e-b85a-4769-94d4-920e47f64079',
} as const

export const SV_SACHVERSTAENDIGE_ID = '1da11741-a406-45ce-a27b-c041576cccbb'

export const CLAIMS = {
  c1: 'fbc10001-0000-4000-8000-000000000001',
  c2: 'fbc10002-0000-4000-8000-000000000002',
  c3: 'fbc10003-0000-4000-8000-000000000003',
} as const
export const LEADS = {
  c1: 'fb1e0001-0000-4000-8000-000000000001',
  c2: 'fb1e0002-0000-4000-8000-000000000002',
  c3: 'fb1e0003-0000-4000-8000-000000000003',
} as const
export const PARTIES = {
  c1: 'fbcp0001-0000-4000-8000-000000000001',
  c2: 'fbcp0002-0000-4000-8000-000000000002',
  c3: 'fbcp0003-0000-4000-8000-000000000003',
} as const
export const AUFTRAEGE = { c2: 'fba00002-0000-4000-8000-000000000002' } as const
export const PFLICHTDOK = {
  fahrzeugschein: 'fbpd0001-0000-4000-8000-000000000001',
  unfallfotos: 'fbpd0002-0000-4000-8000-000000000002',
  schadensfotos: 'fbpd0003-0000-4000-8000-000000000003',
} as const
export const KANZLEI_ID = 'fbca0001-0000-4000-8000-000000000001'
export const KANZLEI_FALL_ID = 'fbca0f01-0000-4000-8000-000000000001'

/** Intern (@claimondo.de) plus-adressiert -> test-sv-guard behandelt den Lead als intern. */
export function internEmail(stage: 'c1' | 'c2' | 'c3'): string {
  return `test-kunde+${stage}@claimondo.de`
}
```

- [ ] **Step 2: Write the failing test** (`scripts/test-fixtures/__tests__/lib.test.ts`)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { Reporter, upsertById, updateById } from '../lib'

// Fake-db: zeichnet from(table).upsert(row)/update(patch).eq('id',id) auf.
function fakeDb() {
  const calls: { table: string; op: string; arg: unknown }[] = []
  const db = {
    from(table: string) {
      return {
        upsert: (row: unknown) => {
          calls.push({ table, op: 'upsert', arg: row })
          return Promise.resolve({ error: null })
        },
        update: (patch: unknown) => ({
          eq: (_c: string, _v: string) => {
            calls.push({ table, op: 'update', arg: patch })
            return Promise.resolve({ error: null })
          },
        }),
        select: (_c: string) => ({
          eq: (_col: string, _v: string) => Promise.resolve({ data: [], error: null }),
        }),
      }
    },
  }
  return { db: db as never, calls }
}

describe('upsertById', () => {
  it('upsertet die Row und meldet ok', async () => {
    const { db, calls } = fakeDb()
    const rep = new Reporter()
    await upsertById(db, 'claims', { id: 'x', schadentag: '2026-01-01' }, { reporter: rep })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'claims', op: 'upsert', arg: { id: 'x' } })
    expect(rep.failures).toBe(0)
  })

  it('dry-run schreibt NICHT (nur select)', async () => {
    const { db, calls } = fakeDb()
    const rep = new Reporter()
    await upsertById(db, 'claims', { id: 'x' }, { reporter: rep, dryRun: true })
    expect(calls.filter((c) => c.op === 'upsert')).toHaveLength(0)
  })
})

describe('Reporter', () => {
  it('zählt failures und exitCode', () => {
    const rep = new Reporter()
    rep.ok('a'); rep.skip('b'); rep.fail('c', new Error('boom'))
    expect(rep.failures).toBe(1)
    expect(rep.exitCode()).toBe(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails** — `npx vitest run scripts/test-fixtures/__tests__/lib.test.ts` → FAIL (module `../lib` fehlt).

- [ ] **Step 4: Write `lib.ts`**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function makeClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY erforderlich')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export class Reporter {
  failures = 0
  private lines: string[] = []
  ok(msg: string) { this.lines.push(`  [ok]   ${msg}`) }
  skip(msg: string) { this.lines.push(`  [skip] ${msg}`) }
  fail(msg: string, err: unknown) {
    this.failures++
    this.lines.push(`  [FAIL] ${msg}: ${err instanceof Error ? err.message : String(err)}`)
  }
  print() { console.log(this.lines.join('\n')) }
  exitCode() { return this.failures > 0 ? 1 : 0 }
}

type Opts = { reporter: Reporter; dryRun?: boolean }

/** Idempotenter upsert auf row.id. Dry-run: nur SELECT (kein Write), meldet exists/missing. */
export async function upsertById(
  db: SupabaseClient, table: string, row: Record<string, unknown>, opts: Opts,
): Promise<void> {
  const id = row.id as string
  if (opts.dryRun) {
    const { data } = await db.from(table).select('id').eq('id', id)
    opts.reporter.skip(`${table} ${id} — ${(data ?? []).length ? 'vorhanden' : 'FEHLT (würde angelegt)'}`)
    return
  }
  const { error } = await db.from(table).upsert(row)
  if (error) opts.reporter.fail(`${table} ${id}`, error)
  else opts.reporter.ok(`${table} ${id}`)
}

/** Idempotentes UPDATE per id (für Zustands-Fixes wie SV-Entsperren). */
export async function updateById(
  db: SupabaseClient, table: string, id: string, patch: Record<string, unknown>, opts: Opts,
): Promise<void> {
  if (opts.dryRun) { opts.reporter.skip(`${table} ${id} — würde patchen`); return }
  const { error } = await db.from(table).update(patch).eq('id', id)
  if (error) opts.reporter.fail(`${table} ${id} update`, error)
  else opts.reporter.ok(`${table} ${id} gepatcht`)
}
```

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run scripts/test-fixtures/__tests__/lib.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(test-fixtures): ids + lib (idempotenter upsert-Helper + Reporter)`.

---

### Task 2: `accounts.ts` — Accounts sicherstellen + test-sv entsperren

**Files:** Create `scripts/test-fixtures/accounts.ts` · Test `scripts/test-fixtures/__tests__/accounts.test.ts`

**Interfaces:** Consumes `upsertById`/`updateById`/`Reporter` (lib), `ACCOUNTS`/`SV_SACHVERSTAENDIGE_ID` (ids). Produces `ensureAccounts(db, opts)`.

- [ ] **Step 1: Write the failing test** — assert der SV-Entsperr-Patch:

```typescript
import { describe, it, expect } from 'vitest'
import { Reporter } from '../lib'
import { ensureAccounts } from '../accounts'
import { SV_SACHVERSTAENDIGE_ID } from '../ids'

function fakeDb() {
  const calls: { table: string; op: string; id?: string; arg: Record<string, unknown> }[] = []
  const db = {
    from(table: string) {
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => { calls.push({ table, op: 'update', id, arg: patch }); return Promise.resolve({ error: null }) },
        }),
        upsert: (row: Record<string, unknown>) => { calls.push({ table, op: 'upsert', arg: row }); return Promise.resolve({ error: null }) },
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }
    },
  }
  return { db: db as never, calls }
}

describe('ensureAccounts', () => {
  it('entsperrt die test-sv sachverstaendige-Row (gesperrt/deaktiviert -> null, ist_aktiv=true)', async () => {
    const { db, calls } = fakeDb()
    await ensureAccounts(db, { reporter: new Reporter() })
    const svPatch = calls.find((c) => c.table === 'sachverstaendige' && c.id === SV_SACHVERSTAENDIGE_ID)
    expect(svPatch).toBeTruthy()
    expect(svPatch!.arg).toMatchObject({
      gesperrt_grund: null, gesperrt_seit: null, deaktiviert_am: null, deaktiviert_grund: null,
      ist_aktiv: true, ist_testaccount: true,
    })
  })
})
```

- [ ] **Step 2: Run test → FAIL** (`../accounts` fehlt).

- [ ] **Step 3: Write `accounts.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { Reporter, updateById } from './lib'
import { SV_SACHVERSTAENDIGE_ID } from './ids'

// Die 7 profiles-Rows existieren bereits (verifiziert). Kanonische Aufgabe:
// test-sv entsperren + als aktiven, verifizierten Test-SV garantieren.
// Passwörter: Grandfathering (<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD> nicht resetten; test-sv bereits
// 'Claimondo-SV-Smoke-2026'). Siehe README.
export async function ensureAccounts(
  db: SupabaseClient, opts: { reporter: Reporter; dryRun?: boolean },
): Promise<void> {
  await updateById(db, 'sachverstaendige', SV_SACHVERSTAENDIGE_ID, {
    gesperrt_grund: null,
    gesperrt_seit: null,
    deaktiviert_am: null,
    deaktiviert_grund: null,
    ist_aktiv: true,
    verifiziert: true,
    ist_testaccount: true,
  }, opts)
  // profiles.aktiv der 7 Accounts ist bereits true (verifiziert) — kein Write nötig.
}
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** — `feat(test-fixtures): ensureAccounts — test-sv entsperren`.

---

### Task 3: `provision.ts` — Orchestrator + `--dry-run`

**Files:** Create `scripts/test-fixtures/provision.ts` · Test `scripts/test-fixtures/__tests__/provision.test.ts`

**Interfaces:** Consumes `makeClient`/`Reporter` (lib), `ensureAccounts` (accounts). Produces `runProvision(db, { dryRun }): Promise<Reporter>`. (`ensureSeedGraph` wird in Task 4 ergänzt.)

- [ ] **Step 1: Write the failing test** — `runProvision` läuft accounts und gibt Reporter zurück; dry-run schreibt nicht:

```typescript
import { describe, it, expect } from 'vitest'
import { runProvision } from '../provision'

function fakeDb() {
  const writes: string[] = []
  const db = {
    from() {
      return {
        update: () => ({ eq: () => { writes.push('update'); return Promise.resolve({ error: null }) } }),
        upsert: () => { writes.push('upsert'); return Promise.resolve({ error: null }) },
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }
    },
  }
  return { db: db as never, writes }
}

describe('runProvision', () => {
  it('dry-run macht keine Writes', async () => {
    const { db, writes } = fakeDb()
    const rep = await runProvision(db, { dryRun: true })
    expect(writes).toHaveLength(0)
    expect(rep.failures).toBe(0)
  })
  it('non-dry-run schreibt', async () => {
    const { db, writes } = fakeDb()
    await runProvision(db, { dryRun: false })
    expect(writes.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test → FAIL.**

- [ ] **Step 3: Write `provision.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeClient, Reporter } from './lib'
import { ensureAccounts } from './accounts'
// import { ensureSeedGraph } from './seed-graph'  // ← Task 4 aktiviert das

export async function runProvision(
  db: SupabaseClient, opts: { dryRun: boolean },
): Promise<Reporter> {
  const reporter = new Reporter()
  const o = { reporter, dryRun: opts.dryRun }
  console.log(`\n=== Test-Fixtures-Provisioner ${opts.dryRun ? '(DRY-RUN)' : ''} ===`)
  console.log('— Accounts —')
  await ensureAccounts(db, o)
  // console.log('— Seed-Graph —'); await ensureSeedGraph(db, o)  // ← Task 4
  return reporter
}

// CLI-Entry (nur wenn direkt ausgeführt)
if (process.argv[1] && process.argv[1].endsWith('provision.ts')) {
  const dryRun = process.argv.includes('--dry-run')
  runProvision(makeClient(), { dryRun })
    .then((rep) => { rep.print(); console.log(`\nFertig — ${rep.failures} Fehler.`); process.exit(rep.exitCode()) })
    .catch((err) => { console.error('Provisioner-Crash:', err); process.exit(2) })
}
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** — `feat(test-fixtures): provision-Orchestrator + --dry-run`.

---

### Task 4: `seed-graph.ts` — Stage-Claim **C2** (sv-termin + Stellungnahme angefordert, #3729-Blocker zuerst)

**Files:** Create `scripts/test-fixtures/seed-graph.ts` · Test `scripts/test-fixtures/__tests__/seed-graph.test.ts` · Modify `scripts/test-fixtures/provision.ts` (ensureSeedGraph einhängen).

**Interfaces:** Consumes `upsertById` (lib), `ACCOUNTS`/`SV_SACHVERSTAENDIGE_ID`/`CLAIMS`/`LEADS`/`PARTIES`/`AUFTRAEGE`/`internEmail` (ids). Produces `ensureSeedGraph(db, opts)` (ruft `ensureC2`; C1/C3 in Task 5/6).

- [ ] **Step 1: Write the failing test** — assert die C2-Payloads (auftrag treibt #3729):

```typescript
import { describe, it, expect } from 'vitest'
import { Reporter } from '../lib'
import { ensureSeedGraph } from '../seed-graph'
import { CLAIMS, AUFTRAEGE, SV_SACHVERSTAENDIGE_ID, ACCOUNTS, PARTIES } from '../ids'

function fakeDb() {
  const rows: Record<string, Record<string, unknown>[]> = {}
  const db = {
    from(table: string) {
      return {
        upsert: (row: Record<string, unknown>) => { (rows[table] ??= []).push(row); return Promise.resolve({ error: null }) },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }
    },
  }
  return { db: db as never, rows }
}

describe('ensureSeedGraph — C2', () => {
  it('legt Claim @sv-termin, geschädigter=test-kunde und Auftrag mit angeforderter Stellungnahme an', async () => {
    const { db, rows } = fakeDb()
    await ensureSeedGraph(db, { reporter: new Reporter() })

    const c2 = (rows['claims'] ?? []).find((r) => r.id === CLAIMS.c2)
    expect(c2).toMatchObject({ id: CLAIMS.c2, operative_status: 'sv-termin', sv_id: SV_SACHVERSTAENDIGE_ID })

    const party = (rows['claim_parties'] ?? []).find((r) => r.id === PARTIES.c2)
    expect(party).toMatchObject({ claim_id: CLAIMS.c2, rolle: 'geschaedigter', user_id: ACCOUNTS.kunde, quelle: 'seed' })

    const auftrag = (rows['auftraege'] ?? []).find((r) => r.id === AUFTRAEGE.c2)
    expect(auftrag).toMatchObject({
      id: AUFTRAEGE.c2, claim_id: CLAIMS.c2, fall_id: CLAIMS.c2, sv_id: SV_SACHVERSTAENDIGE_ID,
      typ: 'erstgutachten', status: 'termin', technische_stellungnahme_status: 'angefordert',
    })
  })
})
```

- [ ] **Step 2: Run test → FAIL.**

- [ ] **Step 3: Write `seed-graph.ts`** (mit `ensureC2`)

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { Reporter, upsertById } from './lib'
import { ACCOUNTS, SV_SACHVERSTAENDIGE_ID, CLAIMS, LEADS, PARTIES, AUFTRAEGE, internEmail } from './ids'

type Opts = { reporter: Reporter; dryRun?: boolean }
const SCHADENTAG = '2026-06-15' // fixes Datum (Date.now() im Script vermeiden -> reproduzierbar)

// C2 — sv-termin: SV hat den Auftrag, Stellungnahme ist angefordert -> SV-CTA #3729.
async function ensureC2(db: SupabaseClient, o: Opts): Promise<void> {
  await upsertById(db, 'leads', {
    id: LEADS.c2, email: internEmail('c2'), vorname: 'Test', nachname: 'Geschädigter C2', status: 'umgewandelt',
  }, o)
  await upsertById(db, 'claims', {
    id: CLAIMS.c2, schadentag: SCHADENTAG, operative_status: 'sv-termin',
    lead_id: LEADS.c2, sv_id: SV_SACHVERSTAENDIGE_ID, sv_zugewiesen_am: SCHADENTAG,
    kundenbetreuer_id: ACCOUNTS.kb, created_via: 'manuell_admin',
  }, o)
  await upsertById(db, 'claim_parties', {
    id: PARTIES.c2, claim_id: CLAIMS.c2, rolle: 'geschaedigter', user_id: ACCOUNTS.kunde, quelle: 'seed',
  }, o)
  await upsertById(db, 'auftraege', {
    id: AUFTRAEGE.c2, claim_id: CLAIMS.c2, fall_id: CLAIMS.c2, sv_id: SV_SACHVERSTAENDIGE_ID,
    typ: 'erstgutachten', status: 'termin', technische_stellungnahme_status: 'angefordert',
  }, o)
}

export async function ensureSeedGraph(db: SupabaseClient, o: Opts): Promise<void> {
  await ensureC2(db, o)
  // await ensureC1(db, o)  // ← Task 5
  // await ensureC3(db, o)  // ← Task 6
}
```

- [ ] **Step 4: Wire into `provision.ts`** — Import + Aufruf entkommentieren:

```typescript
import { ensureSeedGraph } from './seed-graph'
// … in runProvision, nach ensureAccounts:
console.log('— Seed-Graph —')
await ensureSeedGraph(db, o)
```

- [ ] **Step 5: Run tests → PASS** (`npx vitest run scripts/test-fixtures`).
- [ ] **Step 6: Commit** — `feat(test-fixtures): Stage-Claim C2 (sv-termin + Stellungnahme angefordert, #3729)`.

---

### Task 5: Stage-Claim **C1** (ersterfassung + Pflichtdok-Slots + Makler-Attribution)

**Files:** Modify `scripts/test-fixtures/seed-graph.ts` (`ensureC1` + in `ensureSeedGraph`) · Modify `__tests__/seed-graph.test.ts` (C1-Assertions).

**Interfaces:** Consumes `PFLICHTDOK` (ids). Produces `ensureC1`.

- [ ] **Step 1: Add failing test** — C1-Claim @ersterfassung + 3 Pflichtdok-Slots:

```typescript
it('C1: Claim @ersterfassung mit Makler-Attribution + 3 Pflichtdok-Slots', async () => {
  const { db, rows } = fakeDb()
  await ensureSeedGraph(db, { reporter: new Reporter() })
  const c1 = (rows['claims'] ?? []).find((r) => r.id === CLAIMS.c1)
  expect(c1).toMatchObject({ id: CLAIMS.c1, operative_status: 'ersterfassung', makler_id: ACCOUNTS.makler })
  const slots = (rows['pflichtdokumente'] ?? []).filter((r) => r.fall_id === CLAIMS.c1)
  expect(slots).toHaveLength(3)
  expect(slots.map((s) => s.dokument_typ).sort()).toEqual(['fahrzeugschein', 'schadensfotos', 'unfallfotos'])
})
```
(Import `PFLICHTDOK`, `CLAIMS` in the test.)

- [ ] **Step 2: Run test → FAIL.**

- [ ] **Step 3: Write `ensureC1`** in `seed-graph.ts` + call it in `ensureSeedGraph`:

```typescript
import { PFLICHTDOK } from './ids' // zur bestehenden Import-Zeile ergänzen

async function ensureC1(db: SupabaseClient, o: Opts): Promise<void> {
  await upsertById(db, 'leads', {
    id: LEADS.c1, email: internEmail('c1'), vorname: 'Test', nachname: 'Geschädigter C1', status: 'umgewandelt',
  }, o)
  await upsertById(db, 'claims', {
    id: CLAIMS.c1, schadentag: SCHADENTAG, operative_status: 'ersterfassung',
    lead_id: LEADS.c1, makler_id: ACCOUNTS.makler, created_via: 'makler_portal',
  }, o)
  await upsertById(db, 'claim_parties', {
    id: PARTIES.c1, claim_id: CLAIMS.c1, rolle: 'geschaedigter', user_id: ACCOUNTS.kunde, quelle: 'seed',
  }, o)
  const slots: [string, string, number][] = [
    [PFLICHTDOK.fahrzeugschein, 'fahrzeugschein', 0],
    [PFLICHTDOK.unfallfotos, 'unfallfotos', 1],
    [PFLICHTDOK.schadensfotos, 'schadensfotos', 2],
  ]
  for (const [id, typ, sort] of slots) {
    await upsertById(db, 'pflichtdokumente', { id, fall_id: CLAIMS.c1, dokument_typ: typ, sort_order: sort }, o)
  }
}
```
Und in `ensureSeedGraph`: `await ensureC1(db, o)` (nach `ensureC2`).

- [ ] **Step 4: Run tests → PASS.**
- [ ] **Step 5: Commit** — `feat(test-fixtures): Stage-Claim C1 (ersterfassung + Pflichtdok-Slots + Makler)`.

---

### Task 6: Stage-Claim **C3** (kanzlei-uebergeben) — mit Scoping-Discovery

**Files:** Modify `scripts/test-fixtures/seed-graph.ts` (`ensureC3`) · Modify `__tests__/seed-graph.test.ts`.

**Interfaces:** Consumes `KANZLEI_ID`/`KANZLEI_FALL_ID` (ids). Produces `ensureC3`.

- [ ] **Step 1: Discovery — wie ist eine kanzlei-Rolle auf `kanzlei_faelle` gescoped?** `kanzleien` hat keinen Profil-Link. Lies den Kanzlei-Portal-Loader:

Run: `rg -n "kanzlei_faelle|kanzleien|from\('kanzlei" src/app/kanzlei src/lib | head -40`

Bestimme, worüber test-kanzlei (`bbbb1111…`) seine Fälle sieht (z. B. `kanzleien`-Row mit `email='test-kanzlei@claimondo.de'`, oder ein Mapping-Feld auf `claims`/`kanzlei_faelle`, oder RLS per JWT-Claim). Trage das Ergebnis als Kommentar in `ensureC3` ein und wähle die Verknüpfung entsprechend. **Wenn das Scoping nicht in <15 min auflösbar ist → C3 auf einen SP1-Follow-up vertagen** (C1+C2 sind der Kern; im README vermerken).

- [ ] **Step 2: Add failing test** — Kanzlei-Row + kanzlei_faelle + Claim @kanzlei-uebergeben:

```typescript
it('C3: Kanzlei-Fall @kanzlei-uebergeben verknüpft mit test-Kanzlei', async () => {
  const { db, rows } = fakeDb()
  await ensureSeedGraph(db, { reporter: new Reporter() })
  const c3 = (rows['claims'] ?? []).find((r) => r.id === CLAIMS.c3)
  expect(c3).toMatchObject({ id: CLAIMS.c3, operative_status: 'kanzlei-uebergeben' })
  const kf = (rows['kanzlei_faelle'] ?? []).find((r) => r.claim_id === CLAIMS.c3)
  expect(kf).toMatchObject({ claim_id: CLAIMS.c3, fall_id: CLAIMS.c3, status: 'versicherungskontakt' })
})
```

- [ ] **Step 3: Write `ensureC3`** (Verknüpfung gemäß Step-1-Discovery):

```typescript
import { KANZLEI_ID, KANZLEI_FALL_ID } from './ids'

async function ensureC3(db: SupabaseClient, o: Opts): Promise<void> {
  await upsertById(db, 'kanzleien', {
    id: KANZLEI_ID, name: 'Test Kanzlei', email: 'test-kanzlei@claimondo.de', aktiv: true,
  }, o)
  await upsertById(db, 'leads', {
    id: LEADS.c3, email: internEmail('c3'), vorname: 'Test', nachname: 'Geschädigter C3', status: 'umgewandelt',
  }, o)
  await upsertById(db, 'claims', {
    id: CLAIMS.c3, schadentag: SCHADENTAG, operative_status: 'kanzlei-uebergeben',
    lead_id: LEADS.c3, kanzlei_uebergeben_am: SCHADENTAG,
    kanzlei_ansprechpartner_name: 'Test Kanzlei', kanzlei_ansprechpartner_email: 'test-kanzlei@claimondo.de',
    created_via: 'manuell_admin',
    // <Scoping-Feld aus Step-1-Discovery, falls claims-seitig>
  }, o)
  await upsertById(db, 'claim_parties', {
    id: PARTIES.c3, claim_id: CLAIMS.c3, rolle: 'geschaedigter', user_id: ACCOUNTS.kunde, quelle: 'seed',
  }, o)
  await upsertById(db, 'kanzlei_faelle', {
    id: KANZLEI_FALL_ID, claim_id: CLAIMS.c3, fall_id: CLAIMS.c3, status: 'versicherungskontakt',
  }, o)
}
```
Und `await ensureC3(db, o)` in `ensureSeedGraph`.

- [ ] **Step 4: Run tests → PASS.**
- [ ] **Step 5: Commit** — `feat(test-fixtures): Stage-Claim C3 (kanzlei-uebergeben)`.

---

### Task 7: `README.md` + End-to-End-Verifikation gegen Prod

**Files:** Create `scripts/test-fixtures/README.md`.

- [ ] **Step 1: Write `README.md`** — kanonischer Soll-Zustand (7 Accounts + IDs + Passwörter: `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` außer test-sv=`Claimondo-SV-Smoke-2026`), die 3 Stage-Claims (welche Rolle → welche CTA), Run/Dry-Run-Anleitung, Verweis SP2 (Golden-Path-Harness) + SP3 (Cleanup der alten `smoke-*.mjs`).

- [ ] **Step 2: Dry-run gegen Prod**

Run: `NEXT_PUBLIC_SUPABASE_URL=$(...) SUPABASE_SERVICE_ROLE_KEY=$(...) npx tsx scripts/test-fixtures/provision.ts --dry-run`
(Env via `set -a; . .env.local; set +a` sourcen — NICHT den Key ausgeben.)
Expected: listet die fehlenden Fixtures, **keine Writes**.

- [ ] **Step 3: Echt-Lauf gegen Prod**

Run: (gleicher Aufruf ohne `--dry-run`) → `0 Fehler`.

- [ ] **Step 4: READ-Verifikation** (execute_sql / mcp):
  - `sachverstaendige` `1da11741…`: `gesperrt_grund IS NULL AND ist_aktiv=true`.
  - `auftraege` `fba00002…`: `technische_stellungnahme_status='angefordert'`.
  - `claims` c1/c2/c3: `operative_status` = ersterfassung/sv-termin/kanzlei-uebergeben; je eine `claim_parties`-Zeile `rolle='geschaedigter' user_id=<kunde>`.
  - `pflichtdokumente` mit `fall_id=fbc10001…`: 3 Zeilen.

- [ ] **Step 5: Idempotenz** — Echt-Lauf ein 2. Mal → identischer Zustand, keine Duplikate (Row-Counts unverändert).

- [ ] **Step 6: Commit** — `docs(test-fixtures): README + Prod-Verifikation (SP1 komplett)`.

## Self-Review

**1. Spec coverage:** Provisioner-Ort/Tech (Task 1–3) · Accounts + test-sv-Entsperren + Passwort-Grandfathering (Task 2 + README) · 3 Stage-Claims C1/C2/C3, test-kunde=geschädigter, guard-konforme interne Leads (Task 4–6) · `--dry-run` + Sammel-Report + Fehler-Isolation (Task 3, `Reporter`) · Idempotenz stabile UUIDs (Task 1 ids + `upsertById`) · Testing dry-run + READ-Verifikation + Idempotenz (Task 7) · kein DDL (durchgehend). Alle Spec-Punkte abgedeckt.

**2. Placeholder scan:** Alle Spalten/Werte verbatim aus den verifizierten Prod-Fakten. Einzige bewusste Discovery: C3-Kanzlei-Scoping (Task 6 Step 1) — konkreter Befehl + Fallback (vertagen), kein hand-waving.

**3. Type consistency:** `upsertById(db, table, row, opts)` / `updateById(db, table, id, patch, opts)` / `Reporter` / `ensureAccounts` / `ensureSeedGraph` / `runProvision` — Signaturen über alle Tasks identisch. IDs aus `ids.ts` durchgängig referenziert. `Opts = { reporter; dryRun? }` überall gleich.
