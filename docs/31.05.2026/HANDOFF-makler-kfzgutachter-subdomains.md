# Handoff · makler. + kfzgutachter. → :3006 (letztes Bauteil Marketing-Split)

**Datum:** 31.05.2026 · **Für:** die nächste Session, die die zwei verbleibenden Marketing-Subdomains in den :3006-Build holt.
**Single Entry Point (breit):** `claimondo-marketing/_HANDOFF.md`. **Memory:** `[[project-marketing-split]]`, `[[project-cluster-lps-status]]`, `[[project-kfzgutachter-lp-live]]`, `[[feedback-subdomains-in-ruhe-lassen]]`.

---

## 0 · Ziel in einem Satz

`makler.claimondo.de` (Content `/makler/partner-werden`) und `kfzgutachter.claimondo.de` (Content `/kfzgutachter-lp`) **genauso** in den Standalone-Marketing-Build (PM2 `claimondo-marketing` :3006) holen, wie es **gutachter.claimondo.de bereits LIVE** ist — Content migrieren → in `middleware.ts` einkommentieren → deployen → Vhost je 3000→3006 switchen. Danach ist die Marketing-Split zu 100 % durch.

## 1 · Ausgangslage (Fakt, 31.05.)

- **claimondo.de + www + gutachter.claimondo.de laufen schon auf :3006** (PM2 `claimondo-marketing`). Live-Smoke 31.05. grün — siehe `docs/31.05.2026/smoke-marketing-stand.md`.
- **Das Muster ist erprobt** (gutachter. wurde exakt so gemacht). Du wiederholst es nur für zwei weitere Hosts.
- **Code ist in mainline:** PR #2083 → staging (`eaf6e2393`) → main #2086 (`835c8a225`). Der volle `claimondo-marketing/`-Build (302 Files) ist in staging+main.
- **`claimondo-marketing/middleware.ts` hat die zwei Einträge schon vorbereitet (auskommentiert):**
  ```ts
  const SUBDOMAIN_LANDING: Record<string, string> = {
    'gutachter.claimondo.de': '/gutachter-partner',
    // 'makler.claimondo.de': '/makler/partner-werden',  // TODO: makler-Content in den Build migrieren
    // 'kfzgutachter.claimondo.de': '/kfzgutachter-lp',   // TODO: kfzgutachter-lp in den Build migrieren
  }
  ```
  → einkommentieren, sobald der Content im Build liegt.

## 2 · Quell-Inventur (Monolith `src/`, auf staging verifiziert)

### makler. — TRIVIAL (1 Datei)
- `src/app/makler/partner-werden/page.tsx` — **eine** Datei. Recruiting-Page. Imports tracen (vermutlich shared `components/landing/*` + `components/gutachter-partner/*`, die **schon im Build sind**). ⚠️ NUR `partner-werden` migrieren — `/makler` selbst ist das App-Portal (APP_PREFIX), bleibt auf :3000.

### kfzgutachter. — MODERAT (Page + ~14 Files + 1 API)
- `src/app/kfzgutachter-lp/`: `page.tsx`, `actions.ts` (Server-Action Lead), `LeadFormClient.tsx`, `track.ts` (GA4-Conversions), `live-stats.ts`, `LiveCountPill.tsx`, `GoogleReviewsStrip.tsx`, `WarumCardsClient.tsx` + `warum-cards-data.ts`, `ScrollPopoverClient.tsx`, `StickyMobileCta.tsx`, `cid-staedte.ts`, `resolve-stadt.ts`, `constants.ts`, `README.md`. (`__tests__/` **nicht** mitnehmen — Web-Build prunt Tests.)
- **API duplizieren:** `src/app/api/kfzgutachter-lp/gutachter-verfuegbar/{route.ts,_lib.ts}` → nach `claimondo-marketing/app/api/kfzgutachter-lp/gutachter-verfuegbar/`. (Die LP fetcht diese Availability-API.)
- **Gute Nachricht:** Die meisten transitiven lib-Deps (`lib/supabase`, `lib/analytics/ga4-conversions`+`ga4-mp`, `lib/actions/*`, `gutachter-finder-actions`, `lib/whatsapp/availability`) wurden in Stream 3/4/6 **schon** in den Build kopiert → wahrscheinlich nur kleine Lücken nachziehen.

