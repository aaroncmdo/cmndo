# Handoff · claimondo.de Marketing-Site-Trennung (eigener Standalone-Build)

**Datum:** 29.05.2026
**Autor-Session:** Cluster-LP-Improvements + Marketing-Split-Start
**Single Entry Point** für jede Folge-Session zu diesem Thema.
**Verbindlicher Plan:** `marketing-strategy/cluster-seiten/05-plan-claimondo-marketing-split.md` (lokal, gitignored) — exakt umsetzen, angepasst an die unten bestätigten Entscheidungen.
**Memory:** [[project-marketing-split]], [[project-cluster-lps-status]].

---

## 0 · TL;DR — wo stehen wir

- **Block 1 (Cluster-LP-Improvements): FERTIG & LIVE.** gzip + a11y + Hero-Preload auf allen 3 Cluster-LPs, PR **#2010** → staging **gemergt**. Eine offene Marken-Entscheidung (siehe §6).
- **Block 2 (Marketing-Split): Stream 1–8 KOMPLETT — claimondo.de LIVE als eigenständiger Marketing-Build (31.05.), GA4 (G-9YF2W9ZP2S)+Ahrefs aktiv, Redirects beidseitig sauber.** PR **#2083** (→staging) offen.
- **LIVE (Stream 7, 31.05.):** claimondo.de + www → PM2 `claimondo-marketing` :3006 (`/var/www/claimondo-marketing`); app.claimondo.de → :3000 (App). vhost `sites-available/claimondo` gesplittet (Backup `.bak-*` am VPS). Deploy-Scripts: `scripts/deploy-marketing-vps.py` (Phase B) + `deploy-marketing-switch.py` (Phase C, Auto-Rollback). Extern verifiziert; reboot-fest.
- **Stream 8 LIVE:** 301-Redirects claimondo.de/{login,admin,kunde,gutachter,…portal} → app.claimondo.de (nginx-location, `(/|$)`-Anchor clash-frei; `deploy-marketing-redirects.py`). App leitet umgekehrt Marketing-URLs → claimondo.de (proxy.ts) → kein Duplikat.
- **Nächster Schritt:** PR #2083 → staging mergen (Aaron); danach Deploys aus main tarren. Optional GADS/CLARITY-IDs (nur GA4 gesetzt). Subdomains als Folge-Push. **LESSON: nach jedem Marketing-Rebuild MUSS `.next/standalone/.env.local`-Symlink neu (Rebuild wischt .next/standalone → sonst SERVICE_ROLE weg → /gutachter-finden 500).**
- **Offener Querschnitt:** ~~public/-Assets~~ ERLEDIGT. **VPS-`.env.local` (Stream 3) braucht: `NEXT_PUBLIC_MAPBOX_TOKEN`** (sonst Karten leer) + **`NEXT_PUBLIC_GA4_ID`/`GADS_ID`/`CLARITY_ID`** (sonst kein gtag/Clarity; Ahrefs läuft Key-hardcoded). og-default.png/favicon.ico fehlen auch im Source. **DEFERRED (eigenes Ticket, Aaron 30.05.):** voller gutachter-finden-Onboarding-Wizard — auf Marketing per App-Link ersetzt. **DEFERRED (eigenes Ticket, Aaron 30.05.):** voller gutachter-finden-Onboarding-Wizard (DynamicWizard + dispatch/google-calendar/upload/kunde-actions + OCR-API + schadenkalkulation-API) — auf Marketing per App-Link ersetzt.

### ✅ Stream 7 (Deploy) LIVE — 31.05.2026 (Aaron-autorisierter VPS-Deploy)
- **claimondo.de + www = eigenständiger Marketing-Build, PM2 `claimondo-marketing` :3006**, `/var/www/claimondo-marketing` (NO_GIT: Branch-Tarball via SFTP → `npm install` [npm ci scheiterte an @swc/helpers-Lock-Drift] → `npm run build` → standalone). ENV `/etc/claimondo-marketing/.env.local` (server-seitig aus `/etc/claimondo/.env.local`: Supabase/Mapbox/Resend/Baileys/Imagin + APP_URL + PROMO_IP_SALT) — als `.env.local`-Symlink in Projekt-Root (Build → NEXT_PUBLIC_*-Inline) + `.next/standalone`-cwd (Runtime → Next loadEnvConfig). Muster von claimondo-v2 gespiegelt.
- **vhost-Switch:** `sites-available/claimondo` von 1 Block (alle→:3000) auf 2 (claimondo.de+www→:3006, app.claimondo.de→:3000); Cert claimondo.de-0002 (3 SANs). Atomar via `deploy-marketing-switch.py`: Backup → `nginx -t`-Gate → reload → Verify beider Domains → Auto-Rollback. Backups `sites-available/claimondo.bak-*`.
- **Verifiziert extern:** claimondo.de/=200, /login=404 (Marketing), /gutachter-finden+/schaden-melden+/kfz-gutachter/koeln=200; app.claimondo.de/=307→/login, /login=200 (App intakt). Ahrefs live; gtag erst mit GA4-ID. pm2 dump + systemd → reboot-fest.
- **VPS:** root@212.132.119.110, `scripts/vps-ssh-exec.py` (PYTHONIOENCODING=utf-8). **LESSON:** Standalone lädt ENV via `.env.local`-Symlink im cwd (loadEnvConfig), nicht Shell-Source; App-Root 307→/login ist normal (Verify nicht auf 200 festnageln).

