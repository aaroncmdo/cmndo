# 2FA-/Handy-Auth-Härtung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Handy-/2FA-Login-Pfad härten — den kritischen 2FA-Bypass schließen (Remember-Token wird nicht validiert), 2FA für interne Rollen erzwingen, die SV-Exemption entfernen und den Telefon-Login absichern.

**Architecture:** Der Bypass-Fix ersetzt die reine Cookie-Präsenz-Prüfung in der Middleware durch echte Token-Validierung (Web-Crypto SHA-256 gegen `auth_remember_tokens`, RLS-gated own-row, fail-closed). Die 2FA-Pflicht wird an den `profiles.rolle`-Lesern durchgesetzt (Login-Action + `/login/2fa`-Page + `requirePortalAccess`), NICHT in der Middleware — weil `app_metadata.rolle` unzuverlässig ist (Admins 0/5 gesetzt). Google-Auth bleibt konsistent vom Custom-2FA befreit (sonst Redirect-Loop mit der Google-Weiche in `/login/2fa`).

**Tech Stack:** Next.js (Proxy-Middleware `src/proxy.ts`), Supabase Auth (`@supabase/supabase-js@2.100.1`, `@supabase/ssr@0.9.0`, MFA Phone-Faktor / AAL), vitest, Web-Crypto (`crypto.subtle`).

## Global Constraints

- **Branch:** `worktree-kitta+2fa-auth-hardening` (off `origin/staging`). PR gegen **staging**, nie direkt auf `main` (AGENTS Regel 1).
- **Worktree-Pfade:** Alle Edits im Worktree `.claude/worktrees/kitta+2fa-auth-hardening/` — NIE den Main-Checkout (der ist auf fremdem `aar-956` mit uncommitteter WIP).
- **DDL nur via Supabase-Plugin** `apply_migration` (AGENTS Regel 2): apply → `list_migrations` (getrackte Version ablesen) → Migration-File exakt danach benennen → `execute_sql` READ verifizieren. Kein raw-`execute_sql`-DDL, keine CLI.
- **Server-Actions:** Result-Object (`{ ok }` / `{ success }`), kein `throw` (AGENTS §Server-Actions). Bestehende Files behalten ihren Shape (`mfa.ts` = `{ ok }`, `remember-me.ts` = `{ success }`).
- **Frontend-Umlaute:** Nutzersichtbare Strings mit echten `ä/ö/ü/ß`. Backend/Kommentare ASCII erlaubt.
- **Vor jedem Commit:** 7-Punkte-Audit (AGENTS) + 4 Ratchets (`check:token-audit`, `check:component-set`, `check:knip`, Status) 0-neu + `npx tsc --noEmit` grün für berührte Files.
- **Build/Test-Umgebung:** Shared `node_modules` (Symlink → Main-Worktree) ist bei parallelen Sessions fragil → react-email/pdf-Tests + voller `tsc`/`build` können LOKAL transient failen (auch untouched). **CI ist autoritativ.** vitest für pure-Logic-Files läuft lokal.
- **Test-Runner:** `npx vitest run <pfad>` (single file) bzw. `-t "<name>"`.

---

## Task 1 — F1 Core: Remember-Token-Validierung (Modul + Test)

**Files:**
- Create: `src/lib/auth/twofa/remember-validate.ts`
- Test: `src/lib/auth/twofa/remember-validate.test.ts`

**Interfaces:**
- Produces: `validateRememberCookie(supabase: SupabaseClient<Database>, sessionUserId: string, cookieValue: string | undefined): Promise<boolean>` — true nur bei matchendem, nicht-revoked, nicht-expired Token dessen eingebettete userId der Session-userId entspricht. Jeder Fehler → false (fail-closed).

- [ ] **Step 1: Failing test schreiben**

