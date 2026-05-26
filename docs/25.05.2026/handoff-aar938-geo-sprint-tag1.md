# Handoff — AAR-938 GEO-Sprint (Vergleichs-Page + Wissens-Page) · nach Tag 1

**Stand:** 25.05.2026 (Feierabend) · **Ticket:** [AAR-938](https://linear.app/aaroncmndo/issue/AAR-938) (In Progress, High, Team Aaroncmndo)
**Branch:** `kitta/aar-938-geo-sprint-vergleich-wissen` (auf origin, 2 Commits, **kein PR** — bewusst)
**Quell-Plan:** `docs/geo/geo-sprint-vergleich-und-wissen-2026-05-24.md` (Brief 1+2 + Roll-Out) · **Kontext:** `docs/geo/geo-messung-2026-05-24.md`

## TL;DR
Tag 1 (Linear-Ticket + Feature-Branch + Vergleichstabellen-Faktencheck + UWG-Belege) **erledigt**. **Tag 2 = nächster Schritt: Vergleichs-Page-Draft, noch NICHT begonnen.** Eine Optik-Entscheidung wartet auf Aaron (s. unten).

---

## Was Tag 1 ergeben hat

**Faktencheck:** `docs/25.05.2026/vergleich-belege/faktencheck-vergleichstabelle.md` + 8 datierte Screenshot-Belege + 2 reproduzierbare Probe-Scripts (`scripts/probe-vergleich-belege.cjs`, `scripts/probe-sv-netz-count.cjs`).

**5 belegbare Korrekturen am Plan-Tabellen-Entwurf** (Plan-Tabelle NICHT 1:1 übernehmen — die hier nutzen):
1. Claimondo Servicegebiet „DACH" → **„bundesweit (DE)"** (keine AT/CH-Aussage im Repo).
2. Unfallgiganten „60 Min vor Ort" → **widerlegt** (nur „Sofort-Vermittlung").
3. Neogutachter „2 Std Rückruf" → **widerlegt** („rund um die Uhr", Anfrage „in 30 Sek").
4. Unfallgiganten SV-Netz „lokales Netzwerk" → **„Über 250 geprüfte"** (Counter 329).
5. Unfallgiganten Anwalt „nicht beworben" → **doch** (Rechtsanwalt = Partnerkategorie).

