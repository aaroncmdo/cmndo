# Baustein 0 — 2FA optional (F3-Pflicht raus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 2FA von "Pflicht fuer interne Rollen" auf "optional/opt-in" umstellen — entfernt den erzwungenen Enroll an allen 3 Enforcement-Stellen und beseitigt damit den heutigen Founder/Team-Lockout permanent.

**Architecture:** Der Zwang kommt aus 3 `profiles.rolle`-Lesern (`login/actions`, `login/2fa/page`, `requirePortalAccess`), die alle `istZweiFaktorPflicht()` als harte Schranke nutzen. B0 entkoppelt die Enforcement von der Pflicht: `entscheideLoginRouting` routet nur noch faktor-basiert (`hasVerifiedFactor ? challenge : portal`), die Page + der Portal-Guard erzwingen keinen Enroll mehr. `entscheideMfaGate` (Middleware, faktor-basierte Challenge) bleibt **unveraendert** — wer 2FA aktiviert HAT, wird weiter gefordert. `istZweiFaktorPflicht` bleibt als Funktion erhalten (spaeter Nudge in B1), verliert aber jede Enforcement-Wirkung.

**Tech Stack:** Next.js (App Router, Server Actions), Supabase-MFA/AAL, vitest.

## Global Constraints

- **Regel 1:** kein Direct-Push auf `main`. PR **base=staging** (Autopilot: staging → `release:` → main → deploy).
- **Kein lokales `node_modules`** im Worktree → `tsc`/Build lokal nicht fahrbar → **CI ist autoritativ**; Pure-Logik (`mfa-gate`) ist per vitest lokal testbar, sobald deps da sind, sonst CI.
- **Post-Task-7-Punkte-Audit** im Commit-Body (AGENTS.md).
- **Frontend-Umlaute** Pflicht (hier nur Kommentare/Logik betroffen → ASCII ok).
- **Worktree:** `.claude/worktrees/2fa-optional-phone-login`, Branch `kitta/2fa-optional-phone-login` (base staging). Alle `git`-Befehle mit `git -C <worktree>`.
- **`entscheideMfaGate` NICHT anfassen** (Middleware-Gate bleibt faktor-basiert korrekt).

---

### Task 1: `mfa-gate.ts` — Pflicht/Legacy-Enroll aus `entscheideLoginRouting` entfernen

**Files:**
- Modify: `src/lib/auth/mfa-gate.ts` (Typen `LoginRoutingInput`/`LoginRouting` + `entscheideLoginRouting`)
- Test: `src/lib/auth/mfa-gate.test.ts`

**Interfaces:**
- Produces: `entscheideLoginRouting(input: { isGoogleUser: boolean; hasVerifiedFactor: boolean }): 'portal' | 'challenge'`
- Produces (unveraendert, bleibt exportiert): `istZweiFaktorPflicht(rolle): boolean`, `waehleZweitFaktor`, `hatVerifiziertenFaktor`, `entscheideMfaGate`.

- [ ] **Step 1: Test anpassen — Legacy/Pflicht-Enroll-Faelle werden zu 'portal'**

In `src/lib/auth/mfa-gate.test.ts`:
- `loginInput`-Helper: `legacy2faWanted` + `rollePflicht` aus Default + Typ entfernen:
```ts
function loginInput(overrides: Partial<LoginRoutingInput> = {}): LoginRoutingInput {
  return {
    isGoogleUser: false,
    hasVerifiedFactor: false,
    ...overrides,
  }
}
```
- Den Test `'Enroll: Legacy-2FA gewollt...'` (der `legacy2faWanted: true → 'enroll'` erwartet) **ersetzen** durch:
```ts
  it('Portal: kein Supabase-Faktor -> optional, kein erzwungener Enroll', () => {
    expect(entscheideLoginRouting(loginInput())).toBe('portal')
  })
```
- Den kompletten `describe('entscheideLoginRouting — 2FA-Pflicht (F3)', ...)`-Block (die 3 `rollePflicht`-Tests) **loeschen**.
- Neuer Regressions-Test direkt nach dem `entscheideLoginRouting`-describe:
```ts
describe('entscheideLoginRouting — 2FA optional (kein Lockout)', () => {
  it('interne Rolle ohne Faktor wird NICHT mehr in Enroll gezwungen -> portal', () => {
    // rollePflicht existiert nicht mehr als Input; die Entscheidung haengt nur
    // am Faktor. Ein Admin ohne Faktor landet im Portal (Lockout-Regression).
    expect(entscheideLoginRouting({ isGoogleUser: false, hasVerifiedFactor: false })).toBe('portal')
  })
  it('mit Faktor weiterhin challenge', () => {
    expect(entscheideLoginRouting({ isGoogleUser: false, hasVerifiedFactor: true })).toBe('challenge')
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen (rollePflicht/legacy2faWanted noch im Typ/Impl)**

Run (falls deps vorhanden): `npx vitest run src/lib/auth/mfa-gate.test.ts`
Expected: FAIL (Typfehler: `rollePflicht`/`legacy2faWanted` fehlen jetzt / `'enroll'`-Erwartung weg). Ohne lokale deps: via CI.

- [ ] **Step 3: `mfa-gate.ts` anpassen**

`LoginRoutingInput` reduzieren + `LoginRouting` auf `'portal' | 'challenge'` + `entscheideLoginRouting` faktor-only:
```ts
export type LoginRoutingInput = {
  /** user.app_metadata.provider === 'google' */
  isGoogleUser: boolean
  /** User hat einen verifizierten Supabase-MFA-Faktor */
  hasVerifiedFactor: boolean
}

