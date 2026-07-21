# Partner-Aktivierungs-Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem Monitoring-Befund „Partner-Account nie eingeloggt" wird pro totem Partner **eine nachverfolgbare, deduplizierte Vertriebs-Aufgabe**, die sich selbst schließt, sobald der Partner sich einloggt.

**Architecture:** Ein **geteilter Detektor** (`findStuckPartnerAccounts`) kapselt die Frage „wer ist tot?". Zwei Consumer mit verschiedenen Zwecken nutzen ihn: der **Health-Check** *beobachtet* (crit-Metrik auf `/admin/health`), der neue **Cron** *handelt* (Admin-Task pro Partner + Selbstheilung). Keine duplizierte Query, keine Monitoring/Eskalations-Vermischung.

**Tech Stack:** Next.js 15 App Router (Route Handler), TypeScript, Supabase (service-role Admin-Client + GoTrue Admin-API), vitest.

**Spec:** `docs/superpowers/specs/2026-07-20-partner-aktivierungs-nudge-design.md` (Commit `9c648abba`)
**Branch:** `kitta/partner-aktivierungs-nudge` (off `origin/staging`)

## Global Constraints

- **Regel 1:** PR gegen `staging`, **nie** direkt auf `main`.
- **Regel 4:** Nach Prod-Deploy vollständiger Playwright/Prod-Smoke (Plan in Task 4).
- **7-Punkte-Audit** im Body **jedes** Commits (AGENTS.md).
- **`tasks.entity_type` CHECK** kennt `fall|lead|abrechnung|reklamation|sv_onboarding|gutachter|kunde|case|termin|gutschrift|fall_dokumente` — **kein `partner`**. `entity_type`/`entity_id` bleiben deshalb **NULL** (CHECK erlaubt NULL). Ein Wert außerhalb der Liste würde von Postgres **still verworfen**.
- **`tasks.prioritaet` CHECK** = `normal | dringend | kritisch` → wir nutzen `normal`.
- **`tasks.status`** hat keinen CHECK; Bestandswerte `offen` / `erledigt` → wir nutzen genau diese.
- **Dedupe ignoriert den Status** (`task_code` existiert in *irgendeinem* Status → nie neu anlegen) — sonst Nag-Loop.
- **`MAX_TASKS_PRO_LAUF = 25`**, Überhang wird als `uebersprungen_cap` zurückgegeben und geloggt (kein stilles Abschneiden).
- **Umlaute:** Task-`titel`/`beschreibung` erscheinen in der Admin-UI (`/admin/aufgaben`) → **nutzersichtbar → echte Umlaute Pflicht** (`ä/ö/ü/ß`). Code-Kommentare dürfen ASCII sein.
- **`kundenbetreuer`** ist **nicht** im Cron (internes Personal); der Health-Check behält seine bestehende Rollen-Liste.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/lib/partner/stuck-accounts.ts` (**neu**) | Detektor: „welche Partner-Accounts sind tot?" — einzige Query-Logik |
| `src/lib/partner/__tests__/stuck-accounts.test.ts` (**neu**) | Detektor-Tests |
| `src/lib/health/checks/stuck-partner-accounts.ts` (**modify**) | Health-Check nutzt den Detektor (beobachtet) |
| `src/lib/health/checks/__tests__/stuck-partner-accounts.test.ts` (**modify**) | + Test „interne ausgeschlossen" |
| `src/app/api/cron/partner-aktivierung-nachfassen/route.ts` (**neu**) | Cron: Tasks erzeugen + selbstheilend schließen (handelt) |
| `src/app/api/cron/partner-aktivierung-nachfassen/__tests__/route.test.ts` (**neu**) | Cron-Tests |

---

## Task 1: Detektor `findStuckPartnerAccounts`

**Files:**
- Create: `src/lib/partner/stuck-accounts.ts`
- Test: `src/lib/partner/__tests__/stuck-accounts.test.ts`

**Interfaces:**
- Consumes: `istInterneEmail` aus `@/lib/testdaten/interne-identitaet`; `SupabaseClient` aus `@supabase/supabase-js`.
- Produces (von Task 2 + 3 genutzt):
  - `type StuckPartner = { userId: string; email: string; rolle: string; name: string | null; telefon: string | null; seit: string }`
  - `type StuckPartnerResult = { ok: true; partner: StuckPartner[] } | { ok: false; error: string }`
  - `const EXTERNE_PARTNER_ROLLEN: string[]` = `['werkstatt', 'makler', 'sachverstaendiger']`
  - `findStuckPartnerAccounts(admin: SupabaseClient, opts?: { rollen?: string[]; alterTage?: number }): Promise<StuckPartnerResult>`

> **Warum Result-Object statt `StuckPartner[]`:** Der Health-Check muss einen DB-Fehler als `status='error'` melden können. Gäbe der Detektor bei einem Fehler einfach `[]` zurück, würde daraus fälschlich „0 stuck = ok" — und der Bestandstest „error-Status bei DB-Fehler der profiles-Query" bricht.

- [ ] **Step 1: Test-Datei schreiben (schlägt fehl, Modul existiert noch nicht)**

Create `src/lib/partner/__tests__/stuck-accounts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findStuckPartnerAccounts, EXTERNE_PARTNER_ROLLEN } from '../stuck-accounts'

type Prof = {
  id: string
  email: string | null
  rolle: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  created_at: string | null
}