`src/lib/auth/twofa/remember-validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateRememberCookie } from './remember-validate'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const FUTURE = new Date(Date.now() + 60_000).toISOString()
const PAST = new Date(Date.now() - 60_000).toISOString()

// Chainable Supabase-Mock: .from().select().eq().eq().is().maybeSingle()
function mockClient(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.is = () => chain
  chain.maybeSingle = async () => result
  return { from: () => chain } as never
}

describe('validateRememberCookie', () => {
  it('false bei fehlendem Cookie', async () => {
    expect(await validateRememberCookie(mockClient({ data: null, error: null }), USER, undefined)).toBe(false)
  })

  it('false bei malformed Cookie (kein Doppelpunkt)', async () => {
    expect(await validateRememberCookie(mockClient({ data: null, error: null }), USER, 'nocolon')).toBe(false)
  })

  it('false bei userId-Mismatch (Cross-User)', async () => {
    // Zeile existiert zwar, aber Cookie-userId != Session-userId -> nie DB-Lookup
    const r = await validateRememberCookie(mockClient({ data: { id: 'x', expires_at: FUTURE }, error: null }), USER, `${OTHER}:rawtoken`)
    expect(r).toBe(false)
  })

  it('false bei KEINER passenden DB-Zeile (Bypass-Angriff: Cookie gefaelscht)', async () => {
    const r = await validateRememberCookie(mockClient({ data: null, error: null }), USER, `${USER}:garbage`)
    expect(r).toBe(false)
  })

  it('false bei abgelaufenem Token', async () => {
    const r = await validateRememberCookie(mockClient({ data: { id: 'x', expires_at: PAST }, error: null }), USER, `${USER}:rawtoken`)
    expect(r).toBe(false)
  })

  it('false bei DB-Error (fail-closed)', async () => {
    const r = await validateRememberCookie(mockClient({ data: null, error: { message: 'boom' } }), USER, `${USER}:rawtoken`)
    expect(r).toBe(false)
  })

  it('true bei gueltigem Token (userId-match, Zeile da, nicht expired)', async () => {
    const r = await validateRememberCookie(mockClient({ data: { id: 'x', expires_at: FUTURE }, error: null }), USER, `${USER}:rawtoken`)
    expect(r).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `npx vitest run src/lib/auth/twofa/remember-validate.test.ts`
Expected: FAIL (`Cannot find module './remember-validate'`).

- [ ] **Step 3: Modul implementieren**

`src/lib/auth/twofa/remember-validate.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// F1 (2FA-Bypass-Fix, AAR-audit-2fa): Echte Validierung des Trusted-Device-
// Remember-Tokens. Ersetzt die frühere reine Cookie-Präsenz-Prüfung in der
// Middleware (`!!cookie.value`), die 2FA trivial umgehbar machte (jeder mit
// Passwort setzt claimondo_remember=1 -> Gate 'allow'). Web-Crypto SHA-256 →
// läuft in Edge- UND Node-Proxy-Runtime. Fail-closed: jeder Fehler → false.
//
// RLS auf auth_remember_tokens erlaubt dem authentifizierten User-Client die
// eigene Zeile (USING: admin OR user_id = auth.uid()) → kein Service-Role nötig.

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Validiert das `claimondo_remember`-Cookie (`<userId>:<rawToken>`) gegen
 * `auth_remember_tokens`. true nur wenn cookieUserId === sessionUserId UND
 * der SHA-256(rawToken) als nicht-revoked, nicht-expired Zeile existiert.
 */