export type LoginRouting = 'portal' | 'challenge'

/**
 * Routing direkt nach erfolgreichem Passwort-Login. 2FA ist OPTIONAL
 * (2026-07-08): es gibt keinen erzwungenen Enroll mehr — wer einen
 * verifizierten Faktor HAT, verifiziert ihn ('challenge'); sonst direkt ins
 * Portal. Aktivierung von 2FA passiert opt-in in den Konto-Einstellungen.
 */
export function entscheideLoginRouting(input: LoginRoutingInput): LoginRouting {
  if (input.isGoogleUser) return 'portal'
  if (input.hasVerifiedFactor) return 'challenge'
  return 'portal'
}
```
Den Kommentar-Block ueber `ZWEI_FAKTOR_PFLICHT_ROLLEN` anpassen (nur noch Nudge, keine Enforcement):
```ts
// istZweiFaktorPflicht: markiert interne Rollen fuer den WEICHEN 2FA-Nudge
// (Banner "2FA empfohlen", B1). Seit 2026-07-08 KEINE Enforcement mehr — 2FA
// ist optional; kein Login-/Portal-Pfad erzwingt daraus einen Enroll.
const ZWEI_FAKTOR_PFLICHT_ROLLEN = new Set(['admin', 'dispatch', 'kanzlei', 'kundenbetreuer'])
```

- [ ] **Step 4: Test laufen lassen — gruen**

Run: `npx vitest run src/lib/auth/mfa-gate.test.ts` → PASS (bzw. via CI).

- [ ] **Step 5: Commit**

```bash
git -C ".claude/worktrees/2fa-optional-phone-login" add src/lib/auth/mfa-gate.ts src/lib/auth/mfa-gate.test.ts
git -C ".claude/worktrees/2fa-optional-phone-login" commit -F- # message siehe unten
```
Commit-Message (mit Audit):
```
refactor(2fa): entscheideLoginRouting faktor-only — 2FA optional (F3-Enforcement raus)

LoginRoutingInput/LoginRouting entschlackt (rollePflicht + legacy2faWanted +
'enroll'-Outcome entfernt). Kein erzwungener Enroll mehr am Login. istZweiFaktorPflicht
bleibt fuer den B1-Nudge, ohne Enforcement. entscheideMfaGate unveraendert.

Audit:
- Build: n/a lokal (kein node_modules) -> CI; Pure-Logik vitest-getestet
- UI: n/a
- Redundanz: keine
- Dead-Code: rollePflicht/legacy2faWanted-Pfad + F3-Testblock entfernt
- Spec: B0 aus 2026-07-08-2fa-optional-phone-login-redesign-design.md
- Inkonsistenz: entscheideMfaGate bewusst unangetastet
- Regression: neuer Test "interne Rolle ohne Faktor -> portal" (Lockout)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 2: `login/actions.ts` — Pflicht/Legacy aus dem Routing-Call entfernen

**Files:**
- Modify: `src/app/login/actions.ts:82-128`

**Interfaces:**
- Consumes: `entscheideLoginRouting({ isGoogleUser, hasVerifiedFactor })` (Task 1).

- [ ] **Step 1: Import + Profile-Select + Routing-Call anpassen**

Import (Zeile 9) — `istZweiFaktorPflicht` entfernen:
```ts
import { entscheideLoginRouting } from '@/lib/auth/mfa-gate'
```
Profile-Select (Zeile 82-86) — `twofa_aktiviert, twofa_email_aktiviert` raus (nur noch fuers Routing genutzt, jetzt obsolet):
```ts
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rolle, force_password_change, auth_provider')
    .eq('id', user.id)
    .single()
```
Routing-Call (Zeile 122-128):
```ts
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const routing = entscheideLoginRouting({
    isGoogleUser: authProvider === 'google',
    hasVerifiedFactor: aal?.nextLevel === 'aal2',
  })
```
Den Kommentar bei Zeile 130-133 (`'enroll' (Soft-Enroll...)`) auf challenge-only kuerzen:
```ts
  if (routing !== 'portal') {
    // routing === 'challenge': vorhandenen Faktor auf /login/2fa verifizieren.
    revalidatePath('/login/2fa', 'layout')
    redirect('/login/2fa')
  }
```