// Mock: profiles-Query ist chainbar (select/eq/in/lt -> selbes Objekt, am Ende thenable)
// PLUS auth.admin.getUserById fuer den Login-Status. loginAt bildet id -> last_sign_in_at ab;
// fehlt eine id, gilt sie als NIE eingeloggt.
function mockAdmin(opts: {
  profiles?: Prof[] | null
  profilesError?: { message: string } | null
  loginAt?: Record<string, string | null>
  getUserByIdError?: { message: string } | null
}): SupabaseClient {
  const p = Promise.resolve({ data: opts.profiles ?? null, error: opts.profilesError ?? null })
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'lt']) chain[m] = () => chain
  chain.then = p.then.bind(p)
  chain.catch = p.catch.bind(p)
  chain.finally = p.finally.bind(p)
  return {
    from: () => chain,
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, last_sign_in_at: opts.loginAt?.[id] ?? null } },
          error: opts.getUserByIdError ?? null,
        }),
      },
    },
  } as unknown as SupabaseClient
}

const P = (id: string, rolle: string, email: string | null = `${id}@extern.de`): Prof => ({
  id,
  email,
  rolle,
  vorname: `Firma ${id}`,
  nachname: null,
  telefon: `+4917000000${id}`,
  created_at: '2026-06-01T00:00:00Z',
})

