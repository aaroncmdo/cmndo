# Handoff · claimondo.de Marketing-Site-Trennung (eigener Standalone-Build)

**Datum:** 29.05.2026
**Autor-Session:** Cluster-LP-Improvements + Marketing-Split-Start
**Single Entry Point** für jede Folge-Session zu diesem Thema.
**Verbindlicher Plan:** `marketing-strategy/cluster-seiten/05-plan-claimondo-marketing-split.md` (lokal, gitignored) — exakt umsetzen, angepasst an die unten bestätigten Entscheidungen.
**Memory:** [[project-marketing-split]], [[project-cluster-lps-status]].

---

## 0 · TL;DR — wo stehen wir

- **Block 1 (Cluster-LP-Improvements): FERTIG & LIVE.** gzip + a11y + Hero-Preload auf allen 3 Cluster-LPs, PR **#2010** → staging **gemergt**. Eine offene Marken-Entscheidung (siehe §6).
- **Block 2 (Marketing-Split): Stream 1+2+3 FERTIG, Stream 4 BATCH 1+2+3 FERTIG (Batch 3 = 30.05. abends).** Gesamter `/kfz-gutachter/*`-Namespace migriert — Build grün + lokal gesmoked.
- **Nächster Schritt:** Stream 4 Batch 4 — Funnel-Forms (`beratung-anfragen`, `ersteinschaetzung`, `schaden-melden`-Wizard, `gutachter-finden`-Karte, `gutachter-partner`-Waitlist) + API-Routen (`api/ocr-fahrzeugschein-anfrage`, `api/schadenkalkulation`) → Stream 6 (Tracking) → Stream 7 (Deploy, PRODUKTIONSKRITISCH).
- **Offener Querschnitt (alle Seiten):** `public/`-Brand-Assets noch nicht gezogen → Hero-Bilder 404 (auch Landing); RSC-Prefetch-404 auf noch-nicht-migrierte Routes (`/schaden-melden`, `/gutachter-finden`, `/ratgeber` …) lösen sich mit Batch 4+.

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