### ✅ Stream 6 (Tracking/Consent) FERTIG
- App-Tracking-Stack 1:1 ins Marketing-`app/layout.tsx` gespiegelt: GA4/Google-Ads-gtag mit **Google Consent Mode v2** (Default 'denied', wait_for_update 500), **Ahrefs** (cookielos/always-on, Key hardcoded), **ConsentManager** (vanilla-cookieconsent), **ClarityInit**, **PhoneClickTracker**. Mapbox-Preconnect im `<head>`.
- **Host-gated** via `lib/analytics/consent` (TRACKING/MARKETING_HOSTS): claimondo.de → alles an, localhost/Portale → nichts. 3 Komponenten nachgezogen (`components/analytics/{ClarityInit,PhoneClickTracker,useClarityConsentInit}`); ConsentManager/ConsentSettingsLink + lib/analytics/consent + Deps (@microsoft/clarity, vanilla-cookieconsent) waren aus Stream 2 da.
- ENV in `.env.example`: `NEXT_PUBLIC_{GA4_ID,GADS_ID,CLARITY_ID}`. **DSGVO:** `ConsentSettingsLink` ist in `LandingFooter` verdrahtet (Widerruf/Preferences jederzeit).
- Build grün (116/116). Smoke: curl `Host: claimondo.de` → gtag+Ahrefs+Consent-Mode-Default injecten; `localhost` → 0/0 (Gating korrekt); Playwright localhost → kein #418. **Consent-Banner-Auto-Show:** triggert in Headless-Playwright auf Marketing-Build UND Live-`claimondo.de` gleich nicht (kein #cc-main) — **Prod-Parität, kein Marketing-Regression**; ein evtl. Banner-Display-Thema wäre App-weit (separat).