describe('findStuckPartnerAccounts', () => {
  it('liefert nie-eingeloggte Partner inkl. Kontaktdaten', async () => {
    const res = await findStuckPartnerAccounts(mockAdmin({ profiles: [P('a', 'werkstatt', 'w@extern.de')] }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner).toHaveLength(1)
    expect(res.partner[0]).toMatchObject({
      userId: 'a',
      email: 'w@extern.de',
      rolle: 'werkstatt',
      telefon: '+4917000000a',
      seit: '2026-06-01T00:00:00Z',
      name: 'Firma a',
    })
  })

  it('schliesst bereits eingeloggte Kandidaten aus', async () => {
    const res = await findStuckPartnerAccounts(
      mockAdmin({ profiles: [P('a', 'werkstatt'), P('b', 'makler')], loginAt: { b: '2026-06-05T10:00:00Z' } }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner.map((x) => x.userId)).toEqual(['a'])
  })

  it('schliesst interne/Test-Identitaeten aus (istInterneEmail)', async () => {
    const res = await findStuckPartnerAccounts(
      mockAdmin({
        profiles: [
          P('intern', 'kundenbetreuer', 'kb@claimondo.de'),
          P('smoke', 'werkstatt', 'smoke-x@claimondo.test'),
          P('echt', 'werkstatt', 'info@echte-werkstatt.de'),
        ],
      }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner.map((x) => x.userId)).toEqual(['echt'])
  })

  it('getUserById-Fehler -> Kandidat defensiv ueberspringen (kein Fehlalarm)', async () => {
    const res = await findStuckPartnerAccounts(
      mockAdmin({ profiles: [P('a', 'werkstatt')], getUserByIdError: { message: 'auth down' } }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.partner).toEqual([])
  })

  it('DB-Fehler -> ok:false mit Meldung (kein throw, kein stilles Leer)', async () => {
    const res = await findStuckPartnerAccounts(mockAdmin({ profiles: null, profilesError: { message: 'boom' } }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('boom')
  })

  it('EXTERNE_PARTNER_ROLLEN enthaelt kundenbetreuer NICHT', () => {
    expect(EXTERNE_PARTNER_ROLLEN).toEqual(['werkstatt', 'makler', 'sachverstaendiger'])
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/partner/__tests__/stuck-accounts.test.ts`
Expected: FAIL — `Failed to resolve import "../stuck-accounts"`.

- [ ] **Step 3: Detektor implementieren**

Create `src/lib/partner/stuck-accounts.ts`:

```ts
// Geteilter Detektor fuer "tote" Partner-Accounts: angelegt, Zugangs-Mail ist raus,
// aber der Partner hat sich NIE eingeloggt (force_password_change steht noch).
//
// Zwei Consumer mit verschiedenen Zwecken teilen sich GENAU EINE Query-Logik:
//   - Health-Check  stuck-partner-accounts        -> BEOBACHTET (crit-Metrik /admin/health)
//   - Cron          partner-aktivierung-nachfassen -> HANDELT   (Vertriebs-Task je Partner)
//
// Result-Object statt nacktem Array: der Health-Check muss einen DB-Fehler als
// status='error' melden koennen — ein leeres Array waere faelschlich "0 stuck = ok".
import type { SupabaseClient } from '@supabase/supabase-js'
import { istInterneEmail } from '@/lib/testdaten/interne-identitaet'

export type StuckPartner = {
  userId: string
  email: string
  rolle: string
  /** [vorname, nachname] gejoint. profiles.vorname traegt bei werkstatt/makler die FIRMA
   *  (nachname null), bei sachverstaendiger den Vornamen. */
  name: string | null
  telefon: string | null
  /** profiles.created_at (ISO) */
  seit: string
}

export type StuckPartnerResult =
  | { ok: true; partner: StuckPartner[] }
  | { ok: false; error: string }

/** Externe Partner-Rollen (Cron-Default). kundenbetreuer = internes Personal -> kein Vertriebs-Task. */
export const EXTERNE_PARTNER_ROLLEN: string[] = ['werkstatt', 'makler', 'sachverstaendiger']

const DEFAULT_ALTER_TAGE = 7

type ProfRow = {
  id: string
  email: string | null
  rolle: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  created_at: string | null
}

export async function findStuckPartnerAccounts(
  admin: SupabaseClient,
  opts?: { rollen?: string[]; alterTage?: number },
): Promise<StuckPartnerResult> {
  const rollen = opts?.rollen ?? EXTERNE_PARTNER_ROLLEN
  const alterTage = opts?.alterTage ?? DEFAULT_ALTER_TAGE
  const cutoff = new Date(Date.now() - alterTage * 24 * 3600 * 1000).toISOString()

  const { data, error } = await admin
    .from('profiles')
    .select('id, email, rolle, vorname, nachname, telefon, created_at')
    .eq('force_password_change', true)
    .in('rolle', rollen)
    .lt('created_at', cutoff)

  if (error) return { ok: false, error: error.message }

  // Interne/Test-Identitaeten raus (SSoT-Helper): Firmendomain @claimondo.de/.test,
  // example.*, lex-drive.com + test/smoke/e2e-Wortmarker. Verhindert Vertriebs-Tasks
  // auf eigene Accounts (z.B. kb@claimondo.de) und auf Smoke-Fixtures.
  const kandidaten = ((data ?? []) as ProfRow[]).filter((p) => !istInterneEmail(p.email))

  // Nur wer sich NIE eingeloggt hat. getUserById-Fehler -> Kandidat ueberspringen
  // (defensiv: lieber unter- als uebermelden, kein Fehlalarm).
  const partner: StuckPartner[] = []
  for (const p of kandidaten) {
    const { data: udata, error: uErr } = await admin.auth.admin.getUserById(p.id)
    if (uErr) continue
    if (udata?.user && !udata.user.last_sign_in_at) {
      partner.push({
        userId: p.id,
        email: p.email ?? '',
        rolle: p.rolle,
        name: [p.vorname, p.nachname].filter(Boolean).join(' ') || null,
        telefon: p.telefon,
        seit: p.created_at ?? '',
      })
    }
  }

  return { ok: true, partner }
}
```

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run: `npx vitest run src/lib/partner/__tests__/stuck-accounts.test.ts`
Expected: PASS — `Tests  6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/partner/stuck-accounts.ts src/lib/partner/__tests__/stuck-accounts.test.ts
git commit -F - <<'EOF'
feat(partner): geteilter Detektor findStuckPartnerAccounts

Kapselt "welcher Partner-Account ist tot?" (>N Tage alt, force_password_change,
NIE eingeloggt) an EINER Stelle. Zwei Consumer folgen: der Health-Check
stuck-partner-accounts (beobachtet) und der neue Nachfass-Cron (handelt).

Filtert interne/Test-Identitaeten ueber den SSoT-Helper istInterneEmail
(@claimondo.de/.test, example.*, test/smoke/e2e-Marker) — verhindert
Vertriebs-Tasks auf eigene Accounts (kb@claimondo.de) und Smoke-Fixtures.

Result-Object statt nacktem Array, damit ein DB-Fehler nicht faelschlich als
"0 stuck = ok" durchrutscht (der Health-Check braucht seinen error-Status).

Audit:
- Build: vitest 6/6 gruen; tsc im Sammel-Gate (Task 4)
- UI: n/a (reine Lib)
- Redundanz: EINE Query-Logik statt Duplikat in Check + Cron (Sinn der Aenderung)
- Dead-Code: keiner
- Spec: docs/superpowers/specs/2026-07-20-partner-aktivierungs-nudge-design.md
- Inkonsistenz: nutzt bestehenden istInterneEmail-SSoT; Umlaute n/a (Backend)
- Regression: neues File, noch kein Consumer umgestellt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Health-Check auf den Detektor umstellen

**Files:**
- Modify: `src/lib/health/checks/stuck-partner-accounts.ts` (ersetzt die eigene Query komplett)
- Modify: `src/lib/health/checks/__tests__/stuck-partner-accounts.test.ts` (ein Test kommt dazu)

**Interfaces:**
- Consumes: `findStuckPartnerAccounts`, `StuckPartnerResult` aus Task 1.
- Produces: unveränderte `HealthCheck`-Schnittstelle (`stuckPartnerAccountsCheck`, Export `PARTNER_ROLLEN` bleibt — der Enum-Integritäts-Test hängt daran).

**Verhaltens-Delta (gewollt):** Interne/Test-Identitäten fallen jetzt raus → prod-Metrik **12 → 11** (`kb@claimondo.de` zählt nicht mehr). Schwellen, Detail-Text und `sampleIds` bleiben identisch.

- [ ] **Step 1: Neuen Test in die Bestandsdatei einfügen**

In `src/lib/health/checks/__tests__/stuck-partner-accounts.test.ts`, **nach** dem Test `'getUserById-Fehler fuer einen Kandidaten -> defensiv NICHT flaggen (kein Fehlalarm)'` (vor der schließenden `})` des `describe('stuckPartnerAccountsCheck')`) einfügen:

```ts
  it('schliesst interne/Test-Identitaeten aus (kb@claimondo.de zaehlt nicht als stuck)', async () => {
    const profiles = [P('kb', 'kundenbetreuer', 'kb@claimondo.de'), P('w', 'werkstatt', 'info@echte-werkstatt.de')]
    const res = await stuckPartnerAccountsCheck.run(mockCtx({ profiles }))
    expect(res.metric).toBe(1)
    expect(res.sampleIds).toEqual(['info@echte-werkstatt.de'])
  })
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/health/checks/__tests__/stuck-partner-accounts.test.ts`
Expected: FAIL im neuen Test — `expected 2 to be 1` (der alte Check filtert nur `@claimondo.test`, nicht `@claimondo.de`).

- [ ] **Step 3: Check auf den Detektor umstellen**

Replace the **entire** content of `src/lib/health/checks/stuck-partner-accounts.ts` with:

```ts
// Health-Check: Stuck-Partner-Accounts
// Erkennt Partner-Accounts, die seit >7 Tagen auf force_password_change=true stehen
// UND sich noch NIE eingeloggt haben — der Erst-Login wurde nie vollzogen. Moegliche
// Ursache: die Zugangs-/Willkommens-Mail kam nicht an oder der Partner hat sie nicht
// bearbeitet (Werkstatt-Incident 02.07.). Ohne den Check verrotten solche Geist-Accounts still.
//
// Die Erkennungs-Logik liegt im geteilten Detektor src/lib/partner/stuck-accounts.ts —
// derselbe, den der Cron partner-aktivierung-nachfassen nutzt. Dieser Check BEOBACHTET
// nur (Metrik/Alert); das Handeln (Vertriebs-Task) macht der Cron. Interne/Test-
// Identitaeten filtert der Detektor via istInterneEmail heraus.
//
// Kunden (rolle='kunde') sind BEWUSST ausgeschlossen: die greifen ueber Flow-/Magic-Links
// zu, force_password_change=true ist dort erwartet + harmlos.
// Read-only; braucht den service_role-Client (auth.admin.getUserById im Detektor).

import type { HealthCheck, CheckResult } from '@/lib/health/types'
import { findStuckPartnerAccounts } from '@/lib/partner/stuck-accounts'

// Rollen mit Passwort-Portal-Login (Kunde nutzt Magic-Link -> ausgeschlossen;
// admin/dispatch werden anders angelegt). MUSS ausschliesslich gueltige user_role-
// Enum-Werte enthalten — ein unbekannter Wert laesst Postgres die GESAMTE .in()-Query
// mit "invalid input value for enum user_role" abweisen (der Check erroret dann still).
// Exportiert fuer den Enum-Integritaets-Test.
export const PARTNER_ROLLEN: string[] = [
  'werkstatt',
  'sachverstaendiger',
  'makler',
  'kundenbetreuer',
]
const STUCK_ALTER_TAGE = 7
const CRIT_AB = 5

export const stuckPartnerAccountsCheck: HealthCheck = {
  id: 'stuck-partner-accounts',
  category: 'funnel',
  title: 'Partner ohne Erst-Login (force_password_change)',

  async run(ctx): Promise<CheckResult> {
    const res = await findStuckPartnerAccounts(ctx.supabase, {
      rollen: PARTNER_ROLLEN,
      alterTage: STUCK_ALTER_TAGE,
    })
    if (!res.ok) {
      return { status: 'error', detail: `DB-Fehler beim Prüfen der Partner-Accounts: ${res.error}` }
    }

    const rows = res.partner
    const n = rows.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: 'Keine Partner hängen im Erst-Login (>7 Tage, nie eingeloggt, force_password_change=true).',
      }
    }

    const byRolle: Record<string, number> = {}
    for (const r of rows) byRolle[r.rolle] = (byRolle[r.rolle] ?? 0) + 1
    const breakdown = Object.entries(byRolle)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v}× ${k}`)
      .join(', ')

    const status = n >= CRIT_AB ? 'crit' : 'warn'
    return {
      status,
      metric: n,
      detail: `${n} Partner-Account(s) >7 Tage ohne Erst-Login (nie eingeloggt, force_password_change=true): ${breakdown} — Aktivierung nachfassen, Zugangs-Mail ggf. erneut senden`,
      sampleIds: rows.slice(0, 5).map((r) => r.email || r.userId),
    }
  },
}
```

- [ ] **Step 4: Tests laufen lassen — alle grün**

Run: `npx vitest run src/lib/health/checks/__tests__/stuck-partner-accounts.test.ts`
Expected: PASS — `Tests  9 passed (9)` (8 Bestandstests + der neue).

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/checks/stuck-partner-accounts.ts src/lib/health/checks/__tests__/stuck-partner-accounts.test.ts
git commit -F - <<'EOF'
refactor(health): stuck-partner-accounts nutzt den geteilten Detektor

Der Check hatte seine Erkennungs-Query inline; der neue Nachfass-Cron braucht
exakt dieselbe. Statt zu duplizieren nutzt der Check jetzt
findStuckPartnerAccounts (src/lib/partner/stuck-accounts.ts). Der Check
BEOBACHTET weiterhin nur — das Handeln uebernimmt der Cron.

Verhaltens-Delta (gewollt): der Detektor filtert interne/Test-Identitaeten via
istInterneEmail statt nur '%@claimondo.test'. Damit faellt kb@claimondo.de aus
der Metrik -> prod 12 -> 11. Schwellen, Detail-Text und sampleIds unveraendert.

Audit:
- Build: vitest 9/9 gruen (8 Bestand + 1 neu); tsc im Sammel-Gate (Task 4)
- UI: n/a (Health-Check, Anzeige unveraendert auf /admin/health)
- Redundanz: Query-Duplikat vermieden (Sinn der Aenderung)
- Dead-Code: die inline-Query + der engere not-ilike-Filter sind entfernt
- Spec: Verhaltens-Delta 12->11 ist in der Spec dokumentiert und Aaron-approved
- Inkonsistenz: PARTNER_ROLLEN-Export + Enum-Integritaets-Test bleiben erhalten
- Regression: alle 8 Bestandstests unveraendert gruen; einziger Consumer ist ALL_CHECKS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: Cron `partner-aktivierung-nachfassen`

**Files:**
- Create: `src/app/api/cron/partner-aktivierung-nachfassen/route.ts`
- Test: `src/app/api/cron/partner-aktivierung-nachfassen/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `findStuckPartnerAccounts` (Task 1); `assertCronAuth` aus `@/lib/auth/cron-auth`; `createAdminClient` aus `@/lib/supabase/admin`; `createLinkedTask` aus `@/lib/tasks/create-task`.
- Produces: `GET(request: Request)` → `NextResponse` mit `{ geprueft, tasks_erstellt, tasks_geschlossen, uebersprungen_cap }`.

- [ ] **Step 1: Test-Datei schreiben (schlägt fehl, Route existiert noch nicht)**

Create `src/app/api/cron/partner-aktivierung-nachfassen/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  assertCronAuth: vi.fn(() => true),
  createLinkedTask: vi.fn(async () => ({ task_id: 't-neu' })),
  findStuckPartnerAccounts: vi.fn(),
  adminState: {
    vorhandeneCodes: [] as string[],
    offeneTasks: [] as Array<{ id: string; task_code: string }>,
    loginAt: {} as Record<string, string | null>,
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  },
}))

vi.mock('@/lib/auth/cron-auth', () => ({ assertCronAuth: h.assertCronAuth }))
vi.mock('@/lib/tasks/create-task', () => ({ createLinkedTask: h.createLinkedTask }))
vi.mock('@/lib/partner/stuck-accounts', () => ({ findStuckPartnerAccounts: h.findStuckPartnerAccounts }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const st = { istOffeneQuery: false, code: '' }
      const q: Record<string, unknown> = {}
      q.select = (cols: string) => {
        st.istOffeneQuery = cols.includes('task_code')
        return q
      }
      q.eq = (col: string, val: string) => {
        if (col === 'task_code') st.code = val
        return q
      }
      q.like = () => q
      q.limit = () =>
        Promise.resolve({
          data: st.istOffeneQuery
            ? h.adminState.offeneTasks
            : h.adminState.vorhandeneCodes.includes(st.code)
              ? [{ id: 'vorhanden' }]
              : [],
          error: null,
        })
      q.update = (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          h.adminState.updates.push({ id, patch })
          return Promise.resolve({ error: null })
        },
      })
      return q
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, last_sign_in_at: h.adminState.loginAt[id] ?? null } },
          error: null,
        }),
      },
    },
  }),
}))

const P = (userId: string) => ({
  userId,
  email: `${userId}@extern.de`,
  rolle: 'werkstatt',
  name: `Firma ${userId}`,
  telefon: `+4917000000${userId}`,
  seit: '2026-06-01T00:00:00Z',
})

async function callGET() {
  const { GET } = await import('../route')
  return GET(new Request('https://app.claimondo.de/api/cron/partner-aktivierung-nachfassen'))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  h.assertCronAuth.mockReturnValue(true)
  h.createLinkedTask.mockResolvedValue({ task_id: 't-neu' })
  h.adminState.vorhandeneCodes = []
  h.adminState.offeneTasks = []
  h.adminState.loginAt = {}
  h.adminState.updates = []
})

describe('cron partner-aktivierung-nachfassen', () => {
  it('401 ohne Cron-Auth', async () => {
    h.assertCronAuth.mockReturnValue(false)
    const res = await callGET()
    expect(res.status).toBe(401)
    expect(h.createLinkedTask).not.toHaveBeenCalled()
  })

  it('erzeugt pro totem Partner einen Admin-Task mit task_code und OHNE entity_type', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [P('u1')] })
    const res = await callGET()
    const body = await res.json()
    expect(body).toMatchObject({ geprueft: 1, tasks_erstellt: 1, uebersprungen_cap: 0 })
    expect(h.createLinkedTask).toHaveBeenCalledTimes(1)
    const arg = h.createLinkedTask.mock.calls[0][0] as Record<string, unknown>
    expect(arg.task_code).toBe('partner-aktivierung:u1')
    expect(arg.empfaenger_rolle).toBe('admin')
    expect(arg.prioritaet).toBe('normal')
    expect(arg.entity_type).toBeUndefined()
    expect(arg.entity_id).toBeUndefined()
    expect(String(arg.titel)).toContain('Firma u1')
    expect(String(arg.beschreibung)).toContain('+4917000000u1')
  })

  it('kein zweiter Task wenn der task_code schon existiert — auch wenn erledigt (kein Nag-Loop)', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [P('u1')] })
    h.adminState.vorhandeneCodes = ['partner-aktivierung:u1']
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_erstellt).toBe(0)
    expect(h.createLinkedTask).not.toHaveBeenCalled()
  })

  it('Safety-Cap: hoechstens 25 Tasks pro Lauf, Rest als uebersprungen_cap gemeldet', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({
      ok: true,
      partner: Array.from({ length: 30 }, (_, i) => P(`u${i}`)),
    })
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_erstellt).toBe(25)
    expect(body.uebersprungen_cap).toBe(5)
    expect(h.createLinkedTask).toHaveBeenCalledTimes(25)
  })

  it('Selbstheilung: schliesst offene Tasks, deren Partner sich inzwischen eingeloggt hat', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [] })
    h.adminState.offeneTasks = [{ id: 't9', task_code: 'partner-aktivierung:u9' }]
    h.adminState.loginAt = { u9: '2026-07-15T10:00:00Z' }
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_geschlossen).toBe(1)
    expect(h.adminState.updates).toEqual([{ id: 't9', patch: { status: 'erledigt' } }])
  })

  it('Selbstheilung laesst Tasks offen, deren Partner weiterhin nie eingeloggt ist', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [] })
    h.adminState.offeneTasks = [{ id: 't9', task_code: 'partner-aktivierung:u9' }]
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_geschlossen).toBe(0)
    expect(h.adminState.updates).toEqual([])
  })

  it('Detektor-Fehler -> 500, kein Task', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: false, error: 'boom' })
    const res = await callGET()
    expect(res.status).toBe(500)
    expect(h.createLinkedTask).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/app/api/cron/partner-aktivierung-nachfassen/__tests__/route.test.ts`
Expected: FAIL — `Failed to resolve import "../route"`.

- [ ] **Step 3: Route implementieren**

Create `src/app/api/cron/partner-aktivierung-nachfassen/route.ts`:

```ts
// Partner-Aktivierungs-Nachfassen: aus dem Monitoring-Befund wird eine nachverfolgbare
// Vertriebs-Aufgabe. Fuer jeden Partner-Account, der >7 Tage alt ist und sich NIE
// eingeloggt hat, entsteht EIN Admin-Task "anrufen" — dedupliziert und selbstheilend.
//
// Warum keine weitere Nudge-Mail: die Willkommens-Mail ging nachweislich raus
// (email_log status=sent, bei mehreren Werkstaetten sogar re-sent) und hat nicht
// konvertiert. Entscheidung Aaron 19.07.: sofort ein Mensch statt noch einer Mail.
//
// Erkennung liegt im geteilten Detektor (src/lib/partner/stuck-accounts.ts) — derselbe,
// den der Health-Check stuck-partner-accounts nutzt. Der Check beobachtet, dieser Cron handelt.
//
// Schedule (VPS-crontab, NICHT vercel.json — das existiert in diesem Repo nicht):
//   0 7 * * *  cron-call.sh /api/cron/partner-aktivierung-nachfassen
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { findStuckPartnerAccounts } from '@/lib/partner/stuck-accounts'

export const dynamic = 'force-dynamic'

/** Ein Detektor-Fehler darf nicht hunderte Vertriebs-Tasks fluten. Ueberhang wird gemeldet. */
const MAX_TASKS_PRO_LAUF = 25
const CODE_PREFIX = 'partner-aktivierung:'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const res = await findStuckPartnerAccounts(admin)
  if (!res.ok) {
    console.error('[cron/partner-aktivierung-nachfassen] Detektor fehlgeschlagen:', res.error)
    return NextResponse.json({ error: res.error }, { status: 500 })
  }
  const stuck = res.partner

  // ── A) Tasks erzeugen (dedupliziert, gedeckelt) ─────────────────────────────
  let tasksErstellt = 0
  let uebersprungenCap = 0

  for (const p of stuck) {
    if (tasksErstellt >= MAX_TASKS_PRO_LAUF) {
      uebersprungenCap++
      continue
    }
    try {
      const code = `${CODE_PREFIX}${p.userId}`
      // Dedupe ueber ALLE Status (auch 'erledigt'): ein Partner bekommt genau EINEN
      // Anruf-Task, jemals. Sonst Nag-Loop — der Vertrieb schliesst den Task, der
      // Partner ist immer noch tot, und der naechste Lauf legt sofort neu an.
      const { data: vorhanden } = await admin.from('tasks').select('id').eq('task_code', code).limit(1)
      if (vorhanden && vorhanden.length > 0) continue

      const kontakt = [p.telefon ? `Telefon: ${p.telefon}` : null, `E-Mail: ${p.email}`]
        .filter(Boolean)
        .join(' · ')

      await createLinkedTask({
        titel: `Partner aktivieren: ${p.name ?? p.email} (${p.rolle})`,
        beschreibung:
          `${kontakt}\n\n` +
          `Angelegt am ${p.seit.slice(0, 10)}, hat sich seitdem NIE eingeloggt. ` +
          `Die Zugangs-/Willkommens-Mail wurde bereits versendet und hat nicht ` +
          `konvertiert — bitte telefonisch nachfassen und die Aktivierung begleiten.`,
        prioritaet: 'normal',
        empfaenger_rolle: 'admin',
        typ: 'partner_aktivierung',
        task_code: code,
        trigger_event: 'partner_ohne_erstlogin',
        // KEIN entity_type/entity_id: der tasks_entity_type-CHECK kennt kein 'partner'
        // -> Postgres wuerde die Zeile still verwerfen.
      })
      tasksErstellt++
    } catch (err) {
      // Fehler pro Item -> weiter, nie throw (Cron-Hausmuster, s. gegner-invite-nachfassen)
      console.error('[cron/partner-aktivierung-nachfassen] Partner', p.userId, 'fehlgeschlagen:', err)
      continue
    }
  }

  if (uebersprungenCap > 0) {
    console.warn(
      `[cron/partner-aktivierung-nachfassen] Cap ${MAX_TASKS_PRO_LAUF} erreicht — ${uebersprungenCap} Partner uebersprungen`,
    )
  }

  // ── B) Selbstheilung: Tasks schliessen, deren Partner sich eingeloggt hat ────
  // Der generische autoCompleteTask-Resolver greift hier nicht (er arbeitet ueber
  // entity_type/entity_id, die wir mangels 'partner'-CHECK-Wert nicht setzen koennen).
  let tasksGeschlossen = 0
  const { data: offene } = await admin
    .from('tasks')
    .select('id, task_code')
    .like('task_code', `${CODE_PREFIX}%`)
    .eq('status', 'offen')
    .limit(500)

  for (const t of (offene ?? []) as Array<{ id: string; task_code: string }>) {
    try {
      const userId = t.task_code.slice(CODE_PREFIX.length)
      const { data: udata, error: uErr } = await admin.auth.admin.getUserById(userId)
      if (uErr || !udata?.user?.last_sign_in_at) continue
      await admin.from('tasks').update({ status: 'erledigt' }).eq('id', t.id)
      tasksGeschlossen++
    } catch (err) {
      console.error('[cron/partner-aktivierung-nachfassen] Task', t.id, 'schliessen fehlgeschlagen:', err)
      continue
    }
  }

  return NextResponse.json({
    geprueft: stuck.length,
    tasks_erstellt: tasksErstellt,
    tasks_geschlossen: tasksGeschlossen,
    uebersprungen_cap: uebersprungenCap,
  })
}
```

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run: `npx vitest run src/app/api/cron/partner-aktivierung-nachfassen/__tests__/route.test.ts`
Expected: PASS — `Tests  7 passed (7)`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/partner-aktivierung-nachfassen
git commit -F - <<'EOF'
feat(cron): partner-aktivierung-nachfassen — Anruf-Task je totem Partner

Macht aus dem Health-Befund "Partner nie eingeloggt" eine nachverfolgbare
Vertriebs-Aufgabe: pro totem Partner (>7 Tage, force_password_change, nie
eingeloggt) EIN Admin-Task mit Kontaktdaten und Handlungsanweisung.

Dedupe ueber task_code und ueber ALLE Status: ein Partner bekommt genau EINEN
Anruf-Task, jemals. Wuerde nur auf 'offen' geprueft, entstuende ein Nag-Loop —
Vertrieb schliesst den Task, der Partner ist weiter tot, der naechste Lauf legt
sofort neu an.

entity_type/entity_id bleiben bewusst NULL: der tasks_entity_type-CHECK kennt
kein 'partner'; ein Wert ausserhalb der Liste wuerde von Postgres STILL
verworfen (Silent-Fail-Klasse). Deshalb schliesst der Cron seine Tasks selbst
(Selbstheilung), statt sich auf den entity-basierten autoCompleteTask-Resolver
zu verlassen.

Safety-Cap 25/Lauf mit uebersprungen_cap im Summary (kein stilles Abschneiden).

Audit:
- Build: vitest 7/7 gruen; tsc + Ratchets im Sammel-Gate (Task 4)
- UI: Tasks erscheinen in /admin/aufgaben (bestehendes Surface, kein neues UI noetig)
- Redundanz: nutzt den geteilten Detektor + createLinkedTask, keine neue Query/Task-Logik
- Dead-Code: keiner
- Spec: docs/superpowers/specs/2026-07-20-partner-aktivierungs-nudge-design.md
- Inkonsistenz: prioritaet/status/entity_type gegen die echten CHECKs verifiziert; Task-Texte mit echten Umlauten (nutzersichtbar)
- Regression: neue Route, keine bestehende beruehrt; Cron laeuft erst nach VPS-crontab-Eintrag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 4: Gates, PR und Regel-4-Smoke-Plan

**Files:** keine Code-Änderung — Verifikation + PR.

**Interfaces:** Consumes: alles aus Task 1-3.

- [ ] **Step 1: Volle Test-Suite der berührten Bereiche**

Run:
```bash
npx vitest run src/lib/partner src/lib/health/checks/__tests__/stuck-partner-accounts.test.ts src/app/api/cron/partner-aktivierung-nachfassen
```
Expected: PASS — 22 Tests (6 Detektor + 9 Health-Check + 7 Cron).

- [ ] **Step 2: Ratchets**

Run:
```bash
npm run check:server-actions --silent && npm run check:use-server-exports --silent && npm run check:knip --silent -- --ratchet && npm run check:flag-drift --silent -- --ratchet
```
Expected: keine NEUEN Verletzer. Der flag-drift-Ratchet ist hier besonders relevant — er würde ein CHECK-invalides Status-Literal fangen (wir nutzen bewusst nur `offen`/`erledigt` und `normal`).

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine Fehler in den drei neuen/geänderten Dateien. (Hinweis: der volle `next build` schlägt in diesem Worktree an der node_modules-Junction fehl — Turbopack lehnt den Symlink ab. **CI ist die autoritative Build-Instanz.**)

- [ ] **Step 4: Push + PR gegen staging**

```bash
git push -u origin kitta/partner-aktivierungs-nudge
gh pr create --base staging --head kitta/partner-aktivierungs-nudge \
  --title "feat(cron): Partner-Aktivierungs-Nudge — Anruf-Task je totem Partner-Account" \
  --body-file <(cat <<'EOF'
## Problem
Der Health-Check `stuck-partner-accounts` meldet dauerhaft crit: Partner-Accounts >7 Tage alt, `force_password_change=true`, **nie eingeloggt** (aktuell 12). Root-Cause-Analyse (19.07., email_log-verifiziert): **kein Code-Bug** — alle 11 realen Werkstätten haben ihre `willkommen_werkstatt`-Mail bekommen (`status=sent`, 3 sogar re-sent) und trotzdem nicht aktiviert. Der Check macht die toten Accounts nur **sichtbar**, er **heilt** sie nicht.

## Lösung
Ein Cron macht daraus **pro totem Partner eine nachverfolgbare Vertriebs-Aufgabe** — dedupliziert und selbstheilend.

- **`src/lib/partner/stuck-accounts.ts` (neu):** geteilter Detektor `findStuckPartnerAccounts`. Filtert interne/Test-Identitäten über den SSoT-Helper `istInterneEmail`.
- **`stuck-partner-accounts.ts` (refactor):** Health-Check nutzt den Detektor. **Verhaltens-Delta:** metric **12 → 11** (`kb@claimondo.de` ist intern).
- **`/api/cron/partner-aktivierung-nachfassen` (neu):** Admin-Task je Partner (Kontakt + Handlungsanweisung), Dedupe via `task_code`, Selbstheilung, Safety-Cap 25.

## Zwei Fallen, die der Plan bewusst umgeht
1. **`tasks.entity_type` CHECK kennt kein `partner`** → `entity_type` bleibt NULL, sonst hätte Postgres die Zeile **still verworfen**. Deshalb schließt der Cron seine Tasks selbst statt über den entity-basierten Resolver.
2. **Nag-Loop:** Dedupe prüft **alle** Status, nicht nur `offen` — sonst legt der nächste Lauf sofort neu an, sobald ein Mensch den Task schließt.

## Tests
22 vitest-Tests (6 Detektor, 9 Health-Check inkl. Bestand, 7 Cron).

## Nach dem Merge/Deploy
- **VPS-crontab (Aaron):** `0 7 * * * cron-call.sh /api/cron/partner-aktivierung-nachfassen`
- **Regel-4-Smoke:** s. PR-Kommentar / Plan Task 4 Step 5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

- [ ] **Step 5: Regel-4-Prod-Smoke dokumentieren (Ausführung nach Deploy)**

Der Smoke gehört in den PR bzw. den Marker und läuft **nach** dem Prod-Deploy:

1. Cron einmal manuell triggern:
   `curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/partner-aktivierung-nachfassen`
   Erwartet: `{"geprueft":11,"tasks_erstellt":11,"tasks_geschlossen":0,"uebersprungen_cap":0}` (± aktuelle Kohortengröße).
2. Playwright/UI: als Admin einloggen → `/admin/aufgaben` → ein Task „Partner aktivieren: … (werkstatt)" ist sichtbar und trägt Telefonnummer + E-Mail.
3. **Dedupe-Beweis:** Cron ein zweites Mal triggern → `tasks_erstellt: 0`.
4. `/admin/health` prüfen: `stuck-partner-accounts` zeigt jetzt **11** (nicht 12) — der Intern-Filter greift.
5. Aufräumen: die im Smoke erzeugten Tasks sind **echte** Vertriebs-Aufgaben für echte Partner — **nicht löschen**, sie sind das gewünschte Ergebnis. (Falls doch nur getestet werden soll: vorher gegen einen Wegwerf-Partner testen.)

---

## Self-Review (durchgeführt)

**1. Spec-Abdeckung:** Detektor + istInterneEmail-Filter → Task 1 · Health-Check-Refactor inkl. 12→11 → Task 2 · Cron mit Dedupe/Cap/Selbstheilung/entity_type-NULL → Task 3 · Crontab + Regel-4-Smoke → Task 4. Keine Lücke.

**2. Platzhalter:** keine — jeder Code-Schritt enthält vollständigen Code, jeder Run-Schritt einen exakten Befehl mit erwarteter Ausgabe.

**3. Typ-Konsistenz:** `StuckPartner`/`StuckPartnerResult`/`EXTERNE_PARTNER_ROLLEN`/`findStuckPartnerAccounts` sind in Task 1 definiert und in Task 2+3 exakt so verwendet. Der Cron-Test spiegelt die `StuckPartner`-Felder 1:1. Beide `tasks`-Queries enden auf `.limit()`, damit der Mock eine einzige, konsistente Auflösungsstelle hat.

**Präzisierung ggü. der Spec:** Die Spec beschrieb den Detektor als `Promise<StuckPartner[]>`. Der Plan nutzt ein **Result-Object** — sonst kann der Health-Check einen DB-Fehler nicht mehr als `status='error'` melden (der Bestandstest „error-Status bei DB-Fehler" bräche). Verhalten sonst identisch, „wirft nie" bleibt erfüllt.
