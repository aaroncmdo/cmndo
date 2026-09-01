# Telefon-Login für alle (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle neu angelegten Partner-Konten (Makler/Werkstatt/SV) bekommen Telefon-Login ab Anlage, und JEDE Rolle kann Telefon-Login selbst in den Konto-Einstellungen aktivieren — entkoppelt von der optionalen 2FA.

**Architecture:** Teil 1 ruft den bestehenden `enablePhoneLogin`-Helper (Kunde-v1, prod-bewiesen) an den zwei Partner-Anlage-Chokepoints auf (kein Outbound, new-only). Teil 2 fügt eine `PhoneLoginCard` in das geteilte `KontoSicherheitPanel` (rendert für alle Rollen), die die Nummer per Supabase-`phone_change` (`updateUser` → OTP → `verifyOtp`) bestätigt und `auth.users.phone` setzt — ohne 2FA-Faktor.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase Auth (`updateUser({phone})` + `verifyOtp({type:'phone_change'})`, Admin `updateUserById`), react-email n/a, vitest (`renderToStaticMarkup` für Client-Cards, env=node).

## Global Constraints

- **Branch/PR:** `kitta/phone-login-for-all` (bereits erstellt, off `origin/staging`). PR gegen **`staging`**, NIE `main` (AGENTS.md Regel 1).
- **Kein DDL:** `auth.users.phone` existiert + ist UNIQUE (Supabase built-in). KEINE Migration.
- **Server-Actions:** neue `'use server'`-Datei exportiert NUR async Funktionen (AGENTS.md §Server-Actions/AAR-664). Result-Shape `{ ok: true } | { ok: false; error: string }` (kein `throw`, kein `success`-Mix).
- **UI-Umlaute Pflicht:** `PhoneLoginCard`-Strings sind nutzersichtbar → echte `ä/ö/ü/ß` (AGENTS.md §Sprache). (Backend/Log/Kommentar-Strings: ASCII ok.)
- **Teil 1 = kein Outbound:** `enablePhoneLogin` nutzt `phone_confirm:true` (silent, kein SMS). New-only (nur Anlage-Pfad).
- **Teil 2 = user-initiierter SMS** (ein Send pro „Code anfordern"-Klick, wie die bestehende 2FA-Nummer-Karte) + **von 2FA entkoppelt** (kein MFA-Faktor).
- **`mfa.ts` / `TwoFaPhoneChange` / B2-Lane NICHT anfassen.**
- **7-Punkte-Audit pro Commit; Ratchets 0-neu.**
- **Worktree-tsc:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`; bekannte Env-Modul-Fehler (`sharp`/`@react-pdf/renderer`/`@turf/union`/`jsqr`/`PDFParse`) sind KEINE echten Fehler. Voller Build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (Route-Änderung → Pflicht).

---

## Preconditions (vor Task 1 verifizieren — bei Nichterfüllung STOPP)

```bash
# (a) enablePhoneLogin liegt auf der Branch-Basis (Kunde-v1 gemergt):
test -f src/lib/auth/phone-login.ts && grep -q "export async function enablePhoneLogin" src/lib/auth/phone-login.ts && echo OK
# (b) Login-Phone-Tab existiert (rollen-agnostisch, unverändert):
grep -nE "signInWithOtp|verifyOtp.*type: 'sms'|finalisierePhoneLogin" src/app/login/LoginClient.tsx
```
Beide erfüllt (Stand 2026-07-10). Falls (a) fehlt: die Branch wurde nicht off dem gemergten staging gebrancht → neu branchen.

---

## File Structure

| Datei | Verantwortung | Änderung |
|---|---|---|
| `src/lib/makler/anlege-makler.ts` | Makler-Anlage-Kern (Self-Signup + Admin) | +`enablePhoneLogin`-Aufruf vor Return |
| `src/lib/partner/anlege-partner.ts` | Generischer Partner-Kern (makler/werkstatt/SV) | +`enablePhoneLogin`-Aufruf vor Return (alle Rollen) |
| `src/lib/auth/phone-login-actions.ts` | Server-Actions: Nummer verifizieren via phone_change | **NEU** |
| `src/lib/auth/phone-login-actions.test.ts` | Unit-Test der Actions | **NEU** |
| `src/components/auth/PhoneLoginCard.tsx` | Selbst-Service-Karte (2-Stufen) | **NEU** |
| `src/components/auth/PhoneLoginCard.test.tsx` | renderToStaticMarkup-Test (Initial-States) | **NEU** |
| `src/components/auth/KontoSicherheitPanel.tsx` | Geteiltes Sicherheits-Panel (alle Rollen) | +`PhoneLoginCard` (eigene Sektion, entkoppelt) |

---

### Task 1: Teil 1 — `enablePhoneLogin` in beiden Partner-Anlage-Kernen

**Files:**
- Modify: `src/lib/makler/anlege-makler.ts` (Import + Aufruf vor `return { ok: true, … }`)
- Modify: `src/lib/partner/anlege-partner.ts` (Import + Aufruf vor `return { ok: true, … }`)

**Interfaces:**
- Consumes: `enablePhoneLogin(admin: ReturnType<typeof createAdminClient>, userId: string, phone: string | null): Promise<boolean>` aus `@/lib/auth/phone-login`.
- Produces: nichts (der Rückgabe-Bool wird ignoriert — kein Welcome-Hinweis in v1).

> Placement-Rationale: der Aufruf steht am ENDE des Kerns (nach erfolgreichem Anlegen aller Rows, vor dem Return) — so läuft er nur bei voll erfolgreicher Anlage; ein Rollback (deleteUser) weiter oben nimmt auch `auth.users.phone` mit. `enablePhoneLogin` ist best-effort (wirft nie, Rückgabe ignoriert) → kann die Anlage nicht brechen.

- [ ] **Step 1: Import + Aufruf in `anlege-makler.ts`**

Import direkt unter der bestehenden `import { setzeStandardStaffel } …`-Zeile (Z.3):
```ts
import { enablePhoneLogin } from '@/lib/auth/phone-login'
```
Vor dem Schluss-Return (`grep -n "return { ok: true, userId, maklerId" src/lib/makler/anlege-makler.ts`) einfügen — die Zeile
```ts
  return { ok: true, userId, maklerId: m.id as string, password }
```
ersetzen durch:
```ts
  // AAR-phone-login (Phase 2): passwordless Telefon-Login fuer neue Makler aktivieren
  // (auth.users.phone = Anlage-Nummer). Best-effort/kollisionssicher, kein Outbound
  // (phone_confirm:true). New-only per Konstruktion (Kern laeuft nur bei Anlage).
  await enablePhoneLogin(admin, userId, input.telefon)

  return { ok: true, userId, maklerId: m.id as string, password }
```

- [ ] **Step 2: Import + Aufruf in `anlege-partner.ts`**

Import direkt unter der bestehenden `import { setzeStandardStaffel } …`-Zeile (Z.4):
```ts
import { enablePhoneLogin } from '@/lib/auth/phone-login'
```
Vor dem Schluss-Return (`grep -n "return { ok: true, userId, partnerId, password }" src/lib/partner/anlege-partner.ts`) einfügen — die Zeile
```ts
  return { ok: true, userId, partnerId, password }
```
ersetzen durch:
```ts
  // AAR-phone-login (Phase 2): passwordless Telefon-Login fuer ALLE neuen Partner
  // (makler/werkstatt/SV) aktivieren — unbedingt, kein Rollen-Guard. Best-effort/
  // kollisionssicher, kein Outbound (phone_confirm:true). New-only per Konstruktion.
  await enablePhoneLogin(admin, userId, input.telefon)

  return { ok: true, userId, partnerId, password }
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine NEUEN Fehler außer den bekannten Env-Modul-Fehlern. 0 Fehler in `anlege-makler.ts` / `anlege-partner.ts`.

> Test-Rationale: Die Aufrufe sind 1-Zeilen-additiv gegen einen prod-bewiesenen, rollen-agnostischen Helper (Mechanismus bereits durch `scripts/smoke/phone-login-mechanism.mjs` PASS-belegt). Ein voller Unit-Test der Kerne (createUser + profiles + rollen-Row + promo + staffel mocken) ist unverhältnismäßig; die Verdrahtung ist type-checked + im Review sichtbar, und der volle Build (Task 4) validiert die Route.

- [ ] **Step 4: Commit**

```bash
git add src/lib/makler/anlege-makler.ts src/lib/partner/anlege-partner.ts
git commit -m "feat(auth): Telefon-Login-Auto-Enroll fuer alle neuen Partner (Makler/Werkstatt/SV)"
```

---

### Task 2: Teil 2 — Server-Actions `phone-login-actions.ts` (phone_change) + Unit-Test

**Files:**
- Create: `src/lib/auth/phone-login-actions.ts`
- Test: `src/lib/auth/phone-login-actions.test.ts`

**Interfaces:**
- Consumes: `createClient` aus `@/lib/supabase/server` (SSR-User-Session), `toE164` aus `@/lib/format/telefon`.
- Produces:
  - `starteTelefonLoginVerify(phone: string): Promise<PhoneLoginResult>` — löst den phone_change-OTP aus.
  - `bestaetigeTelefonLoginVerify(phone: string, code: string): Promise<PhoneLoginResult>` — bestätigt, setzt `auth.users.phone`.
  - `type PhoneLoginResult = { ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/phone-login-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateUser = vi.fn()
const verifyOtp = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { updateUser, verifyOtp } }),
}))

import { starteTelefonLoginVerify, bestaetigeTelefonLoginVerify } from './phone-login-actions'

beforeEach(() => {
  updateUser.mockReset()
  verifyOtp.mockReset()
})

describe('starteTelefonLoginVerify', () => {
  it('normalisiert E.164 und ruft updateUser({phone}); ok', async () => {
    updateUser.mockResolvedValue({ error: null })
    const r = await starteTelefonLoginVerify('0175 1234567')
    expect(r).toEqual({ ok: true })
    expect(updateUser).toHaveBeenCalledWith({ phone: '+491751234567' })
  })
  it('false bei leerer Nummer, ohne API-Call', async () => {
    const r = await starteTelefonLoginVerify('')
    expect(r.ok).toBe(false)
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('Kollision -> freundliche Meldung', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Phone number already registered' } })
    const r = await starteTelefonLoginVerify('+491751234567')
    expect(r).toEqual({ ok: false, error: 'Diese Nummer ist bereits einem anderen Konto zugeordnet.' })
  })
})

describe('bestaetigeTelefonLoginVerify', () => {
  it('verifyOtp mit type phone_change; ok', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const r = await bestaetigeTelefonLoginVerify('+491751234567', '123456')
    expect(r).toEqual({ ok: true })
    expect(verifyOtp).toHaveBeenCalledWith({ phone: '+491751234567', token: '123456', type: 'phone_change' })
  })
  it('false bei nicht-6-stelligem Code, ohne API-Call', async () => {
    const r = await bestaetigeTelefonLoginVerify('+491751234567', '12')
    expect(r.ok).toBe(false)
    expect(verifyOtp).not.toHaveBeenCalled()
  })
  it('ungueltiger Code -> Meldung', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Invalid OTP token' } })
    const r = await bestaetigeTelefonLoginVerify('+491751234567', '000000')
    expect(r).toEqual({ ok: false, error: 'Ungueltiger oder abgelaufener Code.' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/phone-login-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./phone-login-actions"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/phone-login-actions.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { toE164 } from '@/lib/format/telefon'

// AAR-phone-login (Phase 2): Selbst-Service Telefon-Login-Aktivierung fuer JEDE
// Rolle, entkoppelt von 2FA. Nutzt Supabase-natives phone_change auf der eigenen
// User-Session (SSR): updateUser({phone}) sendet einen OTP -> verifyOtp(type:
// 'phone_change') setzt auth.users.phone. KEIN MFA-Faktor -> 2FA bleibt unberuehrt.
export type PhoneLoginResult = { ok: true } | { ok: false; error: string }

/** Loest den phone_change-OTP fuer die neue Login-Nummer aus (SMS an die Nummer). */
export async function starteTelefonLoginVerify(phone: string): Promise<PhoneLoginResult> {
  const e164 = toE164(phone)
  if (!e164) return { ok: false, error: 'Bitte eine gültige Telefonnummer eingeben.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ phone: e164 })
  if (error) return { ok: false, error: uebersetzePhoneLoginFehler(error.message) }
  return { ok: true }
}

/** Bestaetigt den SMS-Code (phone_change) -> auth.users.phone gesetzt + bestaetigt. */
export async function bestaetigeTelefonLoginVerify(phone: string, code: string): Promise<PhoneLoginResult> {
  const e164 = toE164(phone)
  if (!e164) return { ok: false, error: 'Bitte eine gültige Telefonnummer eingeben.' }
  const sauber = code.replace(/\D/g, '').slice(0, 6)
  if (sauber.length !== 6) return { ok: false, error: 'Bitte den 6-stelligen Code eingeben.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: sauber, type: 'phone_change' })
  if (error) return { ok: false, error: uebersetzePhoneLoginFehler(error.message) }
  return { ok: true }
}

// Lokaler Helfer (NICHT exportiert — 'use server' erlaubt nur async Exports).
function uebersetzePhoneLoginFehler(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('already') || m.includes('registered') || m.includes('duplicate') || m.includes('unique')) {
    return 'Diese Nummer ist bereits einem anderen Konto zugeordnet.'
  }
  if (m.includes('invalid') && (m.includes('code') || m.includes('otp') || m.includes('token'))) {
    return 'Ungültiger oder abgelaufener Code.'
  }
  if (m.includes('expired')) return 'Der Code ist abgelaufen. Bitte einen neuen anfordern.'
  if (m.includes('rate') || m.includes('too many') || m.includes('limit')) {
    return 'Zu viele Versuche. Bitte später erneut versuchen.'
  }
  return 'Aktion fehlgeschlagen. Bitte erneut versuchen.'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/phone-login-actions.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/phone-login-actions.ts src/lib/auth/phone-login-actions.test.ts
git commit -m "feat(auth): phone-login-actions — Selbst-Service Nummer-Verify via phone_change"
```

> **CONTROLLER-GATE nach Task 2 (phone_change-Mechanismus validieren, bevor die Card darauf gebaut wird):**
> Der volle Round-Trip braucht echten SMS-Empfang (nicht automatisierbar), ABER die Sende-Seite (ist phone_change im Projekt aktiv?) ist prüfbar: als Test-Account einloggen und `updateUser({phone})` gegen eine Nummer aufrufen — akzeptiert Supabase den Request (OTP-Send, evtl. Twilio-„invalid number" bei Fake-Nummer = TROTZDEM aktiv), oder lehnt es als „phone change disabled/not configured" ab? Script (Controller führt aus, mit `CLAIMONDO_ENV_FILE`):
> ```js
> import { createClient } from '@supabase/supabase-js'
> // anon key + Test-Account (z.B. smoke-2fa@ / <PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>) -> signInWithPassword -> updateUser({phone:'+49151<ts>'}) -> error inspizieren -> cleanup (updateUser zuruecksetzen ist optional; Smoke-Account).
> ```
> Fehler enthält „disabled"/„not configured"/„provider" → phone_change NICHT nutzbar → **Fallback** (Appendix A) einbauen, bevor Task 3 weitergeht. Sonst: phone_change bestätigt, weiter mit Task 3.

---

### Task 3: Teil 2 — `PhoneLoginCard` + `KontoSicherheitPanel`-Integration

**Files:**
- Create: `src/components/auth/PhoneLoginCard.tsx`
- Test: `src/components/auth/PhoneLoginCard.test.tsx`
- Modify: `src/components/auth/KontoSicherheitPanel.tsx`

**Interfaces:**
- Consumes: `starteTelefonLoginVerify`, `bestaetigeTelefonLoginVerify` (Task 2); `Modal` aus `@/components/primitives/Modal`.
- Produces: `PhoneLoginCard({ aktuellePhone }: { aktuellePhone: string | null })` — Client-Komponente; gerendert vom Panel für alle Rollen.

- [ ] **Step 1: Write the failing test**

Create `src/components/auth/PhoneLoginCard.test.tsx`:
```tsx
// env=node: renderToStaticMarkup (kein jsdom). Actions + Modal gemockt.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth/phone-login-actions', () => ({
  starteTelefonLoginVerify: vi.fn(),
  bestaetigeTelefonLoginVerify: vi.fn(),
}))
vi.mock('@/components/primitives/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('div', null, children)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { PhoneLoginCard } from './PhoneLoginCard'

describe('PhoneLoginCard', () => {
  it('zeigt den Titel + "aktiv" + maskierte Nummer wenn aktuellePhone gesetzt', () => {
    const html = renderToStaticMarkup(React.createElement(PhoneLoginCard, { aktuellePhone: '+491751234567' }))
    expect(html).toContain('Telefon-Login')
    expect(html).toMatch(/aktiv/i)
    expect(html).not.toContain('1751234567') // maskiert
  })
  it('zeigt "nicht aktiv" wenn keine Nummer', () => {
    const html = renderToStaticMarkup(React.createElement(PhoneLoginCard, { aktuellePhone: null }))
    expect(html).toContain('Telefon-Login')
    expect(html).toMatch(/nicht aktiv/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/auth/PhoneLoginCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./PhoneLoginCard"`.

- [ ] **Step 3: Write `PhoneLoginCard.tsx`**

Create `src/components/auth/PhoneLoginCard.tsx` (spiegelt `TwoFaPhoneChange` — 2-Stufen-Modal — ohne MFA-Faktor):
```tsx
'use client'

// AAR-phone-login (Phase 2): Selbst-Service-Karte, mit der JEDE Rolle den
// passwordless Telefon-Login aktiviert/aendert — entkoppelt von 2FA. Zwei Stufen:
// Nummer eingeben -> SMS-Code bestaetigen. Setzt auth.users.phone via phone_change
// (Server-Actions), KEINEN MFA-Faktor.
import { useState, useTransition } from 'react'
import { PhoneIcon, LoaderIcon, XIcon } from 'lucide-react'
import {
  starteTelefonLoginVerify,
  bestaetigeTelefonLoginVerify,
} from '@/lib/auth/phone-login-actions'
import { Modal } from '@/components/primitives/Modal'

export function PhoneLoginCard({ aktuellePhone }: { aktuellePhone: string | null }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'input' | 'code'>('input')
  const [neuePhone, setNeuePhone] = useState('')
  const [normalized, setNormalized] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setStep('input')
    setNeuePhone('')
    setNormalized('')
    setCode('')
    setError(null)
    setSuccess(null)
  }

  function sendCode() {
    setError(null)
    startTransition(async () => {
      const r = await starteTelefonLoginVerify(neuePhone)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setNormalized(neuePhone)
      setStep('code')
    })
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const r = await bestaetigeTelefonLoginVerify(normalized, code)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setSuccess('Telefon-Login aktiviert.')
      setTimeout(() => {
        setOpen(false)
        reset()
        window.location.reload()
      }, 1500)
    })
  }

  return (
    <>
      <div className="rounded-ios-xl border border-claimondo-border bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <PhoneIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Telefon-Login</h3>
        </div>
        <p className="text-xs text-claimondo-ondo">
          Melde dich künftig direkt mit deiner Telefonnummer an — ohne Passwort. Unabhängig von der
          Zwei-Faktor-Authentifizierung.
        </p>
        <p className="text-xs text-claimondo-ondo mt-1">
          Status:{' '}
          {aktuellePhone ? (
            <span className="font-medium text-claimondo-navy">aktiv (<span className="font-mono">{mask(aktuellePhone)}</span>)</span>
          ) : (
            <span className="text-claimondo-ondo/70">nicht aktiv</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(true)
          }}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy"
        >
          {aktuellePhone ? 'Nummer ändern' : 'Telefon-Login aktivieren'}
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        closeOnBackdrop={!pending}
        closeOnEsc={!pending}
        noPadding
        hideCloseButton
        maxWidth={448}
        ariaLabel="Telefon-Login einrichten"
      >
        <div>
          <div className="flex items-center justify-between border-b border-claimondo-border p-4">
            <h2 className="text-base font-semibold text-claimondo-navy">Telefon-Login einrichten</h2>
            <button
              type="button"
              onClick={() => !pending && setOpen(false)}
              className="p-1.5 rounded-ios-md hover:bg-claimondo-bg"
              aria-label="Schließen"
            >
              <XIcon className="w-4 h-4 text-claimondo-ondo" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {step === 'input' && (
              <>
                <p className="text-xs text-claimondo-ondo">
                  Wir senden einen 6-stelligen Code per SMS an deine Nummer. Nach der Bestätigung kannst
                  du dich damit einloggen.
                </p>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                    Telefonnummer
                  </label>
                  <input
                    type="tel"
                    value={neuePhone}
                    onChange={(e) => setNeuePhone(e.target.value)}
                    placeholder="+49 151 12345678 oder 0151 12345678"
                    className="w-full text-sm rounded-ios-md border border-claimondo-border px-2 py-2 outline-none focus:border-claimondo-ondo"
                  />
                </div>
              </>
            )}

            {step === 'code' && (
              <>
                <p className="text-xs text-claimondo-ondo">
                  Wir haben einen Code an <span className="font-mono">{mask(normalized)}</span> gesendet.
                  Bitte eingeben, um den Telefon-Login zu aktivieren.
                </p>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                    6-stelliger Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full text-lg font-mono tracking-widest rounded-ios-md border border-claimondo-border px-2 py-2 outline-none focus:border-claimondo-ondo text-center"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('input')
                    setCode('')
                    setError(null)
                  }}
                  className="text-xs text-claimondo-ondo hover:text-claimondo-navy"
                >
                  ← andere Nummer eingeben
                </button>
              </>
            )}

            {error && (
              <p className="text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-md p-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-success-strong bg-success-soft border border-success/30 rounded-ios-md p-2">
                {success}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-claimondo-border p-3">
            <button
              type="button"
              onClick={() => !pending && setOpen(false)}
              disabled={pending}
              className="px-3 py-1.5 rounded-ios-md text-xs font-medium border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
            >
              Abbrechen
            </button>
            {step === 'input' ? (
              <button
                type="button"
                onClick={sendCode}
                disabled={pending || !neuePhone.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
              >
                {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
                Code senden
              </button>
            ) : (
              <button
                type="button"
                onClick={confirm}
                disabled={pending || code.length !== 6}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
              >
                {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
                Bestätigen
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

// Lokaler Masker (bewusst dupliziert statt aus TwoFaPhoneChange zu importieren —
// B2-Datei nicht anfassen; der Helfer ist trivial).
function mask(phone: string): string {
  if (phone.length < 6) return phone
  return phone.slice(0, 4) + '•••••' + phone.slice(-3)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/auth/PhoneLoginCard.test.tsx`
Expected: PASS (2 passed).
> Falls `renderToStaticMarkup` an `useTransition` scheitert (SSR-Hook-Edge-Case): den Test auf die statische Card-Hülle beschränken (Titel/Status ohne Modal) oder als DONE_WITH_CONCERNS melden — dann deckt tsc/build + der Prod-Smoke (Task 4) die Card.

- [ ] **Step 5: `KontoSicherheitPanel` integrieren (Card in eigener, entkoppelter Sektion)**

In `src/components/auth/KontoSicherheitPanel.tsx`:
Import unter den bestehenden Card-Imports ergänzen:
```ts
import { PhoneLoginCard } from '@/components/auth/PhoneLoginCard'
```
Den `return (…)`-Block ersetzen (2FA-Gruppe in eigenes `div` kapseln + `PhoneLoginCard` als Geschwister-Sektion, damit die „Zwei-Faktor-Authentifizierung"-Überschrift NUR die 2FA-Karten umfasst):
```tsx
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">
            Zwei-Faktor-Authentifizierung
          </h2>
        </div>
        <p className="text-xs text-claimondo-ondo">
          Schütze dein Konto mit einem zweiten Faktor — SMS-Code oder Authenticator-App. Beides ist
          optional und kann jederzeit geändert oder entfernt werden.
        </p>
        <TwoFaPhoneChange
          aktuelleTwofaTelefon={profile?.twofa_telefon ?? null}
          fallbackTelefon={profile?.telefon ?? null}
        />
        <TotpEnrollCard />
        <VertrauteGeraeteSection />
      </div>
      <PhoneLoginCard aktuellePhone={user.phone || null} />
    </div>
  )
```

- [ ] **Step 6: Typecheck + Commit**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0 neue Fehler (außer bekannten Env).
```bash
git add src/components/auth/PhoneLoginCard.tsx src/components/auth/PhoneLoginCard.test.tsx src/components/auth/KontoSicherheitPanel.tsx
git commit -m "feat(auth): PhoneLoginCard — Selbst-Service Telefon-Login fuer alle Rollen im Konto-Sicherheit-Panel"
```

---

### Task 4: Gesamt-Verifikation + phone_change-Prod-Smoke + PR + Koordination

**Files:** keine Code-Änderung (außer ggf. Fallback aus Appendix A, falls das Controller-Gate es verlangte).

- [ ] **Step 1: Fokus-Tests grün**

Run: `npx vitest run src/lib/auth/phone-login-actions.test.ts src/components/auth/PhoneLoginCard.test.tsx`
Expected: alle grün (6 + 2).

- [ ] **Step 2: Ratchets + tsc + Build**

Run: `npm run check:token-audit` → grün (Card nutzt `bg-claimondo-*`/`text-*`/`rounded-ios-*` + `danger`/`success`-Tokens — kein neues Hex/Status-Scale).
Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → nur bekannte Env-Fehler.
Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün (das `| tail`-Pipe VERMEIDEN — echter Exit-Code; auf „Compiled successfully" + Route-Tabelle prüfen).

- [ ] **Step 3: phone_change-Prod-Smoke (echter Round-Trip, Controller/Aaron, Test-Account)**

Als Test-Account mit ECHTER erreichbarer Nummer einloggen → Konto-Sicherheit → „Telefon-Login aktivieren" → Nummer → SMS-Code → „Bestätigen" → Erfolg. Danach Admin-Check `auth.users.phone` gesetzt (Node-Admin-API oder Supabase-Studio). Ausloggen → Login per Telefonnummer mit derselben Nummer → landet im Portal. **Falls `updateUser({phone})` schon beim „Code senden" mit „disabled/not configured" fehlschlägt → Fallback Appendix A** (Actions umbauen, Task 2/3 re-review).

- [ ] **Step 4: 7-Punkte-Audit + Branch pushen**

```bash
git push -u origin kitta/phone-login-for-all
```

- [ ] **Step 5: PR gegen `staging`**

```bash
gh pr create --base staging --title "feat(auth): Telefon-Login fuer alle (Phase 2) — Partner-Auto-Enroll + Selbst-Service-Karte" --body "<Audit-Block: Build gruen / UI: PhoneLoginCard fuer alle Rollen (echte Umlaute) / Redundanz: nutzt enablePhoneLogin (Kunde-v1) / Dead-Code: keiner / Spec: 3 Entscheidungen erfuellt / Inkonsistenz: {ok}-Result, mfa.ts unberuehrt, token-audit gruen / Regression: 2FA-Pfad + anlege-Kerne additiv, kein DDL / phone_change Prod-Smoke bestanden>"
```

- [ ] **Step 6: Koordinations-Marker `coordination-phone-login-for-all` + MEMORY.md-Zeile**

File-Touch dokumentieren (anlege-makler.ts, anlege-partner.ts additiv; KontoSicherheitPanel restrukturiert; neue Files). Beziehung zu `[[coordination-kunde-phone-login]]` + `[[coordination-phone-login-collision-note]]`. Vermerken: `merkeTwofaTelefon`-DRY-Adoption weiterhin offen (B2-Lane).

---

## Appendix A — Fallback (nur falls das Controller-Gate zeigt: phone_change ist im Projekt nicht nutzbar)

`phone_change` durch die bewährten MFA-Primitive ersetzen (alle live in `mfa.ts`), OHNE dass ein 2FA-Faktor zurückbleibt. Nur `phone-login-actions.ts` + die zwei Card-Handler ändern sich; Card-UI/Panel bleiben.

- `starteTelefonLoginVerify(phone)` → statt `updateUser`: `enrollePhoneFaktor(phone)` (aus `@/lib/auth/twofa/mfa`) → liefert `{ factorId, challengeId }` (sendet die SMS). Rückgabe erweitern auf `{ ok: true; factorId: string; challengeId: string } | { ok: false; error }`.
- `bestaetigeTelefonLoginVerify(phone, code, factorId, challengeId)` → `verifyPhoneFaktor(factorId, challengeId, code)` (verifiziert Besitz) → bei ok: `enablePhoneLogin(createAdminClient(), user.id, phone)` (setzt `auth.users.phone`; `user.id` aus `supabase.auth.getUser()`) → dann `entferneFaktor(factorId)` (Faktor entfernen, damit 2FA NICHT aktiviert wird). Result `{ ok }`.
- Card: `sendCode` speichert `factorId`/`challengeId` aus dem `starte`-Result im State; `confirm` reicht sie an `bestaetige` durch. Sonst identisch.
- Tests entsprechend anpassen (mock `enrollePhoneFaktor`/`verifyPhoneFaktor`/`entferneFaktor`/`enablePhoneLogin`).

Trade-off: legt transient einen Phone-Faktor an + entfernt ihn wieder (kurz aal2), aber nutzt ausschließlich prod-bewiesene Primitive.

---

## Self-Review

**1. Spec coverage:**
- Teil 1 Auto-Enroll alle Partner → Task 1 (beide Kerne, anlegePartnerKern unbedingt = alle Rollen). ✓
- Teil 2 Selbst-Service-Karte alle Rollen, SMS-bestätigt, entkoppelt von 2FA → Task 2 (Actions) + Task 3 (Card in geteiltem Panel). ✓
- Mechanismus phone_change + Fallback → Task 2 + Controller-Gate + Appendix A. ✓
- Invarianten (ein auth.users.phone-Ziel, nie stehlen, Login-Seite unverändert, kein DDL, 2FA-Entkopplung) → Global Constraints + Task-Kommentare + kein MFA-Faktor in Task 2. ✓
- Kein Welcome-Hinweis / kein Disable / kein Backfill → nicht im Plan (bewusst raus, Spec-Nicht-Ziele). ✓
- Testing (Actions-Unit, Card-render, Mechanismus-Smoke bereits grün, ehrliche SMS-Grenze) → Tasks 2/3/4. ✓

**2. Placeholder scan:** keine TBD/„handle errors"; jeder Code-Step zeigt vollständigen Code; Fehlermapping explizit. Der Fallback (Appendix A) ist konkret auf Primitiv-Ebene beschrieben (Contingency, kein Pflicht-Step). ✓

**3. Type consistency:** `PhoneLoginResult = { ok: true } | { ok: false; error: string }` konsistent in Actions + Card-Handlern. `starteTelefonLoginVerify(phone)`/`bestaetigeTelefonLoginVerify(phone, code)` identisch in Task 2 (Def), Task 3 (Card-Aufruf), Test. `enablePhoneLogin(admin, userId, phone)` wie Kunde-v1. `PhoneLoginCard({ aktuellePhone })` konsistent Test + Panel (`user.phone || null`). ✓