export async function validateRememberCookie(
  supabase: SupabaseClient<Database>,
  sessionUserId: string,
  cookieValue: string | undefined,
): Promise<boolean> {
  try {
    if (!cookieValue) return false
    const sep = cookieValue.indexOf(':')
    if (sep <= 0) return false
    const cookieUserId = cookieValue.slice(0, sep)
    const rawToken = cookieValue.slice(sep + 1)
    if (!rawToken || cookieUserId !== sessionUserId) return false

    const tokenHash = await sha256Hex(rawToken)
    const { data, error } = await supabase
      .from('auth_remember_tokens')
      .select('id, expires_at')
      .eq('user_id', sessionUserId)
      .eq('token_hash', tokenHash)
      .is('revoked_am', null)
      .maybeSingle()

    if (error || !data) return false
    if (new Date((data as { expires_at: string }).expires_at).getTime() < Date.now()) return false
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/lib/auth/twofa/remember-validate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/twofa/remember-validate.ts src/lib/auth/twofa/remember-validate.test.ts
git commit -m "feat(2fa): validateRememberCookie — echte Trusted-Device-Token-Validierung (F1 Bypass-Fix)"
```

---

## Task 2 — mfa-gate Logik: SV-Exemption raus (F2) + 2FA-Pflicht-Helper (F3)

**Files:**
- Modify: `src/lib/auth/mfa-gate.ts`
- Test: `src/lib/auth/mfa-gate.test.ts`

**Interfaces:**
- Produces: `istZweiFaktorPflicht(rolle: string | null | undefined): boolean` (true für admin/dispatch/kanzlei/kundenbetreuer).
- Changed: `MfaGateInput` verliert `isGutachterPath`. `LoginRoutingInput` gewinnt `rollePflicht: boolean`.

- [ ] **Step 1: Tests anpassen/ergänzen (failing)**

In `src/lib/auth/mfa-gate.test.ts`:
- Im `input()`-Helper die Zeile `isGutachterPath: false,` **entfernen**.
- Den Test `'laesst /gutachter-Pfade durch (SV-Portal ist 2FA-frei)'` **ersetzen** durch:
```ts
  it('challenge auch auf /gutachter (Exemption entfernt): Faktor + aal1', () => {
    // F2: SV-Portal ist nicht mehr 2FA-frei. Ein SV mit Faktor wird gechallenged.
    expect(entscheideMfaGate(input())).toBe('challenge')
  })
```
- Im `loginInput()`-Helper `rollePflicht: false,` ergänzen.
- Neue Tests anhängen:
```ts
describe('istZweiFaktorPflicht', () => {
  it('true für interne Rollen', () => {
    for (const r of ['admin', 'dispatch', 'kanzlei', 'kundenbetreuer']) {
      expect(istZweiFaktorPflicht(r)).toBe(true)
    }
  })
  it('false für externe Rollen + null/undefined', () => {
    for (const r of ['kunde', 'sachverstaendiger', 'makler', 'werkstatt']) {
      expect(istZweiFaktorPflicht(r)).toBe(false)
    }
    expect(istZweiFaktorPflicht(null)).toBe(false)
    expect(istZweiFaktorPflicht(undefined)).toBe(false)
  })
})

describe('entscheideLoginRouting — 2FA-Pflicht (F3)', () => {
  it('Pflicht-Rolle ohne Faktor -> enroll (auch ohne Legacy-Flag)', () => {
    expect(entscheideLoginRouting(loginInput({ rollePflicht: true }))).toBe('enroll')
  })
  it('Pflicht-Rolle mit Faktor -> challenge (Faktor schlaegt Pflicht)', () => {
    expect(entscheideLoginRouting(loginInput({ rollePflicht: true, hasVerifiedFactor: true }))).toBe('challenge')
  })
  it('Google-Pflicht-Rolle -> portal (Google-Bypass bleibt, kein Loop)', () => {
    expect(entscheideLoginRouting(loginInput({ rollePflicht: true, isGoogleUser: true }))).toBe('portal')
  })
})
```
Und den Import um `istZweiFaktorPflicht` ergänzen.

- [ ] **Step 2: Test laufen lassen — muss failen**

Run: `npx vitest run src/lib/auth/mfa-gate.test.ts`
Expected: FAIL (`istZweiFaktorPflicht` nicht exportiert; `rollePflicht` unbekannt; gutachter-Test).

- [ ] **Step 3: mfa-gate.ts implementieren**

- `MfaGateInput`: das Feld `isGutachterPath` **entfernen** (inkl. JSDoc-Zeile).
- In `entscheideMfaGate`: die Zeilen
  ```ts
  // SV-Portal (/gutachter*) ist 2FA-frei (KFZ-184-Parität).
  if (input.isGutachterPath) return 'allow'
  ```
  **löschen**.
- `LoginRoutingInput`: Feld ergänzen `rollePflicht: boolean` (JSDoc: „interne Rolle mit 2FA-Pflicht (admin/dispatch/kanzlei/kundenbetreuer)").
- In `entscheideLoginRouting` nach dem `hasVerifiedFactor`-Zweig einfügen:
  ```ts
  // F3: interne Pflicht-Rolle ohne Faktor -> Enroll (überstimmt legacy/portal).
  if (input.rollePflicht) return 'enroll'
  ```
- Am Dateiende (oder bei den Helpern) neu:
  ```ts
  // F3: Rollen mit 2FA-Pflicht (Aaron 2026-07-06: „interne Rollen Pflicht").
  const ZWEI_FAKTOR_PFLICHT_ROLLEN = new Set(['admin', 'dispatch', 'kanzlei', 'kundenbetreuer'])

  /** true, wenn die Rolle 2FA verpflichtend braucht (interne Rollen). */
  export function istZweiFaktorPflicht(rolle: string | null | undefined): boolean {
    return !!rolle && ZWEI_FAKTOR_PFLICHT_ROLLEN.has(rolle)
  }
  ```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npx vitest run src/lib/auth/mfa-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/mfa-gate.ts src/lib/auth/mfa-gate.test.ts
git commit -m "feat(2fa): SV-Exemption raus (F2) + istZweiFaktorPflicht/rollePflicht (F3)"
```

---

## Task 3 — Middleware-Wiring: F1 + F2 + F7

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/lib/supabase/server.ts`

**Interfaces:**
- Consumes: `validateRememberCookie` (T1), `entscheideMfaGate` ohne `isGutachterPath` (T2), `hatVerifiziertenFaktor` (bestehend).

- [ ] **Step 1: Import ergänzen** (`middleware.ts`, oben) — die `mfa-gate`-Zeile existiert bereits, nur die zweite Zeile neu hinzufügen:
```ts
import { entscheideMfaGate, hatVerifiziertenFaktor } from '@/lib/auth/mfa-gate' // existiert bereits
import { validateRememberCookie } from '@/lib/auth/twofa/remember-validate'      // NEU
```

- [ ] **Step 2: F7 — cm_remember-Default invertieren** (`middleware.ts:47`):
```ts
// BUG-83 / F7: fehlender Marker ⇒ NICHT persistent (Default OFF). Nur explizit
// "1" (User hat "Angemeldet bleiben" gewählt) hält die Auth-Cookies langlebig.
const remember = request.cookies.get(REMEMBER_COOKIE_NAME)?.value === '1'
```
Und in `server.ts:26-28` analog:
```ts
const remember = options.remember !== undefined
  ? options.remember
  : cookieStore.get(REMEMBER_COOKIE_NAME)?.value === '1'
```

- [ ] **Step 3: F1 + F2 — echte Token-Validierung + kein isGutachterPath**

Im `else`-Zweig (User vorhanden), den Block ab `const decision = entscheideMfaGate({...})` ersetzen durch:
```ts
    // F1: Trusted-Device NUR bei echt validiertem Token (nicht mehr reine
    // Cookie-Präsenz). Lazy: DB-Lookup nur wenn Cookie da UND Faktor vorhanden
    // UND noch nicht aal2 — sonst entscheidet das Gate ohnehin ohne den Token.
    const hatFaktor = hatVerifiziertenFaktor(user.factors)
    let hasRememberToken = false
    if (aalCurrent !== 'aal2' && hatFaktor) {
      const rememberCookie = request.cookies.get('claimondo_remember')?.value
      if (rememberCookie) {
        hasRememberToken = await validateRememberCookie(supabase, user.id, rememberCookie)
      }
    }

    // KFZ-184/AAR-111: 2FA-Check ZUERST (vor Admin-Rollen-Check). F2: /gutachter
    // ist nicht mehr befreit — Enforcement folgt dem Faktor, nicht dem Pfad.
    const decision = entscheideMfaGate({
      isOn2faPage: request.nextUrl.pathname === '/login/2fa',
      isGoogleUser: user.app_metadata?.provider === 'google',
      aalCurrent,
      hasVerifiedFactor: hatFaktor,
      hasRememberToken,
    })
```
(Die alte `hasVerifiedFactor: hatVerifiziertenFaktor(user.factors)`- und `isGutachterPath`-Zeile entfallen dadurch.)

- [ ] **Step 4: tsc + gezielte Prüfung**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler in `middleware.ts` / `server.ts`. (Voller tsc kann wg. shared node_modules unrelated failen — nur auf diese Files achten.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/middleware.ts src/lib/supabase/server.ts
git commit -m "feat(2fa): middleware validiert Remember-Token echt + /gutachter nicht mehr befreit + cm_remember Default OFF (F1/F2/F7)"
```

---

## Task 4 — Login-Flow-Wiring: 2FA-Pflicht sichtbar machen (F3)

**Files:**
- Modify: `src/app/login/actions.ts`
- Modify: `src/app/login/2fa/page.tsx`
- Modify: `src/app/login/2fa/TwoFaClient.tsx`

**Interfaces:**
- Consumes: `istZweiFaktorPflicht`, `entscheideLoginRouting` mit `rollePflicht` (T2).

- [ ] **Step 1: `login/actions.ts`** — Import + rollePflicht übergeben:
```ts
import { entscheideLoginRouting, istZweiFaktorPflicht } from '@/lib/auth/mfa-gate'
```
und im `entscheideLoginRouting({...})`-Aufruf ergänzen:
```ts
    rollePflicht: istZweiFaktorPflicht(profile.rolle),
```

- [ ] **Step 2: `login/2fa/page.tsx`** — Enroll auch bei Pflicht + `mandatory`-Flag:
```ts
import { istZweiFaktorPflicht } from '@/lib/auth/mfa-gate'
```
Nach dem Laden von `profile` (vor dem `verifiedPhone`-Block) berechnen:
```ts
  const pflicht = istZweiFaktorPflicht(profile?.rolle as string | null | undefined)
```
Den `legacyWanted`-Block ersetzen durch:
```ts
  const legacyWanted =
    profile?.twofa_aktiviert === true || profile?.twofa_email_aktiviert === true

  if (legacyWanted || pflicht) {
    // SOFT-ENROLL bzw. PFLICHT-ENROLL. mandatory=true blendet "Später" aus.
    return (
      <TwoFaClient
        mode="enroll"
        prefillPhone={profile?.twofa_telefon ?? profile?.telefon ?? null}
        targetPath={finalTarget}
        mandatory={pflicht}
      />
    )
  }
```

- [ ] **Step 3: `login/2fa/TwoFaClient.tsx`** — Prop + Skip-Button ausblenden:

Im `Props`-Type ergänzen:
```ts
  /** true = interne Pflicht-Rolle: "Später einrichten" wird ausgeblendet */
  mandatory?: boolean
```
In der Signatur `mandatory = false` destrukturieren. Den `{mode === 'enroll' && (...)}`-Skip-Button-Block ändern zu:
```tsx
        {mode === 'enroll' && !mandatory && (
          // Soft-Enroll: überspringbar. Pflicht-Rollen (mandatory) sehen den
          // Skip NICHT — sie müssen 2FA einrichten.
          <button
            onClick={() => router.push(targetPath)}
            className="w-full mt-4 py-2 text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo transition-colors text-center"
          >
            Später einrichten
          </button>
        )}
```

- [ ] **Step 4: tsc**

Run: `npx tsc --noEmit` — keine neuen Fehler in den 3 Files.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/actions.ts src/app/login/2fa/page.tsx src/app/login/2fa/TwoFaClient.tsx
git commit -m "feat(2fa): interne Pflicht-Rolle -> non-skippable Enroll im Login-Flow (F3)"
```

---

## Task 5 — Portal-Guard-Enforcement: 2FA-Pflicht pro Request (F3)

**Files:**
- Modify: `src/lib/auth/portal-guard.ts`

**Interfaces:**
- Consumes: `istZweiFaktorPflicht`, `hatVerifiziertenFaktor` (T2/bestehend). Nutzt `user.factors` aus dem bereits geladenen `getUser()`-Ergebnis (kein Extra-Call).

**Kontext:** `requirePortalAccess` ist der Choke-Point aller Portale und erzwingt bereits `force_password_change` pro Request — die 2FA-Pflicht kommt an dieselbe Stelle. `istZweiFaktorPflicht(rolle)` short-circuittet für nicht-interne Rollen (kein Faktor-Check für kunde/sv/makler/werkstatt). **Google-Auth MUSS befreit sein** — sonst Loop mit der Google-Weiche in `/login/2fa`.

- [ ] **Step 1: Import ergänzen** (`portal-guard.ts`):
```ts
import { istZweiFaktorPflicht, hatVerifiziertenFaktor } from '@/lib/auth/mfa-gate'
```

- [ ] **Step 2: Enforcement einfügen** — direkt nach dem `force_password_change`-Block, VOR `const rolle = profile.rolle as UserRolle` … tatsächlich `rolle` wird dort erst gelesen; daher den Block nach `const rolle = ...` und vor dem `allowedRollen.includes`-Check einsetzen:
```ts
  const rolle = profile.rolle as UserRolle

  // F3 (AAR-audit-2fa): 2FA-Pflicht für interne Rollen pro Request erzwingen
  // (analog force_password_change oben). Google-Auth ist — wie im Login-Gate —
  // befreit (Google-eigene MFA), sonst Loop mit der Google-Weiche in /login/2fa.
  // user.factors kommt aus dem bereits geladenen getUser() → kein Extra-Call.
  const isGoogleUser = user.app_metadata?.provider === 'google'
  if (!isGoogleUser && istZweiFaktorPflicht(rolle) && !hatVerifiziertenFaktor(user.factors)) {
    redirect('/login/2fa')
  }

  if (!allowedRollen.includes(rolle)) {
    redirect(roleToPath(rolle))
  }
```
(Die bestehende `const rolle` + `allowedRollen`-Zeilen werden durch den obigen Block ersetzt — `rolle` nicht doppelt deklarieren.)

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit` — keine neuen Fehler in `portal-guard.ts`. (`user` ist hier das volle auth-User-Objekt aus `getUser()`, `.factors` ist typisiert vorhanden.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/portal-guard.ts
git commit -m "feat(2fa): requirePortalAccess erzwingt 2FA-Pflicht fuer interne Rollen pro Request (F3, Google-exempt)"
```

---

## Task 6 — remember-me: Dead-Code raus (F1) + clearTwoFa unenrollt Faktor (F6)

**Files:**
- Modify: `src/lib/auth/twofa/remember-me.ts`

- [ ] **Step 1: Toten `validateRememberToken` entfernen (F1)** — die komplette Funktion `export async function validateRememberToken(userId: string): Promise<boolean> { ... }` (inkl. JSDoc) löschen. Sie hat 0 Caller (durch T1/T3 ersetzt). `hashToken`/`createHash` bleiben (von `createRememberToken` genutzt).

- [ ] **Step 2: `clearTwoFa` erweitern (F6)** — die Funktion ersetzen durch:
```ts
export async function clearTwoFa(targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const db = createAdminClient()
  // F6: Auch die echten Supabase-MFA-Faktoren entfernen — sonst bleibt der User
  // trotz "2FA zurückgesetzt" gechallenged/ausgesperrt. Admin-MFA-API (service
  // role). Idempotent (kein Faktor -> no-op). Verify API-Shape gg @supabase/
  // supabase-js@2.100.1 (auth.admin.mfa.listFactors/deleteFactor).
  try {
    const { data } = await db.auth.admin.mfa.listFactors({ userId: targetUserId })
    for (const f of data?.factors ?? []) {
      await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: targetUserId })
    }
  } catch (err) {
    console.error('[clearTwoFa] MFA-Faktor-Delete fehlgeschlagen:', err)
  }
  await db.from('profiles').update({
    twofa_telefon: null,
    twofa_telefon_verifiziert_am: null,
    twofa_aktiviert: false,
  }).eq('id', targetUserId)
  await revokeAllTokens(targetUserId)
  return { success: true }
}
```

- [ ] **Step 3: tsc + knip**

Run: `npx tsc --noEmit` (keine neuen Fehler; falls `auth.admin.mfa` im SDK anders heißt → auf die in `@supabase/supabase-js@2.100.1` vorhandene `GoTrueAdminMFAApi`-Signatur anpassen).
Run: `npm run check:knip -- --warn` — `validateRememberToken` darf nicht mehr als „unused export" gemeldet werden (bzw. Baseline sinkt).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/twofa/remember-me.ts
git commit -m "feat(2fa): clearTwoFa entfernt echte MFA-Faktoren (F6) + tote validateRememberToken raus (F1)"
```

---

## Task 7 — Telefon-Login härten (F4)

**Files:**
- Modify: `src/app/login/LoginClient.tsx`

- [ ] **Step 1: `shouldCreateUser: false`** — in `handlePhoneSend` den Aufruf ändern:
```ts
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false },
      })
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` — keine neuen Fehler in `LoginClient.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/LoginClient.tsx
git commit -m "fix(2fa): Telefon-Login ohne Auto-Signup (shouldCreateUser:false) (F4)"
```

---

## Task 8 — REVOKE anon auf auth_remember_tokens (F8)

**Files:**
- Create: `supabase/migrations/<getrackte-version>_revoke_anon_auth_remember_tokens.sql`

- [ ] **Step 1: Migration via Supabase-Plugin anwenden**

`apply_migration({ name: "revoke_anon_auth_remember_tokens", query: "REVOKE ALL ON public.auth_remember_tokens FROM anon;" })` auf Projekt `paizkjajbuxxksdoycev`.

- [ ] **Step 2: Getrackte Version ablesen**

`list_migrations` → die vom Plugin vergebene Version `<V>` notieren.

- [ ] **Step 3: Migration-File committen** — Datei `supabase/migrations/<V>_revoke_anon_auth_remember_tokens.sql` mit exakt:
```sql
REVOKE ALL ON public.auth_remember_tokens FROM anon;
```

- [ ] **Step 4: Verifizieren (READ)**

`execute_sql` (READ):
```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='auth_remember_tokens' and grantee='anon';
```
Expected: 0 Zeilen.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_revoke_anon_auth_remember_tokens.sql
git commit -m "chore(2fa): REVOKE ALL auth_remember_tokens FROM anon (F8 Haertung)"
```

---

## Task 9 — Rate-Limit-Verifikation (F5) + Gesamt-Audit / Close-out

**Files:** keine Code-Änderung (außer evtl. Doku).

- [ ] **Step 1: GoTrue-SMS-Rate-Limits verifizieren (F5)** — via Supabase-MCP `get_project` / Auth-Config bzw. `get_advisors`, ob SMS-/MFA-Rate-Limits aktiv sind. Ergebnis im PR-Body dokumentieren. (Kein App-Code — GoTrue backstopt; `shouldCreateUser:false` aus T7 nimmt die Signup-Amplifikation.)

- [ ] **Step 2: Volle Suite der berührten Tests**

Run: `npx vitest run src/lib/auth/`
Expected: alle grün (remember-validate + mfa-gate).

- [ ] **Step 3: 4 Ratchets**

Run: `npm run check:token-audit` · `npm run check:component-set` · `npm run check:knip` — jeweils 0-neu (Status-Ratchet ist Teil von token-audit). `red-50`/`emerald`-Bestand in `TwoFaClient.tsx` NICHT neu einführen (bestehende Zeilen unberührt lassen).

- [ ] **Step 4: 7-Punkte-Audit** (AGENTS) im PR-Body dokumentieren: Build (CI), UI-Erreichbarkeit (Login/2FA-Flow unverändert erreichbar), Redundanz (Choke-Point `requirePortalAccess`/`mfa-gate` wiederverwendet), Dead-Code (`validateRememberToken` entfernt), Spec-Treue (F1–F8), Inkonsistenz (Result-Object/Umlaute/Tokens), Regression (Google-exempt gegen Loop, SV-mit-Faktor challenge, faktor-lose Nicht-interne unberührt).

- [ ] **Step 5: PR gegen staging öffnen** — Body: Findings-Tabelle, Rollout-Hinweis (~12 interne User → Enroll bei nächster Portal-Navigation), Post-Merge-Prod-Smoke-Checkliste (Bypass zu / interner Enroll erzwungen / SV challenge), F8-Migration prod-applied.

---

## Post-Merge (nicht Teil der Tasks, für den Merge-/Smoke-Verantwortlichen)

- Prod-Smoke im frischen SW-freien Browser (s. `[[broadcast-prod-smokes-fresh-sw-browser]]`):
  1. Passwort-Login + `claimondo_remember=1` fälschen → **muss** auf `/login/2fa` bleiben.
  2. Interner Test-Account ohne Faktor → non-skippable Enroll.
  3. SV mit Faktor → im `/gutachter`-Portal gechallenged.
- Follow-up-Ticket: Marketing-Middleware (`claimondo-marketing/lib/supabase/middleware.ts`) — toten Alt-2FA/Admin-Zweig entfernen (nicht ausnutzbar, s. Spec §7).
