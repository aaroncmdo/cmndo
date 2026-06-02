# Cluster-LP v15 Page-Fixes (Nicolas Cowork-Handoff) — Smoke + Hero-Handoff

**Datum:** 2026-06-02
**Branch:** `kitta/cluster-lp-v15-page-fixes` (von `staging`)
**Quelle:** `marketing-strategy/pages v2/HANDOFF_CLAUDE_CODE_v15_2026-06-02.zip` (v15.5 Cowork)
**Apps:** `kfz-gutachter-wuppertal`, `kfz-gutachter-duesseldorf`, `kfz-gutachter-bonn` (3 identische Standalone-Next-16-LPs)

## Entscheidungen (Aaron, 2026-06-02)

1. **Monika = Trennung halten (Option A).** Die interaktive Monika bleibt das ENV-gated `/embed/monika.js`-Widget (`MonikaEmbedSlot.tsx`). Nicolas' DIFF 3/4/5 (Pull-Notification-Pill + Bounce + Sound + 3-Zeilen-Stack) operieren auf der Inline-State-Machine des HTML-Prototyps, die im Repo bewusst WEGGELASSEN wurde (`FabStack.tsx`-Pill = statischer WhatsApp-Link). → **NICHT portiert.** Bleiben Spec-Referenz im Bundle.
2. **Page-Level-Diffs (1/2/6) + Hero** in dieser Session umgesetzt.
3. **Eigener Worktree** wegen Branch-Kollision (4 Sessions auf `kitta/aar-939-monika-embed`).

## Was umgesetzt wurde

### DIFF 1 · Vergleichstabelle full-width (Tablet + Desktop)
- **Befund:** `<NetzwerkCompare/>` (#netzwerkCompareWrap) saß in der rechten 1.25fr-Grid-Spalte → Tabelle auf ~603px gestaucht.
- **Fix:** `NetzwerkSection.tsx` — Tabelle + Hinweis in `<div className="netzwerk-compare-fullspan">` als **direkten Grid-Sibling** gezogen. `globals.css`: `@media (min-width:768px){ .netzwerk-compare-fullspan { grid-column:1/-1 } }`. Mobile (grid-cols-1) ist ohnehin full-width.
- **Verifiziert:** @1440 `tableW=1132px` bei `innerW=1180px` (= volle Container-Breite minus px-6). Alle 3 Spalten ungestaucht lesbar (Screenshot).

### DIFF 2 · Praxis-Tablet-Peek (641–1279px)
- **Befund/Divergenz:** Das Repo (`CasesCarousel.tsx`) nutzt **Dots + kontinuierliches Auto-Scroll, KEINE Pfeil-Buttons.** Nicolas' DIFF 2 (Arrows als Bottom-Pagination + `getCardWidth()`-`<style>`-Child-Fix) ist damit **gegenstandslos** — es gibt keine Arrows und kein injiziertes Style-Element.
- **Fix (CSS-Adaption, Aaron-Entscheid):** nur `globals.css` — `@media (min-width:641px) and (max-width:1279px)`: Card `clamp(280px,58vw,360px)` + `scroll-snap-align:center` + Track-Padding `clamp(40px,8vw,96px)` + beidseitige Fade-Mask. **Dots + Auto-Scroll + Mobile bleiben unangetastet.**
- **Verifiziert:** @768 `cardW=360, mask=true, padL=61px`; @1024 `cardW=360, 3 Cards intersecting (1 zentral + 2 Peeks), mask=true`; @390 (Mobile-Regression) `cardW=301 (w-[88%]), mask=false, padL=24px` → **unverändert** (Regeln greifen korrekt erst ab 641px).

### DIFF 6 · Sub-Page-Routing — N/A
- Stadt-Links im **Footer** (`Footer.tsx` → `cityHref(c)`), und `cityHref` liefert `city.main ? '/' : '/lp/${slug}'` (echter Next-App-Router-Pfad, `app/lp/[slug]/page.tsx`). Der Prototyp-Bug (`/_NEXTJS_COMPONENTS/lp/SLUG/`-Dev-Pfade → 404) **kann im Repo nicht auftreten.** Nichts geändert. (Bonn-Live bestätigt 200 OK.)

## Build-Gate + Smoke

- `tsc --noEmit` (wuppertal, repräsentativ — JSX-Change byte-identisch in allen 3): **grün**.
- Visual-Smoke via Playwright gegen lokalen Dev-Server (Wuppertal): DIFF 1 @1440 (Tabelle full-width), DIFF 2 @768/@1024 (eine dominante Card + Peek beidseitig + Fade), Mobile @390 (unverändert). Hinweis: `public/assets/img/` ist gitignored → Screenshots zeigen Bild-Platzhalter, das **Layout** ist eindeutig.

## Hero Wuppertal — Handoff an Aaron (kein Code-Commit)

`public/assets/img/` ist **gitignored** (~400 MB, Quelle = `brand-assets-archiv.zip`, siehe `MISSING-ASSETS.md`). `HeroSection.tsx` referenziert `hero-wuppertal.webp` als CSS-`background` — **gleicher Dateiname** wie das neue Asset → reiner Binär-Tausch, **null Code-Change**.

**Neue Datei:** `marketing-strategy/pages v2/HANDOFF_CLAUDE_CODE_v15_2026-06-02.zip` → `04_assets_new/hero-wuppertal.webp` (81 KB, web-optimiert).
**`.avif` wird NICHT deployt** — der Component lädt nur `.webp` (Aaron-Entscheid „webp-only").

**Swap auf dem VPS (Aaron/Dev-Lane):**
1. Neue `hero-wuppertal.webp` in `brand-assets-archiv.zip` unter `wuppertal/` ersetzen (für künftige Re-Deploys).
2. Auf dem VPS die Datei direkt ersetzen — statischer Public-Asset, **kein Rebuild nötig**:
   - `/var/www/kfz-unfallgutachter-wuppertal-app/.../public/assets/img/wuppertal/hero-wuppertal.webp`
   - `…/.next/standalone/public/assets/img/wuppertal/hero-wuppertal.webp` (postbuild-Kopie)
   - danach `pm2 reload kfz-gutachter-wuppertal` (optional, Static-Asset wird ohne Reload neu ausgeliefert).
3. Verify: `curl -sI https://kfz-unfallgutachter-wuppertal.de/assets/img/wuppertal/hero-wuppertal.webp | head -1` → 200.

## Reststrecke / bewusst offen

- **DIFF 3/4/5 (Monika):** nicht portiert (Option A). Falls Aaron später die volle State-Machine ODER das Embed-Widget ausbauen will → separater Branch/Session.
- **Deploy:** Code-Diffs gehen erst live bei VPS-Redeploy der 3 LPs (kein Git auf dem VPS, SFTP/tar — siehe `DEPLOY.md`). PR-Merge ≠ Live.
- **PR:** `--base staging`, nicht gemergt (nur die benannte Merge-Session merged).
