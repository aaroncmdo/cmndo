# Handoff · P5 — Marketing aus dem Monolith entfernen (Marketing-Split finalisieren)

**Datum:** 31.05.2026 · **Status:** P1–P3 LIVE + verifiziert (claimondo.de läuft komplett aus dem :3006-Marketing-Build). P4 (Fallback) + P5 (Monolith-Abbau) offen. · **Branch der Migration:** `kitta/marketing-subdomains-makler-kfzgutachter` (PR #2093). · **Audit:** `docs/31.05.2026/AUDIT-marketing-split-vollstaendigkeit.md`.

## Warum P5 vertagt
P5 ist destruktiv (Löschen aus dem geteilten Monolith `src/`) und wurde bewusst auf ein **ruhiges src/-Fenster** verschoben — am 31.05. arbeiteten 3+ Sessions parallel in `src/` (Trampel-/Konflikt-Risiko). Die Live-Site ist funktional fertig; der nginx-Fallback (claimondo.de 404 → :3000) bleibt als harmloses Netz, bis P5 läuft (danach ist er moot, da der Monolith kein Marketing mehr hat).

## Ist-Zustand (was P5 voraussetzt — alles erledigt)
- Marketing **vollständig** im :3006-Build: 19 Routen + 105 Content-`.md` (`content/claimondo/**`) + Content-Engine (`claimondo-mdx`, `CONTENT_ROOT=process.cwd()/content/claimondo`, `copy-standalone` bundlet `content/` ins Standalone) + SEO (sitemap **199 = Monolith-Parität**, robots, llms.txt, llms-full.txt, og, favicon, manifest) + Assets (kfzgutachter-lp-Bilder etc.).
- :3006-Sweep: **197/197** claimondo.de-Sitemap-URLs = 200 direkt aus :3006 (ohne Fallback). Public-Klick-Smoke: 0 Errors.
- Vhosts: claimondo.de/www + gutachter./makler./kfzgutachter. alle → :3006. app.claimondo.de → :3000.

## P5 — Schritte (eigener PR gegen staging, App-Repo)

**1 · Marketing-Routen aus `src/app` löschen** (die in :3006 migrierten):
`ratgeber`, `decoder` (+`[slug]`), `haftpflicht` (+`[slug]`), `sachverstaendige` (+`[slug]`), `versicherer` (+`[slug]`), `e-auto-gutachter`, `gegnerische-versicherung-zahlt-nicht`, `kosten-kfz-gutachten`, `lkw-gutachter`, `motorrad-gutachter`, `unfall-was-tun-als-geschaedigter`, `unfallskizze`, `unverschuldeter-unfall-rechte`, `versicherung-schickt-gutachter`, `kfz-haftpflicht-schaden` — sowie die bereits früher migrierten (`page.tsx` Landing, `agb`/`datenschutz`/`impressum`/`nutzungsbedingungen`, `faq`/`ueber-uns`/`vorteile`/`wie-es-funktioniert`/`sa-volltext`/`schadensreport-2026`, `kfz-gutachter/*`, `beratung-anfragen`/`ersteinschaetzung`/`schaden-melden`/`gutachter-finden`/`gutachter-partner`, `makler/partner-werden`, `kfzgutachter-lp`).
⚠️ **NICHT** löschen: App/Portal-Routen (`login`, `2fa`, `admin`, `dispatch`, `gutachter`, `kunde`, `kanzlei`, `mitarbeiter`, `faelle`, `upload`, `sv`, `sv-portal`, `flow`, `passwort-*`) + die bewusst app-seitigen Wizard-Subsysteme (`DynamicWizard`, `api/ocr-*`, `api/schadenkalkulation`).

**2 · Content + SEO-Generatoren im Monolith abräumen:**
- `src/content/claimondo/**` (105 .md) löschen.
- `src/app/sitemap.ts`, `robots.ts`, `llms.txt`, `llms-full.txt`, `opengraph-image.tsx` — entweder löschen (wenn app.claimondo.de keine eigene Sitemap braucht) ODER auf reine App-URLs scopen. ⚠️ Diese lesen `claimondo-mdx` → nach Content-Löschung brechen sie; daher zusammen behandeln.
- Tote shared-Deps prüfen (Knip): `components/content/*`, `lib/content/*`, `data/*-mapping.ts` — sind sie nach Routen-Löschung im Monolith noch referenziert? Wenn nein → mitlöschen.

**3 · Redirects (Bookmarks/Cross-Links) sicherstellen:**
- `src/proxy.ts` redirectet Marketing-URLs auf app.claimondo.de bereits → claimondo.de (Stream 8). Prüfen, dass das nach Routen-Löschung noch greift (sonst 404 auf app.claimondo.de/ratgeber statt Redirect).
- Im **Marketing-Build**: `/de`, `/en` etc. graceful → `/` redirecten (next.config redirect, locale-Prefix strippen), da nach Fallback-Wegfall der Monolith-307 entfällt. (Nicht indexiert, aber sauber.)

**4 · P4 — nginx-Fallback entfernen** (NACH P5-Deploy):
`/etc/nginx/sites-available/claimondo` → `proxy_intercept_errors on` + `error_page 404 = @monolith` + `location @monolith {...}` entfernen. `nginx -t` → reload → Sweep erneut (197/197 müssen weiter 200 sein, jetzt ohne Netz). Backups: `claimondo.bak-fallback-*`.

**5 · Verify:**
- App-Build grün (Routen-Löschung darf keine Imports brechen — grep `from '@/app/(geloeschte-route)'`).
- claimondo.de Voll-Sweep (199 URLs) + Klick-Durchlauf 0 Errors.
- app.claimondo.de/ratgeber → 301 → claimondo.de/ratgeber (proxy.ts).
- Sitemap weiter 199, llms.txt/robots.txt aus :3006.

## Update 31.05. spät — P5a DONE, P5b verifiziert-bereit

- **P5a (alle restlichen Marketing-Flächen nach :3006) ERLEDIGT + deployed + gesmoked:** zusätzlich zu Content/SEO/Assets jetzt auch **Feed-System** (`lib/feed/*` + `app/feed.json|feed.xml|feed/katalog.json|feed/katalog.xml` — feed.json 51 Items, katalog.xml 164 Items, korrekte Content-Types) und **`/kfz-gutachter-koeln`** (Ads-Hijack-Route) migriert. :3006 serviert die **komplette** Marketing-Fläche.
- **Blast-Radius VERIFIZIERT (31.05.):** Marketing-Cluster (Routen + `content/claimondo` + `lib/feed` + `lib/content` + `components/content` + `data/*-mapping` + sitemap/robots/llms/og/feed) ist **self-contained** — KEIN App/Portal-Code importiert daraus. `robots.ts` referenziert die Sitemap nur als String (kein Import). → Lösch-Set ist sauber, `tsc --noEmit` sollte nach Löschung grün bleiben (Gate).
- **Konkretes Lösch-Set (src/):** `app/{ratgeber,decoder,haftpflicht,sachverstaendige,versicherer,e-auto-gutachter,gegnerische-versicherung-zahlt-nicht,kosten-kfz-gutachten,lkw-gutachter,motorrad-gutachter,unfall-was-tun-als-geschaedigter,unfallskizze,unverschuldeter-unfall-rechte,versicherung-schickt-gutachter,kfz-haftpflicht-schaden,kfz-gutachter,(marketing)}` + `app/{sitemap.ts,llms.txt,llms-full.txt,opengraph-image.tsx,feed.json,feed.xml,feed}` + `content/claimondo/**` + `lib/{feed,content}` + `components/content` + `data/{citation-box,faq-stems,vr-bait,versicherer-mapping,decoder-versicherer-cross,versicherer-detail}-mapping.ts`.
- **Nuancen (Entscheidung in P5b):** (1) **Landing `app/page.tsx`** — die Marketing-Homepage; auf app.claimondo.de nicht serviert (307→/login). Löschen erst nach Klärung, ob der app-Root-Redirect in Middleware/proxy.ts (dann safe) oder in der Page selbst liegt. (2) **`robots.ts`** — behalten + auf App-only scopen (app.claimondo.de = noindex Portal), Sitemap-Zeile entfernen. (3) **`favicon.ico`** behalten (App braucht eins). (4) Nach Löschung Knip auf neue Orphans.
- **Reihenfolge bleibt:** Löschen → `tsc --noEmit` grün → PR gegen staging → Release-Flow-Deploy (NICHT direkt :3000) → DANN nginx-Fallback entfernen (P4).

## Risiken / Hinweise
- **Geteilter Monolith:** vor dem Lösch-PR mit aktiven src/-Sessions koordinieren (Branch-Kollision). Großer Delete-Diff → Rebase-Schmerz bei parallelen src/-PRs.
- **Reihenfolge:** Content-Löschung + sitemap/llms-Anpassung MÜSSEN zusammen (sonst Monolith-Build rot).
- **Fallback erst NACH** erfolgreichem P5-Deploy entfernen (sonst 404 auf etwaige nicht-gesweepte URLs).
- VPS-Deploy beider Builds (App :3000 + Marketing :3006) + Aaron-Override.
