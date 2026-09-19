# Kunde kommt ohne Link in sein Konto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Reviews nur auf dem stärksten Modell (Aaron 04.09.).

**Goal:** Ein Kunde, der seinen FlowLink nie bekam oder verlor, kommt über `/login` mit Telefonnummer oder E-Mail in sein Konto, sieht dort seinen Schaden — auch einen halbfertigen — und kann ihn fortsetzen; unbekannte Kontakte erfahren nichts.

**Architecture:** Drei Erweiterungen an bestehenden Bausteinen, kein Umbau. (1) Eine Server-Action vor dem bestehenden OTP-Login legt für einen **bekannten** Kontakt (Lead oder Claim) das Konto an — Enumeration-sicher nach dem Muster von `requestPasswordReset`. (2) `claimFaelleByEmail` wird zu `claimFaelleByKontakt` (E-Mail **oder** Telefon-Suffix, Muster `match-fall.ts`). (3) Das Kunden-Portal zeigt Leads ohne Claim als Karte mit „Jetzt fortsetzen" → `ensureCanonicalFlowLinkForLead` → `/flow/[token]` (Muster `unterschrift/route.ts`). **Stufe 1 = dieser Plan:** Konto nur für Kontakte, deren Lead eine E-Mail trägt — weil `profiles.email` NOT NULL + UNIQUE ist (gemessen 19.09.). **Stufe 2 (eigener Plan):** `profiles.email` nullable + 26-Stellen-Sweep + Telefon-only-Konto + Kennzeichen-Schritt (A3).

**Tech Stack:** Next.js 16 App Router, `@supabase/ssr` (Server-Actions), Supabase Auth Admin-API (`createUser`, `generateLink`), vitest (Unit, `src/**/*.test.ts`), Playwright (Regel 4), react-email (`src/lib/email/google/templates`).

## Global Constraints

* Regel 1: Branch `kitta/kunde-login-ohne-link` (Basis `origin/main` `a306e09b5`, r497), PR gegen **`staging`**. Regel 4: Prod-Smoke nach Deploy (Task 10). Regel 5/6: Soll-Blatt `memory/abnahmen/2026-09-19-kunde-kommt-ohne-link-ins-konto.md` ist der Maßstab; Abweichungen dort eintragen, nie das Blatt anpassen.
* **Keine Migration in Stufe 1** (Annahme A2 gilt für alles außer Telefon-only). Sollte eine nötig werden → `apply_migration`, Version ablesen, Datei = Version, im selben PR (L4).
* Enumeration-Schutz ist hart: **jede** Antwort der Login-Actions an den Client ist `{ ok: true }` mit demselben Satz — unabhängig davon, ob ein Vorgang existiert, ob gedrosselt wurde, ob ein Fehler auftrat. Nur Server-Logs unterscheiden.
* Fail-closed: Ein Fehler beim Lead-Match, bei `createUser` oder beim Versand legt **kein** Konto an und schickt **nichts** — und antwortet trotzdem neutral.
* Writes auf `leads`/`claims`/`tasks` prüfen `error` (`check:silent-writes`, Baseline 0). Enum-Werte nur aus `scripts/lib/status-check-constraints.json`: `nachrichten.kanal ∈ {…,'system',…}`.
* Kein `'use server'`-File exportiert etwas anderes als `async function` (`check:use-server-exports`). Server-Actions liefern `{ ok, error? }`.
* Frontend-Texte mit echten Umlauten. Neue UI nutzt bestehende Klassen des LoginClient (Boy-Scout-Pflicht für `component-set` gilt nur für neue Komponenten → Task 7 nutzt `primitives`).
* Telefon-Normalisierung ausschließlich über `toE164` (`src/lib/format/telefon.ts`); Lead-Match über `leads.telefon_ziffern` mit **9-Ziffern-Suffix** (`match-fall.ts:38`), nie über `leads.telefon`.
* Kunde liest Leads **nur server-seitig** über `createAdminClient()` mit Guard auf `user.id`/Kontakt — `leads`-RLS hat keinen Kunden-Zweig und bekommt keinen.
* Smoke-Konten: `test-kunde+<stage>@claimondo.de` (`scripts/test-fixtures/ids.ts:53`), `ACCOUNTS.kunde = d63661dd-…`. Passwörter nie ins Repo.
* Supabase-Doku (verifiziert 19.09.): `auth.admin.createUser({ phone, phone_confirm: true })` ist dokumentiert; `verifyOtp` für SMS = `type: 'sms'`; OTP höchstens alle 60 s, gültig 1 h; `generateLink` verschickt nichts, liefert `properties.hashed_token`.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/lib/auth/lead-kontakt.ts` (neu) | **Reine** Suche: Kontakt → `{ leadIds, claimIds, leadEmail }`. Kein Auth, kein Write. |
| `src/lib/auth/lead-kontakt.test.ts` (neu) | Unit-Tests mit Admin-Mock. |
| `src/lib/kunde/auto-claim.ts` (ändern) | `claimFaelleByKontakt` (neu) + `claimFaelleByEmail` als Wrapper. |
| `src/lib/kunde/auto-claim.test.ts` (neu) | Unit-Tests. |
| `src/lib/email/google/templates/LoginLink.tsx` (neu) | react-email-Vorlage „Ihr Anmelde-Link". |
| `src/lib/email/google/flows.ts` (ändern) | `sendLoginLink({ to, vorname, actionUrl })`. |
| `src/app/login/bekannter-kontakt-actions.ts` (neu) | Server-Actions `bereiteTelefonLoginVor`, `sendeAnmeldeLinkPerEmail`. Enumeration-sicher. |
| `src/app/login/bekannter-kontakt-actions.test.ts` (neu) | Unit-Tests (Neutralität, Fail-closed, Kontoanlage). |
| `src/app/login/LoginClient.tsx` (ändern) | Telefon-Tab ruft die Action vor `signInWithOtp`; E-Mail-Tab bekommt „Anmelde-Link senden". |
| `src/app/kunde/layout.tsx` (ändern) | `claimFaelleByKontakt` mit `user.phone`. |
| `src/lib/kunde/offene-leads.ts` (neu) | Leads ohne Claim für den eingeloggten Kunden. |
| `src/lib/kunde/offene-leads.test.ts` (neu) | Unit-Tests. |
| `src/components/kunde/OffeneSchadenmeldungKarte.tsx` (neu) | Karte + Formular „Jetzt fortsetzen". |
| `src/app/kunde/offene-leads-actions.ts` (neu) | Server-Action `fortsetzeSchadenmeldung` → FlowLink → redirect. |
| `src/app/kunde/page.tsx` (ändern) | Karte(n) neben `KundeWillkommensHero`. |
| `src/lib/kunde/login-timeline.ts` (neu) | Timeline-Eintrag `kunde_selbst_angemeldet`. |
| `docs/fundament/journeys/j02-meldung-alle-kanaele.md` (ändern) | Journey-Delta Schritt 2b. |
| `docs/fundament/entry-points-flowlink.md` (ändern) | Eingang L-2. |
| `tests/e2e/flows/kunde-login-ohne-link-smoke.spec.ts` (neu) | Regel-4-Smoke (E-Mail-Weg voll, SMS-Weg skip mit Grund). |
| `scripts/smoke/kunde-login-ohne-link-seed.mjs` (neu) | Seed: Wegwerf-Lead mit E-Mail + Telefon, ohne Konto. |

---

### Task 1: Reine Kontakt-Suche `findeVorgaengeZuKontakt`

**Files:**
- Create: `src/lib/auth/lead-kontakt.ts`
- Test: `src/lib/auth/lead-kontakt.test.ts`

**Interfaces:**
- Consumes: `toE164` aus `@/lib/format/telefon`; `SupabaseClient` (Admin).
- Produces:
  ```ts
  export type KontaktEingabe = { telefon?: string | null; email?: string | null }
  export type VorgaengeZuKontakt = { leadIds: string[]; claimIds: string[]; leadEmail: string | null; leadVorname: string | null }
  export async function findeVorgaengeZuKontakt(admin: SupabaseClient, eingabe: KontaktEingabe): Promise<VorgaengeZuKontakt>
  export function telefonSuffix(raw: string | null | undefined): string | null   // 9 Ziffern, null wenn < 6
  ```

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/auth/lead-kontakt.test.ts
import { describe, it, expect, vi } from 'vitest'
import { findeVorgaengeZuKontakt, telefonSuffix } from './lead-kontakt'

function adminMock(opts: { leads?: Array<{ id: string; email: string | null; vorname: string | null }>; claims?: Array<{ id: string }> }) {
  const leads = opts.leads ?? []
  const claims = opts.claims ?? []
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'like', 'in', 'order', 'limit']) q[m] = vi.fn(() => q)
    ;(q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null })
    return q
  }
  const from = vi.fn((t: string) => (t === 'leads' ? chain(leads) : chain(claims)))
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('telefonSuffix', () => {
  it('liefert die letzten 9 Ziffern, unabhaengig vom Format', () => {
    expect(telefonSuffix('+49 177 5799941')).toBe('775799941')
    expect(telefonSuffix('01775799941')).toBe('775799941')
  })
  it('null bei zu kurzer Eingabe', () => {
    expect(telefonSuffix('12345')).toBeNull()
    expect(telefonSuffix('')).toBeNull()
  })
})

describe('findeVorgaengeZuKontakt', () => {
  it('leer ohne Eingabe, ohne DB-Aufruf', async () => {
    const admin = adminMock({})
    const r = await findeVorgaengeZuKontakt(admin, {})
    expect(r).toEqual({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    expect((admin as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })
  it('Telefon: findet Lead + Claim, liefert Lead-E-Mail fuer die Kontoanlage', async () => {
    const admin = adminMock({ leads: [{ id: 'L1', email: 'k@example.test', vorname: 'Kai' }], claims: [{ id: 'C1' }] })
    const r = await findeVorgaengeZuKontakt(admin, { telefon: '+49 177 5799941' })
    expect(r.leadIds).toEqual(['L1'])
    expect(r.claimIds).toEqual(['C1'])
    expect(r.leadEmail).toBe('k@example.test')
    expect(r.leadVorname).toBe('Kai')
  })
  it('E-Mail wird klein und getrimmt verglichen', async () => {
    const admin = adminMock({ leads: [{ id: 'L2', email: 'k@example.test', vorname: null }] })
    const r = await findeVorgaengeZuKontakt(admin, { email: '  K@Example.TEST ' })
    expect(r.leadIds).toEqual(['L2'])
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss rot sein**

Run: `npx vitest run src/lib/auth/lead-kontakt.test.ts`
Expected: FAIL — `Cannot find module './lead-kontakt'`

- [ ] **Step 3: Implementierung**

```ts
// src/lib/auth/lead-kontakt.ts
// Reine Suche "Kontakt -> Vorgaenge" fuer den Login ohne Link (Soll-Blatt
// 2026-09-19-kunde-kommt-ohne-link-ins-konto, 1c Weg 2 Schritt 3).
//
// Telefon wird NIE gegen leads.telefon verglichen, sondern gegen die generierte
// Nur-Ziffern-Spalte telefon_ziffern per 9-Ziffern-Suffix — dasselbe Muster wie
// match-fall.ts:38-53: die Spalte traegt beide Formate ('4917…' und '0177…'),
// Gleichheit wuerde die Haelfte verfehlen. Kein Write, kein Auth: der Aufrufer
// entscheidet, was mit dem Ergebnis passiert.
import type { SupabaseClient } from '@supabase/supabase-js'

