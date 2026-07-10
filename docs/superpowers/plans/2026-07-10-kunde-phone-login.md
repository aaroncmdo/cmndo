# Kunde Telefon-Login (First-Class-Registrierung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neu registrierte Kunden koennen sich mit ihrer Telefonnummer (passwordless SMS-OTP) einloggen, weil ihre Flow-Nummer bei der Konto-Erstellung nach `auth.users.phone` gespiegelt wird.

**Architecture:** Ein kleiner, fail-safe/kollisionssicherer Shared-Helper `enablePhoneLogin` spiegelt die Nummer via Supabase-Admin-API nach `auth.users.phone` (E.164, confirmed). `createKundeAccount` ruft ihn NUR im Neu-Konto-Zweig auf und reicht ein `phoneLoginAktiviert`-Flag bis zur Willkommens-Email durch, die konditional einen Hinweis rendert. Die Login-Seite (Phone-Tab) existiert bereits und ist rollen-agnostisch — sie bleibt unveraendert.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase Auth (Admin-API `updateUserById`), react-email, vitest, Playwright/Node-Smokes.

## Global Constraints

- **Branch/PR:** Feature-Branch `kitta/kunde-phone-login` (bereits erstellt, off `origin/staging`). PR gegen **`staging`**, NIE direkt auf `main` pushen (AGENTS.md Regel 1).
- **Kein DDL:** `auth.users.phone` existiert bereits + ist UNIQUE (Supabase built-in). Diese Aenderung braucht KEINE Migration — Regel 2 wird nicht ausgeloest.
- **UI-Umlaute Pflicht:** Der neue Email-Hinweis ist nutzersichtbar → echte `ä/ö/ü/ß` (AGENTS.md §Sprache). Alle 6 Locales pflegen (de/en/tr/ar/ru/pl).
- **Server-Action-Pattern:** `createKundeAccount` behaelt seinen bestehenden `{ success, ... }`-Shape — NICHT auf `{ ok }` umstellen (konsistent im File bleiben, AGENTS.md §Server-Actions).
- **7-Punkte-Audit pro Commit** (AGENTS.md) — Build/tsc gruen (bei Server-Action-/Route-Files IMMER voller `npm run build`), Ratchets 0-neu.
- **Heisses File:** `src/app/flow/[token]/actions.ts` wird von mehreren aar-956-Sessions bearbeitet. Touch minimal halten; falls der File-Collision-Hook blockt → Task 3 kurz zurueckstellen, an den anderen Tasks weiterarbeiten, spaeter erneut. Bodies fremder Funktionen NIE anfassen.
- **Worktree-tsc:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`. 17 bekannte Env-Modul-Fehler (`sharp`, `@react-pdf/renderer`, `@turf/union`, `jsqr`, `PDFParse`) sind KEINE echten Fehler — Deliverable = „keine NEUEN Fehler ausserhalb dieser 17".

---

## Preconditions (vor Task 1 verifizieren — bei Nichterfuellung STOPP + Plan revidieren)

Das Feature setzt voraus, dass die Login-Seite den Telefon-Login schon rollen-agnostisch beherrscht. Bestaetigen:

```bash
# (a) Phone-Tab loest gegen auth.users.phone auf, kein Auto-Signup:
grep -nE "signInWithOtp|shouldCreateUser: false|verifyOtp|finalisierePhoneLogin" src/app/login/LoginClient.tsx
# ERWARTET: signInWithOtp({ phone: toE164(phone), options: { shouldCreateUser: false } }),
#           verifyOtp({ ... type: 'sms' }), finalisierePhoneLogin()

