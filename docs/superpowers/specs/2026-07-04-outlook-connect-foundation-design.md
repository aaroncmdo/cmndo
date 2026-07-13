# SP5a — Microsoft-Outlook-Connect-Fundament (OAuth + Token + UI)

**Datum:** 2026-07-04
**Kontext:** SP5 des universellen Kalender-Sync-Features (nach SP1–SP2d = Feature-Core komplett). Outlook/M365-Kalender laufen über **Microsoft Graph + OAuth** (CalDAV ist von MS deprecatet), nicht über die CalDAV-Verbindungen. SP5 spiegelt daher die **Google-Fläche** für Microsoft. **SP5a = das OAuth-Fundament**: ein Nutzer kann seinen Outlook-Kalender **verbinden**; der eigentliche Sync (Provider/IN/admin) folgt in SP5b–d.

## Entscheidungen (Aaron)

- **Env-gated / dormant:** Der komplette Code wird gebaut, aber wie Googles `not_configured`-Fallback hinter `MICROSOFT_OAUTH_CLIENT_ID/SECRET` gegatet. **Mergebar + sicher**, leuchtet auf, sobald eine Azure-AD-App registriert + die Secrets gesetzt sind. **Nur build-verifiziert** — kein funktionaler/Prod-Smoke (kein MS-Konto/Token verfügbar).
- **Externe Voraussetzung (Aaron, außerhalb dieses PRs):** Azure-AD-App registrieren · Redirect-URI `<APP_URL>/api/auth/microsoft/callback` · API-Permission `Calendars.ReadWrite` (+ `offline_access`, `User.Read`) · Client-Secret · Env `MICROSOFT_OAUTH_CLIENT_ID` + `MICROSOFT_OAUTH_CLIENT_SECRET`.

## Ziel

Ein Mitarbeiter/SV verbindet auf seiner Kalender-/Profilseite seinen **Microsoft-Outlook**-Kalender (OAuth), analog zu Google. Tokens landen profil-gekeyed auf `profiles.ms_*`. SP5a liefert Connect/Disconnect + den Token-Refresh-Helper, den SP5b (Provider) nutzt.

## Nicht-Ziele (SP5b–d)

- **Kein** Termin-Sync (kein `outlookProvider`, kein `gutachter_termine.ms_event_id`) — SP5b.
- **Kein** IN-Sync (Graph free/busy → Cache) — SP5c.
- **Kein** admin_termine-Outlook (Rückrufe) — SP5d.

## Architektur (spiegelt Google 1:1, raw `fetch` statt SDK)

### 1. Schema (additive Migration, Regel 2)

`profiles` + 5 Spalten (Mirror von `google_*`):
`ms_refresh_token text`, `ms_access_token text`, `ms_token_expires_at timestamptz`, `ms_email text`, `ms_connected_at timestamptz`.

### 2. OAuth-Helper (`src/lib/microsoft/graph-client.ts`, neu)

- Konstanten: `MS_AUTHORIZE_ENDPOINT` / `MS_TOKEN_ENDPOINT` (`https://login.microsoftonline.com/common/oauth2/v2.0/{authorize,token}` — `common` = persönliche **und** work/school Accounts), `MS_SCOPES = 'offline_access Calendars.ReadWrite User.Read'`.
- **`msTokenNeedsRefresh(expiresAtIso, nowMs)` (pure)** — true wenn kein/abgelaufenes (< now + 60s Puffer) Token. Testbar.
- **`getMicrosoftAccessTokenForUser(userId): Promise<string | null>`** — env-gated; liest `profiles.ms_*`; ohne `ms_refresh_token` → null; gültiges `ms_access_token` → direkt zurück; sonst Refresh (POST `MS_TOKEN_ENDPOINT`, `grant_type=refresh_token`) → neues `access_token` (+ ggf. rotiertes `refresh_token`) auf `profiles` speichern → zurückgeben; Refresh-Fehler → null (fail-soft). (Das ist das Pendant zu `getGoogleOAuthClientForUser`; SP5b nutzt es für Graph-Calls.)
- **`isMicrosoftConnected(userId)`** — `!!ms_refresh_token`.

### 3. OAuth-Routen (Mirror der Google-Routen, `externalUrl`/`externalOrigin` für nginx)

- **`/api/auth/microsoft/connect`** — env-gated; `state = "<user.id>|<return>"`; Redirect auf `MS_AUTHORIZE_ENDPOINT?client_id&response_type=code&redirect_uri=<base>/api/auth/microsoft/callback&response_mode=query&scope=<MS_SCOPES>&state`.
- **`/api/auth/microsoft/callback`** — validiert `code`+`state`+`user.id===stateUserId`; env-gated; Token-Exchange (POST `MS_TOKEN_ENDPOINT`, `grant_type=authorization_code`); braucht `refresh_token`; Email via `GET https://graph.microsoft.com/v1.0/me` (`mail ?? userPrincipalName`); speichert `profiles.ms_*`; Redirect auf whitelisted `safeReturn` (nur relative Pfade). Fehler → `?error=...` auf einen Fallback-Pfad.
- **`/api/auth/microsoft/disconnect`** — nullt `profiles.ms_*` (POST, mirror Google-disconnect).

### 4. Connect-UI

- **`KalenderConnectPanel`** (SP2b-shared) bekommt eine dritte Card **„Microsoft Outlook"** (analog Google-Card: Status-Badge, Email, „Verbinden/Anderes Konto"-Button → `/api/auth/microsoft/connect?return=<returnPath>`). Neue Props `microsoftConnected`/`microsoftEmail`.
- **`/gutachter/einstellungen/kalender/page.tsx`** + **`/mitarbeiter/profil/page.tsx`**: `profiles.ms_connected_at`/`ms_email` mitladen + an den Panel durchreichen. (Der SV-Client `KalenderEinstellungenClient` reicht die neuen Props durch.)

## Testing

- **Unit (vitest):** `msTokenNeedsRefresh` (null/leer → true; abgelaufen → true; gültig+Puffer → false).
- **Build/tsc/Ratchets** grün. Routen kompilieren (Next-Validator).
- **KEIN funktionaler Smoke** (Env nicht gesetzt → `not_configured`-Pfad; kein Azure/MS-Konto). Ehrlich dokumentiert: SP5a ist build-verifiziert + dormant bis Aaron Azure einrichtet.

## Risiko & Rollback

Rein additiv (5 nullable Spalten, 3 neue Routen, 1 Helper, 1 UI-Card). Env-gated → im deployten Zustand (ohne Secrets) zeigt der Outlook-Button „nicht konfiguriert", sonst nichts. Kein bestehender Flow berührt (Google/CalDAV unverändert). Rollback = Code-Revert.

## Reihenfolge

SP1–SP2d (✅ Feature-Core) → **SP5a** (dieses Dokument) → SP5b `outlookProvider` (OUT) → SP5c IN-Sync → SP5d admin_termine-Outlook.