export type KontaktEingabe = { telefon?: string | null; email?: string | null }
export type VorgaengeZuKontakt = {
  leadIds: string[]
  claimIds: string[]
  /** E-Mail des juengsten passenden Leads — Stufe 1 braucht sie fuer profiles.email (NOT NULL). */
  leadEmail: string | null
  leadVorname: string | null
}

const MIN_ZIFFERN = 6
const SUFFIX_LAENGE = 9

export function telefonSuffix(raw: string | null | undefined): string | null {
  const ziffern = (raw ?? '').replace(/\D/g, '')
  if (ziffern.length < MIN_ZIFFERN) return null
  return ziffern.slice(-SUFFIX_LAENGE)
}

export async function findeVorgaengeZuKontakt(
  admin: SupabaseClient,
  eingabe: KontaktEingabe,
): Promise<VorgaengeZuKontakt> {
  const leer: VorgaengeZuKontakt = { leadIds: [], claimIds: [], leadEmail: null, leadVorname: null }
  const suffix = telefonSuffix(eingabe.telefon)
  const email = (eingabe.email ?? '').trim().toLowerCase() || null
  if (!suffix && !email) return leer

  let q = admin.from('leads').select('id, email, vorname')
  q = suffix ? q.like('telefon_ziffern', `%${suffix}%`) : q.eq('email', email as string)
  const { data: leads, error } = await q.order('created_at', { ascending: false }).limit(10)
  if (error) {
    console.error('[lead-kontakt] leads-Suche fehlgeschlagen:', error.message)
    return leer
  }
  const rows = (leads ?? []) as Array<{ id: string; email: string | null; vorname: string | null }>
  if (rows.length === 0) return leer

  const leadIds = rows.map((l) => l.id)
  const { data: claims, error: claimErr } = await admin.from('claims').select('id').in('lead_id', leadIds)
  if (claimErr) console.error('[lead-kontakt] claims-Suche fehlgeschlagen:', claimErr.message)

  const mitEmail = rows.find((l) => l.email && l.email.includes('@')) ?? rows[0]
  return {
    leadIds,
    claimIds: ((claims ?? []) as Array<{ id: string }>).map((c) => c.id),
    leadEmail: mitEmail.email ? mitEmail.email.trim().toLowerCase() : null,
    leadVorname: mitEmail.vorname ?? null,
  }
}
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run src/lib/auth/lead-kontakt.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/lead-kontakt.ts src/lib/auth/lead-kontakt.test.ts
git commit -m "feat(auth): reine Kontakt-Suche Lead/Claim per Telefon-Suffix oder E-Mail"
```

---

### Task 2: `claimFaelleByKontakt` — Zuordnung auch per Telefon

**Files:**
- Modify: `src/lib/kunde/auto-claim.ts`
- Test: `src/lib/kunde/auto-claim.test.ts`

**Interfaces:**
- Consumes: `findeVorgaengeZuKontakt` (Task 1).
- Produces:
  ```ts
  export async function claimFaelleByKontakt(admin: SupabaseClient, userId: string, kontakt: { email: string | null; telefon: string | null }): Promise<{ claimed: number }>
  export async function claimFaelleByEmail(admin, userId, userEmail): Promise<{ claimed: number }>   // bleibt, ruft claimFaelleByKontakt
  ```

- [ ] **Step 1: Failing test**

```ts
// src/lib/kunde/auto-claim.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const finde = vi.fn()
vi.mock('@/lib/auth/lead-kontakt', () => ({ findeVorgaengeZuKontakt: (...a: unknown[]) => finde(...a) }))

import { claimFaelleByKontakt, claimFaelleByEmail } from './auto-claim'

function adminMock(updatedIds: string[]) {
  const calls: Array<{ table: string; payload: unknown }> = []
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    q.update = vi.fn((p: unknown) => { calls.push({ table, payload: p }); return q })
    for (const m of ['in', 'is', 'eq']) q[m] = vi.fn(() => q)
    q.select = vi.fn(() => Promise.resolve({ data: updatedIds.map((id) => ({ id })), error: null }))
    ;(q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: null, error: null })
    return q
  }
  return { from: vi.fn((t: string) => chain(t)), calls } as unknown as import('@supabase/supabase-js').SupabaseClient & { calls: typeof calls }
}

beforeEach(() => finde.mockReset())

