# 2FA- & Google-Auth — Tiefen-Audit + Repro (31.05.2026)

**Branch:** `kitta/aar-939-monika-embed` · **Target:** `app.staging.claimondo.de` · **DB:** `paizkjajbuxxksdoycev`
**Modus:** read-only Audit + Repro (kein Fix). Probes: `scripts/probe-2fa-google-audit{,2,3}.mjs`, Evidenz: `docs/31.05.2026/2fa-google-audit/findings*.json` + Screenshots.

---

## TL;DR — 2 reproduzierte Bugs

1. **2FA-Reload-Loop / Lockout** — ein eingeloggter User **ohne aktive 2FA**, dem das `claimondo_2fa_verified`-Cookie fehlt (3-Tage-Ablauf, Mobile/Edge-Verlust, Host-Mismatch), wird von der Middleware auf `/login/2fa` geworfen, die Seite schickt ihn zurück auf `/admin`, die Middleware wieder auf `/login/2fa` → **Endlos-Bounce**. Empirisch: **18 Navigationen auf `/login/2fa` in 6 s** (≈3 Reloads/Sek). = „reloads bei 2fa" + leeres Flackern + kompletter Aussperrer.
2. **Google-Auth** — Supabase-Google-**Login funktioniert** (re-verifiziert 31.05. mit Hydration-Beweis: Klick feuert `signInWithOAuth` → authorize/PKCE → accounts.google.com; der frühere „Button tut nichts"-Befund war ein **Hydration-Timing-Artefakt** der Probe — zu früh geklickt). Echter Bug nur: **Google-Calendar-Connect ist auf Staging tot** — `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_CLIENT_ID` fehlen → `not_configured` bzw. **HTTP 500**, plus Redirect-Leak auf die interne Origin `0.0.0.0:3001`.

---

## BUG 1 — 2FA-Lockout (Cookieless 2FA-off → Dead-End)

### Reproduziert (test-admin@claimondo.de, 2FA aus)
| Schritt | Request | Ergebnis |
|---|---|---|
| 1 | Login | landet `/admin`, Cookie `claimondo_2fa_verified=1` gesetzt ✓ |
| 2 | Cookie gelöscht (simuliert Ablauf) → `GET /admin` | **307 → `/login/2fa`** |
| 3 | `GET /login/2fa` | **200, leerer Shell** (kein "Zwei-Faktor"-Heading, kein Redirect) |
| 4 | Browser-Navigation `/admin` | endet auf `/login/2fa`, Seite leer (Screenshot `A-loop-error.png` / `A2-login2fa-render.png`) |

### Root-Cause-Kette
1. **Middleware** (`src/lib/supabase/middleware.ts:112`) wirft **jeden** eingeloggten Nicht-Google-, Nicht-`/gutachter`-User ohne `claimondo_2fa_verified`-Cookie auf `/login/2fa` — **auch wenn er gar keine 2FA hat**:
   ```ts
   if (!isGoogleUser && !has2faCookie && !hasRememberCookie && !isGutachterPath) {
     response = NextResponse.redirect(externalUrl(request, '/login/2fa'))
   }
   ```
   `hasRememberCookie` prüft `claimondo_remember` (nur via 2FA-„Angemeldet bleiben"-Checkbox gesetzt) — ein 2FA-off-User hat den nie.
2. **`/login/2fa/page.tsx`** schickt 2FA-off-User via `redirect(targetPath)` zurück ins Portal (`page.tsx:38`) — empirisch bestätigt: Render enthält `NEXT_REDIRECT` + `/admin` ×4, die 2FA-Karte rendert NICHT (`hasTwoFa:false`). Da `/admin` ohne Cookie wieder auf `/login/2fa` bounced und **niemand im Bounce das Cookie setzt**, läuft es endlos (gemessen 18×/6s).
3. **Der dafür gebaute Loop-Fix ist Dead-Code:** `src/app/login/2fa/TwoFaSkipRedirect.tsx` + `markTwoFaSkipForInactive()` (`src/lib/auth/twofa/skip-cookie.ts`) — ihr expliziter Zweck (Cookie client-seitig setzen, dann hart navigieren, weil Server-Components keine Cookies setzen) — **wird von niemandem gerendert** (grep: nur die Self-Referenzen). `page.tsx` nutzt stattdessen den nackten `redirect()`, den der Fix vermeiden sollte.

### Cookie-Smell (Begünstiger)
`claimondo_2fa_verified` wird **ohne `domain`** gesetzt (host-only) — die Auth-Cookies dagegen mit `domain=.claimondo.de`. Über Subdomain-/Host-Wechsel ist das Cookie weg, der Auth-State bleibt → exakt die Lockout-Konstellation.

### Branch-Kontext (wichtig)
Mein Branch verändert genau diese Datei: `git diff origin/staging HEAD -- src/app/login/2fa/page.tsx` zeigt, dass AAR-939 das `safeContinue`/`LOGIN_CONTINUE_COOKIE`-„continue"-Konstrukt **entfernt**. Der 2FA-Hop ist also gerade mitten im Umbau (Login-Embed). Fix muss damit koordiniert werden.

### DB-Nebenbefund
3 Accounts `aaron.sprafke+kunde14/15/17@claimondo.de`: `twofa_aktiviert=true`, aber **`twofa_telefon IS NULL`** + Email-2FA aus → SMS-2FA „an" ohne Nummer. `nicolas.kitta@claimondo.de` (admin) hat `force_password_change=true`.

---

## BUG 2 — Google-Auth

### Was funktioniert
- **Supabase-Google-Provider OK:** direkter Hit `…/auth/v1/authorize?provider=google&redirect_to=<staging>/api/auth/callback` → **302 → accounts.google.com**, `client_id` gesetzt, **Staging-`redirect_to` akzeptiert** (kein Provider-Error).
- **Login-Button „Mit Google anmelden" OK** (re-verifiziert 31.05., `scripts/probe-google-button-reverify.mjs`, mit Hydration-Beweis): Klick feuert `signInWithOAuth` → authorize (PKCE) → accounts.google.com. Der frühere no-op war ein Probe-Timing-Artefakt (Klick vor React-Hydration). Das `handleGoogle`-Hardening bleibt trotzdem sinnvoll (ein echter `{error}` wurde bisher still geschluckt).

### Was kaputt ist (Staging)
| Endpoint | Ergebnis | Ursache |
|---|---|---|
| `/api/auth/google/connect` | 307 → `…/admin/einstellungen/google?error=not_configured` **auf `https://0.0.0.0:3001`** | `GOOGLE_OAUTH_CLIENT_ID/SECRET` fehlen auf Staging **+** Route baut Redirect mit `new URL(path, req.url)` statt `externalUrl()` → interne Proxy-Origin leakt |
| `/api/auth/google-calendar/connect` | **HTTP 500** | `route.ts:9` `if (!clientId) return 500` — `GOOGLE_CLIENT_ID` fehlt auf Staging |
| ~~Login-Button „Mit Google anmelden"~~ | **FALSCHER ALARM** (korrigiert) — re-verifiziert: Button feuert `signInWithOAuth` → authorize → Google. Früherer no-op = Hydration-Timing-Artefakt der Probe. | — (kein Bug; Hardening trotzdem behalten) |

### Env-Lage
Lokale `.env.local` (= Prod-Set lt. Memory) hat **weder** `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL` **noch** `GOOGLE_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_ID`. Calendar-Connect-Callback fällt ohne `NEXT_PUBLIC_APP_URL` auf `http://localhost:3000` zurück (`google-calendar/callback/route.ts:25`) → `redirect_uri_mismatch`. Staging-Env (`/etc/claimondo/.env.local` auf VPS) von hier nicht lesbar — die Connect-Endpoints **beweisen** aber empirisch, dass die Keys auf Staging fehlen.

---

## Symptom-Bestätigung (Aaron, 31.05.)
„Aussperren / leere 2FA-Seite" + „Google-Button reagiert nicht" + „reloads bei 2fa" — alle drei durch die Repro abgedeckt (Reload-Loop = die ersten beiden + drittes in einem).

## Mechanik-Nachweis (Probes)
- `probe-2fa-google-audit.mjs` / `…2` / `render-classify` — `/login/2fa` rendert keine 2FA-Karte, encodiert `redirect(/admin)`; `/admin` ohne Cookie → 307 → `/login/2fa`.
- `probe-2fa-loopcount.mjs` — **18 `/login/2fa`-Navigationen in 6 s** (Bounce bestätigt).

## Fix-Richtung (für eigenen Worktree — Branch geteilt)
**2FA (Loop):** Den Bounce brechen, indem im 2FA-aus-Fall das Cookie gesetzt wird BEVOR navigiert wird. Sauberste Optionen:
  1. `page.tsx` rendert für `!zweiFaAktiv` den vorhandenen `TwoFaSkipRedirect` (setzt Cookie via `markTwoFaSkipForInactive`, dann hart navigieren) statt nacktem `redirect()` — der Fix existiert, ist nur nicht verdrahtet.
  2. ODER Skip-Cookie über einen Route-Handler setzen (Server-Components können keine Cookies setzen → daher die Bridge).
  3. Plus: `claimondo_2fa_verified` mit `domain=.claimondo.de` setzen (wie die Auth-Cookies), gegen Subdomain-Verlust.
**Google:** (a) `handleGoogle()` Error-Handling/Redirect-Check; (b) Connect-Routen `externalUrl()` statt `new URL(path, req.url)` (0.0.0.0-Leak); (c) `GOOGLE_OAUTH_CLIENT_ID/SECRET` + `GOOGLE_CLIENT_ID/SECRET` + `NEXT_PUBLIC_APP_URL` auf Staging/VPS setzen.

## Produkt-Entscheidung (Aaron, 31.05.)
**Option A — beide Kalender behalten, Google reparieren** (nicht CalDAV-only). Grund: Basic-Auth-CalDAV erreicht Google Calendar nicht (Google will OAuth) → CalDAV-only schlösse Gmail-/Workspace-SVs aus.

## Noch offen
- Genuine 2FA-**on**-Repro (SMS/Email-Code) braucht ein 2FA-on-Account-Passwort (alle Test-User sind 2FA-off) oder Freigabe für DML-Toggle eines Test-Users.