**Aaron-Entscheidungen 25.05.:**
- **Erreichbarkeit** = digital **+ telefonisch rund um die Uhr** („wir sind immer erreichbar").
- **SV-Netz-Zahl** = aktive `sv_leads` + qualifizierte `sachverstaendige` aus Supabase, zusammengefasst (= kanonische `/gutachter-finden`-Definition). **Live-Stand 25.05. = 69** (62 + 7). **Auf der Page LIVE rendern, nicht hardcoden.**

### Verifizierte Vergleichstabelle (Stand 25.05.2026) — diese für die Page nutzen

| Kriterium | Claimondo | Neogutachter | Unfallpaten | Unfallgiganten |
|---|---|---|---|---|
| **Geschäftsmodell** | Gemanagte Full-Service-Regulierung (Gutachten → Partnerkanzlei → Auszahlung) | Gutachter-Vermittlung (Anfrage → SV) | Schadenabwicklung „aus einer Hand" (Gutachter + Rechtsbeistand) | Unfall-Experten-**Verzeichnis** mit Umkreis-Suche, Profil-Listings |
| **Erreichbarkeit** | digital + telefonisch rund um die Uhr; Reaktion „unter 15 Min" | „rund um die Uhr", Anfrage „in 30 Sek"; Tel 0160/4873888 | „24h Soforthilfe", 0800 505 50 50 | „Sofort-Vermittlung" + Umkreis-Suche |
| **SV-Netz (öffentl.)** | **live = 69** (62 sv_leads aktiv + 7 SVs, = /gutachter-finden); bundesweit, Schwerpunkt NRW | nicht beziffert | „bundesweites Netzwerk" | „Über 250 geprüfte" (Counter 329) |
| **Vor-Ort-Besichtigung** | immer Pflicht | Standard | „direkt vor Ort" | vermittelt Vor-Ort-SV |
| **Online-only-Gutachten** | nein | nein | nein | nein |
| **Anwaltsanbindung** | ja — integrierte feste Partnerkanzlei | ja (Reviews) | ja („fachkundiger Rechtsbeistand") | ja (Partnerkategorie) |
| **Kosten Geschädigter** | 0 € (§249 BGB, vorbeh. Anerkenntnis) | „unverbindlich & kostenlos" | 0 € (Haftpflicht zahlt) | „Kostenlos für Geschädigte" |
| **Whitelabel für SV** | **ja (einzige)** | nein | nein | nein („Premium Member"-Listing) |
| **Trustpilot (25.05.)** | kein Profil | 4,6 · 133 | kein Profil (Webwiki 3,7) | 4,5 · 14 |
| **Servicegebiet** | bundesweit (DE) | deutschlandweit (DE) | deutschlandweit (DE) | deutschlandweit (DE) |

---

## OFFENE Entscheidung für Aaron (vor/bei Tag 2)

**Optik:** Live-Zahl **69** steht in der SV-Netz-Zeile neben Unfallgigantens „über 250"/329 — die sind ein **bezahltes Verzeichnis-Listing**, wir ein **gemanagtes/geprüftes Netz**. Roh-Count sieht für uns klein aus.
**Mein Vorschlag (NICHT von Aaron bestätigt):** Live-Zahl zeigen + in der Prosa das Modell rahmen (gemanagte aktive Partner + Partnerkanzlei + Whitelabel vs. bezahltes Verzeichnis). Falls Aaron anders entscheidet → Page-Prosa/Zeile anpassen.

---

## Tag 2 — konkrete Bau-Anleitung

**Datei:** `src/app/kfz-gutachter/vermittlungsportale-vergleich/page.tsx` (neuer Spoke unter dem `/kfz-gutachter`-Pillar).

**SV-Zahl live (Server Component, async):**
```ts
import { ladeSvLeads, ladeAktiveSVs } from '@/lib/actions/gutachter-finder-actions'
const [l, s] = await Promise.all([ladeSvLeads(), ladeAktiveSVs()])
const svNetz = (l.ok ? l.data.length : 0) + (s.ok ? s.data.length : 0) // = 69 (25.05.)
```
(Optional DRY: kleinen Helper `getSvNetzCount()` extrahieren — auch `/gutachter-finden` nutzt die Summe. Nicht zwingend für Tag 2.)

**Komponenten (AGENTS §claimondo-component-set):** `PageHeader`/`SectionCard` (shared), `DataTable`+`DataTableContainer` (shared) für die Tabelle, `AnswerCapsule` (`@/components/landing/AnswerCapsule`) für Antwort-Blöcke, `primitives.Button` für CTAs (**nie** rohes `<button>`), FAQ als `<details>` wie auf der Pillar-Page (`src/app/kfz-gutachter/page.tsx` als Vorlage) — oder Tag 4 nach `shared/FaqAccordion` extrahieren.

**H2-Outline (Brief 1):** „Was eine Vermittlungsplattform leistet" · „Direktvergleich — Tabelle" · „Wann welche Plattform passt" · „Was alle vier gemeinsam haben" · „LG-Bremen-Urteil 2026 + Bedeutung" · „FAQ" · „Fazit". Title/Meta/Keywords aus Brief 1. `metadata.alternates.canonical = '/kfz-gutachter/vermittlungsportale-vergleich'`.

---

## Tag 3–12 (aus Plan)
- **Tag 3:** Wissens-Page `src/app/kfz-gutachter/online-kfz-gutachten/page.tsx` (LG Bremen 9 O 1720/24, „noch nicht rechtskräftig" prominent).
- **Tag 4:** `src/lib/seo/jsonld.ts` → `vermittlerVergleichSchema()` (FAQPage + ItemList) + `onlineGutachtenSchema()` (Article). FAQ-Komponente nach `shared/`.
- **Tag 5:** Internal-Links (Pillar `/kfz-gutachter`, `/vorteile`, `/faq`, `/gutachter-finden`, `/wie-es-funktioniert`) + `src/app/sitemap.ts` (2 URLs, priority 0.9, `langAlternates`) + additive Diffs in `llms.txt` + `llms-full.txt` (rein additiv, Header/Listen unverändert).
- **Tag 8:** UWG-§6-Vorprüfung (Belege liegen in `docs/25.05.2026/vergleich-belege/`).
- **Tag 12:** PR **gegen `staging`** (Regel 1, kein Direct-Push main) + Indexing-Push (GSC/Bing/IndexNow/Sitemap-Re-Submit).

---

## Gotchas / Pflicht (sonst Zeitverlust)
- **Worktree-Write-Misroute:** Write NEUER Files im nested Worktree landet intermittierend im MAIN-Repo (diese Session 1× passiert). Nach jedem `Write` → `git status` + ggf. `mv`/`rm`. (Memory `feedback_worktree_write_misroute`.)
- **Konkurrenz + Trustpilot blocken WebFetch (403):** echter Browser nötig → `scripts/probe-vergleich-belege.cjs` (`@playwright/test`, Aufruf mit `NODE_PATH="<main-repo>/node_modules"`, Browser global in `ms-playwright/`).
- **„DAT-zertifiziert" VERBOTEN** im Marketing (Memory `feedback_dat_zertifiziert_claim`) → „zertifiziert" + „DAT Experts-Netzwerk". Partner-**Kanzlei NIE namentlich** (Memory `feedback_kanzlei_nie_namentlich`) → „unsere Partnerkanzlei".
- **UWG §6:** konservative Sprache, jede Konkurrenz-Zelle hat Beleg (liegt vor), Footer-Disclaimer „Stand der vergleichenden Angaben: 25.05.2026", Konkurrenz-Domains `rel="nofollow"`.
- **Umlaute Pflicht** in JSX; Brand-Tokens (`bg-claimondo-*`), keine Hex (Token-Audit-CI).
- **Build:** voller `npm run build` bei neuen Routen (Next-15-Validator); ggf. `NODE_OPTIONS=--max-old-space-size=8192` (TS-Check-OOM bei Marketing-Routen, Memory `project_claimondo_content_routes`). `next start` kaputt mit `output:standalone` → mit `next dev` smoken.
- **Neue public Route → 307-Falle:** prüfen ob `/kfz-gutachter/*` in `middleware.ts` publicPaths + `proxy.ts` MARKETING_PREFIXES abgedeckt ist (Pillar lebt → vermutlich ja, aber verifizieren), sonst 307→/login für anon+Crawler bei grünem Build.

---

## Wie weiterarbeiten (Worktree)
- Branch vollständig auf origin (`c3ebf4a0`). Dieser Worktree: `.claude/worktrees/session-0525-2137` (Branch dort ausgecheckt).
- **Nächste Session:** entweder in diesen Worktree `cd`, ODER (sauberer) aus dem Haupt-Repo `git worktree remove .claude/worktrees/session-0525-2137` und dann `node scripts/new-session-worktree.mjs aar-938-geo-sprint-vergleich-wissen` (erkennt den existierenden Branch und checkt ihn aus).
- **Branch-Koordination:** unique, kollidiert mit keiner anderen aktiven Session. Andere SEO-Sessions laufen auf `doc16`/`doc38`/`ga4-consent` — keine Datei-Überlappung mit AAR-938 erwartet (neue Page-Dateien), aber `sitemap.ts` / `llms.txt` / `llms-full.txt` werden Tag 5 angefasst — dort vor dem Edit kurz auf parallele Änderungen prüfen.

## Session-Abschluss-Status
- `git status` clean · alle Commits gepusht (`c3ebf4a0`) · kein eigener Stash · kein offener PR (gewollt).