describe('claimFaelleByKontakt', () => {
  it('0 ohne Kontakt, ohne Suche', async () => {
    const admin = adminMock([])
    expect(await claimFaelleByKontakt(admin, 'U1', { email: null, telefon: null })).toEqual({ claimed: 0 })
    expect(finde).not.toHaveBeenCalled()
  })
  it('setzt geschaedigter_user_id auf allen Claims des Kontakts', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: ['C1', 'C2'], leadEmail: null, leadVorname: null })
    const admin = adminMock(['C1', 'C2'])
    const r = await claimFaelleByKontakt(admin, 'U1', { email: null, telefon: '+491775799941' })
    expect(r).toEqual({ claimed: 2 })
    expect(finde).toHaveBeenCalledWith(admin, { email: null, telefon: '+491775799941' })
    expect(admin.calls[0]).toEqual({ table: 'claims', payload: { geschaedigter_user_id: 'U1' } })
  })
  it('claimFaelleByEmail bleibt ein Wrapper (E-Mail-only)', async () => {
    finde.mockResolvedValue({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    const admin = adminMock([])
    await claimFaelleByEmail(admin, 'U1', 'k@example.test')
    expect(finde).toHaveBeenCalledWith(admin, { email: 'k@example.test', telefon: null })
  })
})
```

- [ ] **Step 2: Rot**

Run: `npx vitest run src/lib/kunde/auto-claim.test.ts`
Expected: FAIL — `claimFaelleByKontakt is not exported`

- [ ] **Step 3: Implementierung** — den Funktionskörper von `claimFaelleByEmail` in `claimFaelleByKontakt` verschieben; Lead-Suche durch Task 1 ersetzen:

```ts
// src/lib/kunde/auto-claim.ts — Kopfkommentar ergaenzen, dann:
import type { SupabaseClient } from '@supabase/supabase-js'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'

// Login ohne Link (19.09.2026): die Zuordnung kennt jetzt beide Kontaktachsen.
// Bisher nur leads.email — ein Kunde, der nur eine Nummer hinterlassen hat, sah
// selbst mit Konto einen leeren Vorgang. Telefon laeuft ueber den 9-Ziffern-Suffix
// (lead-kontakt.ts), nie ueber Gleichheit auf leads.telefon.
export async function claimFaelleByKontakt(
  admin: SupabaseClient,
  userId: string,
  kontakt: { email: string | null; telefon: string | null },
): Promise<{ claimed: number }> {
  if (!kontakt.email && !kontakt.telefon) return { claimed: 0 }

  const { claimIds } = await findeVorgaengeZuKontakt(admin, { email: kontakt.email, telefon: kontakt.telefon })
  if (claimIds.length === 0) return { claimed: 0 }

  // CMM-49: claims.geschaedigter_user_id ist der Ownership-SSoT. Additiv + idempotent (`is null`).
  const { data: claimedRows, error: claimErr } = await admin
    .from('claims')
    .update({ geschaedigter_user_id: userId })
    .in('id', claimIds)
    .is('geschaedigter_user_id', null)
    .select('id')
  if (claimErr) {
    console.warn('[claimFaelleByKontakt] claims.geschaedigter_user_id-Update fehlgeschlagen:', claimErr.message)
    return { claimed: 0 }
  }

  const { error: partyErr } = await admin
    .from('claim_parties')
    .update({ user_id: userId })
    .in('claim_id', claimIds)
    .eq('rolle', 'geschaedigter')
    .is('user_id', null)
  if (partyErr) console.warn('[claimFaelleByKontakt] claim_parties.user_id-Update:', partyErr.message)

  return { claimed: (claimedRows ?? []).length }
}

/** Bestehender Aufrufer-Vertrag (kunde/page.tsx, kunde/layout.tsx) — E-Mail-only. */
export async function claimFaelleByEmail(admin: SupabaseClient, userId: string, userEmail: string): Promise<{ claimed: number }> {
  if (!userEmail) return { claimed: 0 }
  return claimFaelleByKontakt(admin, userId, { email: userEmail, telefon: null })
}
```

- [ ] **Step 4: Grün** — `npx vitest run src/lib/kunde/auto-claim.test.ts` → PASS (3)
- [ ] **Step 5: Bestehende Aufrufer prüfen** — `grep -rn "claimFaelleByEmail" src/` → `kunde/page.tsx`, `kunde/layout.tsx` bleiben unverändert lauffähig.
- [ ] **Step 6: Commit** — `git commit -am "feat(kunde): claimFaelleByKontakt — Fall-Zuordnung auch per Telefon-Suffix"`

---

### Task 3: E-Mail-Vorlage + `sendLoginLink`

**Files:**
- Create: `src/lib/email/google/templates/LoginLink.tsx`
- Modify: `src/lib/email/google/flows.ts` (Export `sendLoginLink` neben `sendPasswortReset`)
- Test: `src/lib/email/google/templates/LoginLink.test.tsx`

**Interfaces:**
- Produces: `sendLoginLink({ to, vorname, actionUrl }): Promise<{ success: boolean; error?: string }>`; `email_log.template = 'login_link'`.

- [ ] **Step 1: Failing test**

```tsx
// src/lib/email/google/templates/LoginLink.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { LoginLinkEmail, subject } from './LoginLink'

describe('LoginLinkEmail', () => {
  it('Betreff nennt die Anmeldung, Link steht im Button', async () => {
    expect(subject({ vorname: 'Kai', actionUrl: 'https://x/y' })).toBe('Ihr Anmelde-Link für Claimondo')
    const html = await render(LoginLinkEmail({ vorname: 'Kai', actionUrl: 'https://app.claimondo.de/auth/bestaetigen?token_hash=abc' }))
    expect(html).toContain('Hallo Kai,')
    expect(html).toContain('token_hash=abc')
    expect(html).toContain('Jetzt anmelden')
  })
})
```

- [ ] **Step 2: Rot** — `npx vitest run src/lib/email/google/templates/LoginLink.test.tsx` → FAIL (Modul fehlt)

- [ ] **Step 3: Vorlage** (Muster `PasswortReset.tsx`)

```tsx
// src/lib/email/google/templates/LoginLink.tsx
// Token-Audit-Skip: react-email braucht Inline-Farben (kein Tailwind im Mail-Client).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'

type Props = { vorname: string | null; actionUrl: string }

export function subject(_p: Props): string {
  return 'Ihr Anmelde-Link für Claimondo'
}