# (b) KEIN rollen-spezifisches Gate im Phone-Handler (Kunde darf durch):
grep -nE "rolle\s*===\s*'kunde'|rolle\s*!==\s*'kunde'" src/app/login/LoginClient.tsx
# ERWARTET: keine Treffer im Phone-Send/-Verify-Handler
```

Beide erfuellt (Stand 2026-07-10). Falls sich das geaendert hat: STOPP — die Annahme „Login-Seite ready" traegt das ganze Feature.

---

## File Structure

| Datei | Verantwortung | Aenderung |
|---|---|---|
| `src/lib/auth/phone-login.ts` | Fail-safe Spiegel Nummer → `auth.users.phone` | **NEU** |
| `src/lib/auth/phone-login.test.ts` | Unit-Test des Helpers (Normalisierung, true/false, Kollision, Throw) | **NEU** |
| `src/lib/email/google/templates/KundeWelcome.i18n.ts` | 6-Locale-Strings der Welcome-Mail | +`telefonLoginHint` |
| `src/lib/email/google/templates/KundeWelcome.tsx` | Welcome-Mail-Template | +`LoginInfo.phoneLoginAktiviert` + konditionaler `<Note>` |
| `src/lib/email/google/templates/__tests__/KundeWelcome.test.tsx` | Render-Test des Hinweises | **NEU** |
| `src/lib/email/google/flows.ts` | `sendKundeWelcome` + `KundeWelcomeLoginInfo` | +Feld im Typ (traegt durch bestehendes `loginInfo: loginInfo ?? null`) |
| `src/app/flow/[token]/actions.ts` | `createKundeAccount`/`finalizeKundeSetup`/`sendWelcomeWithLogin` | +Enroll-Call (Neu-Zweig) + Flag durchreichen |
| `scripts/smoke/phone-login-mechanism.mjs` | Node-Smoke: reale Supabase-Infra setzt phone + UNIQUE fail-safe | **NEU** |

---

### Task 1: `enablePhoneLogin` Helper + Unit-Test

**Files:**
- Create: `src/lib/auth/phone-login.ts`
- Test: `src/lib/auth/phone-login.test.ts`

**Interfaces:**
- Consumes: `toE164` from `@/lib/format/telefon` (`(raw: string | null | undefined) => string | null`), `createAdminClient` from `@/lib/supabase/admin` (nur fuer den `ReturnType`-Typ).
- Produces: `enablePhoneLogin(admin: ReturnType<typeof createAdminClient>, userId: string, phone: string | null): Promise<boolean>` — `true` nur wenn der `auth.users.phone`-Sync griff.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/phone-login.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { enablePhoneLogin } from './phone-login'

type Admin = Parameters<typeof enablePhoneLogin>[0]

// Minimaler struktureller Mock — enablePhoneLogin nutzt nur admin.auth.admin.updateUserById.
function makeAdmin(result: { error: { message: string } | null } | Error) {
  const updateUserById = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  const admin = { auth: { admin: { updateUserById } } } as unknown as Admin
  return { admin, updateUserById }
}

describe('enablePhoneLogin', () => {
  it('normalisiert die Nummer auf E.164 und setzt phone_confirm; gibt true zurueck', async () => {
    const { admin, updateUserById } = makeAdmin({ error: null })
    const ok = await enablePhoneLogin(admin, 'user-1', '0175 1234567')
    expect(ok).toBe(true)
    expect(updateUserById).toHaveBeenCalledWith('user-1', {
      phone: '+491751234567',
      phone_confirm: true,
    })
  })

  it('gibt false zurueck ohne Nummer und ruft die Admin-API nicht', async () => {
    const { admin, updateUserById } = makeAdmin({ error: null })
    expect(await enablePhoneLogin(admin, 'user-1', null)).toBe(false)
    expect(await enablePhoneLogin(admin, 'user-1', '')).toBe(false)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('gibt false zurueck bei UNIQUE-Kollision (Error-Result), ohne zu werfen', async () => {
    const { admin } = makeAdmin({ error: { message: 'phone number already registered' } })
    expect(await enablePhoneLogin(admin, 'user-2', '+491751234567')).toBe(false)
  })

  it('gibt false zurueck wenn updateUserById wirft (fail-safe)', async () => {
    const { admin } = makeAdmin(new Error('network down'))
    expect(await enablePhoneLogin(admin, 'user-3', '+491751234567')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/phone-login.test.ts`
