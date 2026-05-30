# Login-Embed — revalidierter Umsetzungsplan

**Datum:** 30.05.2026 · **Status:** revalidiert gegen Live-Code (Multi-Agent + adversarielle Verifikation), entscheidungsreif
**Quelle:** Workflow `wr59oduxu` (8 Agenten) + manuelle Auflösung der 2FA-Widerspruchs-Frage.
**Bezug:** Aarons „Login-Widget"-Plan (28./29.05.) — mehrere Behauptungen darin sind gegen den echten Code **falsch/veraltet** (s. §Korrekturen).

---

## TL;DR

Ein einbindbares **Login-Widget** (Header-Button) per `<script>` auf **allen Claimondo-Marketing- und sonstigen Seiten — außer `app.claimondo.de` und den Portal-Routen**. Es authentifiziert **nicht selbst**, sondern leitet im **Redirect-Modus** zu `app.claimondo.de/login?continue=<zurück-URL>` weiter; die `.claimondo.de`-Session entsteht serverseitig nach Login.

- **Architektur:** **Redirect-Modus** (kein Inline-Modal), **separates Bundle** `claimondo.de/embed/claimondo-login.js`, **0 Migrationen**.
- **Kern-Backend (L1):** `/login` bekommt einen `continue`-Param, der den 2FA- + Force-Password-Hop übersteht und auf die Ziel-URL redirectet — über **alle 3 Login-Pfade** (Email · Google-OAuth · SMS-OTP).
- **Billigster Hebel (L3a):** der bestehende `LandingTopbar`-Anmelden-Button (Hauptdomain) bekommt einfach den `continue` — **kein Bundle nötig** auf der Hauptdomain.

> ## ⚠️ Plan-Korrekturen (alter Plan ist hier falsch)
> 1. **2FA feuert NICHT bei jedem Login.** `login/actions.ts:109-114` redirectet zu `/login/2fa` **nur** wenn `twofa_aktiviert===true || twofa_email_aktiviert===true`. Der Code-Kommentar (Z.92-94) behauptet „bei jeder Anmeldung", der Code gated aber auf die Flags. → Das Redirect-Argument hängt an **Cookie-Domain**, nicht an 2FA.
> 2. **`embed_sites` braucht KEINE `login_*`/`enabled_widgets`-Spalten und KEINE `embed_widget_events`-Tabelle.** Das Login-Widget ist **site-unabhängig** (nur ein Redirect-Button). → **0 Migrationen** im empfohlenen Pfad.
> 3. **Inline-Modal ist NICHT machbar** ohne neue Infra: `login/actions.ts` ist `'use server'`, ruft nur `redirect()` (nie JSON). Ein Modal bräuchte JSON-Endpoint + CORS + Cross-Domain-Session — und löst den Cookie-Blocker trotzdem nicht.

---

## Warum Redirect-Modus (verifiziert)

- **Cookie-Domain `.claimondo.de` nur in `production`** *(server.ts:35, supabase/middleware.ts:50)* → auf externen LP-Domains (`kfz-gutachter-*.de`) per Browser-Regel **nicht** setzbar. Ein Inline-Modal-Login von dort kann das Auth-Cookie technisch nicht setzen → Redirect zu `app.claimondo.de` ist dort **zwingend**.
- **`SameSite=lax`** *(server.ts:42-43)* ist der eigentliche Grund, warum Redirect funktioniert: eine **Top-Level-Navigation** von einer externen LP zu `app.claimondo.de` trägt das Cookie (lax erlaubt Top-Level-Nav) — ein `fetch`/XHR (Modal) nicht.
- **Bestehendes Muster:** `LandingTopbar.tsx:168` verlinkt anonym schon hart auf `https://app.claimondo.de/login`. Das Login-Widget ist primär eine **Vereinheitlichung** dieses Patterns.

---

## Schon fertig (wiederverwenden)