export function LoginLinkEmail({ vorname, actionUrl }: Props) {
  const anrede = vorname ? `Hallo ${vorname},` : 'Hallo,'
  return (
    <EmailShell preview="Mit einem Klick in Ihren Schadensfall">
      <Hero title="Ihr Anmelde-Link" />
      <Card>
        <Paragraph>{anrede}</Paragraph>
        <Paragraph>
          Sie haben sich mit dieser E-Mail-Adresse bei Claimondo angemeldet. Mit dem Knopf unten kommen Sie direkt in
          Ihren Schadensfall — ohne Passwort.
        </Paragraph>
        <Button href={actionUrl}>Jetzt anmelden</Button>
        <Paragraph style={{ color: email.color.ondo, fontSize: 13 }}>
          Der Link ist eine Stunde gültig. Falls Sie diese Anmeldung nicht angefordert haben, können Sie die E-Mail
          ignorieren.
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
```
*(Token-Name gemessen 19.09.: `PasswortReset.tsx:41` nutzt `email.color.ondo`.)*

- [ ] **Step 4: `sendLoginLink` in `flows.ts`** — direkt unter `sendPasswortReset`, gleiches Muster:

```ts
export async function sendLoginLink({ to, vorname, actionUrl }: { to: string; vorname: string | null; actionUrl: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const props = { vorname, actionUrl }
    const html = await render(LoginLinkEmail(props))
    await sendEmail({
      to,
      subject: loginLinkSubject(props),
      html,
      fallId: null,
      template: 'login_link',
      allowInternalRecipient: true,
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```
Import oben in `flows.ts`: `import { LoginLinkEmail, subject as loginLinkSubject } from './templates/LoginLink'`. `fallId: null` + `allowInternalRecipient: true` sind die Pflichtfelder aus `sendPasswortReset` (gemessen 19.09.).

- [ ] **Step 5: Grün** — Test PASS; `npx tsc --noEmit` auf `flows.ts` sauber (mit `NODE_OPTIONS=--max-old-space-size=8192`).
- [ ] **Step 6: Commit** — `git add src/lib/email/google/templates/LoginLink.tsx src/lib/email/google/templates/LoginLink.test.tsx src/lib/email/google/flows.ts && git commit -m "feat(email): Anmelde-Link-Vorlage + sendLoginLink"`

---

### Task 4: Server-Actions „bekannter Kontakt" (Kern, Enumeration-sicher)

**Files:**
- Create: `src/app/login/bekannter-kontakt-actions.ts`
- Test: `src/app/login/bekannter-kontakt-actions.test.ts`

**Interfaces:**
- Consumes: `findeVorgaengeZuKontakt` (T1), `sendLoginLink` (T3), `buildWelcomeConfirmLink` (`@/lib/auth/welcome-link`), `enablePhoneLogin` (`@/lib/auth/phone-login`), `toE164`, `createAdminClient`.
- Produces:
  ```ts
  export async function bereiteTelefonLoginVor(telefonRaw: string): Promise<{ ok: true }>
  export async function sendeAnmeldeLinkPerEmail(emailRaw: string): Promise<{ ok: true }>
  ```
  Beide antworten **immer** `{ ok: true }`. Der Client zeigt danach den neutralen Satz.

**Ablauf `bereiteTelefonLoginVor`:** E.164 → Vorgänge suchen → keine → Ende. Existiert bereits ein `auth.users` mit dieser Nummer → Ende (der Client macht `signInWithOtp` wie bisher). Sonst: hat der Lead eine E-Mail (Stufe-1-Bedingung) → `createUser({ email: leadEmail, phone, phone_confirm: true, email_confirm: true })` → `profiles.upsert({ id, rolle:'kunde', email, telefon, vorname, auth_provider:'phone', force_password_change:false })` → `enablePhoneLogin` ist durch `phone` im createUser bereits erledigt (Spiegel = `auth.users.phone`). Kollision `users_phone_key`/`profiles_email_key` → loggen, Ende. Danach macht der Client `signInWithOtp({ phone, shouldCreateUser:false })` — jetzt findet er den User.

**Ablauf `sendeAnmeldeLinkPerEmail`:** lower/trim → Rate-Limit (`email_log`, `template='login_link'`, 3/h) → Vorgänge suchen → keine → Ende. Existiert `profiles` mit dieser E-Mail → `buildWelcomeConfirmLink(email,'magiclink','/kunde')` → `sendLoginLink`. Sonst: `createUser({ email, email_confirm:true })` + `profiles.upsert` → dann Link. 

- [ ] **Step 1: Failing tests**

```ts
// src/app/login/bekannter-kontakt-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const finde = vi.fn()
const createUser = vi.fn()
const listUsers = vi.fn()
const upsert = vi.fn()
const sendLoginLink = vi.fn()
const buildLink = vi.fn()
const emailLogCount = vi.fn()

vi.mock('@/lib/auth/lead-kontakt', () => ({ findeVorgaengeZuKontakt: (...a: unknown[]) => finde(...a) }))
vi.mock('@/lib/email/google/flows', () => ({ sendLoginLink: (...a: unknown[]) => sendLoginLink(...a) }))
vi.mock('@/lib/auth/welcome-link', () => ({ buildWelcomeConfirmLink: (...a: unknown[]) => buildLink(...a) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser, listUsers } },
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'maybeSingle']) q[m] = vi.fn(() => q)
      q.upsert = vi.fn((p: unknown) => { upsert(t, p); return Promise.resolve({ error: null }) })
      ;(q as { then: unknown }).then = (res: (v: unknown) => void) =>
        res(t === 'email_log' ? { count: emailLogCount(), error: null } : { data: null, error: null })
      return q
    },
  }),
}))

import { bereiteTelefonLoginVor, sendeAnmeldeLinkPerEmail } from './bekannter-kontakt-actions'

beforeEach(() => { for (const f of [finde, createUser, listUsers, upsert, sendLoginLink, buildLink, emailLogCount]) f.mockReset(); emailLogCount.mockReturnValue(0) })

