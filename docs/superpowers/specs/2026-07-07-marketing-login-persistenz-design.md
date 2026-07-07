# Marketing-Login-Persistenz — saubere Loesung

**Datum:** 2026-07-07
**Branch:** `kitta/marketing-login-persistenz` (off `origin/main`)
**Kontext:** Nutzer sind auf den Marketingseiten (claimondo.de) scheinbar/tatsaechlich ausgeloggt,
darum bleibt der Community-/Kommentar-Nutzername nicht gespeichert. Betroffen: Wissen-Kommentare
(`/wissen/[slug]`) **und** der B2B-Community-Feed auf der Startseite — beide teilen dieselbe Auth-/
Identitaets-Infra. Diese Spec formalisiert die mit Aaron am 07.07. abgestimmte Loesung.

---

## Problem / Root-Cause

Die Diagnose ergab **zwei getrennte Ursachen**, nicht eine:

### Bug A — „Du siehst ueberall ausgeloggt aus" (sichtbare Ursache)
Fast jede Marketing-Content-Seite rendert die Kopfleiste hart als
`<LandingTopbar authenticatedUser={null} />` — `/wissen`, `/decoder`, `/haftpflicht`, `/faq`,
`/check`, `/autor/*`, alle `kfz-gutachter/*`, `gutachter-partner/*`, `community-regeln`, … (~30 Seiten,
per `git grep` verifiziert). **Nur die Startseite `/`** loest den echten User serverseitig auf
(`getUser` → `profiles.rolle/anzeigename` → „Zu meinem Portal"). Ergebnis: Das Session-Cookie liegt
auf `.claimondo.de` an, aber auf jeder Content-Seite steht trotzdem „Anmelden" in der Leiste → es
*sieht* aus wie ausgeloggt.

### Bug B — „Der Nutzername bleibt nicht gespeichert" (Session-Persistenz)
Das Kommentar-/Feed-Formular ist eine Marketing-Identitaet: Magic-Link-Login per E-Mail
(`requestCommentLogin` → `/auth/callback` → `exchangeCodeForSession`) + Community-Identitaet
(`community_my_identity` → Partner-Firma bzw. `community_profiles`-Username). Der Login-Status
(`getAuthState` → `getUser`) wird **serverseitig auf der Content-Seite** berechnet und als Prop ins
Formular gegeben.

Die Marketing-Middleware (`lib/supabase/middleware.ts`) macht auf **Public-Paths einen harten
Early-Return VOR** `getUser()` (Perf-Kurzschluss AAR-622: kein GoTrue-Hit fuer Crons/Crawler). Die
Wissens-/Content-Seiten sind Public-Paths → die Session wird dort **nie refresht**. Server Components
koennen keine Cookies schreiben, also wird ein rotiertes Refresh-Token nie persistiert; nach
Token-Ablauf ist der User serverseitig ausgeloggt → `getAuthState` liefert `isLoggedIn:false` → das
Formular faellt auf Stage „E-Mail eingeben" zurueck → der an die Session gekoppelte Nutzername wirkt
„verloren".

### Was die Schwester-Session (`kitta/wissen-comment-login-state`) schon macht
Registrierte Partner kommentieren unter Firmennamen (`community_my_identity`, kein Nutzernamen-Zwang)
+ ein Login-Hinweis *im* Formular. Komplementaer, adressiert aber **weder Bug A noch Bug B**. Ihre
Dateien (`lib/community/*`, `components/community/*`) sind **disjunkt** zur Fix-Zone hier.

---

## Loesung (2 Fixes, disjunkt zur Schwester-Session)

### Fix 1 — Topbar zeigt ueberall den echten Login-Status (Bug A)

**Ansatz: Client-Hydrate** (statt ~30 SEO-Seiten dynamic zu machen).

- **Neu:** `claimondo-marketing/components/landing/TopbarAuthCta.tsx` (`'use client'`).
  Kapselt den CTA-Slot. Props: `initialUser: AuthenticatedUser | null` + die 2 Label-Strings + die
  2 className-Strings (aus dem server-`LandingTopbar`, damit keine i18n-Provider-Abhaengigkeit im
  Client noetig ist).
  - `useState(initialUser)`. `useEffect`: **wenn `initialUser` gesetzt** (Startseite) → nichts tun
    (kein Flash). **Wenn `null`** → Browser-Session lesen: `createClient()` (`@/lib/supabase/client`)
    → `auth.getSession()` (lokal, kein GoTrue-Roundtrip). Bei vorhandener Session `profiles`
    (`rolle, anzeigename`) laden → `setUser({ portalPath: roleToPath(rolle), displayName })`.
  - Render: `user` → Portal-Link („Zu meinem Portal →"); sonst `<LoginEmbed triggerClassName=… />`.
- **Geaendert:** `LandingTopbar.tsx` (bleibt Server-Component). Der Inline-Branch
  `{authenticatedUser ? <PortalLink/> : <LoginEmbed/>}` wird durch `<TopbarAuthCta …/>` ersetzt. Die
  exakten className-/Label-Strings werden 1:1 als Props weitergegeben (keine visuelle Aenderung).

**Effekt:** SSR rendert weiter den anonymen Zustand (Crawler/SEO/Static unveraendert). Eingeloggte
Menschen bekommen nach Hydration den Portal-CTA — **ein** Component-Change fixt **alle** ~30 Seiten
(+ kuenftige). Einziger Preis: <1 s CTA-Flash bei Eingeloggten auf Content-Seiten; Startseite hat
keinen Flash (server-resolved Prop).

### Fix 2 — Session ueberlebt auf Content-Seiten (Bug B)

**Geaendert:** `claimondo-marketing/lib/supabase/middleware.ts`.

- Der pauschale `if (isPublicPath) return early` wird aufgeteilt:
  - **Public-Path OHNE Auth-Cookie** (`sb-*-auth-token`) → Fast-Path bleibt (kein Supabase-Client,
    kein GoTrue-Hit → AAR-622-Perf fuer Crons/anonyme Besucher/Crawler bleibt exakt erhalten).
  - **Public-Path MIT Auth-Cookie** → durchlaeuft den bestehenden `getUser()`-Refresh (rotiert die
    Cookies via den vorhandenen `setAll`-Hook), wird aber **NIE nach `/login` redirected**.
- Der Response-Bau bekommt eine `isPublic`-Kurzschluss-Zweig ganz oben: Public → `NextResponse.next`
  (Cookie-Updates werden weiter unten angewandt). Der `/login`-Redirect + 2FA- + Admin-Rollen-Checks
  bleiben **1:1** fuer geschuetzte Pfade.

Cookie-Detektion: `request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))`
(deckt `sb-<ref>-auth-token` + chunked `.0/.1` ab).

**Effekt:** Eingeloggte Besucher behalten ihre Session auf Wissens-/Content-Seiten → `getAuthState`
im Formular sieht die Session zuverlaessig → Anmeldung + Nutzername bleiben „gespeichert". Beide
Surfaces (Wissen-Kommentare **und** Feed-Composer nutzen dieselbe `getAuthState`-Logik) profitieren,
ebenso App-Partner (deren `.claimondo.de`-Session wird jetzt auch auf Marketing-Content refresht).

---

## Sicherheits-/Regressions-Betrachtung

- **Access Control unveraendert:** Public-Paths bleiben oeffentlich (nur zusaetzlicher Refresh, kein
  neuer Zugriff). Der `/login`-Redirect ist strikt auf `!isPublic` gegatet → oeffentliche Besucher
  werden nie gebounced (auch nicht mit abgelaufenem/ungueltigem Cookie).
- **2FA-/Admin-Weichen** greifen weiter nur auf geschuetzten Pfaden (unveraendert).
- **Perf:** Der zusaetzliche GoTrue-Call trifft nur Requests **mit** Session-Cookie. Crons (`/api/*`,
  server-to-server, kein Cookie) + anonymer Traffic + Crawler bleiben auf dem Fast-Path — der
  AAR-622-Grund (GoTrue-Ueberlastung durch Crons) wird NICHT reintroduziert.
- **Hot Zone:** `middleware.ts` ist geteilt/auth-kritisch. Parallel laeuft `kitta/auth-callback-origin-fix`
  (Middleware-/Callback-Naehe) → vor Push `git fetch` + Diff gegen deren Aenderungen pruefen. Die
  App-2FA-Haertung (`worktree-kitta+2fa-auth-hardening`) betrifft `src/middleware.ts` (App), NICHT die
  Marketing-Middleware → disjunkt.

## Koordination

- **Angefasst:** `lib/supabase/middleware.ts`, `components/landing/LandingTopbar.tsx`, neu
  `components/landing/TopbarAuthCta.tsx`. → **Kein Overlap** mit den Community-/Kommentar-Dateien der
  Schwester-Session. Marker `COORDINATION-marketing-login-persistenz` wird gesetzt.

## Verifikation

- **Marketing lokal env-blockiert** (kein `claimondo-marketing/node_modules` im Setup) → tsc/vitest
  nicht lokal fahrbar. Verifikation daher: (1) standalone Pure-Logic-Check des Cookie-Predikats,
  (2) Diff-Review, (3) Deploy-Build (Auto-Rollback — Marketing NICHT im CI-Build-Gate),
  (4) Prod-Smoke im **frischen SW-freien Browser**: Login → Wissen-/Content-Seite → Topbar zeigt
  eingeloggt; Kommentar posten → Reload → weiterhin angemeldet, Nutzername da.

## Out of Scope

- Kommentar-Identitaet (Partner-unter-Firma) — gehoert der Schwester-Session.
- Umbau der Topbar in ein shared Layout (groesserer Refactor, nicht noetig).
- Server-Resolve auf allen Content-Seiten (wuerde SEO-Seiten dynamic machen — schlechterer Trade-off).
