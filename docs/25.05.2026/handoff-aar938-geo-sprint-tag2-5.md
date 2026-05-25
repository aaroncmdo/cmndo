# Handoff — AAR-938 GEO-Sprint · nach Tag 2–5b

**Stand:** 25.05.2026 (spät) / 26.05.2026 · **Ticket:** [AAR-938](https://linear.app/aaroncmndo/issue/AAR-938) (In Progress, High)
**Branch:** `kitta/aar-938-geo-sprint-vergleich-wissen` — Origin-HEAD `c5ca7ab7`, **kein PR** (bewusst, siehe Tag 12)
**Vorgänger-Handoff:** [`docs/25.05.2026/handoff-aar938-geo-sprint-tag1.md`](./handoff-aar938-geo-sprint-tag1.md)
**Quell-Plan:** [`docs/geo/geo-sprint-vergleich-und-wissen-2026-05-24.md`](../geo/geo-sprint-vergleich-und-wissen-2026-05-24.md) (Brief 1 = Vergleich, Brief 2 = Wissen, Tag-Plan + Roll-Out)
**Faktencheck (UWG-Belege):** [`docs/25.05.2026/vergleich-belege/faktencheck-vergleichstabelle.md`](./vergleich-belege/faktencheck-vergleichstabelle.md) + 8 Screenshots + 2 Probe-Scripts

---

## TL;DR

**Build + Internal-Linking + Discovery sind KOMPLETT.** Beide Pages sind live auf dem Branch, querverlinkt, mit JSON-LD-Schema, in Sitemap + llms.txt + llms-full.txt. Jeder Schritt einzeln verifiziert (Build grün · token-audit 0 · Smoke HTTP 200 + Screenshots/JSON-LD geprüft).

**Offen:** Tag 8 (UWG-§6-Vorprüfung) + Tag 12 (PR gegen `staging` + Indexing-Push). **Den PR NICHT vorschnell öffnen — siehe Warnung unten.**

---

## Was erledigt ist (Commits auf dem Branch)

| Tag | Inhalt | Commit |
|---|---|---|
| 1 | Linear-Ticket + Branch + Faktencheck + UWG-Belege (Vorgänger-Session) | `e1f62d08` / `c3ebf4a0` / `edeec828` |
| **2** | **Vergleichs-Page** `/kfz-gutachter/vermittlungsportale-vergleich` + Inbound-Card im Pillar-Themen-Grid | `451b4c74` |
| **3** | **Wissens-Page** `/kfz-gutachter/online-kfz-gutachten` (LG Bremen 9 O 1720/24) | `9104a632` |
| **4** | dedizierte JSON-LD-Helper `vermittlerVergleichSchema` (FAQPage+ItemList) + `onlineGutachtenSchema` (Article+Legislation) | `c01e3405` |
| **5** | `sitemap.ts` (2 URLs) + `llms.txt` (2 Bullets) + `llms-full.txt` (2 Blöcke) | `8572af8d` |
| **5b** | Neighbor-Inbound-Links `/vorteile`→Vergleich, `/wie-es-funktioniert`→Wissen | `c5ca7ab7` |

### Geänderte/neue Dateien
- **NEU** `src/app/kfz-gutachter/vermittlungsportale-vergleich/page.tsx` — Vergleichs-Page (async Server-Component, live SV-Count)
- **NEU** `src/app/kfz-gutachter/online-kfz-gutachten/page.tsx` — Wissens-Page (static, kein DB)
- **MOD** `src/app/kfz-gutachter/page.tsx` — Pillar: 5. Themen-Card „Plattform-Vergleich"
- **MOD** `src/lib/seo/jsonld.ts` — 2 neue Helper am Datei-Ende (rein additiv)
- **MOD** `src/app/sitemap.ts` — 2 URLs im /kfz-gutachter-Block (priority 0.9, langAlternates)
- **MOD** `src/app/llms.txt/route.ts` — 2 Bullets in „Brand-Hauptseiten"
- **MOD** `src/app/llms-full.txt/route.ts` — 2 Markdown-Blöcke vor FOOTER (verifizierte Fakten!)
- **MOD** `src/app/vorteile/page.tsx` + `src/app/wie-es-funktioniert/page.tsx` — je 1 kontextueller Inbound-Link

---

## Wichtige Entscheidungen & Abweichungen vom Plan (mit Grund)

1. **Landing-Chrome statt `PageHeader`/`SectionCard`** (Plan-Reuse-Tabelle): Beide Pages nutzen `LandingTopbar` / `AnswerCapsule` / Navy-Hero / `LandingFooter` / `StickyCallBar` + `<details>`-FAQ — weil der Pillar (`/kfz-gutachter`) und ALLE `/kfz-gutachter/*`-Siblings diesen Stil nutzen. Die Vergleichstabelle ist trotzdem `shared/DataTable` (semantisch `<table>` + `<caption>` + `scope`), wie vom Plan gefordert.
2. **SV-Netz-Zahl LIVE + Modell-Framing** (Aaron-Entscheidung 25.05.): gerendert via `ladeSvLeads()` + `ladeAktiveSVs()` (= `/gutachter-finden`-Definition), NICHT hardcoded. Smoke zeigte **67** (nicht die 69 aus dem Faktencheck — Daten driften, genau deshalb live). Einordnungs-Box unter der Tabelle rahmt „gemanagtes Netz vs. bezahltes Verzeichnis-Listing".
3. **llms-full-Inhalt = VERIFIZIERTE Fakten**, NICHT der stale Plan-Tabellen-Entwurf (der hatte „60 Min vor Ort"/„DACH"/„lokales Netzwerk" — alle im Faktencheck widerlegt). Wer den llms-full-Block ändert: immer gegen den Faktencheck prüfen.
4. **`/kanzlei`-Link weggelassen** (Wissens-Page): Route existiert nicht + nicht public → wäre 404. RDG-Argument steht ohne Link.
5. **`datePublished` = 2026-05-25** (echtes Build-Datum) statt Plan-Platzhalter 2026-06-04.
6. **Neighbor-Links `/faq` + `/gutachter-finden` SKIPPED** (Tag 5b): `/faq` = thin Wrapper + `FaqClient` (kein Prosa-Spot ohne Client-Edit); `/gutachter-finden` = Map-UI (Vergleichs-Page verlinkt es bereits outbound).
7. **`robots.txt` unverändert** — `/kfz-gutachter` ist nicht disallowed (verifiziert via `middleware.ts` publicPaths + `proxy.ts` MARKETING_PREFIXES).

**Hub-Graph aktuell:** Vergleichs-Page ← Pillar-Card + `/vorteile`; Wissens-Page ← Vergleichs-Page (2×, Intro + LG-Bremen-Abschnitt) + `/wie-es-funktioniert`. Beide in Sitemap + llms.

---

## Offene Strecke

### Tag 8 — UWG-§6-Vorprüfung
- Belege liegen vollständig vor: [`docs/25.05.2026/vergleich-belege/`](./vergleich-belege/) (8 datierte Screenshots + Faktencheck + Probe-Scripts `scripts/probe-vergleich-belege.cjs`, `scripts/probe-sv-netz-count.cjs`).
- Engineering-Seite ist im Wesentlichen schon erfüllt: jede Konkurrenz-Zelle belegt, konservative Sprache, Footer-Disclaimer „Stand 25.05.2026", Konkurrenz-Domains `rel="nofollow"`.
- **TODO:** jede Tabellen-Zelle 1:1 gegen die Belege gegenchecken + als Audit-MD dokumentieren (Konvention `feedback_smoke_audit_mds`). **Finale anwaltliche Freigabe = menschliche Aufgabe** (Plan §„Rechtliche Absicherung").
- Offene Faktencheck-Punkte vor Publish (siehe Faktencheck §„Offene Punkte"): Unfallpaten „Webwiki 3,7" gegenchecken/als extern kennzeichnen (auf der Page bereits als „extern: Webwiki" gelabelt); Neogutachter-Trustpilot-403-Quirk optional manuell bestätigen.

### Tag 12 — PR gegen `staging` + Indexing-Push
- ⚠️ **NICHT vorschnell PR öffnen!** Es läuft eine **Merge-Watcher-Session** (`kitta/sync-watcher`), die offene **Nicht-Draft**-staging-PRs mit grünem Build **autonom squash-merged**. Zusätzlich gilt `feedback_draft_pr_nicht_release_sicher`: auch Draft-PRs sind nicht release-sicher. → **PR ERST öffnen, wenn die UWG-Freigabe da ist UND der Content bewusst released werden soll.** Vorher gar nicht erst öffnen.
- Indexing nach Merge: GSC/Bing/IndexNow + Sitemap-Re-Submit für die 2 neuen URLs.

---

## Gotchas / Pflicht (sonst Zeitverlust)

- **Build im Worktree:** `npm run build` wirft am Ende sporadisch `EBUSY: copyfile … .next/standalone/…` — das ist ein Windows+nested-Worktree-Flake (`output: standalone` kopiert das worktree-eigene `.next` rekursiv). **Fix: `rm -rf .next` + erneut bauen** → grün. Tritt auf CI/VPS (Build im Repo-Root) NICHT auf. Compile + TypeScript + Page-Generation laufen VOR dem EBUSY durch — das ist die eigentliche Validierung.
- **Worktree hat KEIN `.env.local`.** Für lokalen Dev-Smoke aus dem Main-Repo kopieren: `cp "<main>/.env.local" "<worktree>/.env.local"` (ist gitignored). Nach dem Smoke wieder `rm`. Die **Vergleichs-Page** braucht die DB (live SV-Count), die **Wissens-Page** ist static (kein DB).
- **Worktree-Push:** Upstream-Tracking hält nicht zuverlässig → immer explizit `git push origin kitta/aar-938-geo-sprint-vergleich-wissen`.
- **Worktree-Write-Misroute** (aus Tag-1-Handoff): nach `Write` neuer Files `git status` prüfen (ist diese Session NICHT aufgetreten, aber bleibt latent).
- **Build-Heap:** `NODE_OPTIONS=--max-old-space-size=8192` setzen (Marketing-Routen OOMen sonst bei 4 GB).
- **Smoke = Screenshot/Parse + Analyse** im selben Turn. JSON-LD-Validierung via fetch + `JSON.parse` (siehe Smoke-Rezept). Smoke-Scripts dieser Session liegen im OS-Temp (nicht im Repo).

---

## Wie weiterarbeiten

- **Worktree:** `.claude/worktrees/session-0525-2137` (Branch dort ausgecheckt). Entweder dort `cd` rein, ODER aus dem Haupt-Repo `git worktree remove .claude/worktrees/session-0525-2137` + `node scripts/new-session-worktree.mjs aar-938-geo-sprint-vergleich-wissen` (erkennt den existierenden Branch).
- **Vor dem Start:** `git -C <worktree> pull` (Origin-HEAD `c5ca7ab7`). Der Branch wird mit der dormanten „Feierabend"-Session `088ac4a6` (Tag-1-Autor) geteilt — falls die morgen aufwacht, muss sie pullen (kein Konflikt erwartet, alles additiv).
- **Smoke-Rezept:** `cp env` → `cd <worktree> && NODE_OPTIONS=--max-old-space-size=8192 npx next dev -p 3939` (Hintergrund) → fetch/Playwright (`NODE_PATH=<main>/node_modules`, Chromium global) → Server killen (`Stop-Process` auf Port 3939) → `rm <worktree>/.env.local`.
- **Branch-Koordination:** keine Datei-Überlappung mit anderen aktiven SEO-Sessions erwartet (doc16/doc38/ga4). Tag-5-Files (`sitemap.ts`, `llms.txt`, `llms-full.txt`) wurden rein additiv angefasst — bei künftigen Edits dort kurz auf parallele Änderungen prüfen.

---

## Session-Abschluss-Status (diese Session)
- `git status` clean · alle Commits gepusht (Origin-HEAD `c5ca7ab7`) · kein eigener Stash · kein offener PR (gewollt).
- Linear AAR-938: pro Tag (2/3/4/5/5b) ein Fortschritts-Kommentar mit Verifikations-Details.
- Vorhandene Repo-Stashes (5×) + andere unpushed Commits gehören ANDEREN Sessions/Branches — unangetastet gelassen.