Expected: FAIL — `Failed to resolve import "./phone-login"` (Datei existiert noch nicht).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/phone-login.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { toE164 } from '@/lib/format/telefon'

/**
 * Aktiviert den passwordless Telefon-Login fuer einen User, indem die Nummer
 * (E.164, confirmed) nach auth.users.phone gespiegelt wird. signInWithOtp loest
 * beim Login GEGEN auth.users.phone auf (nicht gegen profiles/leads.telefon) —
 * ohne diesen Spiegel findet der Telefon-Login das Konto nicht.
 *
 * FAIL-SAFE + KOLLISIONSSICHER: auth.users.phone ist UNIQUE. Ist die Nummer schon
 * einem anderen Konto zugeordnet, schlaegt updateUserById fehl; wir fangen das ab
 * und geben false zurueck — das aeltere Konto behaelt die Nummer, dieses Konto
 * faellt auf Email/Magic-Link zurueck. Der Aufrufer darf NIE daran scheitern
 * (best-effort). Rueckgabe true = der Sync griff (Login-per-Nummer aktiv).
 */
export async function enablePhoneLogin(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  phone: string | null,
): Promise<boolean> {
  const e164 = toE164(phone)
  if (!e164) return false
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      phone: e164,
      phone_confirm: true,
    })
    if (error) {
      console.warn(
        '[phone-login] auth.users.phone-Sync uebersprungen (evtl. Nummer bereits vergeben):',
        error.message,
      )
      return false
    }
    return true
  } catch (err) {
    console.warn('[phone-login] auth.users.phone-Sync Ausnahme (non-critical):', err)
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/phone-login.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/phone-login.ts src/lib/auth/phone-login.test.ts
git commit -m "feat(auth): enablePhoneLogin Helper — auth.users.phone-Sync (fail-safe, kollisionssicher)"
```

---

### Task 2: Welcome-Email — konditionaler Telefon-Login-Hinweis

**Files:**
- Modify: `src/lib/email/google/templates/KundeWelcome.i18n.ts` (Typ `S` + 6 Locales)
- Modify: `src/lib/email/google/templates/KundeWelcome.tsx:19-23` (`LoginInfo`-Typ) + Render-Block (~Z.131)
- Modify: `src/lib/email/google/flows.ts:59-63` (`KundeWelcomeLoginInfo`-Typ)
- Test: `src/lib/email/google/templates/__tests__/KundeWelcome.test.tsx` (NEU)

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: `KundeWelcomeLoginInfo.phoneLoginAktiviert?: boolean` (von Task 3 gesetzt) und `LoginInfo.phoneLoginAktiviert?: boolean` (Template). Wenn `true` → Mail enthaelt den String aus `s.telefonLoginHint` (de-Kern: „mit Ihrer Telefonnummer anmelden").

- [ ] **Step 1: Write the failing test**

Create `src/lib/email/google/templates/__tests__/KundeWelcome.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { KundeWelcomeEmail } from '../KundeWelcome'

const base = {
  vorname: 'Max',
  fallNummer: 'CL-2026-0001',
  unfallDatum: '01.07.2026',
  adresse: 'Teststr. 1, 50667 Köln',
  fahrzeug: 'VW Golf',
  versicherung: 'HUK-Coburg',
  svName: null,
  accountExists: false,
  locale: 'de',
  loginInfo: { magicLink: null, email: 'max@example.com', password: 'Secret123!' },
}

// Distinktiver Kern des de-Hinweises — eindeutig, nicht Teil anderer Strings.
const HINT = 'mit Ihrer Telefonnummer anmelden'

describe('KundeWelcomeEmail — Telefon-Login-Hinweis', () => {
  it('zeigt den Hinweis wenn phoneLoginAktiviert=true', async () => {
    const html = await render(
      KundeWelcomeEmail({ ...base, loginInfo: { ...base.loginInfo, phoneLoginAktiviert: true } }),
    )
    expect(html).toContain(HINT)
  })

  it('zeigt den Hinweis NICHT ohne phoneLoginAktiviert', async () => {
    const html = await render(KundeWelcomeEmail(base))
    expect(html).not.toContain(HINT)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/email/google/templates/__tests__/KundeWelcome.test.tsx`
Expected: FAIL — der positive Case findet `HINT` nicht (Feld+Render fehlen noch). (Ggf. TS-Fehler auf `phoneLoginAktiviert` — auch ein erwarteter Fehlschlag.)

- [ ] **Step 3a: `telefonLoginHint` in den i18n-Typ + alle 6 Locales**

In `src/lib/email/google/templates/KundeWelcome.i18n.ts`:

Im Typ `S`, direkt nach `passwortHint: string` (innerhalb der `loginInfo branch`-Gruppe):

```ts
  passwortHint: string
  telefonLoginHint: string
```

Dann in JEDEM der 6 Locale-Objekte direkt nach der `passwortHint:`-Zeile die passende Uebersetzung ergaenzen:

```ts
// de:
  telefonLoginHint: 'Tipp: Sie können sich künftig auch direkt mit Ihrer Telefonnummer anmelden — ganz ohne Passwort.',
// en:
  telefonLoginHint: 'Tip: In future you can also log in directly with your phone number — no password needed.',
// tr:
  telefonLoginHint: 'İpucu: Bundan böyle doğrudan telefon numaranızla da giriş yapabilirsiniz — şifre gerekmez.',
// ar:
  telefonLoginHint: 'نصيحة: يمكنك مستقبلاً تسجيل الدخول مباشرةً برقم هاتفك أيضًا — دون الحاجة إلى كلمة مرور.',
// ru:
  telefonLoginHint: 'Совет: в дальнейшем вы также можете входить напрямую по номеру телефона — без пароля.',
// pl:
  telefonLoginHint: 'Wskazówka: w przyszłości możesz też logować się bezpośrednio numerem telefonu — bez hasła.',
```

Wichtig: Der Test prueft den **de**-String (`base.locale='de'`) auf `mit Ihrer Telefonnummer anmelden` — den de-Text nicht umformulieren.

- [ ] **Step 3b: `phoneLoginAktiviert` in den Template-Typ + Render**

In `src/lib/email/google/templates/KundeWelcome.tsx`, den lokalen `LoginInfo`-Typ (Z.19-23) erweitern:

```ts
export type LoginInfo = {
  magicLink: string | null
  email: string
  password: string
  // AAR-phone-login: konditionaler Hinweis, wenn auth.users.phone gesetzt wurde
  phoneLoginAktiviert?: boolean
}
```

Im Render, im `props.loginInfo ? (...)`-Zweig, direkt NACH dem schliessenden `</div>` des Zugangsdaten-Blocks und VOR dem schliessenden `</>` (der `<Note>{s.passwortHint}</Note>` steht INNERHALB des `<div>`; danach kommt `</div>`):

```tsx
            </div>
            {props.loginInfo.phoneLoginAktiviert ? <Note>{s.telefonLoginHint}</Note> : null}
          </>
```

(Anker: die Zeile `</div>` unmittelbar vor `) : props.accountExists ? (`. `Note` ist in Z.11 bereits importiert.)

- [ ] **Step 3c: Feld in `KundeWelcomeLoginInfo` (flows.ts)**

In `src/lib/email/google/flows.ts` den exportierten Typ (Z.59-63) erweitern:

```ts
export type KundeWelcomeLoginInfo = {
  magicLink: string | null
  email: string
  password: string
  // AAR-phone-login: an KundeWelcomeEmail.loginInfo durchgereicht (Z.236 loginInfo: loginInfo ?? null)
  phoneLoginAktiviert?: boolean
}
```

Kein weiterer Code in flows.ts noetig — `loginInfo: loginInfo ?? null` (Z.236) reicht das Objekt inkl. neuem Feld an die Template-Props durch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/email/google/templates/__tests__/KundeWelcome.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/google/templates/KundeWelcome.i18n.ts src/lib/email/google/templates/KundeWelcome.tsx src/lib/email/google/templates/__tests__/KundeWelcome.test.tsx src/lib/email/google/flows.ts
git commit -m "feat(email): konditionaler Telefon-Login-Hinweis in der Kunde-Welcome-Mail (6 Locales)"
```

---

### Task 3: `enablePhoneLogin` in `createKundeAccount` verdrahten + Flag durchreichen

**Files:**
- Modify: `src/app/flow/[token]/actions.ts` (Import + Neu-Zweig-Call + 2 Signaturen + 2 Pass-throughs)

**Interfaces:**
- Consumes: `enablePhoneLogin` (Task 1), `KundeWelcomeLoginInfo.phoneLoginAktiviert` (Task 2).
- Produces: im Neu-Konto-Zweig gesetztes `phoneLoginAktiviert`, das bis `sendKundeWelcome(fallId, { …, phoneLoginAktiviert })` durchgereicht wird. Relink-/Idempotenz-Pfade bleiben (Default `false`) unveraendert = „nur neue Konten".

> **Hot-File-Hinweis:** Vor dem Editieren `git log --oneline -3 -- src/app/flow/[token]/actions.ts` pruefen; falls der Collision-Hook blockt, diesen Task zurueckstellen (Tasks 4 vorziehen) und spaeter erneut. Immer die aktuellen Zeilennummern per `grep -n` gegenpruefen — das File bewegt sich.

- [ ] **Step 1: Import ergaenzen**

`grep -n "from '@/lib/supabase/admin'" src/app/flow/[token]/actions.ts` → direkt darunter einfuegen:

```ts
import { enablePhoneLogin } from '@/lib/auth/phone-login'
```

- [ ] **Step 2: Enroll im Neu-Konto-Zweig**

Anker (`grep -n "const finRes = await finalizeKundeSetup(admin, authUser.user.id" src/app/flow/[token]/actions.ts`). Die Zeile

```ts
    const finRes = await finalizeKundeSetup(admin, authUser.user.id, normalizedEmail, vorname, nachname, telefon, password)
```

ersetzen durch:

```ts
    // AAR-phone-login: passwordless Telefon-Login fuer NEUE Kunden aktivieren
    // (auth.users.phone = Flow-Nummer). NUR hier im Neu-Zweig -> kein Lazy-Backfill
    // auf dem Relink-Pfad. Best-effort/kollisionssicher (siehe enablePhoneLogin).
    const phoneLoginAktiviert = await enablePhoneLogin(admin, authUser.user.id, telefon)
    const finRes = await finalizeKundeSetup(admin, authUser.user.id, normalizedEmail, vorname, nachname, telefon, password, phoneLoginAktiviert)
```

- [ ] **Step 3: `finalizeKundeSetup`-Signatur + Pass-through**

Signatur (`grep -n "async function finalizeKundeSetup" src/app/flow/[token]/actions.ts`): die Zeile `password: string,` (letzter Param vor `):`) ergaenzen zu:

```ts
  password: string,
  // AAR-phone-login: nur im Neu-Zweig true; Default false = Relink-Pfad unveraendert.
  phoneLoginAktiviert: boolean = false,
): Promise<{ magicLink: string | null }> {
```

Return (`grep -n "return await sendWelcomeWithLogin(admin, fallId, email, password)" src/app/flow/[token]/actions.ts`) ersetzen durch:

```ts
  return await sendWelcomeWithLogin(admin, fallId, email, password, phoneLoginAktiviert)
```

- [ ] **Step 4: `sendWelcomeWithLogin`-Signatur + `sendKundeWelcome`-Options**

Signatur (`grep -n "async function sendWelcomeWithLogin" src/app/flow/[token]/actions.ts`): die Zeile `password: string,` ergaenzen zu:

```ts
  password: string,
  phoneLoginAktiviert: boolean = false,
): Promise<{ magicLink: string | null }> {
```

`sendKundeWelcome`-Aufruf (`grep -n "await sendKundeWelcome(fallId" src/app/flow/[token]/actions.ts`) ersetzen durch:

```ts
    await sendKundeWelcome(fallId, { magicLink, email, password, phoneLoginAktiviert })
```

> Die Direkt-Aufrufer `sendWelcomeWithLogin(admin, fallId, normalizedEmail, password)` (Idempotenz-Reload-Pfad) und `finalizeKundeSetup(admin, existingProfile.id, …)` (Relink-Pfad) NICHT anfassen — sie nutzen den Default `false`.

- [ ] **Step 5: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine NEUEN Fehler ausser den 17 bekannten Env-Modul-Fehlern (`sharp`/`@react-pdf/renderer`/`@turf/union`/`jsqr`/`PDFParse`). Insbesondere 0 Fehler in `actions.ts`, `flows.ts`, `phone-login.ts`.

- [ ] **Step 6: Voller Build (Server-Action-File → Pflicht laut Audit-Punkt 1)**

Run: `npm run build`
Expected: Build gruen (Next.js-15-Validatoren fuer die `flow/[token]`-Route bestehen).

- [ ] **Step 7: Commit**

```bash
git add src/app/flow/[token]/actions.ts
git commit -m "feat(auth): createKundeAccount aktiviert Telefon-Login fuer neue Kunden + reicht Flag an Welcome-Mail"
```

---

### Task 4: Mechanismus-Smoke — reale Supabase-Infra (phone gesetzt + UNIQUE fail-safe)

**Files:**
- Create: `scripts/smoke/phone-login-mechanism.mjs`

**Interfaces:**
- Consumes: reale Supabase-Admin-API (Service-Role-Key aus `.env.local`).
- Produces: Exit 0 + `PASS`-Log, wenn (1) `updateUserById({phone, phone_confirm})` `auth.users.phone` setzt und (2) eine Kollision (zweites Konto, gleiche Nummer) fehlschlaegt, das erste Konto die Nummer behaelt. Raeumt beide Wegwerf-User wieder ab.

> **Warum ein Node-Script statt Playwright-Spec:** Der Enroll passiert server-seitig bei der Konto-Erstellung (keine Browser-UI), und der volle SMS-OTP-Login ist ohne echten SMS-Empfang nicht automatisierbar (bewusst, siehe Spec §Testing). Der Mechanismus-Beweis ist daher ein API-Level-Check gegen die reale Infra — das validiert genau die zwei Annahmen, auf denen `enablePhoneLogin` + `createKundeAccount` beruhen.

- [ ] **Step 1: Script schreiben**

Create `scripts/smoke/phone-login-mechanism.mjs`:

```js
// Mechanismus-Smoke fuer den Kunde-Telefon-Login (AAR-phone-login).
// Beweist gegen die REALE Supabase-Infra: (1) admin.updateUserById({phone,
// phone_confirm:true}) persistiert nach auth.users.phone; (2) auth.users.phone
// ist UNIQUE -> zweites Konto mit gleicher Nummer scheitert, erstes behaelt sie
// (fail-safe, klaut nie). Legt zwei Wegwerf-Auth-User an + raeumt sie wieder ab.
// NUR gegen Test-/Staging-Projekte oder bewusst gegen Prod mit Wegwerf-Usern.
//
// Run (env-file explizit, kein Default -> kein Versehen):
//   CLAIMONDO_ENV_FILE=/abs/pfad/zu/.env.local node scripts/smoke/phone-login-mechanism.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const envFile = process.env.CLAIMONDO_ENV_FILE
if (!envFile) {
  console.error('FAIL: CLAIMONDO_ENV_FILE (absoluter Pfad zur .env.local) ist Pflicht.')
  process.exit(1)
}
const env = loadEnv(envFile)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in der env-Datei.')
  process.exit(1)
}
console.log(`[phone-login-smoke] Ziel-Projekt: ${url}`)

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Eindeutige Test-Nummer je Lauf (vermeidet Kollision mit echten Konten).
const suffix = String(Date.now()).slice(-7)
const TEST_PHONE = `+49151${suffix}` // deutsches Mobil-Muster
const digits = (s) => (s || '').replace(/\D/g, '')
const stamp = Date.now()
const emailA = `smoke-phone-a-${stamp}@claimondo.test`
const emailB = `smoke-phone-b-${stamp}@claimondo.test`

let idA = null
let idB = null
let failed = false
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} — ${msg}`); if (!cond) failed = true }

try {
  // 1. Zwei Wegwerf-User anlegen (email-only, wie createKundeAccount).
  const { data: a, error: aErr } = await admin.auth.admin.createUser({ email: emailA, email_confirm: true })
  if (aErr || !a?.user) throw new Error(`createUser A: ${aErr?.message}`)
  idA = a.user.id
  const { data: b, error: bErr } = await admin.auth.admin.createUser({ email: emailB, email_confirm: true })
  if (bErr || !b?.user) throw new Error(`createUser B: ${bErr?.message}`)
  idB = b.user.id

  // 2. A bekommt die Nummer -> muss greifen + persistent sein.
  const { error: setA } = await admin.auth.admin.updateUserById(idA, { phone: TEST_PHONE, phone_confirm: true })
  check(!setA, `A: updateUserById(phone) ohne Fehler (${setA?.message ?? 'ok'})`)
  const { data: readA } = await admin.auth.admin.getUserById(idA)
  check(digits(readA?.user?.phone) === digits(TEST_PHONE), `A: auth.users.phone == ${TEST_PHONE} (ist: ${readA?.user?.phone ?? 'leer'})`)

  // 3. B bekommt DIESELBE Nummer -> UNIQUE-Kollision, muss fehlschlagen.
  const { error: setB } = await admin.auth.admin.updateUserById(idB, { phone: TEST_PHONE, phone_confirm: true })
  check(!!setB, `B: Kollision schlaegt fehl (erwartet Fehler; ist: ${setB?.message ?? 'KEIN Fehler!'})`)
  const { data: readB } = await admin.auth.admin.getUserById(idB)
  check(!digits(readB?.user?.phone), `B: hat KEINE Nummer (klaut nicht; ist: ${readB?.user?.phone ?? 'leer'})`)

  // 4. A behaelt die Nummer (nicht gestohlen).
  const { data: reReadA } = await admin.auth.admin.getUserById(idA)
  check(digits(reReadA?.user?.phone) === digits(TEST_PHONE), `A: behaelt die Nummer nach der B-Kollision`)
} catch (err) {
  console.error('FAIL (Exception):', err.message)
  failed = true
} finally {
  // 5. Aufraeumen — immer.
  if (idA) await admin.auth.admin.deleteUser(idA).catch(() => {})
  if (idB) await admin.auth.admin.deleteUser(idB).catch(() => {})
  console.log('[phone-login-smoke] Wegwerf-User entfernt.')
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS')
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Smoke gegen Prod laufen lassen**

Run (Pfad zur Haupt-Repo-`.env.local` anpassen):
```bash
CLAIMONDO_ENV_FILE="C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local" node scripts/smoke/phone-login-mechanism.mjs
```
Expected: `RESULT: PASS` (5x `ok`), danach „Wegwerf-User entfernt.".
> Falls Schritt 2 (`A: updateUserById`) fehlschlaegt: die zufaellige Test-Nummer kollidierte evtl. mit einem echten Konto → Script erneut laufen lassen (neuer Timestamp = neue Nummer). Zweimal in Folge Fehler → echtes Infra-Problem (z.B. Phone-Provider im Projekt aus).

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke/phone-login-mechanism.mjs
git commit -m "test(auth): Mechanismus-Smoke — auth.users.phone-Sync + UNIQUE fail-safe (Node, opt-in)"
```

---

### Task 5: Gesamt-Verifikation + 7-Punkte-Audit + PR + Koordination

**Files:** keine Code-Aenderung — Verifikation, PR, Marker.

- [ ] **Step 1: Volle Test-Suite (betroffene Bereiche)**

Run: `npx vitest run src/lib/auth/phone-login.test.ts src/lib/email/google/templates/__tests__/KundeWelcome.test.tsx`
Expected: alle gruen (4 + 2).

- [ ] **Step 2: Ratchets 0-neu**

Run: `npm run check:token-audit`
Expected: gruen (der Email-Hinweis nutzt bestehende `<Note>`-Komponente + i18n-Strings — kein neues Hex/Status/Accent; `scripts/**` ist von den Ratchets ohnehin ausgenommen).

- [ ] **Step 3: tsc + build final**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (nur die 17 bekannten Env-Fehler)
Run: `npm run build` (gruen)

- [ ] **Step 4: 7-Punkte-Audit dokumentieren + Branch pushen**

```bash
git push -u origin kitta/kunde-phone-login
```

- [ ] **Step 5: PR gegen `staging` oeffnen**

```bash
gh pr create --base staging --title "feat(auth): Kunde Telefon-Login als First-Class-Registrierung" --body "<Audit-Block: Build gruen / UI: konditionaler Welcome-Hinweis / Redundanz: enablePhoneLogin buendelt Sync-Logik / Dead-Code: n/a / Spec: 4 Entscheidungen erfuellt / Inkonsistenz: Umlaute in 6 Locales, Server-Action-Shape unveraendert / Regression: Relink-/Idempotenz-Pfade via Default false unveraendert>"
```

- [ ] **Step 6: Koordinations-Marker fuer die aar-956-Lane**

`enablePhoneLogin` ist ein neues File (0 Kollision), aber `src/app/flow/[token]/actions.ts` ist heiss. Marker `COORDINATION-kunde-phone-login.md` schreiben (File-Touch: `actions.ts` — additive Params mit Default, keine fremden Bodies angefasst; die anderen aar-956-Sessions rebasen ggf.) + MEMORY.md-Zeile ergaenzen.

- [ ] **Step 7 (nach Deploy): Prod-Mechanismus-Smoke**

Nach Merge→Deploy erneut `node scripts/smoke/phone-login-mechanism.mjs` gegen Prod → `RESULT: PASS`.

---

## Self-Review

**1. Spec coverage:**
- Kunde-first, Auto-Enroll ab Konto-Erstellung → Task 3 (Neu-Zweig-Call). ✓
- Nur neue Konten (kein Backfill) → Task 3 defaultet Relink/Idempotenz auf `false`; Enroll nur im `createUser`-Zweig. ✓
- Konditionaler Willkommens-Hinweis → Task 2 (`phoneLoginAktiviert`-gated `<Note>`). ✓
- Fail-safe/kollisionssicher (nie stehlen) → Task 1 (try/catch + false) + Task 4 (UNIQUE-Beweis). ✓
- Login-Seite unveraendert → Preconditions-Block (verifiziert, kein Task). ✓
- Shared Helper + Mechanismus-Smoke → Task 1 + Task 4. ✓
- Ehrliche Grenze (voller SMS-Login nicht automatisierbar) → Task 4 Rationale. ✓
- Koordination heisses File → Global Constraints + Task 5 Step 6. ✓

**2. Placeholder scan:** keine `TBD`/`TODO`/„handle errors"; jeder Code-Step zeigt vollstaendigen Code. ✓

**3. Type consistency:** `enablePhoneLogin(admin, userId, phone): Promise<boolean>` identisch in Task 1 (Def), Task 3 (Call), Task 4 (mechanik-aequivalent). `phoneLoginAktiviert: boolean` durchgaengig gleich benannt in actions.ts (Task 3), `KundeWelcomeLoginInfo` + `LoginInfo` (Task 2). `telefonLoginHint` gleich in Typ `S` + 6 Locales + Template. ✓

**Abweichung ggue. Spec-Dateiliste (dokumentiert):** Der Mechanismus-Smoke ist `scripts/smoke/phone-login-mechanism.mjs` (Node) statt `tests/e2e/flows/kunde-phone-enroll-smoke.spec.ts` (Playwright) — begruendet: der Enroll ist server-seitig ohne Browser-UI, der API-Level-Check ist der ehrliche Mechanismus-Beweis. Der Welcome-WhatsApp-Hinweis (Spec „optional additiv") ist bewusst NICHT in v1 (Email-Hinweis genuegt, haelt den heissen-File-Touch klein) — Follow-up.