### ✅ Stream 5 (Marketing-Seite / Login-CTA, L3a) FERTIG
- **Revidiert:** Stream 5 war NICHT idle — Login-Embed läuft in AAR-939 (`origin/kitta/aar-939-staging-recovery-gap`: L1 continue-Param #2057 gemergt, L3a, Bundle `public/embed/claimondo-login.js`, `sv-portal/embed-sites`). Plan: `docs/30.05.2026/AAR-login-embed-plan.md`.
- **Marketing-Anteil = L3a (nativ, kein Bundle):** claimondo.de ist `*.claimondo.de` → Auth-Cookie teilt → LandingTopbar-Anmelden-Button reicht. `components/landing/LoginCtaLink.tsx` **byte-gleich zum Monolith** gespiegelt (Commit 28a44d2ba); LandingTopbar anonymen `<Link href=.../login>` → `<LoginCtaLink>`.
- **Verhalten:** SSR-Fallback `<a href=app.claimondo.de/login>` (No-JS-safe), onClick → `…/login?continue=<encodeURIComponent(location.href)>`. App-L1-Whitelist (*.claimondo.de) validiert; fehlt L1 live → degradiert sauber auf Default-Portal.
- Build grün (116/116), Smoke (`mkt-l3a-*.png`): Anmelden rendert, continue trägt aktuelle Seite, kein #418 (LoginCtaLink kein BOM).
- **Bleibt AAR-939 (nicht Marketing-Scope):** L2-Bundle für externe Cluster-LPs (Cross-Domain) + voller Wizard-Embed.

### ✅ GutachterFindenSection — wiederverwendbare Marketing-Section (Aaron-Request 30.05.)
- **Abgrenzung (wichtig):** NICHT Monika. Monika = public `<script>`-Embed via embed-sites/embed_site_id (jeder bettet ein, auch extern; AAR-939). DIES = **interne React-Section**, die der Entwickler per Code auf beliebige Marketing-Seiten setzt — Platzierung selbstbestimmt, kein Embed/iframe/Domain-Freigabe.
- `components/gutachter-finden/GutachterFindenSection.tsx` (server) + `GutachterFindenTeaser.tsx` (client). Prop `variant`:
  - `full` → volle interaktive Karte (Marker + Finder + Wizard-Toggle + App-Link), Höhe via `height` (default `'100dvh'`; In-Page-Section z.B. `'78vh'`/`'70vh'`). Lädt SV-Daten selbst (gutachter-finder-actions).
  - `teaser` → kompakt: Eyebrow/Heading/Subline (Props-überschreibbar, Umlaut-Defaults) + PLZ/Stadt-Input + CTA → `/gutachter-finden?plz=…|stadt=…` (vorzentriert).
- `GutachterFinderMapClient` bekam `height`-Prop (default `'100dvh'`; Overlays sind container-relativ → skalieren mit). `gutachter-finden/page.tsx` refactored → nutzt `<GutachterFindenSection variant="full" height="100dvh" initialCenter={…}>` (eine Quelle, kein Duplikat).
- **Verwendung auf anderer Seite:** `<GutachterFindenSection variant="teaser" />` ODER `<GutachterFindenSection variant="full" height="78vh" />`.
- Build grün (116/116), Smoke (`mkt-gf-*.png`): /gutachter-finden (full) regression-frei; Demo-Seite teaser + full@70vh — beide rendern, Teaser-Input + Karte da, kein #418.

### ✅ Stream 4 Batch 4c FERTIG (finder-only) — gutachter-finden Karte + Finder
- **Architektur-Entscheidung Aaron 30.05.:** gutachter-finden = Karte + SV-Finder; der volle Onboarding-Wizard (DynamicWizard) bleibt in der App, Marketing verlinkt per CTA (`app.claimondo.de/gutachter-finden`) — statt das ganze Wizard-Subsystem zu duplizieren.
- Migriert: `app/gutachter-finden/{page.tsx (DynamicWizard-Import raus → App-Link-Panel als KartenWizardToggle-dynamicWizard-Slot), GutachterFinderMapClient, opengraph-image}`, `components/onboarding/KartenWizardToggle` (togglet Mini-Wizard ↔ App-Link), `components/shared/glass/` (Karten-UI). Karte nutzt mapbox-gl (4a) + gutachter-finder-actions (Batch 3) + mapbox/{client,geocode}.
- **DEFERRED (eigenes Ticket):** DynamicWizard + WizardClient + fields/ + lib/onboarding/{slots,svMatching,localize} + lib/dispatch + lib/ocr + lib/ai + `api/{ocr-fahrzeugschein-anfrage,schadenkalkulation}` + @anthropic-ai/sdk — zieht App-Subsysteme (dispatch/google-calendar/upload/kunde-portal) in den Marketing-Build. Bewusst NICHT migriert.
- Build grün (116/116), MS1 0 Treffer. Smoke (`mkt-4c-gutachter-finden.png`): HTTP 200, Karte+Toggle+KPIs+BGH+FAQ+CTA rendern, App-Link-CTA da, keine JS-Crashes. (Karte zeigt mit Dummy-Token "konnte nicht geladen werden" → echter NEXT_PUBLIC_MAPBOX_TOKEN nötig.)

### ✅ Stream 4 Batch 4b FERTIG — schaden-melden Mini-Wizard
- Routes: `app/schaden-melden/{page, layout, MiniWizardClient, link-versendet/page, selbstverschulden/page}` (3-Fragen-Wizard → Magic-Link).
- Module: `lib/flow/{schemas/mini-wizard, promo-attribution, resolve-promo}`, `lib/actions/create-lead-from-mini-wizard`, `lib/magic-link/dispatch-magic-link`, `lib/mapbox/geocode`, `lib/notifications`, `lib/fahrzeug/imagin`, `lib/storage/url`, `lib/branding/{token-theme,theme,defaults,kunden-theme}` (NUR die token-theme-Kette — NICHT die Heavy-Files claude-vision/server-bg-remove/extract-colors, sonst tsc-Fehler aus ungenutzten Files), `components/ui/{label,input,checkbox}`, `components/shared/SheetCard`.
- **GANZES `lib/email/`-Subsystem** (~70 Files: components + google/templates + hero-image) — `dispatch-magic-link` → `email/google/flows` ist ein Barrel, der ALLE Templates eager importiert → ganzes Subsystem nötig. `__tests__` gepruned.
- Deps installiert: `react-hook-form@^7.72`, `@hookform/resolvers@^5.2`, `@base-ui/react@^1.5`.
- Build grün (115/115), MS1 0 Treffer. Smoke (`mkt-4b-*.png`): /schaden-melden (Wizard: Schuld-Radio-Cards + Form + @base-ui-Checkbox) + selbstverschulden + link-versendet alle HTTP 200, keine JS-Crashes, Umlaute ok.

### ✅ Stream 4 Batch 4a FERTIG — Funnel-Marketing (beratung-anfragen + ersteinschaetzung + gutachter-partner)
- Routes: `app/{beratung-anfragen, ersteinschaetzung, gutachter-partner/(page|actions|GutachterPartnerClient|WaitlistApply|WaitlistApplyLoader|layout|leads-generieren|marketing|neukundengewinnung|opengraph-image)}`.
- Module nachgezogen: `components/gutachter-partner/{PartnerContent,PartnerFooter,partner-faq}`, `components/landing/TrustBlock`, `lib/actions/gutachter-waitlist`, `lib/mapbox/client`, **gesamte `components/primitives/`-Schicht** (Stream-2-Prune hatte sie als Orphans komplett entfernt — Landing nutzte keine; `.native.tsx` + Tests gepruned, web-only via explizite `./X.web`-Barrels).
- **mapbox-gl@^3.22 + @types/mapbox-gl installiert** (kein Stub in next.config — echter Import; gutachter-partner Einsatzgebiet-Karte client-only via `next/dynamic ssr:false`). `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.example` ergänzt.
- **BOM-Fix (LESSON):** `GutachterPartnerClient.tsx` + `WaitlistApply.tsx` hatten UTF-8-BOM vor `'use client'` → React #418 (Hydration-Mismatch) auf /gutachter-partner. BOM gestrippt → #418 weg. **NUR Turbopack-relevant:** der Monolith-App-Build toleriert BOMs (316 src-Files BOM-prefixed/219 'use client', aber Prod /login + /gutachter-partner = kein #418) — KEIN Live-Bug, kein dringender src-Fix nötig.
- Build grün (Static-Gen 112/112), MS1 0 Treffer (gutachter-waitlist nutzt createAdminClient server-only). Smoke (`C:/pwtool/shots/mkt-4a-*.png`): 5 Seiten HTTP 200, keine JS-Crashes (nach BOM-Fix), Umlaute ok, gutachter-partner Formular + Karte rendern.

### ✅ Stream 4 Batch 3 FERTIG — gesamter `/kfz-gutachter/*`-Namespace (Hub + pSEO + Ratgeber)
- **Scope ggü. Handoff-Wortlaut ("pSEO [stadt]") bewusst erweitert:** ganzen `/kfz-gutachter/*`-Tree migriert — Hub→Ratgeber→[stadt] cross-linken + teilen Deps; Hub auf dem Monolithen zu lassen wäre inkohärent.
- 15 Files: `app/kfz-gutachter/{page.tsx, freshness.ts, staedte.ts(identisch), [stadt]/(page|actions|opengraph-image|StadtLeadFormClient), ablauf, autoschaden-soforthilfe, gutachten-service, kosten, online-kfz-gutachten, sachverstaendiger-vs-gutachter, vermittlungsportale-vergleich, wertminderung}`.
- 5 vom Stream-2-Prune nicht erreichte Module nachgezogen: `components/landing/AnswerCapsule.tsx`; `lib/actions/gutachter-finder-actions.ts` (von vermittlungsportale-vergleich) + transitive Deps `lib/whatsapp/availability.ts`, `lib/analytics/ga4-conversions.ts`, `lib/analytics/ga4-mp.ts`.
- Build: `Compiled successfully in 4.4s` + TypeScript grün + Static-Gen 106/106. 11 neue Routes, alle dynamisch (`ƒ`).
- **MS1: 0 Treffer** `SUPABASE_SERVICE_ROLE_KEY` in `.next/static/` (trotz neuem createAdminClient via gutachter-finder-actions — nur server-SSR-Chunks).
- **Lokaler Smoke (Dummy-ENV `.env.local`, `next start -p 3099`, Playwright-Screenshots `C:/pwtool/shots/mkt-kfz-*.png`):** Hub + kosten + wertminderung + ablauf + [stadt]/koeln → alle HTTP 200, volles Layout, Umlaute korrekt, Translation-Keys aufgelöst, DataTable (wertminderung) ok, [stadt] interpoliert "Köln". Keine JS-Crashes. Erwartete Lücken: Hero-Bilder-404 (public/-Gap), RSC-Prefetch-404 auf Batch-4-Routes.

### ✅ Stream 4 Batch 2 FERTIG — Content-Pages
- 6 Pages kopiert: `app/{faq,ueber-uns,vorteile,wie-es-funktioniert,sa-volltext,schadensreport-2026}/`. 2 fehlende Components restored: `components/landing/ReviewerByline.tsx` + `components/marketing/TrackingHooks.tsx` (war komplett nicht kopiert). Sonst alles erreichbar (Landing-Sections waren beim Stream-2-Prune korrekt erhalten geblieben).
- Build: `Compiled successfully in 3.7s`, Static-Gen 13/13. Routes alle Content-Pages dynamisch (`ƒ`).
- Service-Role-Leak-Check: weiterhin 0 Treffer in `.next/static/`.

### ✅ Stream 3 lokal FERTIG (Aaron-Side VPS-Step offen)
- `.env.example` mit allen 14 referenzierten Vars geschrieben (Supabase trio, App-URL, Gmail-SMTP, Baileys-WA, Resend, Promo-IP-Salt).
- **VPS-Step für Aaron (ich kann's nicht):** `/etc/claimondo-marketing/.env.local` anlegen (chmod 600), Werte einsetzen (Anon+Service-Role-Key aus paizkjajbuxxksdoycev, Gmail/Baileys/Resend-Credentials).

### ✅ Stream 4 Batch 1 FERTIG — Recht-Pages
- 4 Pages kopiert: `app/{agb,datenschutz,impressum,nutzungsbedingungen}/page.tsx`. Imports: `@/components/shared/PageHeader` (restored), `@/components/shared/DataTable` (restored, von datenschutz genutzt), `@/lib/seo/brand-constants` (war noch da).
- Build: `Compiled successfully in 3.0s`, Static-Gen 7/7. Routes `ƒ /agb`, `ƒ /datenschutz`, `ƒ /impressum`, `ƒ /nutzungsbedingungen` ✓.

### Stream-2-STATUS (29.05. ~21:10) — was committet ist (Build noch ROT)
Committet auf `kitta/claimondo-marketing-split` (WIP, isoliert in `wt-claimondo-marketing`):
- **Landing-Dep-Graph nach `claimondo-marketing/` (root-level, `@/*`→`./*`) kopiert:** `app/page.tsx` (Landing) + volle `app/globals.css` (alle Tokens) + lean `app/layout.tsx` (Montserrat+Noto Sans, next-intl-Provider, JSON-LD, Skip-Link — Analytics/Offline/Consent BEWUSST raus → Stream 6); `components/{landing,shared,ui,primitives,analytics/ConsentSettingsLink}`; `lib/{supabase,seo,branding,auth,i18n,crypto,utils,brand,leads,actions,design-tokens}`; `i18n/` (next-intl request.ts + locales + load-messages + 6 messages-Kataloge); `app/kfz-gutachter/staedte.ts`.
- **Gepruned (gehören nicht in Web-Build):** 13 `*.native.tsx` (react-native), 11 `*.test.ts(x)`, 6 `__tests__/`.
- **next-intl verdrahtet:** `createNextIntlPlugin('./i18n/request.ts')` in `next.config.ts`; Provider im Layout.
- **Deps ergänzt + `npm install` (94 Pkg):** next-intl, @supabase/ssr, sonner, lucide-react, framer-motion, clsx, tailwind-merge, class-variance-authority, chroma-js, node-vibrant.
- **Primitives** lösen Web sauber über per-Komponente `index.ts`-Barrels (→`.web.tsx`) — kein Resolver-Config nötig. **Mapbox-Stubs** nur für `/gutachter-finden` (Stream 4), nicht Landing.

**Entscheidung Aaron 29.05.:** Notification-Stack = (c) E-Mail + WA beides mitkopieren. → `lib/email/` + `lib/whatsapp/` + `lib/analytics/` kopiert, Deps ergänzt (`@react-email/components`, `@react-email/render`, `nodemailer`, `resend`, `@microsoft/clarity`, `vanilla-cookieconsent`, `tw-animate-css`, `shadcn`, `types/`) + `npm install` (vier Runden).

### ✅ Stream 2 KOMPLETT (29.05. ~22:00)
- **Build grün:** `✓ Compiled successfully` + Static-Gen 3/3 + Finalize. Route `ƒ /` (Landing, dynamisch) + `ƒ /_not-found`.
- **Prune-Iteration:** BFS-Tracer (`scripts/_trace-landing.mjs`) hat vom Landing-Entry 48 erreichbare Files identifiziert und 277 über-kopierte Orphans entfernt (App-Code: admin-tasks, dispatch-leads, faelle, kanzlei, claims-lifecycle, mitteilungen, abrechnung, 2FA-SMS-Helpers, Email-Templates anderer Flows, …). Zwei kleine BFS-Edge-Cases korrigiert (lib/brand restored — 3 Section-Imports; lib/auth/twofa pauschal entfernt — Landing nutzt kein 2FA). `@types/nodemailer` als devDep nachgezogen.
- **Service-Role-Leak-Check (MS1) PASSED:** `grep SUPABASE_SERVICE_ROLE_KEY .next/static/` → **0 Treffer**. (Server-Chunks `.next/server/chunks/ssr/` referenzieren `process.env.SUPABASE_SERVICE_ROLE_KEY` — das ist normal/safe, kein Leak; der Wert kommt nur server-seitig zur Runtime.) `createAdminClient` nur in 3 Server-Files: `lib/supabase/admin.ts` (Def), `lib/email/google/client.ts`, `lib/actions/public-rueckruf.ts` — alles server-side. Landing-Page = Server Component.

### Was Stream 2 nicht abdeckt (bewusst — kommt in Folge-Streams)
- Analytics/Consent-Banner in Layout (NextIntlClientProvider ist drin; ConsentManager/ClarityInit absichtlich nicht, → **Stream 6**).
- Brand-Assets im public/ noch nicht 1:1 vom Source-public/ gezogen (og-default.png, nrw-karte.png etc. — falls Layout-/Page-Referenzen 404 wirft, hier nachziehen).
- Weitere Pages (Recht, Content, pSEO, Funnel-Forms, API-Routen-Duplikate) → **Stream 4**.
- Supabase-ENV auf VPS (`/etc/claimondo-marketing/.env.local`) → **Stream 3**.

---

## 1 · Ziel (Aaron, 29.05.2026)

**Alle Marketing-Flächen** raus aus dem App-Monolith → **app.claimondo.de wird reine App**. Marketing = Marketing, App = App.

Betrifft: `claimondo.de` (+ www) **und** die Subdomains `gutachter.claimondo.de`, `kfzgutachter.claimondo.de`, `makler.claimondo.de` **inkl. aller Unterseiten**.

---

## 2 · Ist-Zustand (VPS-nginx-Map — Fakt, am 29.05. geprüft)

| Domain | Proxy-Ziel | Status |
|---|---|---|
| `claimondo.de` + `www` + `app.claimondo.de` | **:3000 (die App)** | ❌ Marketing + App teilen einen vhost |
| `gutachter.claimondo.de` | :3000 (App) | ❌ vom Monolith host-geroutet |
| `kfzgutachter.claimondo.de` | :3000 (App) | ❌ → `src/app/kfzgutachter-lp/` |
| `makler.claimondo.de` | :3000 (App) | ❌ Partner-Marketing (Design-Doc s.u.) |
| `kfz-unfallgutachter-{wuppertal,duesseldorf,bonn}.de` | :3003/4/5 | ✅ schon getrennt (Cluster-LPs) |

Host-Routing in der App: **`src/proxy.ts`**. Subdomain-Marketing-Design: `docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md` (+ Plan `docs/superpowers/plans/2026-05-12-marketing-subdomains-makler-gutachter.md`).

---

## 3 · Bestätigte Architektur-Entscheidungen (verbindlich)

1. **EIN host-routender Standalone-Build** `claimondo-marketing/` (Port **3006**) bedient claimondo.de **+** gutachter./kfzgutachter./makler. via Host-Routing. (Nicht mehrere Builds.)
2. **claimondo.de ZUERST** komplett extrahieren + deployen (Template), Subdomains **danach** in Folge-Push.
3. **Kein Monika** auf der Marketing-Site (Ratgeber-Seite braucht's nicht).
4. **Login = späteres Embed** — Stream 5 vertagt (Embed-Bundle Plan 03/04 noch WIP, **kein `/embed` im Repo**). Nur einen Login-Slot im Header freihalten.
5. **schaden-melden-Wizard komplett auf claimondo.de**, Marketing-**API-Routen duplizieren** (nicht proxen).

---

## 4 · Was schon steht (Stream 1)

- **Branch:** `kitta/claimondo-marketing-split` (ab `origin/staging`, inkl. #2010).
- **Worktree:** `C:/Users/Aaron Sprafke/stampit-app/stampit-app/wt-claimondo-marketing`.
- **Ordner:** `claimondo-marketing/` (Pattern aus `autounfall-io/`):
  - `next.config.ts` (output:standalone, `turbopack.root=__dirname`, Security-Header), `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `package.json`, `package-lock.json` (von autounfall-io übernommen — Deps identisch, damit `npm ci` gegen den Lock läuft).
  - `scripts/copy-standalone.mjs` (Postbuild: kopiert `public/` + `.next/static/` → `.next/standalone/`).
  - `app/globals.css` (Claimondo-Token-**Minimalset** — vollständige Tokens kommen mit Stream 2), `app/layout.tsx` (Inter + Space Grotesk, Claimondo-Meta), `app/page.tsx` (Hello-World-Platzhalter).
- **Verifiziert:** `npm ci` + `npm run build` **grün**; `.next/standalone/server.js` + Postbuild-Copy vorhanden.

### ⚠️ Pfad-Alias-Falle
`claimondo-marketing/tsconfig.json`: **`@/*` → `./*`** (Root-Level), NICHT `./src/*` wie in der App. → Shared-Code muss nach `claimondo-marketing/components/…` und `claimondo-marketing/lib/…` (Root-Ebene). App-Imports `@/lib/x` / `@/components/x` lösen dann korrekt auf.

---

## 5 · Nächste Schritte (Stream 2 → 4 → 6 → 7 → 8)

### Stream 2 — Shared-Code (inkl. next-intl!)
**Befund:** `src/app/page.tsx` (Landing) importiert einen tiefen Graph:
`@/lib/supabase/{server,admin}`, `@/lib/auth/role-redirect`, `@/lib/i18n/locale-cookie`, `@/lib/crypto/hash-ip`, `@/lib/seo/{jsonld,alternates}`, `@/components/landing/{LandingPage,LandingTopbar}`, **`next-intl/server` (`getTranslations`)**.
→ Die Marketing-Seiten sind **mehrsprachig**. **next-intl + Message-Kataloge + i18n-Request-Config** müssen mit. (Dep `next-intl` in package.json ergänzen → dann `npm install` neu, Lock aktualisiert sich.)

Kopier-Reihenfolge (Root-Level wegen `@/`→`./`):
```
SRC=<worktree>/src ; DST=<worktree>/claimondo-marketing
cp -r $SRC/components/landing      $DST/components/landing
cp -r $SRC/lib/supabase            $DST/lib/supabase
cp -r $SRC/lib/seo                 $DST/lib/seo
cp -r $SRC/lib/branding            $DST/lib/branding
cp -r $SRC/lib/auth                $DST/lib/auth      # role-redirect
cp -r $SRC/lib/i18n                $DST/lib/i18n
cp -r $SRC/lib/crypto              $DST/lib/crypto
# + next-intl-Setup: i18n/request.ts o.ä. + messages/  (App-Struktur prüfen)
# + Brand-Assets: public/{brand,og-default.png,nrw-karte.png,marketing-landing-koeln}
```
Dann **iterativ**: `npm run build` → fehlende Imports/Deps nachziehen → wiederholen, bis grün. (Transitive Deps: `lib/utils`, ggf. `components/ui/*`, design-tokens etc. tauchen beim Build auf.)

**Service-Role-Leak-Check (Pflicht, MS1):** nach Build `grep -r SUPABASE_SERVICE_ROLE_KEY .next/` → 0 Treffer. `createAdminClient` nur in Server-Actions/Route-Handlers.

### Stream 3 — Supabase-ENV
`/etc/claimondo-marketing/.env.local` (chmod 600), Anon-Key + Service-Role-Key (geteilter Cluster `paizkjajbuxxksdoycev`). `.env.example` schreiben (siehe 05-Plan §Stream 3).

### Stream 4 — Pages migrieren (Reihenfolge: Landing zuerst)
`page.tsx` (Landing, mit Promo-Click-Tracking) → Recht (`agb/datenschutz/impressum/nutzungsbedingungen`) → Content (`faq/ueber-uns/vorteile/wie-es-funktioniert/sa-volltext/schadensreport-2026`) → pSEO `kfz-gutachter/[stadt]` (+ `staedte.ts`, `generateStaticParams`) → **Funnel-Forms** (`beratung-anfragen`, `ersteinschaetzung`, `schaden-melden`-Wizard, `gutachter-finden`-Karte, `gutachter-partner`-Waitlist `actions.ts`) → **API-Routen duplizieren** (`api/ocr-fahrzeugschein-anfrage`, `api/schadenkalkulation`) → SEO-Files (`sitemap.ts` marketing-only, `robots.ts`, `llms.txt`, `opengraph-image.tsx`, `favicon`).
**Subdomains (gutachter./kfzgutachter./makler.) erst NACH claimondo.de** — als host-geroutete Sektionen in denselben Build (Host-Erkennung via Middleware/`proxy.ts`-Äquivalent).

### Stream 6 — Tracking + SEO
Plausible (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN=claimondo.de`), GTM/GA4 Cross-Domain, JSON-LD Organization, Sitemap nur Marketing-URLs.

### Stream 7 — Deploy (⚠️ PRODUKTIONSKRITISCH)
PM2 `claimondo-marketing:3006` nach `/var/www/claimondo.de/claimondo-marketing`. **vhost-Switch:** `claimondo.de` zeigt heute auf **denselben vhost wie app.claimondo.de (:3000)** — der Split muss `claimondo.de` (+www) auf :3006 umlenken, `app.claimondo.de` auf :3000 lassen. Cert vorab via certbot. **Im Wartungsfenster, mit vhost-Backup/Rollback** — ein Fehler nimmt claimondo.de UND app.claimondo.de runter.
Build-on-VPS-Pattern (NO_GIT-Deploy wie Cluster-LPs) oder git-clone — siehe `autounfall-io/DEPLOY.md`.

### Stream 8 — Redirects
301: `claimondo.de/{login,admin,dispatch,gutachter,kunde,kanzlei,makler,faelle,upload,...}` → `app.claimondo.de/...`. Marketing-Routes aus der App entfernen (nach erfolgreichem Live) + `src/proxy.ts`-Host-Routing für die migrierten Subdomains zurückbauen.

---

## 6 · Block 1 (Cluster-LPs) — Status zur Vollständigkeit

- **Live + verifiziert:** gzip (nginx-Snippet `/etc/nginx/snippets/claimondo-gzip.conf`, per-vhost, −67 % JS), a11y (`--color-muted` #5F6E74, `<aside>`-Landmark, fokussierbarer `.cr-wrap`), Hero-`ReactDOM.preload`.
- **PR #2010 → staging GEMERGT.**
- **OFFEN — Marken-Entscheidung:** weißer CTA-Text auf Gold (#c9a77e) = **2.25:1** auf Düsseldorf/Bonn (primäre „Jetzt anrufen"-Schaltfläche ausgewaschen). Empfehlung: CTA-Text Navy/Ink statt Weiß (Theme-Token `--color-on-amber`). + roter Akzent auf dunklen Panels (Wuppertal). Perf ~85 ist LCP-/Hero-Bild-gebunden (Lighthouse-simulated) — kein weiterer Hebel ohne JS-Splitting.
- **Cluster-Deploy-Source:** Worktree `wt-cluster-lp-wuppertal` (NO_GIT auf VPS, build-on-VPS via `scripts/deploy-cluster-a11y.py`).

---

## 7 · Umgebung / Zugänge

- **VPS:** `212.132.119.110`, root. SSH via `python scripts/vps-ssh-exec.py "<cmd>"` mit ENV `VPS_SSH_PASSWORD` (paramiko; nur exec). Datei-Upload: paramiko SFTP `sftp.open(abs_path,'wb')` (siehe `scripts/deploy-cluster-a11y.py` als Vorlage).
- **Tooling (außerhalb des geteilten node_modules, stabil):** `C:/pwtool/` — `axe.mjs` (a11y, `@axe-core/playwright`), `verify-shot.mjs` (Screenshots), `lighthouse`. `AXE_URL=… node C:/pwtool/axe.mjs`.
- **Supabase:** geteilter Cluster `paizkjajbuxxksdoycev`. ENV-Pattern `/etc/claimondo-marketing/.env.local`.

---

## 8 · Koordination / Vorsicht

- **NICHT** auf `kitta/aar-939-monika-embed` committen — das ist der Haupt-Repo-Checkout (Shell-cwd), aber eine **fremde Session** arbeitet dort. Diese Arbeit läuft isoliert im Worktree `wt-claimondo-marketing` via `git -C`.
- Mehrere parallele Sessions aktiv (cmm44, monika-embed, monika-db, deadcode-deps, portal-i18n, email-p3). Marketing-Split berührt nur `claimondo-marketing/` (neuer Ordner) → keine Datei-Kollision.
- **Vorhandener `stash@{0}`** gehört `kitta/aar-kunde-gutachten-werte` (fremd, dokumentiert) — nicht anfassen.
- **Regeln:** PR immer `--base staging`, nie Direct-Push auf main. Diese Session ist KEINE Merge-Session. Umlaute Pflicht (Pre-Commit-Hook). 7-Punkte-Audit im Commit-Body.

---

## 9 · Referenzen

- Plan: `marketing-strategy/cluster-seiten/05-plan-claimondo-marketing-split.md` (9 Streams, Open Questions Q1–Q8, Risks MS1–MS10, Acceptance-Criteria).
- Pattern: `autounfall-io/` (`next.config.ts`, `DEPLOY.md`, `_HANDOFF-WP4ff.md`).
- Host-Routing-Vorbild: `src/proxy.ts`.
- Subdomain-Marketing: `docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md`.
- Cookie-Domain (für späteres Login-Embed): `src/app/login/actions.ts` (`.claimondo.de`).