- [ ] **Step 2: Verifizieren (kein lokaler Build) — via CI**

Der volle `npm run build` laeuft in CI (Server-Action-File → Next-Validator). Lokal nur Sichtpruefung: `entscheideLoginRouting`-Call hat exakt `{ isGoogleUser, hasVerifiedFactor }`, kein `istZweiFaktorPflicht`-Rest, kein `twofa_*` mehr referenziert.

- [ ] **Step 3: Commit**

```bash
git -C ".claude/worktrees/2fa-optional-phone-login" add src/app/login/actions.ts
```
```
refactor(2fa): login/actions ohne Pflicht/Legacy-Enroll-Routing

entscheideLoginRouting-Call auf {isGoogleUser, hasVerifiedFactor} reduziert;
istZweiFaktorPflicht-Import + twofa_*-Select-Felder (nur fuers alte Routing)
entfernt. Login zwingt keine interne Rolle mehr in den 2FA-Enroll.

Audit:
- Build: CI (Server-Action, Next-Validator)
- UI: n/a
- Redundanz: keine
- Dead-Code: istZweiFaktorPflicht-Import + twofa_aktiviert/twofa_email_aktiviert-Select raus
- Spec: B0
- Inkonsistenz: Result-Pattern unangetastet (Funktion nutzt redirect(), wie gehabt)
- Regression: finalisierePhoneLogin unberuehrt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 3: `login/2fa/page.tsx` — erzwungenen Enroll-Branch entfernen

**Files:**
- Modify: `src/app/login/2fa/page.tsx:8, 73-92`

- [ ] **Step 1: Enroll-Branch durch Portal-Redirect ersetzen**

Import (Zeile 8) — `istZweiFaktorPflicht` raus:
```ts
import { waehleZweitFaktor } from '@/lib/auth/mfa-gate'
```
Zeile 73-91 (`// Kein verifizierter Faktor.` bis Ende) ersetzen durch:
```ts
  // Kein verifizierter Faktor -> 2FA ist optional, kein erzwungener Enroll.
  // Die 2FA-Einrichtung passiert opt-in in den Konto-Einstellungen (B1).
  redirect(finalTarget)
}
```
Den Doc-Kommentar oben (Zeile 10-17) die Enroll-Zeile anpassen:
```ts
//   - Legacy/kein Faktor           -> direkt ins Ziel (2FA optional, kein Zwang)
```

- [ ] **Step 2: Verifizieren (CI)** — `istZweiFaktorPflicht` nicht mehr importiert/genutzt; `TwoFaClient` bleibt fuer den `mode="challenge"`-Pfad (Zeile 60-71) importiert. `mandatory`-Prop wird von der Page nicht mehr gesetzt (bleibt an `TwoFaClient` als optionale Prop bestehen — kein Fehler; wird in B1 aufgeraeumt).

- [ ] **Step 3: Commit**

```bash
git -C ".claude/worktrees/2fa-optional-phone-login" add src/app/login/2fa/page.tsx
```
```
refactor(2fa): /login/2fa erzwingt keinen Enroll mehr (optional)

Kein-Faktor-Fall -> redirect ins Portal statt mandatory TwoFaClient-Enroll.
istZweiFaktorPflicht-Import raus. TOTP/Phone-Challenge fuer vorhandene Faktoren
bleibt. mandatory-Prop an TwoFaClient wird nicht mehr gesetzt (Cleanup in B1).

Audit:
- Build: CI (Route)
- UI: /login/2fa zeigt fuer faktor-lose User keine Enroll-Wand mehr
- Redundanz: keine
- Dead-Code: pflicht/legacyWanted-Enroll-Branch entfernt
- Spec: B0
- Inkonsistenz: keine
- Regression: challenge-Pfad (totp/phone) unveraendert

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 4: `portal-guard.ts` — F3-Redirect-Block entfernen

**Files:**
- Modify: `src/lib/auth/portal-guard.ts` (Import-Zeile + der F3-Block)

- [ ] **Step 1: Block + Import entfernen**

Import — nur noch `roleToPath` aus mfa-gate-Nachbarn; die `istZweiFaktorPflicht, hatVerifiziertenFaktor`-Zeile **loeschen** (werden nach dem Block nicht mehr gebraucht — vor dem Commit mit `grep` im File bestaetigen).
Den kompletten F3-Block loeschen:
```ts
  // F3 (AAR-audit-2fa): 2FA-Pflicht fuer interne Rollen pro Request erzwingen ...
  const isGoogleUser = user.app_metadata?.provider === 'google'
  if (!isGoogleUser && istZweiFaktorPflicht(rolle) && !hatVerifiziertenFaktor(user.factors)) {
    redirect('/login/2fa')
  }