describe('bereiteTelefonLoginVor', () => {
  it('unbekannte Nummer: ok, kein Konto, keine Suche nach Usern', async () => {
    finde.mockResolvedValue({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    expect(await bereiteTelefonLoginVor('0177 5799941')).toEqual({ ok: true })
    expect(createUser).not.toHaveBeenCalled()
  })
  it('bekannter Lead MIT E-Mail, noch kein Konto: legt phone-bestaetigten User + Kunden-Profil an', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: 'k@example.test', leadVorname: 'Kai' })
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    createUser.mockResolvedValue({ data: { user: { id: 'U9' } }, error: null })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(createUser).toHaveBeenCalledWith({ email: 'k@example.test', phone: '+491775799941', phone_confirm: true, email_confirm: true })
    expect(upsert).toHaveBeenCalledWith('profiles', expect.objectContaining({ id: 'U9', rolle: 'kunde', email: 'k@example.test', telefon: '+491775799941', auth_provider: 'phone', force_password_change: false }))
  })
  it('bekannter Lead OHNE E-Mail (Stufe 2): ok, aber kein Konto — profiles.email ist NOT NULL', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: null, leadVorname: null })
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(createUser).not.toHaveBeenCalled()
  })
  it('Konto existiert bereits: ok, nichts anlegen', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: 'k@example.test', leadVorname: null })
    listUsers.mockResolvedValue({ data: { users: [{ id: 'U1', phone: '491775799941' }] }, error: null })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(createUser).not.toHaveBeenCalled()
  })
  it('createUser-Fehler (Kollision): ok nach aussen, kein Profil', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: 'k@example.test', leadVorname: null })
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'Phone number already registered' } })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('sendeAnmeldeLinkPerEmail', () => {
  it('unbekannte E-Mail: ok, kein Versand', async () => {
    finde.mockResolvedValue({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    expect(await sendeAnmeldeLinkPerEmail('x@example.test')).toEqual({ ok: true })
    expect(sendLoginLink).not.toHaveBeenCalled()
  })
  it('bekannt + Konto vorhanden: Magic-Link raus', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: ['C1'], leadEmail: 'k@example.test', leadVorname: 'Kai' })
    listUsers.mockResolvedValue({ data: { users: [{ id: 'U1', email: 'k@example.test' }] }, error: null })
    buildLink.mockResolvedValue('https://app/auth/bestaetigen?token_hash=t')
    sendLoginLink.mockResolvedValue({ success: true })
    expect(await sendeAnmeldeLinkPerEmail('K@Example.test')).toEqual({ ok: true })
    expect(buildLink).toHaveBeenCalledWith('k@example.test', 'magiclink', '/kunde')
    expect(sendLoginLink).toHaveBeenCalledWith({ to: 'k@example.test', vorname: 'Kai', actionUrl: 'https://app/auth/bestaetigen?token_hash=t' })
  })
  it('gedrosselt (3/h erreicht): ok, kein Versand, keine Suche', async () => {
    emailLogCount.mockReturnValue(3)
    expect(await sendeAnmeldeLinkPerEmail('k@example.test')).toEqual({ ok: true })
    expect(finde).not.toHaveBeenCalled()
    expect(sendLoginLink).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rot** — `npx vitest run src/app/login/bekannter-kontakt-actions.test.ts` → FAIL (Modul fehlt)

- [ ] **Step 3: Implementierung**

```ts
// src/app/login/bekannter-kontakt-actions.ts
'use server'

// Login ohne Link (Soll-Blatt 2026-09-19-kunde-kommt-ohne-link-ins-konto, Weg 2).
//
// Beide Actions antworten IMMER { ok: true } — bekannt, unbekannt, gedrosselt, Fehler:
// nach aussen ununterscheidbar (Enumeration-Schutz, Muster requestPasswordReset).
// Fail-closed: jeder Fehler auf dem Weg legt KEIN Konto an und schickt NICHTS.
//
// Stufe 1: ein Konto entsteht nur, wenn der Lead eine E-Mail traegt — profiles.email
// ist NOT NULL + UNIQUE (gemessen 19.09.). Telefon-only-Konten sind Stufe 2
// (Migration + 26-Stellen-Sweep), siehe Plan-Kopf.
import { createAdminClient } from '@/lib/supabase/admin'
import { toE164 } from '@/lib/format/telefon'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'
import { buildWelcomeConfirmLink } from '@/lib/auth/welcome-link'
import { sendLoginLink } from '@/lib/email/google/flows'

const MAX_LOGIN_MAILS_PRO_STUNDE = 3

type Neutral = { ok: true }
const NEUTRAL: Neutral = { ok: true }

export async function bereiteTelefonLoginVor(telefonRaw: string): Promise<Neutral> {
  try {
    const phone = toE164(telefonRaw)
    if (!phone) return NEUTRAL
    const admin = createAdminClient()

    const vorgaenge = await findeVorgaengeZuKontakt(admin, { telefon: phone })
    if (vorgaenge.leadIds.length === 0 && vorgaenge.claimIds.length === 0) return NEUTRAL

    // Konto vorhanden? auth.users.phone ist E.164 ohne '+'.
    const { data: liste, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) { console.error('[login-kontakt] listUsers:', listErr.message); return NEUTRAL }
    const ohnePlus = phone.replace(/^\+/, '')
    if ((liste?.users ?? []).some((u) => (u.phone ?? '').replace(/^\+/, '') === ohnePlus)) return NEUTRAL

    if (!vorgaenge.leadEmail) {
      console.warn('[login-kontakt] Lead ohne E-Mail — Telefon-only-Konto ist Stufe 2, kein Konto angelegt')
      return NEUTRAL
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: vorgaenge.leadEmail,
      phone,
      phone_confirm: true,
      email_confirm: true,
    })
    if (createErr || !created?.user) {
      console.error('[login-kontakt] createUser fehlgeschlagen (evtl. Kollision):', createErr?.message)
      return NEUTRAL
    }

    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: created.user.id,
        rolle: 'kunde',
        email: vorgaenge.leadEmail,
        telefon: phone,
        vorname: vorgaenge.leadVorname,
        auth_provider: 'phone',
        force_password_change: false,
      },
      { onConflict: 'id' },
    )
    if (profErr) console.error('[login-kontakt] profiles.upsert fehlgeschlagen:', profErr.message)
    return NEUTRAL
  } catch (err) {
    console.error('[login-kontakt] bereiteTelefonLoginVor:', err)
    return NEUTRAL
  }
}

export async function sendeAnmeldeLinkPerEmail(emailRaw: string): Promise<Neutral> {
  try {
    const email = (emailRaw ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) return NEUTRAL
    const admin = createAdminClient()

    // ANTI-BOMBING wie requestPasswordReset: max. N Mails/h je Empfaenger, fail-open bei DB-Hiccup.
    const seit = new Date(Date.now() - 60 * 60_000).toISOString()
    const { count } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('template', 'login_link')
      .eq('empfaenger', email)
      .gte('created_at', seit)
    if ((count ?? 0) >= MAX_LOGIN_MAILS_PRO_STUNDE) return NEUTRAL

    const vorgaenge = await findeVorgaengeZuKontakt(admin, { email })
    if (vorgaenge.leadIds.length === 0 && vorgaenge.claimIds.length === 0) return NEUTRAL

    const { data: liste, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) { console.error('[login-kontakt] listUsers:', listErr.message); return NEUTRAL }
    const vorhanden = (liste?.users ?? []).some((u) => (u.email ?? '').toLowerCase() === email)

    if (!vorhanden) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true })
      if (createErr || !created?.user) {
        console.error('[login-kontakt] createUser (email) fehlgeschlagen:', createErr?.message)
        return NEUTRAL
      }
      const { error: profErr } = await admin.from('profiles').upsert(
        { id: created.user.id, rolle: 'kunde', email, vorname: vorgaenge.leadVorname, auth_provider: 'email', force_password_change: false },
        { onConflict: 'id' },
      )
      if (profErr) { console.error('[login-kontakt] profiles.upsert:', profErr.message); return NEUTRAL }
    }

    const actionUrl = await buildWelcomeConfirmLink(email, 'magiclink', '/kunde')
    if (!actionUrl) return NEUTRAL
    const res = await sendLoginLink({ to: email, vorname: vorgaenge.leadVorname, actionUrl })
    if (!res.success) console.error('[login-kontakt] sendLoginLink:', res.error)
    return NEUTRAL
  } catch (err) {
    console.error('[login-kontakt] sendeAnmeldeLinkPerEmail:', err)
    return NEUTRAL
  }
}
```

⚠ `listUsers` mit `perPage: 1000` ist eine bewusste Stufe-1-Vereinfachung: prod hat 102 Kunden-Konten (gemessen 19.09.). In Stufe 2 durch eine `profiles`-Abfrage (`telefon_ziffern`-Suffix / `email`) ersetzen — **das steht als Task in Stufe 2, nicht als TODO im Code.** Im Code-Kommentar nur: `// Stufe 2: profiles statt listUsers (Plan 2026-09-19-…, Stufe 2, Task S2-3)`.

- [ ] **Step 4: Grün** — `npx vitest run src/app/login/bekannter-kontakt-actions.test.ts` → PASS (8)
- [ ] **Step 5: `check:use-server-exports`** — `node scripts/check-server-actions.mjs` → keine Value-Exports (nur `async function`); `NEUTRAL`/`MAX_…` sind Modul-lokal, nicht exportiert ✓
- [ ] **Step 6: Commit** — `git add src/app/login/bekannter-kontakt-actions.ts src/app/login/bekannter-kontakt-actions.test.ts && git commit -m "feat(login): Konto fuer bekannten Kontakt vor OTP/Magic-Link, Enumeration-sicher"`

---

### Task 5: LoginClient — Action vor `signInWithOtp`, E-Mail-Link-Knopf, neutraler Satz

**Files:**
- Modify: `src/app/login/LoginClient.tsx` (Telefon-Tab: `handlePhoneSend`; E-Mail-Tab: neuer Block unter dem Passwort-Formular)

**Interfaces:**
- Consumes: `bereiteTelefonLoginVor`, `sendeAnmeldeLinkPerEmail` (Task 4).

- [ ] **Step 1: `handlePhoneSend` erweitern** — direkt vor `supabase.auth.signInWithOtp(...)`:

```tsx
      // Login ohne Link (19.09.): fuer einen BEKANNTEN Kontakt entsteht das Konto jetzt
      // serverseitig, bevor signInWithOtp (shouldCreateUser:false) ihn sucht. Die Action
      // antwortet immer neutral — der Satz unten gilt fuer bekannt UND unbekannt.
      await bereiteTelefonLoginVor(phone)
```
Import: `import { bereiteTelefonLoginVor, sendeAnmeldeLinkPerEmail } from './bekannter-kontakt-actions'`.

- [ ] **Step 2: Fehlertext bei unbekannter Nummer neutralisieren** — Supabase antwortet bei `shouldCreateUser:false` und unbekannter Nummer mit einem Fehler (**Wortlaut im Bau messen**, Task 10 Positivkontrolle). Im `catch` von `handlePhoneSend`:

```tsx
    } catch (err) {
      // Enumeration-Schutz: "Signups not allowed" (unbekannte Nummer) sieht fuer den Nutzer
      // aus wie Erfolg — derselbe Satz wie nach echtem Versand. Andere Fehler bleiben sichtbar.
      const msg = err instanceof Error ? err.message : ''
      if (/signup|not allowed|user not found/i.test(msg)) { setPhoneStep('verify'); return }
      setPhoneError(msg || 'SMS konnte nicht gesendet werden')
    }
```
Den Regex nach der Messung auf den **tatsächlichen** Wortlaut anpassen.

- [ ] **Step 3: Verify-Schritt-Text** — die Zeile `<p …>Code gesendet an <span…>{phone}</span></p>` ersetzen durch:

```tsx
              <p className="text-claimondo-ondo text-sm">
                Falls zu <span className="text-claimondo-navy">{phone}</span> ein Vorgang bei uns existiert, haben wir
                gerade einen Code per SMS geschickt.
              </p>
```

- [ ] **Step 4: E-Mail-Tab: „Anmelde-Link senden"** — unter dem Passwort-`<form>` im `tab === 'email'`-Block:

```tsx
          <div className="mt-4 border-t border-claimondo-border pt-4">
            <p className="text-sm text-claimondo-ondo mb-2">
              Kein Passwort? Wir schicken Ihnen einen Anmelde-Link an die E-Mail-Adresse, mit der Sie Ihren Schaden
              gemeldet haben.
            </p>
            {linkGesendet ? (
              <p className="text-sm text-claimondo-navy">
                Falls zu dieser Adresse ein Vorgang bei uns existiert, ist der Anmelde-Link unterwegs. Bitte auch den
                Spam-Ordner prüfen.
              </p>
            ) : (
              <button
                type="button"
                disabled={linkLoading}
                onClick={async () => {
                  const el = document.querySelector<HTMLInputElement>('input[name="email"]')
                  const value = el?.value ?? ''
                  if (!value.includes('@')) return
                  setLinkLoading(true)
                  try { await sendeAnmeldeLinkPerEmail(value); setLinkGesendet(true) } finally { setLinkLoading(false) }
                }}
                className="text-sm font-medium text-claimondo-ondo hover:text-claimondo-navy underline underline-offset-2"
              >
                {linkLoading ? 'Wird gesendet …' : 'Anmelde-Link per E-Mail senden'}
              </button>
            )}
          </div>
```
State oben: `const [linkGesendet, setLinkGesendet] = useState(false)` und `const [linkLoading, setLinkLoading] = useState(false)`.

- [ ] **Step 5: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 Fehler; `npm run check:component-set` → keine neue Verletzung (Text-Button ohne Card/Border ist erlaubt; sonst `primitives.Button variant="link"`).
- [ ] **Step 6: Commit** — `git commit -am "feat(login): Telefon/E-Mail fuer bekannte Kontakte, neutrale Antworten"`

---

### Task 6: Portal-Layout ordnet auch per Telefon zu

**Files:**
- Modify: `src/app/kunde/layout.tsx` (Block um Z.16–19)

- [ ] **Step 1:** Den Block

```tsx
  if (user.email) {
      const { claimFaelleByEmail } = await import('@/lib/kunde/auto-claim')
      await claimFaelleByEmail(createAdminClient(), user.id, user.email)
```
ersetzen durch

```tsx
  // Login ohne Link (19.09.): beide Kontaktachsen — user.phone kommt aus auth.users.phone
  // (E.164 ohne '+'), toE164 im Suffix-Match ist formatunabhaengig.
  if (user.email || user.phone) {
      const { claimFaelleByKontakt } = await import('@/lib/kunde/auto-claim')
      await claimFaelleByKontakt(createAdminClient(), user.id, { email: user.email ?? null, telefon: user.phone ?? null })
```
(Den umgebenden `try/catch` und Kommentar des Bestands beibehalten.)

- [ ] **Step 2:** Dieselbe Ersetzung in `src/app/kunde/page.tsx` Z.29–33.
- [ ] **Step 3:** `npx tsc --noEmit` grün; `npx vitest run src/lib/kunde` grün.
- [ ] **Step 4: Commit** — `git commit -am "feat(kunde): Fall-Zuordnung beim Portal-Besuch auch per Telefon"`

---

### Task 7: Offener Lead im Portal — Karte „Jetzt fortsetzen"

**Files:**
- Create: `src/lib/kunde/offene-leads.ts`, `src/lib/kunde/offene-leads.test.ts`
- Create: `src/app/kunde/offene-leads-actions.ts`
- Create: `src/components/kunde/OffeneSchadenmeldungKarte.tsx`
- Modify: `src/app/kunde/page.tsx` (Empty-State-Zweig)

**Interfaces:**
- Produces:
  ```ts
  export type OffenerLead = { id: string; createdAt: string; schadentyp: string | null; kennzeichen: string | null }
  export async function ladeOffeneLeadsFuerKunde(admin, kontakt: { email: string | null; telefon: string | null }): Promise<OffenerLead[]>
  export async function fortsetzeSchadenmeldung(formData: FormData): Promise<void>   // redirect
  ```

- [ ] **Step 1: Failing test**

```ts
// src/lib/kunde/offene-leads.test.ts
import { describe, it, expect, vi } from 'vitest'
const finde = vi.fn()
vi.mock('@/lib/auth/lead-kontakt', () => ({ findeVorgaengeZuKontakt: (...a: unknown[]) => finde(...a) }))
import { ladeOffeneLeadsFuerKunde } from './offene-leads'

function adminMock(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'is', 'order', 'limit']) q[m] = vi.fn(() => q)
  ;(q as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null })
  return { from: vi.fn(() => q) } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('ladeOffeneLeadsFuerKunde', () => {
  it('nur Leads OHNE Claim (konvertiert_zu_fall_id is null)', async () => {
    finde.mockResolvedValue({ leadIds: ['L1', 'L2'], claimIds: ['C1'], leadEmail: null, leadVorname: null })
    const admin = adminMock([{ id: 'L2', created_at: '2026-09-18T10:00:00Z', schadentyp: 'Auffahrunfall', kennzeichen: null }])
    const r = await ladeOffeneLeadsFuerKunde(admin, { email: 'k@example.test', telefon: null })
    expect(r).toEqual([{ id: 'L2', createdAt: '2026-09-18T10:00:00Z', schadentyp: 'Auffahrunfall', kennzeichen: null }])
  })
  it('leer ohne Kontakt', async () => {
    expect(await ladeOffeneLeadsFuerKunde(adminMock([]), { email: null, telefon: null })).toEqual([])
    expect(finde).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rot** — `npx vitest run src/lib/kunde/offene-leads.test.ts` → FAIL

- [ ] **Step 3: Loader**

```ts
// src/lib/kunde/offene-leads.ts
// Leads des Kunden, aus denen noch kein Claim wurde (Flow nicht bis zur SA-Unterschrift).
// Alle drei Ownership-Wege des Portals enden bei claims — ohne diese Sicht saehe ein
// Kunde nach dem Login ohne Link eine leere Liste (Soll-Blatt 1c Schritt 5).
// Gelesen wird ueber den Admin-Client, gescopt auf den Kontakt des eingeloggten Users:
// die leads-Policy hat keinen Kunden-Zweig und bekommt keinen.
import type { SupabaseClient } from '@supabase/supabase-js'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'

export type OffenerLead = { id: string; createdAt: string; schadentyp: string | null; kennzeichen: string | null }

export async function ladeOffeneLeadsFuerKunde(
  admin: SupabaseClient,
  kontakt: { email: string | null; telefon: string | null },
): Promise<OffenerLead[]> {
  if (!kontakt.email && !kontakt.telefon) return []
  const { leadIds } = await findeVorgaengeZuKontakt(admin, kontakt)
  if (leadIds.length === 0) return []
  const { data, error } = await admin
    .from('leads')
    .select('id, created_at, schadentyp, kennzeichen')
    .in('id', leadIds)
    .is('konvertiert_zu_fall_id', null)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) { console.error('[offene-leads]', error.message); return [] }
  return ((data ?? []) as Array<{ id: string; created_at: string; schadentyp: string | null; kennzeichen: string | null }>)
    .map((l) => ({ id: l.id, createdAt: l.created_at, schadentyp: l.schadentyp, kennzeichen: l.kennzeichen }))
}
```
Spalten gemessen 19.09. (`information_schema.columns`): `leads.schadentyp`, `kennzeichen`, `konvertiert_zu_fall_id`, `vorname`, `telefon_ziffern` existieren, alle nullable.

- [ ] **Step 4: Server-Action** (Muster `unterschrift/route.ts`)

```ts
// src/app/kunde/offene-leads-actions.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'

// Bewusst KEIN Result-Object: endet immer in redirect() (wie bestaetigeMagicLink).
// Ownership-Guard: der Lead muss zum Kontakt des eingeloggten Users gehoeren —
// eine fremde leadId im Formular landet auf /kunde, nie im fremden Flow.
export async function fortsetzeSchadenmeldung(formData: FormData): Promise<void> {
  const leadId = (formData.get('leadId') as string | null)?.trim() || null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!leadId) redirect('/kunde')

  const admin = createAdminClient()
  const { leadIds } = await findeVorgaengeZuKontakt(admin, { email: user.email ?? null, telefon: user.phone ?? null })
  if (!leadIds.includes(leadId)) redirect('/kunde')

  const link = await ensureCanonicalFlowLinkForLead(leadId, { admin })
  if (!link.ok) redirect('/kunde')
  redirect(`/flow/${link.token}`)
}
```

- [ ] **Step 5: Karte** (Komponenten-Set: `primitives`)

```tsx
// src/components/kunde/OffeneSchadenmeldungKarte.tsx
import { Card, Text, Button } from '@/components/primitives'
import { fortsetzeSchadenmeldung } from '@/app/kunde/offene-leads-actions'
import type { OffenerLead } from '@/lib/kunde/offene-leads'

export default function OffeneSchadenmeldungKarte({ lead }: { lead: OffenerLead }) {
  const datum = new Date(lead.createdAt).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
  return (
    <Card>
      <Text variant="headingSm" as="h3">Ihre Schadenmeldung vom {datum}</Text>
      <Text variant="bodySm" as="p">
        {lead.schadentyp ?? 'Schaden'}{lead.kennzeichen ? ` · ${lead.kennzeichen}` : ''} — noch nicht abgeschlossen.
        Sie können sie jetzt fortsetzen; Ihre bisherigen Angaben sind gespeichert.
      </Text>
      <form action={fortsetzeSchadenmeldung}>
        <input type="hidden" name="leadId" value={lead.id} />
        <Button type="submit" variant="navy">Jetzt fortsetzen</Button>
      </form>
    </Card>
  )
}
```
Prop-Namen gemessen 19.09.: `ButtonVariant = 'navy'|'ondo'|'ghost'|'bare'|'danger'|'success'`, `TypoVariant = 'caption'|'bodyXs'|'bodySm'|'body'|'headingSm'|'headingMd'|'headingLg'` (`src/lib/design-tokens.ts:171,306`), `Text.as` erlaubt `p|span|h1..h4|div|label`. Die Datei ist eine Server-Component (kein `'use client'`) → `client-timezone`-Gate greift nicht; `timeZone` trotzdem gesetzt.

- [ ] **Step 6: Einbau in `kunde/page.tsx`** — vor `const needsOnboarding`:

```tsx
  const offeneLeads = await ladeOffeneLeadsFuerKunde(adminClient, { email: user.email ?? null, telefon: user.phone ?? null })
```
und im JSX den Empty-State-Zweig:

```tsx
      {faelle.length === 0 ? (
        offeneLeads.length > 0 ? (
          <div className="space-y-4">{offeneLeads.map((l) => <OffeneSchadenmeldungKarte key={l.id} lead={l} />)}</div>
        ) : (
          <KundeWillkommensHero vorname={vorname} />
        )
      ) : (
```
Imports: `ladeOffeneLeadsFuerKunde` aus `@/lib/kunde/offene-leads`, `OffeneSchadenmeldungKarte` aus `@/components/kunde/OffeneSchadenmeldungKarte`. Bei `faelle.length > 0` **und** offenen Leads: die Karten **über** `KundeSchadenUebersicht` rendern (gleicher `map`).

- [ ] **Step 7: Grün** — vitest PASS; `tsc` 0 Fehler; `npm run check:component-set`, `check:redirect-stubs`, `check:silent-writes` grün.
- [ ] **Step 8: Commit** — `git add src/lib/kunde/offene-leads.ts src/lib/kunde/offene-leads.test.ts src/app/kunde/offene-leads-actions.ts src/components/kunde/OffeneSchadenmeldungKarte.tsx src/app/kunde/page.tsx && git commit -m "feat(kunde): offene Schadenmeldung im Portal fortsetzen (frischer FlowLink)"`

---

### Task 8: Timeline-Eintrag „Kunde hat sich selbst angemeldet"

**Files:**
- Create: `src/lib/kunde/login-timeline.ts`
- Modify: `src/app/login/actions.ts` (`finalisierePhoneLogin`) und `src/app/auth/bestaetigen/actions.ts` (nach erfolgreichem `verifyOtp` mit `type==='magiclink'`)

- [ ] **Step 1: Helfer**

```ts
// src/lib/kunde/login-timeline.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'

// Dispatcher/KB sehen am Lead, dass der Kunde selbst reingekommen ist (Soll 1c Schritt 7).
// kanal='gruppenchat' wie system-messages.ts: 'system' waere CHECK-erlaubt, aber kein Reader
// kennt den Wert (gemessen 19.09.: is_system-Zeilen tragen email/gruppenchat/whatsapp). Best-effort.
export async function schreibeLoginTimeline(user: { id: string; email?: string | null; phone?: string | null }, weg: 'telefon' | 'email'): Promise<void> {
  try {
    const admin = createAdminClient()
    const { leadIds } = await findeVorgaengeZuKontakt(admin, { email: user.email ?? null, telefon: user.phone ?? null })
    for (const leadId of leadIds.slice(0, 3)) {
      const { error } = await admin.from('nachrichten').insert({
        lead_id: leadId,
        kanal: 'gruppenchat',
        sender_id: null,
        sender_rolle: 'system',
        nachricht: weg === 'telefon' ? 'Kunde hat sich per Telefonnummer angemeldet.' : 'Kunde hat sich per E-Mail-Link angemeldet.',
        hat_anhang: false,
        is_system: true,
        system_event: 'kunde_selbst_angemeldet',
      })
      if (error) console.warn('[login-timeline]', error.message)
    }
  } catch (err) {
    console.warn('[login-timeline]', err)
  }
}
```
Gemessen 19.09.: `nachrichten.fall_id`, `lead_id`, `sender_rolle` sind nullable; `sender_rolle='system'` kommt real vor; kein CHECK auf `sender_rolle`.

- [ ] **Step 2:** In `finalisierePhoneLogin` nach dem `profiles`-Update: `await schreibeLoginTimeline(user, 'telefon')`. In `bestaetigeMagicLink` nach erfolgreichem `verifyOtp`, wenn `type === 'magiclink'`: `const { data: { user } } = await supabase.auth.getUser(); if (user) await schreibeLoginTimeline(user, 'email')`.
- [ ] **Step 3:** `check:flag-drift` grün; `tsc` grün.
- [ ] **Step 4: Commit** — `git commit -am "feat(kunde): Timeline-Eintrag bei Selbst-Anmeldung"`

---

### Task 9: Journey-Delta J2, Register L-2, Soll-Blatt-Verweis

**Files:**
- Modify: `docs/fundament/journeys/j02-meldung-alle-kanaele.md` (nach Schritt 2)
- Modify: `docs/fundament/entry-points-flowlink.md` (Tabelle ab Z.86)

- [ ] **Step 1: J2 Schritt 2b einfügen**

```markdown
2b. **Melder hat den FlowLink nicht (nie angekommen, verloren, Gerät gewechselt)** → öffnet `/login`, gibt Telefonnummer oder E-Mail an → System: existiert ein Lead/Claim zu diesem Kontakt, entsteht sein Konto (Stufe 1: nur wenn der Lead eine E-Mail trägt), er bekommt SMS-Code bzw. Anmelde-Link; unbekannte Kontakte sehen denselben neutralen Satz. Nach dem Login: Fall zugeordnet (`claims.geschaedigter_user_id`), offener Lead als Karte „Jetzt fortsetzen" → frischer FlowLink → weiter bei Schritt 2. **Festnetz ohne E-Mail:** kein digitaler Weg — Dispatch-Aufgabe (#5986) ist der vorgesehene Pfad. Soll-Blatt: `memory/abnahmen/2026-09-19-kunde-kommt-ohne-link-ins-konto.md`.
```

- [ ] **Step 2: Register-Zeile** (Format Z.87–89 übernehmen):

```markdown
| L-2 | **/login (bekannter Kontakt)** — Telefon/E-Mail ohne Link | `login/bekannter-kontakt-actions.ts` | ✗ (liest Lead/Claim) | ✗ | ✓ neu über Portal-Karte (`ensureCanonicalFlowLinkForLead`) | ✗ (Timeline statt Notif) | ✓ (Konto idempotent) | ✗ |
```

- [ ] **Step 3:** Zeile B-3 im Register `eingaenge-rollen.md`/`entry-points.md` korrigieren: „Team bekommt nichts (bewusst)" → „Team-WhatsApp über `notify-new-lead.ts` (gemessen 19.09.)".
- [ ] **Step 4: Commit** — `git commit -am "docs(fundament): J2 Schritt 2b Login ohne Link, Register L-2, B-3 korrigiert"`

---

### Task 10: Regel-4-Smoke (E-Mail-Weg voll, SMS-Weg ausgewiesen)

**Files:**
- Create: `scripts/smoke/kunde-login-ohne-link-seed.mjs`
- Create: `tests/e2e/flows/kunde-login-ohne-link-smoke.spec.ts`

**Soll (aus dem Blatt, 1c Weg 2):** Ein Lead mit E-Mail `test-kunde+login-<ts>@claimondo.de` und Mobilnummer, **ohne** Konto → `/login` → E-Mail-Tab → „Anmelde-Link per E-Mail senden" → neutraler Satz → Link aus `email_log` lesen (Seed-Script mit Service-Key) → öffnen → `/auth/bestaetigen` klicken → landet auf `/kunde` → Karte „Ihre Schadenmeldung vom …" sichtbar → „Jetzt fortsetzen" → URL beginnt mit `/flow/` und `flow_links.lead_id` = Seed-Lead. Gegenprobe DB: `auth.users` neu, `profiles.rolle='kunde'`. Negativ: unbekannte E-Mail → derselbe Satz, **keine** neue `auth.users`-Zeile.

- [ ] **Step 1: Seed** — Lead über `createCase`-Weg? Nein: Seed erzeugt **direkt** einen Lead (`leads.insert`) mit `source_channel='smoke-login'`, `email`, `telefon`, ohne Claim, ohne Konto — das ist der Ausgangszustand, den ein fremder Eingang hergestellt hätte (Regel 4 erlaubt Seed nur dafür). Schreibt `scripts/smoke/.kunde-login-ohne-link-seed.json` `{ leadId, email, telefon }`. Aufräumen am Ende: Lead + ggf. Konto löschen (per E-Mail-Muster `test-kunde+login-`).

- [ ] **Step 2: Spec** (Seed-Read **im** `try` — E2E-Toplevel-FS-Gate):

```ts
// tests/e2e/flows/kunde-login-ohne-link-smoke.spec.ts
// Journey J2 Schritt 2b — Login ohne Link. Soll: memory/abnahmen/2026-09-19-kunde-kommt-ohne-link-ins-konto.md
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
let seed: { leadId: string; email: string; telefon: string; magicLinkUrl?: string } | null = null
try { seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.kunde-login-ohne-link-seed.json'), 'utf8')) } catch { /* nicht geseedet */ }

test('Weg 2 (E-Mail): bekannter Lead ohne Konto -> Link -> Portal -> offene Meldung fortsetzen', async ({ page }) => {
  test.skip(!seed, 'Seed-Fixture fehlt — local-only Prod-Smoke')
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(seed!.email)
  await page.getByRole('button', { name: /Anmelde-Link per E-Mail senden/ }).click()
  await expect(page.getByText(/Falls zu dieser Adresse ein Vorgang/)).toBeVisible()
  // Der Link wird vom Seed-Script nach dem Klick aus email_log gelesen (2. Lauf: --link)
  test.skip(!seed!.magicLinkUrl, 'magicLinkUrl fehlt — Seed-Script mit --link erneut ausfuehren')
  await page.goto(seed!.magicLinkUrl!, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Anmelden|Bestätigen/ }).click()
  await page.waitForURL(/\/kunde/, { timeout: 30_000 })
  await expect(page.getByText(/Ihre Schadenmeldung vom/)).toBeVisible()
  await page.getByRole('button', { name: /Jetzt fortsetzen/ }).click()
  await page.waitForURL(/\/flow\//, { timeout: 30_000 })
  expect(page.url()).toMatch(/\/flow\/[A-Za-z0-9_-]+/)
})

test('Weg 2 (E-Mail): unbekannte Adresse sieht denselben Satz', async ({ page }) => {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="email"]').fill(`niemand-${Date.now()}@example.test`)
  await page.getByRole('button', { name: /Anmelde-Link per E-Mail senden/ }).click()
  await expect(page.getByText(/Falls zu dieser Adresse ein Vorgang/)).toBeVisible()
})

test.skip('Weg 2 (SMS): bekannter Lead -> Code', () => {
  // NICHT NACHGEWIESEN: braucht eine Test-Mobilnummer, deren SMS-Code der Smoke lesen kann.
  // Existiert nicht (vgl. 2fa-hardening: SMOKE_2FA_* fehlt ueberall). Status im Marker:
  // "verdrahtet, nicht gelaufen". Soll-Blatt Abschnitt 9.
})
```

- [ ] **Step 3: DB-Gegenprobe im Seed-Script** (`--verify`): `auth.users` mit `email = seed.email` existiert, `profiles.rolle='kunde'`, `flow_links.lead_id = seed.leadId`; für den Negativfall: `count(auth.users where email like 'niemand-%@example.test') = 0`.
- [ ] **Step 4: `check:e2e-toplevel-fs`, `check:stumme-waechter`** grün (kein `RUN_*`-Schalter; `test.skip` mit Grund).
- [ ] **Step 5: Commit** — `git add scripts/smoke/kunde-login-ohne-link-seed.mjs tests/e2e/flows/kunde-login-ohne-link-smoke.spec.ts && git commit -m "test(e2e): Regel-4-Smoke Login ohne Link (E-Mail-Weg; SMS ausgewiesen)"`

---

### Task 11: Build, Ratchets, PR, Abnahme-Erstfassung

- [ ] **Step 1:** `npm run build > /tmp/build.log 2>&1; echo EXIT=$?` — **Inhalts-Grep** statt Zahl: `grep -ciE '\berror\b' /tmp/build.log` = 0; Exit ≠ 134.
- [ ] **Step 2:** Ratchets: `check:silent-writes`, `check:flag-drift`, `check:use-server-exports`, `check:knip`, `check:component-set`, `check:redirect-stubs`, `check:e2e-toplevel-fs`, `check:stumme-waechter`, `check:client-timezone`, `check:vitest -- --ratchet` — alle grün, Ausgabe gelesen.
- [ ] **Step 3:** PR gegen `staging` mit Body: Befund (Zahlen aus dem Blatt), Kette, was Stufe 1 liefert / Stufe 2 offen lässt, Regel-4-Plan, Abnahme-Link.
- [ ] **Step 4:** Abnahme-Datei Abschnitte 2–5, 7–9 füllen, Register-Status `🟡 PR offen`.

---

## Stufe 2 (eigener Plan, nicht hier) — damit sie nicht verloren geht

* **S2-1** Migration `profiles.email DROP NOT NULL` (UNIQUE bleibt, NULLs kollidieren nicht) über `apply_migration`; Typen regenerieren.
* **S2-2** Sweep der 26 Stellen (`.email!` ×2, `user.email` ×24) auf `?? null`/Guard.
* **S2-3** `bereiteTelefonLoginVor`: Telefon-only-Konto (`createUser({ phone, phone_confirm })` ohne E-Mail), `listUsers` durch `profiles`-Suffix-Abfrage ersetzen.
* **S2-4** Kennzeichen-/Schadendatum-Bestätigung beim ersten Login über Weg 2 (Annahme A3).
* **S2-5** Schriftstück-Postweg für Konten ohne E-Mail (Download im Portal / WhatsApp-Dokument).
* **S2-6** Verifikations-Schritt im Flow (Option A): „Unter welcher Nummer erreicht Sie der Gutachter?" — Code, 6 Ziffern; `createKundeAccount` öffnen (E-Mail optional, wenn Nummer bestätigt).

## Self-Review (nach dem Schreiben)

* Spec-Coverage: 1c Weg 2 Schritte 1–3 → T4/T5; Schritt 5 (Zuordnung) → T2/T6; Schritt 5 (Lead-Karte) → T7; Schritt 7 (Timeline) → T8; Schritt 4 (Kennzeichen, A3) → **bewusst Stufe 2** (steht im Blatt als Annahme, Aaron entscheidet); Weg 1 (Konto ohne E-Mail im Flow) → **Stufe 2 S2-6**, da vom selben NOT-NULL-Blocker abhängig. Abnahmekriterien 1–7 → T10; 8 → Stufe 2; 9 → Stufe 2.
* Placeholder-Scan: keine TBD/TODO; die zwei ⚠-Hinweise (Spaltennamen, `fall_id` NOT NULL) sind **Prüfschritte**, keine offenen Implementierungen.
* Typkonsistenz: `findeVorgaengeZuKontakt(admin, { telefon?, email? })` → `{ leadIds, claimIds, leadEmail, leadVorname }` in T1/T2/T4/T7/T8 identisch; `claimFaelleByKontakt(admin, userId, { email, telefon })` in T2/T6 identisch; `sendLoginLink({ to, vorname, actionUrl })` in T3/T4 identisch.
