# SP5a — Microsoft-Outlook-Connect-Fundament — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).

**Goal:** Outlook-Kalender verbinden (OAuth) — env-gated/dormant, spiegelt die Google-Fläche mit raw `fetch`.

**Architecture:** `profiles.ms_*` (mirror google_*) → MS-OAuth-Helper (`graph-client.ts`) → 3 Routen (`/api/auth/microsoft/*`) → Outlook-Card im geteilten `KalenderConnectPanel` + ms-State in 2 Seiten.

**Tech Stack:** Next.js 16, Supabase, Microsoft Graph (raw fetch, keine neue Dependency), vitest.

## Global Constraints
- Regel 1: Branch `kitta/outlook-connect-foundation` (erstellt, stacked auf SP2d), PR gegen SP2d-Branch.
- **Env-gated:** ohne `MICROSOFT_OAUTH_CLIENT_ID`/`MICROSOFT_OAUTH_CLIENT_SECRET` → `not_configured` (kein Crash). **Kein funktionaler Smoke** (dormant bis Azure). Nur build-verifiziert.
- Regel 2: Migration via apply_migration. `externalUrl`/`externalOrigin` für nginx-sichere redirect_uri. Umlaute in UI-Strings. 7-Punkte-Audit.
- `state = "<user.id>|<return>"`; returnTo IMMER whitelisten (relativer Pfad).

## File Structure
- **Create:** `supabase/migrations/<V>_profiles_ms_oauth.sql`.
- **Create:** `src/lib/microsoft/graph-client.ts` (+ `__tests__/graph-client.test.ts`).
- **Create:** `src/app/api/auth/microsoft/connect/route.ts`, `.../callback/route.ts`, `.../disconnect/route.ts`.
- **Modify:** `src/components/shared/KalenderConnectPanel.tsx` (Outlook-Card + Props), `src/app/gutachter/einstellungen/kalender/KalenderEinstellungenClient.tsx` (Props-Passthrough), `src/app/gutachter/einstellungen/kalender/page.tsx` + `src/app/mitarbeiter/profil/page.tsx` (ms-State laden).

---

### Task 1: Migration — `profiles.ms_*` (5 Spalten)

- [ ] **Step 1: apply_migration** (name `profiles_ms_oauth`):
```sql
-- SP5a: Microsoft-OAuth-Tokens fuer Outlook-Kalender-Sync, mirror von profiles.google_*.
-- Additiv, nullable. Env-gated genutzt (MICROSOFT_OAUTH_CLIENT_ID/SECRET).
alter table profiles
  add column if not exists ms_refresh_token text,
  add column if not exists ms_access_token text,
  add column if not exists ms_token_expires_at timestamptz,
  add column if not exists ms_email text,
  add column if not exists ms_connected_at timestamptz;
```
- [ ] **Step 2–4:** list_migrations → Version → File `<V>_profiles_ms_oauth.sql` → READ-Verify (5 Spalten). **Step 5: Commit.**

---

### Task 2: OAuth-Helper + Test (TDD)

**Files:** Create `src/lib/microsoft/graph-client.ts`, `src/lib/microsoft/__tests__/graph-client.test.ts`.

- [ ] **Step 1: Failing test:**
```ts
import { describe, it, expect } from 'vitest'
import { msTokenNeedsRefresh } from '../graph-client'
describe('msTokenNeedsRefresh', () => {
  const now = 1_000_000_000_000
  it('kein Ablauf → true', () => { expect(msTokenNeedsRefresh(null, now)).toBe(true) })
  it('abgelaufen → true', () => { expect(msTokenNeedsRefresh(new Date(now - 1000).toISOString(), now)).toBe(true) })
  it('gültig (> now+60s Puffer) → false', () => { expect(msTokenNeedsRefresh(new Date(now + 120_000).toISOString(), now)).toBe(false) })
  it('innerhalb Puffer (< 60s) → true', () => { expect(msTokenNeedsRefresh(new Date(now + 30_000).toISOString(), now)).toBe(true) })
})
```
- [ ] **Step 2: fail. Step 3: Implement** `graph-client.ts`:
```ts
// SP5a: Microsoft-Graph-OAuth-Helper (Pendant zu google/oauth-client.ts, raw fetch).
// Env-gated (MICROSOFT_OAUTH_CLIENT_ID/SECRET). getMicrosoftAccessTokenForUser liefert
// ein gueltiges Access-Token (mit Refresh) oder null; SP5b nutzt es fuer Graph-Calls.
import { createAdminClient } from '@/lib/supabase/admin'

// 'common' = persoenliche (outlook.com) UND work/school (M365) Accounts.
export const MS_AUTHORIZE_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
export const MS_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
export const MS_SCOPES = 'offline_access Calendars.ReadWrite User.Read'

/** Braucht das Token einen Refresh? Kein/abgelaufenes (< now+60s Puffer) → true. Pure. */
export function msTokenNeedsRefresh(expiresAtIso: string | null, nowMs: number): boolean {
  if (!expiresAtIso) return true
  return new Date(expiresAtIso).getTime() <= nowMs + 60_000
}

export async function getMicrosoftAccessTokenForUser(userId: string): Promise<string | null> {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const db = createAdminClient()
  const { data: p } = await db
    .from('profiles')
    .select('ms_refresh_token, ms_access_token, ms_token_expires_at')
    .eq('id', userId)
    .single()
  if (!p?.ms_refresh_token) return null

  if (p.ms_access_token && !msTokenNeedsRefresh((p.ms_token_expires_at as string | null) ?? null, Date.now())) {
    return p.ms_access_token as string
  }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: p.ms_refresh_token as string,
      scope: MS_SCOPES,
    })
    const resp = await fetch(MS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!resp.ok) {
      console.warn('[ms-graph] refresh fehlgeschlagen:', resp.status)
      return null
    }
    const tok = (await resp.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!tok.access_token) return null
    await db
      .from('profiles')
      .update({
        ms_access_token: tok.access_token,
        ms_token_expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
        ...(tok.refresh_token ? { ms_refresh_token: tok.refresh_token } : {}),
      })
      .eq('id', userId)
    return tok.access_token
  } catch (err) {
    console.warn('[ms-graph] refresh error:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function isMicrosoftConnected(userId: string): Promise<boolean> {
  const db = createAdminClient()
  const { data } = await db.from('profiles').select('ms_refresh_token').eq('id', userId).single()
  return !!data?.ms_refresh_token
}
```
- [ ] **Step 4: pass. Step 5: tsc. Step 6: Commit.**