## 3 · Schritte (pro Subdomain, exakt wie gutachter.)

> **Reihenfolge: makler. ZUERST** (trivial, risikoarm) als Aufwärmer, **kfzgutachter. DANACH** (siehe §4 — Risiko!).

**A — Content migrieren** (Root-Level, `@/*`→`./*`!):
1. Source-Files nach `claimondo-marketing/` kopieren (Page unter `app/...`, Komponenten/Libs auf Root-Ebene `components/`/`lib/`).
2. `npm run build` im `claimondo-marketing/` → fehlende Imports/Deps **iterativ** nachziehen bis grün. (BFS-Tracer-Muster aus Stream 2, falls nötig.)
3. **MS1-Check:** `grep -r SUPABASE_SERVICE_ROLE_KEY .next/static/` → **0 Treffer** (Pflicht).
4. **BOM-Falle:** neue `'use client'`-Files auf UTF-8-BOM prüfen (`file`/Hex) → strippen (sonst React #418 unter Turbopack).

**B — middleware.ts:** den jeweiligen `SUBDOMAIN_LANDING`-Eintrag einkommentieren.

**C — Deploy auf :3006:** `python scripts/deploy-marketing-update.py` (SFTP Files → `npm run build` → **`.next/standalone/.env.local`-Symlink NEU** → `pm2 reload claimondo-marketing`). **⚠️ LESSON: der Rebuild wischt `.next/standalone/` → den Symlink MUSS das Script neu setzen, sonst SERVICE_ROLE weg → /gutachter-finden (& jede Service-Role-Seite) 500.** Das Script macht's; verifizieren.

**D — Pre-Switch-Verify (am VPS, vor dem Vhost-Touch):**
```
curl -s -o /dev/null -w "%{http_code}" -H "Host: makler.claimondo.de" http://localhost:3006/      # erw. 200
curl -s -o /dev/null -w "%{http_code}" -H "Host: kfzgutachter.claimondo.de" http://localhost:3006/ # erw. 200
```
Rendert :3006 den Content schon korrekt host-geroutet? Erst dann switchen.

**E — Vhost-Switch (PRODUKTIONSKRITISCH, je Subdomain einzeln):**
1. Vhost-Filename am VPS verifizieren: `ls /etc/nginx/sites-available/ | grep -E 'makler|kfzgutachter'` (gutachter. war `sites-available/gutachter.claimondo.de`).
2. Backup → `sed`-Switch `proxy_pass …:3000` → `…:3006` → `nginx -t` (Gate!) → `systemctl reload nginx` → extern verifizieren → bei Fehler **Auto-Rollback** aus Backup. (Mechanik 1:1 wie gutachter. / `deploy-marketing-switch.py`.)

**F — Smoke (Pflicht, Screenshots + Analyse):** je Host `/`=200 (host-routed Content), Landing-Pfad→301→`/`, anderer Pfad→301→claimondo.de. Tool: `C:/pwtool/shot-marketing.mjs` (Jobs anpassen). **Für kfzgutachter. zusätzlich den Conversion-Pfad** (LeadForm-Submit, GA4-`track`-Event, `gutachter-verfuegbar`-API) testen.

## 4 · ⚠️ Risiko: kfzgutachter. ist eine LIVE-Ads-Conversion-LP

`kfzgutachter.claimondo.de` ist **kein** statisches Recruiting-Page wie makler. Es ist die **Google-Ads-Landeseite** (Maik = Ads-Partner, 150 € CPL — `[[project-sla-und-partner-provisionen]]`), seit 20.05. live, mit eigener Conversion-Mechanik (LeadFormClient, GA4-Conversions via `track.ts`, live-stats, Sticky-CTA) und **frischer Consent-Arbeit** (`docs/28.05.2026/HANDOFF-kfzgutachter-lp-consent-fix.md`). Es gibt zudem die Alt-Notiz `[[feedback-subdomains-in-ruhe-lassen]]` (Subdomains liefen bewusst separat) — durch die Marketing-Split-Entscheidung (Aaron 29.05.) für die :3006-Konsolidierung überholt, aber die **Vorsicht** bleibt gültig.

**Konsequenz:**
- Migration **vollständig + verhaltensgleich** (jede Conversion-Komponente + die `gutachter-verfuegbar`-API + GA4-Events). Eine Regression = verlorene bezahlte Conversions = echtes Geld.
- **Vor dem kfzgutachter.-Vhost-Switch mit Aaron rückkoppeln** (Ads-Traffic, ggf. Wartungsfenster). makler. kannst du ohne Rückfrage durchziehen.
- Nach Switch: GA4-Echtzeit + ein Test-Lead prüfen, dass Conversions weiter feuern.

## 5 · proxy.ts-Kontext (Monolith) — nicht verwirren lassen

`src/proxy.ts` routet **alle drei** Subdomains noch (`SUBDOMAIN_LANDINGPAGES`, Zeilen 65–69: gutachter-partner / makler/partner-werden / kfzgutachter-lp). Das ist **kein Widerspruch**: sobald nginx den Host auf :3006 schickt, erreicht der Request die App (:3000) gar nicht mehr → der proxy.ts-Zweig für diesen Host wird **toter, aber harmloser** Code (genau wie schon für gutachter.). **Optionaler Stream-8-Hygiene-Schritt (separat, nicht blockierend):** nach erfolgreichem Switch die makler./kfzgutachter.-Einträge aus `src/proxy.ts` entfernen (eigener PR gegen staging, app-Build-Gate). **Nicht** im selben PR wie die Marketing-Migration — App-Repo ≠ Marketing-Build.

## 6 · Branch / Worktree / Koordination

- **Frischen Branch off `origin/staging`** (hat den vollen Build + diese Handoffs): `git checkout -b kitta/marketing-subdomains-makler-kfzgutachter origin/staging` im Worktree `wt-claimondo-marketing`. (NICHT den verbrauchten `kitta/claimondo-marketing-split` weiterverwenden — der ist gemergt, divergiert per Squash-Artefakt.)
- **Berührte Files:** nur `claimondo-marketing/*` (neuer Content + middleware.ts) + VPS-Vhosts. Kollidiert nicht mit den parallelen cmm-/aar-939-Sessions.
- **Regeln:** PR `--base staging`, nie Direct-Push main, **du bist NICHT die Merge-Session**. Umlaute Pflicht. 7-Punkte-Audit im Commit-Body. VPS-Deploy nur mit Aaron-Override (root@212.132.119.110, `scripts/vps-ssh-exec.py`, `PYTHONIOENCODING=utf-8`).
- **Vorhandener `stash@{0}`** (`kitta/aar-kunde-gutachten-werte`) ist fremd/dokumentiert — nicht anfassen.

## 7 · Referenzen

- **Erprobtes Muster:** wie gutachter. live wurde — `claimondo-marketing/_HANDOFF.md` §Stream 9 + §Stream 7.
- **Deploy-Tooling:** `scripts/deploy-marketing-{update,switch,vps,redirects}.py`.
- **Monolith-Host-Routing:** `src/proxy.ts` (vollständig gelesen 31.05.).
- **Design-Doc Subdomains:** `docs/superpowers/specs/2026-05-12-marketing-subdomains-makler-gutachter-design.md`.
- **kfzgutachter-LP-Spezifika:** `src/app/kfzgutachter-lp/README.md` + `docs/28.05.2026/HANDOFF-kfzgutachter-lp-consent-fix.md`.
- **Pfad-Alias-Falle:** `claimondo-marketing/tsconfig.json` = `@/*`→`./*` (Root-Level, NICHT `src/`). **Und:** der Build ist im Root-`tsconfig.json` schon excluded (CI-Lesson #2083) — neue Files dort brauchst du nicht anzufassen.