- Monika **Stream 5**: `api/embed/config`, `api/embed-track`, `lib/embed/jwt.ts` (HS256, dependency-free). Bundle-**Host-Präzedenz**: Monika wird von **`claimondo.de/embed/`** ausgeliefert *(MonikaEmbedSlot `embedBase=https://claimondo.de`)* — Login-Bundle gehört auf denselben Host (nicht `app.`).
- Monika **Stream 4** Widget + `scripts/build-monika.mjs` (esbuild IIFE, gzip-Gate <30 KB) auf `origin/kitta/aar-939-monika-widget` (#2035) — **Build-Vorbild** für das Login-Bundle.
- `roleToPath()` *(lib/auth/role-redirect.ts)* — 7 Rollen, der Post-Login-Ziel-Resolver (bleibt **Fallback**, wenn kein `continue`).
- `LandingTopbar` macht Redirect-Login de facto schon (anonym → `/login`, eingeloggt → server-resolved Portal-CTA).

---

## Streams

### L1 — `continue`-Param im Login-Flow (Kern-Backend) · Aufwand M
**Ziel:** `app.claimondo.de/login?continue=<encoded-url>` redirectet nach erfolgreichem Login (inkl. 2FA + Force-Password-Change) auf diese URL statt nur `roleToPath()`.

**Muss ALLE 3 Login-Pfade abdecken** (Skeptiker-Fund — alter Plan nur Email):
- **Email** *(login/actions.ts)*: `continue` aus FormData, **server-seitig** gegen Open-Redirect-Whitelist prüfen, am Ende `redirect(continueUrl)` statt `redirect(targetPath)`.
- **Google-OAuth** *(api/auth/callback/route.ts)*: liest heute schon `next` (Z.15), **ehrt es aber nie** (immer `roleToPath` Z.30-31). `continue` durch den OAuth-State/`next`-Round-Trip tragen + dort honorieren. `LoginClient.tsx:83` (`redirectTo`) anpassen.
- **SMS-OTP** *(LoginClient `handlePhoneVerify`)*: client-seitiger `window.location.href = roleToPath` → `continue` berücksichtigen.

**2FA-Hop (korrigiert):** Der Post-2FA-Redirect ist **client-seitig** *(TwoFaClient.tsx:128 `router.push(targetPath)`, `targetPath` aus `2fa/page.tsx:29` via `roleToPath`, liest KEINE searchParams)*. → `continue` über ein **kurzlebiges signiertes Cookie** (`cm_login_continue`, httpOnly, ~600s) in `login/actions.ts` setzen, in **`2fa/page.tsx` (Server)** lesen + validieren + als Prop in `TwoFaClient` reinreichen (überschreibt `targetPath`). **Validierung MUSS server-seitig** sein — ein client-seitiges `router.push(query-param)` würde den Open-Redirect-Guard umgehen.

**Force-Password-Change** *(actions.ts:82-90)*: gleiches Cookie überlebt den `/passwort-aendern`-Hop.

**Logged-in-Short-Circuit (Skeptiker-Fund):** Heute redirectet `/login` **eingeloggte** User nicht weiter — sie sehen das Formular nochmal. → in `login/page.tsx`: wenn eingeloggt + `continue` valide → direkt auf `continue`.

**Open-Redirect-Whitelist:** nur `https://app.claimondo.de/`, `https://*.claimondo.de/` oder relativ `/` (nie `//`). *(Achtung: der oft zitierte „Präzedenz" `google/callback:78` ist der **Calendar**-Connect-Flow, nicht Login — eigenen Helper bauen.)*

### L3a — `LandingTopbar` auf `continue` (Hauptdomain) · Aufwand S
Der bestehende Anmelden-Button bekommt `?continue=<aktuelle Marketing-URL>`. **Kein externes Bundle** auf der Hauptdomain (React-nativ). Damit ist die Haupt-Marketing-Fläche sofort fertig.

### L2 — Login-Embed-Bundle + Build · Aufwand M (nur falls externe/Standalone-LPs einen Button brauchen → Open-Decision)
`public/embed/claimondo-login.js` (IIFE, ~6 KB, Vanilla): findet sein `<script>`, liest `data-continue` (default `location.href`), `data-label`, `data-mode redirect|slot`, rendert Button → `onClick window.location.href = ${base}/login?continue=...`. Eigenes `scripts/build-login-embed.mjs` + `build:embed:login` (Vorbild `build-monika.mjs`). **Bundle setzt NIE Cookies** — nur Navigation. Host: `claimondo.de/embed/`.

### L4 — (Optional) `/api/auth/me` für „Mein Konto"-Toggle · Aufwand S
**Cross-Domain kaputt:** wildcard-CORS + credentials ist vom Browser verboten; das `.claimondo.de`-Cookie geht eh nicht zu externen LPs. → funktioniert nur auf `*.claimondo.de` mit **per-Origin-CORS** + `Allow-Credentials`. Niedrige Prio / evtl. streichen.

---

## Integrations-Fläche

| Surface | Wie | Bundle? |
|---|---|---|
| **Hauptdomain** (Landing, /faq, Rechtspages, /kfz-gutachter, …) | `LandingTopbar` Anmelden-Button → `continue` (L3a) | ❌ React-nativ |
| **Cluster-LPs** `kfz-gutachter-*.de` (Standalone) | `<Script src=claimondo.de/embed/claimondo-login.js>` via `next/script lazyOnload` (wie `MonikaEmbedSlot`) | ✅ Pflicht (Cross-Domain) |
| **Partner-Subdomains** `gutachter./makler.claimondo.de` | Bundle ODER nativer Link (Cookie teilt, aber Redirect einheitlich) | optional |
| **`claimondo-marketing/`** (Marketing-Split, falls live) | Bundle ODER `LandingTopbar` mitziehen | je nach Split |
| **AUSGENOMMEN: `app.claimondo.de` + alle Portale** (/admin /dispatch /gutachter /kunde /makler /kanzlei /mitarbeiter) | **kein** Embed-Button — nativer Auth-Kontext | — |

> ⚠️ **`src/app/layout.tsx` ist das gemeinsame Root-Layout für Portal UND Marketing-Hauptdomain** → **kein** globaler `<script>` dort (sonst Login-Button im eingeloggten Portal). Falls global, dann host-gated — aber `isMarketingHost` *(consent.ts:11)* deckt nur `{claimondo.de, www, kfzgutachter.}` ab, **nicht** die Partner-Subdomains. Sauberer: gezielt im `LandingTopbar` + Standalone-Header, nicht global.

---

## Koordination mit `98044b6b` (Monika-Builder)
- **Disjunkte Bundle-Dateien:** `claimondo-login.js` (ich) vs `monika.v1.js` (98044b6b) — eigenes Build-Script + gzip-Budget, kein geteiltes Budget, kein Output-Konflikt.
- **Geteilter Touch-Point:** `api/embed-track` `ALLOWED_EVENTS`-Set *(route.ts:25-32)* ist `monika_*`-only. Login-Telemetrie würde dieses Set editieren → **Monika-Territorium**, vorher abstimmen (oder Login-Events vorerst weglassen).
- **embed_sites NICHT anfassen** (98044b6bs Tabelle) → Login-Widget site-unabhängig halten = null Kopplung + 0 Migration.
- Eigenes Linear-Ticket + eigener Branch `kitta/aar-<login>-login-embed`, Start melden.

---

## 🔑 Offene Entscheidungen für Aaron
1. **Externe Cluster-LPs** (`kfz-gutachter-*.de`) überhaupt mit Login-Button? Es sind Paid-Conversion-Seiten (Schaden melden) — Login dort untypisch. → evtl. Login-Embed **nur** auf Hauptdomain + `*.claimondo.de`, spart L2/L3b + Cross-Domain-Edgecases.
2. **„Mein Konto"-Toggle (L4)** gewünscht — obwohl cross-domain kaputt (extern immer „Anmelden")? Wenn statisch „Anmelden" reicht → L4 streichen.
3. **`continue`-Scope:** nach Login zurück zur externen LP (ohne Session-Sichtbarkeit dort) ODER immer ins Portal (`roleToPath`)? Empfehlung: extern → Portal; `*.claimondo.de` → `continue`.
4. **Login-Button-Branding:** fix Claimondo-neutral (empfohlen, entkoppelt) vs. pro Site gebrandet (= Kopplung an `embed_sites` → Migration + 98044b6b).
5. Eigenes **Linear-Ticket** für den Login-Embed (separat von AAR-939)?

---

## Risiken
- **Open-Redirect:** `continue` ohne strikte **server-seitige** Whitelist = Phishing-Vektor (besonders weil der 2FA-Redirect client-seitig ist).
- **`continue`-Verlust über 2FA-/Password-Hop:** naiv implementiert landet der User im Default-Portal statt am Ziel → Kurzzeit-Cookie sauber durchziehen.
- **Marketing-Split-Drift:** `LandingTopbar` lebt im Monolith; sobald `claimondo-marketing/` standalone live geht, muss `continue` dort mitgezogen werden (zwei Quellen). Und: ob der Standalone-Build überhaupt Auth (`getUser`) auflöst, ist **unverifiziert** — sonst zeigt er immer „Anmelden".
- **Globaler `<script>`** im Root-Layout → Button auch im Portal. Strikt host-/surface-gated.

---

## Reihenfolge
1. **Abstimmung 98044b6b** (Bundle-Dateinamen, Build-Namespace, embed-track-Events) + Login-Ticket + Branch.
2. **L1** (continue über alle 3 Login-Pfade + 2FA-Cookie-Hop + Logged-in-Short-Circuit + Open-Redirect-Whitelist). Voller `npm run build`.
3. **L1 auf staging smoken** (claimondo.de → /login mit `?continue=`, mit/ohne 2FA, mit Force-Password). Screenshots.
4. **L3a** (`LandingTopbar` continue — Hauptdomain sofort fertig).
5. **L2 + L3b** (Bundle + Standalone-LP-Header) — **nur nach Entscheidung 1**.
6. **L4** optional.
7. Cross-Surface-Smoke (Hauptdomain + Subdomain + externe LP + `app.claimondo.de` darf KEINEN Button zeigen). PR gegen `staging`.

---

*Revalidiert; alte Plan-Behauptungen (2FA-immer, `enabled_widgets`/`login_*`/`embed_widget_events`, Inline-Modal, `google/callback:78`-Whitelist) als falsch markiert. Live-DB-Check war zum Synth-Zeitpunkt nicht möglich (MCP-Token) — die „0 Migration"-Aussage ruht auf der Migration `20260529154349` + embed-track-Kommentar (repo-autoritativ); inzwischen ist der DB-Zugang wieder da und bestätigt: keine `login_*`-Spalten.*