---

### Task 3: OAuth-Routen (connect/callback/disconnect)

**Files:** Create the 3 route.ts (Mirror der Google-Routen mit raw fetch — vollständiger Code im Spec/aus dem Google-Vorbild). Kernpunkte:
- **connect:** env-gated; returnTo whitelisten (`safeReturn = returnTo.startsWith('/') && !startsWith('//') ? returnTo : '/mitarbeiter/profil'`); `not_configured` → Redirect `safeReturn?ms_error=not_configured`; sonst Redirect `MS_AUTHORIZE_ENDPOINT?client_id&response_type=code&redirect_uri=<base>/api/auth/microsoft/callback&response_mode=query&scope=<MS_SCOPES>&state=<uid>|<safeReturn>`.
- **callback:** `code`/`state` parsen, `user.id===stateUserId`, env-gated; Token-Exchange POST `MS_TOKEN_ENDPOINT` (`grant_type=authorization_code`); braucht `refresh_token`; Email `GET graph.microsoft.com/v1.0/me` (`mail ?? userPrincipalName`); `profiles.ms_*` speichern (`ms_token_expires_at = now + expires_in*1000`); Redirect `safeReturn`. Fehler → `safeReturn?ms_error=<...>`.
- **disconnect:** POST, auth-gated; `profiles.ms_*` = null; `{ success: true }`.
- [ ] **Step 1–3:** die 3 Routen schreiben (env-gated, `externalUrl`/`externalOrigin`, whitelisted returnTo). **Step 4: tsc (0).** **Step 5: Commit.**

---

### Task 4: Connect-UI (Outlook-Card + ms-State)

**Files:** Modify `KalenderConnectPanel.tsx`, `KalenderEinstellungenClient.tsx`, `gutachter/einstellungen/kalender/page.tsx`, `mitarbeiter/profil/page.tsx`.

- [ ] **Step 1: `KalenderConnectPanel`** — Props `microsoftConnected: boolean`, `microsoftEmail: string | null` ergänzen; `handleConnectMicrosoft` (`window.location.href = '/api/auth/microsoft/connect?return=' + encodeURIComponent(returnPath)`); eine dritte `<section>` „Microsoft Outlook" analog zur Google-Card (Status-Badge verbunden/nicht verbunden, Email, „Microsoft Outlook verbinden"/„Anderes Microsoft-Konto verbinden"-Button). Umlaute korrekt.
- [ ] **Step 2: `KalenderEinstellungenClient` (SV)** — `microsoftConnected`/`microsoftEmail` in Props + an `<KalenderConnectPanel>` durchreichen.
- [ ] **Step 3: `gutachter/einstellungen/kalender/page.tsx`** — im `profiles`-Select `ms_connected_at, ms_email` ergänzen; an `KalenderEinstellungenClient` `microsoftConnected={!!profile?.ms_connected_at}` + `microsoftEmail`.
- [ ] **Step 4: `mitarbeiter/profil/page.tsx`** — im `profiles`-Select `ms_connected_at, ms_email` ergänzen; an `KalenderConnectPanel` `microsoftConnected={!!profile.ms_connected_at}` + `microsoftEmail`.
- [ ] **Step 5: tsc (0) + Full-Build** (Routen/Layouts betroffen). **Step 6: Commit.**

---

### Task 5: Verifikation + PR

- [ ] **Step 1:** tsc 0 · Full-Build 0 · vitest (graph-client + Domain) · 3 Ratchets 0 neue.
- [ ] **Step 2: Prod-Smoke (READ):** 5 `profiles.ms_*`-Spalten live. **KEIN funktionaler Smoke** (env nicht gesetzt → `not_configured`; dormant bis Azure) — ehrlich im PR + Marker.
- [ ] **Step 3: 7-Punkte-Audit + Session-Abschluss-Check.**
- [ ] **Step 4: Push + PR** gegen `kitta/rueckruf-caldav-sync` (SP2d-Branch, stacked). PR-Body: Azure-Setup-Anleitung für Aaron (App registrieren + Redirect-URI + Permission + Secret + Env).
- [ ] **Step 5: Marker + MEMORY.md** (SP5a gebaut, dormant).

## Self-Review
- Spec-Coverage: Migration(T1), Helper(T2), Routen(T3), UI(T4), Verify(T5).
- Platzhalter: Routen-Code aus dem Google-Vorbild + Spec (beim Ausführen 1:1 mit raw fetch); `<V>`/`<terminId>`-Analoga mechanisch.
- Typ-Konsistenz: `msTokenNeedsRefresh`/`getMicrosoftAccessTokenForUser`/`isMicrosoftConnected`; Panel-Props `microsoftConnected`/`microsoftEmail`.
- Risiko: additiv + env-gated; kein bestehender Flow berührt.
