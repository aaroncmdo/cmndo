# Enhanced Conversions (Marketing Lead-Forms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bei `generate_lead` gehashte user-provided data (Telefon/Name/E-Mail) an Google senden — Client (gtag) + Server (MP) — für Enhanced Conversions.

**Architecture:** Client: pure `user-data.ts` baut das gtag-`user_data`-Objekt (rohe, normalisierte Werte; gtag hasht selbst) → `setUserData()` vor `generate_lead` in 4 Forms. Server: `user-data-mp.ts` (SHA-256 via `node:crypto`) → durch `ga4-mp`/`ga4-conversions` in das MP-Event von `createLeadFromMiniWizard`.

**Tech Stack:** Next 16 (`claimondo-marketing`, standalone), gtag.js (GA4 `G-9YF2W9ZP2S`), GA4 Measurement Protocol, vitest v4 (node-env, aus #3221), `node:crypto`.

## Global Constraints
- Alles in `claimondo-marketing/`. Verify-Befehle: `npm --prefix claimondo-marketing run test` / `… run typecheck` / `… run build`.
- **Nur Hashes an Google** — client: gtag SHA-256 (automatisch); server: `node:crypto` SHA-256. Kein Roh-PII.
- **Consent NICHT selbst gaten** — Consent-Mode (client) + MP-`consent`-Feld (server, existiert) erledigen das.
- Kein UI-String-Change (nur Event-/Tracking-Logik). Code-Kommentare ASCII erlaubt.
- Tests co-located unter `lib/**/*.test.ts` (vitest-include aus #3221).
- Branch: `kitta/marketing-enhanced-conversions` (stacked auf #3221; nach #3221+#3197-Merge auf `staging` rebasen).
- MP-`user_data`-Shape nach GA4-MP-UPD-Spec — **in GA4 DebugView verifizieren** (Konsole, Aaron).

---

### Task 1: Client-EC-Helper `user-data.ts`

**Files:**
- Create: `claimondo-marketing/lib/analytics/user-data.ts`
- Test: `claimondo-marketing/lib/analytics/user-data.test.ts`

**Interfaces:**
- Produces: `toE164(raw?: string, cc?: string): string` · `splitName(name?: string): { first_name?: string; last_name?: string }` · `buildUserData(input: { name?: string; phone?: string; email?: string }): Record<string, unknown> | null` · `setUserData(input): void`

- [ ] **Step 1: Write the failing test** — `claimondo-marketing/lib/analytics/user-data.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { toE164, splitName, buildUserData } from './user-data'

describe('toE164', () => {
  it('normalisiert DE-Varianten auf E.164', () => {
    expect(toE164('0151 1234567')).toBe('+491511234567')
    expect(toE164('0049 151 1234567')).toBe('+491511234567')
    expect(toE164('+49 151 1234567')).toBe('+491511234567')
    expect(toE164('151/1234-567')).toBe('+491511234567')
  })
  it('leer/unbrauchbar → ""', () => {
    expect(toE164('')).toBe('')
    expect(toE164(undefined)).toBe('')
    expect(toE164('+')).toBe('')
  })
})

describe('splitName', () => {
  it('splittet Vor-/Nachname', () => {
    expect(splitName('Max Mustermann')).toEqual({ first_name: 'Max', last_name: 'Mustermann' })
    expect(splitName('Max')).toEqual({ first_name: 'Max' })
    expect(splitName('  Anna Lena  Schmidt ')).toEqual({ first_name: 'Anna', last_name: 'Lena Schmidt' })
    expect(splitName('')).toEqual({})
  })
})

describe('buildUserData', () => {
  it('baut user_data mit normalisierten Werten', () => {
    expect(buildUserData({ name: 'Max Mustermann', phone: '0151 1234567', email: 'Max@Example.DE ' })).toEqual({
      phone_number: '+491511234567',
      email: 'max@example.de',
      address: { first_name: 'Max', last_name: 'Mustermann' },
    })
  })
  it('lässt leere/ungültige Felder weg', () => {
    expect(buildUserData({ name: 'Max', phone: '', email: 'keine-mail' })).toEqual({
      address: { first_name: 'Max' },
    })
  })
  it('komplett leer → null', () => {
    expect(buildUserData({})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm --prefix claimondo-marketing run test`
Expected: FAIL — `Cannot find module './user-data'`.

- [ ] **Step 3: Write the implementation** — `claimondo-marketing/lib/analytics/user-data.ts`

```ts
// Enhanced Conversions (Google user-provided data) fuer die gtag.js-Lead-Forms.
// setUserData() normalisiert die Form-Daten + ruft gtag('set','user_data', …)
// VOR dem generate_lead-Event. gtag.js hasht client-seitig SHA-256 und Consent
// Mode redacted user_data automatisch bei ad_user_data=denied → kein Roh-PII
// ohne Einwilligung. toE164/splitName/buildUserData sind pur → vitest-testbar.
// Ambient-Typ fuer window.gtag ist im Projekt deklariert (vgl. trackLpEvent).

/** Deutsche Telefonnummer → E.164 (+49…). Leer/unbrauchbar → ''. */
export function toE164(raw: string | undefined, cc = '49'): string {
  const s = (raw ?? '').replace(/[^\d+]/g, '')
  if (!s || s === '+') return ''
  if (s.startsWith('+')) return s
  if (s.startsWith('00')) return '+' + s.slice(2)
  if (s.startsWith('0')) return '+' + cc + s.slice(1)
  if (s.startsWith(cc)) return '+' + s
  return '+' + cc + s
}

export function splitName(name: string | undefined): { first_name?: string; last_name?: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { first_name: parts[0] }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

export type LeadUserData = { name?: string; phone?: string; email?: string }

/** gtag-user_data (rohe, normalisierte Werte; gtag hasht selbst). null wenn leer. */
export function buildUserData(input: LeadUserData): Record<string, unknown> | null {
  const ud: Record<string, unknown> = {}
  const phone = toE164(input.phone)
  if (phone) ud.phone_number = phone
  const email = input.email?.trim().toLowerCase()
  if (email && email.includes('@')) ud.email = email
  const { first_name, last_name } = splitName(input.name)
  const address: Record<string, string> = {}
  if (first_name) address.first_name = first_name
  if (last_name) address.last_name = last_name
  if (Object.keys(address).length > 0) ud.address = address
  return Object.keys(ud).length > 0 ? ud : null
}

/** Setzt gtag user_data fuer Enhanced Conversions (no-op ohne window/gtag/Daten). */
export function setUserData(input: LeadUserData): void {
  if (typeof window === 'undefined' || !window.gtag) return
  const ud = buildUserData(input)
  if (ud) window.gtag('set', 'user_data', ud)
}
```

- [ ] **Step 4: Run test, verify it passes** — `npm --prefix claimondo-marketing run test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/lib/analytics/user-data.ts claimondo-marketing/lib/analytics/user-data.test.ts
git commit -m "feat(marketing): Client-EC-Helper user-data.ts (gtag user_data)"
```

---

### Task 2: Server-EC-Helper `user-data-mp.ts`

**Files:**
- Create: `claimondo-marketing/lib/analytics/user-data-mp.ts`
- Test: `claimondo-marketing/lib/analytics/user-data-mp.test.ts`

**Interfaces:**
- Consumes: `toE164` aus `./user-data` (pur, server-importierbar — `user-data.ts` hat keinen `'use client'`-Header und referenziert `window` nur lazy in `setUserData`).
- Produces: `buildHashedUserData(input: { email?: string|null; phone?: string|null; firstName?: string|null; lastName?: string|null }): Record<string, unknown> | null`

- [ ] **Step 1: Write the failing test** — `claimondo-marketing/lib/analytics/user-data-mp.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { buildHashedUserData } from './user-data-mp'

const h = (v: string) => createHash('sha256').update(v).digest('hex')

describe('buildHashedUserData', () => {
  it('hasht normalisierte Werte (SHA-256 hex)', () => {
    const ud = buildHashedUserData({
      email: 'Max@Example.DE ',
      phone: '0151 1234567',
      firstName: 'Max',
      lastName: 'Mustermann',
    })
    expect(ud).toEqual({
      sha256_email_address: h('max@example.de'),
      sha256_phone_number: h('+491511234567'),
      address: { sha256_first_name: h('max'), sha256_last_name: h('mustermann') },
    })
  })
  it('lässt leere/ungültige Felder weg', () => {
    expect(buildHashedUserData({ email: 'keine-mail', phone: '', firstName: 'Max' })).toEqual({
      address: { sha256_first_name: h('max') },
    })
  })
  it('komplett leer → null', () => {
    expect(buildHashedUserData({})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify it fails** — `npm --prefix claimondo-marketing run test` → FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `claimondo-marketing/lib/analytics/user-data-mp.ts`

```ts
// SERVER-ONLY: SHA-256-gehashte user-provided data fuer GA4 Measurement Protocol
// (Enhanced Conversions). Normalisiert (E.164/lowercase/trim) → SHA-256 hex.
// Wird von ga4-mp.sendGa4Event in den MP-Body als `user_data` gehaengt.
import { createHash } from 'node:crypto'
import { toE164 } from './user-data'

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export type MpUserDataInput = {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
}

/** GA4-MP user_data (pre-gehasht). null wenn keine brauchbaren Felder. */
export function buildHashedUserData(input: MpUserDataInput): Record<string, unknown> | null {
  const ud: Record<string, unknown> = {}
  const email = input.email?.trim().toLowerCase()
  if (email && email.includes('@')) ud.sha256_email_address = sha256(email)
  const phone = toE164(input.phone ?? undefined)
  if (phone) ud.sha256_phone_number = sha256(phone)
  const address: Record<string, string> = {}
  const first = input.firstName?.trim().toLowerCase()
  const last = input.lastName?.trim().toLowerCase()
  if (first) address.sha256_first_name = sha256(first)
  if (last) address.sha256_last_name = sha256(last)
  if (Object.keys(address).length > 0) ud.address = address
  return Object.keys(ud).length > 0 ? ud : null
}
```

- [ ] **Step 4: Run test, verify it passes** — `npm --prefix claimondo-marketing run test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/lib/analytics/user-data-mp.ts claimondo-marketing/lib/analytics/user-data-mp.test.ts
git commit -m "feat(marketing): Server-EC-Helper user-data-mp.ts (SHA-256)"
```

---

### Task 3: Server-EC durch MP + Mini-Wizard verdrahten

**Files:**
- Modify: `claimondo-marketing/lib/analytics/ga4-mp.ts` (sendGa4Event)
- Modify: `claimondo-marketing/lib/analytics/ga4-conversions.ts` (trackServerConversion)
- Modify: `claimondo-marketing/lib/actions/create-lead-from-mini-wizard.ts`

**Interfaces:**
- Consumes: `buildHashedUserData` (Task 2).
- Produces: `sendGa4Event(opts: {…; userData?: Record<string,unknown> | null})` · `trackServerConversion(clientId, event, userData?: Record<string,unknown> | null)`

- [ ] **Step 1: `ga4-mp.ts` — `userData` in opts + Body.** In `sendGa4Event` die opts-Signatur erweitern um `userData?: Record<string, unknown> | null` und im `JSON.stringify`-Body ergänzen:

```ts
        body: JSON.stringify({
          client_id: opts.clientId,
          events: opts.events,
          consent: { ad_user_data: consent, ad_personalization: consent },
          ...(opts.userData ? { user_data: opts.userData } : {}),
        }),
```

- [ ] **Step 2: `ga4-conversions.ts` — `userData` durchreichen.** `trackServerConversion` um optionalen Parameter erweitern:

```ts
export async function trackServerConversion(
  clientId: string | null | undefined,
  event: Ga4Event,
  userData?: Record<string, unknown> | null,
): Promise<void> {
  if (!clientId) return
  await sendGa4Event({ clientId, events: [event], consentGranted: true, userData })
}
```

- [ ] **Step 3: `create-lead-from-mini-wizard.ts` — gehashtes user_data anhängen.** Import ergänzen:

```ts
import { getConsentedGaClientId, trackServerConversion } from '@/lib/analytics/ga4-conversions'
import { buildHashedUserData } from '@/lib/analytics/user-data-mp'
```

Den `generate_lead`-Aufruf (im `if (gaClientId)`-Block, `if (!isDisqualifiziert)`) ersetzen durch:

```ts
    if (!isDisqualifiziert) {
      void trackServerConversion(
        gaClientId,
        { name: 'generate_lead', params: { source: 'mini_wizard' } },
        buildHashedUserData({
          email: data.email,
          phone: data.telefon,
          firstName: data.vorname,
          lastName: data.nachname,
        }),
      )
    }
```

- [ ] **Step 4: Verify** — `npm --prefix claimondo-marketing run typecheck` → grün (kein Output).
- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/lib/analytics/ga4-mp.ts claimondo-marketing/lib/analytics/ga4-conversions.ts claimondo-marketing/lib/actions/create-lead-from-mini-wizard.ts
git commit -m "feat(marketing): Server-EC — user_data in MP + Mini-Wizard generate_lead"
```

---

### Task 4: Client-EC in die 4 gtag-Forms

**Files:**
- Modify: `claimondo-marketing/components/landing/HomeLeadFormClient.tsx`
- Modify: `claimondo-marketing/app/[locale]/check/CheckFunnelClient.tsx`
- Modify: `claimondo-marketing/components/shared/glass/BeratungModal.tsx`
- Modify: `claimondo-marketing/components/landing/StickyCallBar.tsx`

**Interfaces:** Consumes `setUserData` (Task 1). Muster überall: `import { setUserData } from '@/lib/analytics/user-data'` + `setUserData({...})` **direkt vor** dem bestehenden `trackEvent('generate_lead', …)`.

- [ ] **Step 1: HomeLeadFormClient** — Import ergänzen; im `result.ok`-Zweig vor `trackEvent('generate_lead', …)`:

```ts
        setUserData({ name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? '') })
```

- [ ] **Step 2: CheckFunnelClient** — Import ergänzen; im `res.ok`-Zweig vor `trackEvent('generate_lead', …)`:

```ts
        setUserData({ name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? '') })
```

- [ ] **Step 3: BeratungModal** — Import ergänzen; im `result.ok`-Zweig vor `trackEvent('generate_lead', …)`:

```ts
        setUserData({ name, phone: telefon, email: email || undefined })
```

- [ ] **Step 4: StickyCallBar** — Import ergänzen; im `r.ok`-Zweig vor `trackEvent('generate_lead', …)`:

```ts
        setUserData({ name, phone: telefon })
```

- [ ] **Step 5: Verify** — `npm --prefix claimondo-marketing run typecheck` grün, dann `npm --prefix claimondo-marketing run build` grün.
- [ ] **Step 6: Commit**

```bash
git add "claimondo-marketing/components/landing/HomeLeadFormClient.tsx" "claimondo-marketing/app/[locale]/check/CheckFunnelClient.tsx" "claimondo-marketing/components/shared/glass/BeratungModal.tsx" "claimondo-marketing/components/landing/StickyCallBar.tsx"
git commit -m "feat(marketing): Client-EC — setUserData vor generate_lead in 4 Forms"
```

---

### Task 5: Endverifikation

- [ ] **Step 1:** `npm --prefix claimondo-marketing run test` → alle grün (result-model 8 + trackEvent 4 + user-data + user-data-mp).
- [ ] **Step 2:** `npm --prefix claimondo-marketing run typecheck` → grün.
- [ ] **Step 3:** `npm --prefix claimondo-marketing run build` → grün (postbuild copy-standalone „fertig").
- [ ] **Step 4:** `git status` clean; Branch pushen + PR gegen `kitta/marketing-vitest` (stacked). PR-Body: EC-Design + ⚠️ Konsole/Legal (Ads-EC-Terms, GA4-UPD, DSE) + DebugView-Verifikation der MP-Shape.

## Self-Review (gegen Spec)
- Client-EC (4 Forms) → Task 1 + 4. ✓
- Server-EC (Mini-Wizard MP) → Task 2 + 3. ✓
- Nur Hashes / Consent-Mode-gated → Task 1 (gtag) + Task 3 (MP consent existiert) + Spec. ✓
- Tests beide Helper → Task 1 + 2. ✓
- Konsole/Legal-Caveats → Task 5 PR-Body + Spec. ✓
- Typkonsistenz: `userData?: Record<string,unknown> | null` einheitlich in sendGa4Event + trackServerConversion; `buildHashedUserData` liefert `…|null` → passt direkt. ✓