```
`force_password_change`-Block + Rollen-Check (`if (!allowedRollen.includes(rolle))`) bleiben unveraendert.

- [ ] **Step 2: Verifizieren**

```bash
grep -nE "istZweiFaktorPflicht|hatVerifiziertenFaktor|isGoogleUser" ".claude/worktrees/2fa-optional-phone-login/src/lib/auth/portal-guard.ts"
```
Expected: keine Treffer mehr (sonst Import-Rest → CI-Fehler `unused`).

- [ ] **Step 3: Commit**

```bash
git -C ".claude/worktrees/2fa-optional-phone-login" add src/lib/auth/portal-guard.ts
```
```
refactor(2fa): requirePortalAccess ohne F3-2FA-Pflicht (optional)

Der per-Request-Redirect nach /login/2fa fuer interne Rollen ohne Faktor
entfaellt -> Admin/dispatch ohne 2FA-Faktor kommen wieder ins Portal.
istZweiFaktorPflicht/hatVerifiziertenFaktor-Import raus. force_password_change
+ Rollen-Check unveraendert.

Audit:
- Build: CI (in allen Portal-Layouts konsumiert)
- UI: interne Portale ohne 2FA-Enroll-Wand erreichbar
- Redundanz: keine
- Dead-Code: F3-Block + Imports entfernt
- Spec: B0 (Kern-Lockout-Fix)
- Inkonsistenz: keine
- Regression: force_password_change + Rollen-Weiche intakt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 5: PR gegen staging + Deploy-Smoke

- [ ] **Step 1: Push + PR**

```bash
git -C ".claude/worktrees/2fa-optional-phone-login" push -u origin kitta/2fa-optional-phone-login
gh pr create --base staging --head kitta/2fa-optional-phone-login --title "feat(2fa): 2FA optional (F3-Pflicht raus) — Baustein 0 / Lockout-Fix" --body "<Zusammenfassung + Spec-Link + Hinweis: entsperrt admin/dispatch>"
```

- [ ] **Step 2: CI abwarten** — `build` (required) muss gruen sein (findet Server-Action/Route/Layout-Validator-Fehler). Bei rot: Fix, Re-push.

- [ ] **Step 3: Merge via Autopilot** — base=staging → `release:`-PR → main → `deploy-vps`.

- [ ] **Step 4: Prod-Smoke (autoritativ, frischer SW-freier Browser):**
  - Admin-Account **ohne** Faktor (`lupus.674music@gmail.com`) → Email+Passwort-Login → landet **direkt im Admin-Portal**, KEIN `/login/2fa`-Redirect. (= Aarons Unlock + Kern-Akzeptanz.)
  - Ein Account **mit** verifiziertem Faktor (`aaron.sprafke+makler@`) → wird weiterhin auf `/login/2fa` gefordert (Challenge intakt).
  - SV-Account (`aaron.sprafke@`) → Portal wie bisher.

---

## Follow-on (eigene Plaene nach B0-Ship)

- **B1** — 2FA opt-in (TOTP/SMS-Methodenwahl) in `KontoSicherheitPanel` + TOTP-enroll/verify in `twofa/mfa.ts` + Erst-Login-Nudge + `mandatory`-Prop-Cleanup an `TwoFaClient`.
- **B2** — passwordless Telefon-Login: `auth.users.phone`-Sync (`admin.updateUserById` `phone_confirm`) + Nummer-Eindeutigkeit + 18er-Testnummer-Bereinigung.

Beide referenzieren `docs/superpowers/specs/2026-07-08-2fa-optional-phone-login-redesign-design.md`.

## Self-Review

- **Spec-Coverage:** B0 der Spec = Pflicht raus an login/actions (Task 2) + login/2fa/page (Task 3) + portal-guard (Task 4) + mfa-gate (Task 1); `entscheideMfaGate` unangetastet (Constraint erfuellt); `istZweiFaktorPflicht` bleibt fuer Nudge. ✓
- **Placeholder-Scan:** keine TBD/TODO in Steps; jeder Step hat exakten Code/Command. ✓
- **Typ-Konsistenz:** `entscheideLoginRouting`-Signatur in Task 1 (Produce) == Nutzung in Task 2 (Consume) == `{isGoogleUser, hasVerifiedFactor} -> 'portal'|'challenge'`. ✓
