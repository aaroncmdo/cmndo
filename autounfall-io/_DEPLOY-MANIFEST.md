# Deploy-Manifest — autounfall.io · Branch `feat/au-seo-handoff` · Stand 2026-06-12

**Für:** den Deploy-Account (VPS + Git-Schreibzugriff). **Mission:** den abgenommenen
SEO-/GEO-/Analytics-/Legal-Stand von `feat/au-seo-handoff` in **einem Pass** live stellen.
**Du** mergst + deployst — Claude Code hat **nicht** gepusht/gemergt.

---

## 0 · TL;DR
- Branch `feat/au-seo-handoff`, Basis `ceaf5d81`, **20 Commits** (inkl. Partnerkanzlei-Generisierung + Recht-Praezision), **rein additiv**.
- **Harte Garantie:** `git diff ceaf5d81..HEAD -- '*.generated.ts'` = **0** → keine der
  243 Bestands-Routen inhaltlich verändert. Neue Routen + Analytics + Legal additiv.
- **Env vor dem Build setzen** (§3). **Datenschutz + Clarity zusammen** deployen.
- **⚠️ Legal-Gate (§4):** zwei CC-verfasste Inhaltsseiten brauchen RA-Genter-Freigabe vor Live.
- Monika/Finder = Platzhalter, in Produktion `null` — **nicht** scharf in diesem Deploy (§5).

## 1 · Commits (Reihenfolge base → HEAD)
| # | Commit | Punkt |
|---|---|---|
| 1 | `9d4ffe01` | BRIEF-03 — GSC/Bing/Ahrefs-Verifizierungs-Meta-Tags (`app/layout.tsx`) |
| 2 | `4dff1905` | C1 — neue Seite `/kba-schluesselnummer` (manueller Artikel) |
| 3 | `7ec8bc82` | A1 — Vergleichs-Cluster (8 `/vergleich/[slug]` + Hub `/vergleich`) |
| 4 | `c2787a96` | BRIEF-05 — `llms.txt` + `llms-full.txt` datengetrieben |
| 5 | `8c5ed10e` | BRIEF-04 Teil A — Relations-Layer + „Verwandte Themen" |
| 6 | `c3390419` | BRIEF-06-1 — Logo-Akzent-Punkt |
| 7 | `4bc6bbf4` | docs — Handoff-State (Repo-Doc, **keine** Route) |
| 8 | `9ef89531` | C2 — Unkostenpauschale-Abschnitt + 2 FAQ in `/nutzungsausfall` (additiv) |
| 9 | `38167c58` | A5 — Standalone-Artikel `/nutzungsausfall-unkostenpauschale` · **⚠️ Legal-Gate** |
| 10 | `db83ef1e` | Impressum + Datenschutz (finaler LexDrive-Text 1:1) + Footprint-Fix (Mail/Tel) |
| 11 | `92755449` | Microsoft Clarity (Opt-out, Art. 6 Abs. 1 lit. f) + „Cookie-Einstellungen"-Footer |
| 12 | `c4e23602` | Organization-`sameAs` (LinkedIn/Crunchbase/Startbase) |
| 13 | `66e47f07` | Plausible-Funnel-Events (`form_start`, `scroll_50/90`, `cta_click`) |
| 14 | `df0b027c` | `cta_click` auf Homepage + Decoder/Tool-CTAs |
| 15 | `3c6d4b87` | §1 — Head↔Decoder konsequent verlinkt (Relations-Layer) |
| 16 | `1f32f334` | §2 — Head-Hub `/stundenverrechnungssatz` (answer-first + FAQPage) · **⚠️ Legal-Gate** |
| 17 | `77f42928` | §4 — Monika-FAB + Gutachter-Finder-Embed als Platzhalter (prod = `null`) |
| 18 | `7688c9af` | Partnerkanzlei site-weit generisch (LexDrive entnamt; Vergleich-Seiten behalten Nennung/UWG §6) + A5/§2 Recht-Praezision |
| (19/20) | docs | Deploy-Manifest v1 (`3da49128`) + diese Aktualisierung |

## 2 · Diff-Garantie (additiv)
- `content/articles.generated.ts`, `content/rest-pages.generated.ts`,
  `content/decoder-data.generated.ts` → **Diff = 0** über alle Commits (auch die LexDrive-Generisierung lief als Merge-Transform in `content/*/index.ts` + `lib/decoders.ts` — generated.ts unangetastet).
- Änderungen ausschließlich in: Manual-/Merge-Layer (`content/*.manual.ts`,
  `content/*/index.ts`), App-Code (neue Routen/Layout/Components/lib), datengetriebene
  `sitemap`/`llms` (ziehen neue Seiten automatisch).
- Fremde WIP `kfz-gutachter-wuppertal/` (shared git-root `cmndo`) **nie** angefasst.
- **Prüfbefehl:** `git diff --stat ceaf5d81..feat/au-seo-handoff -- 'autounfall-io/content/*.generated.ts'` → leer.

## 3 · Build & Env
- `npm ci` → `npm run build` (Next 16, `output: standalone`), **0 Errors** erwartet · `tsc --noEmit` grün.
- eslint: **14 PRE-EXISTING** Fehler (`react-hooks/*` in `components/tools/*`) — bekannt, kein Blocker.
- **Env in der Deploy-Umgebung:**
  - `NEXT_PUBLIC_CLARITY_PROJECT_ID=x5ty9kh510` (Code-Default ist dieselbe öffentliche ID; Env macht's explizit/überschreibbar).
  - optional: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_SITE_EMAIL`, `NEXT_PUBLIC_SITE_PHONE`.
- **Clarity-Projekt (Dashboard):** **NICHT** auf „require cookie consent" (wir nutzen Opt-out) · Masking-Mode **Mask/Balanced**.
- **Datenschutz + Clarity zusammen deployen:** die DSE (Commit 10) verweist auf den
  „Cookie-Einstellungen"-Footer-Schalter aus Commit 11 (Opt-out/Widerspruch).

## 4 · Legal-Gate vor Go-Live — ✅ Aktenzeichen verifiziert
Zwei CC-verfasste Inhaltsseiten → **finale RA-Genter-Bestätigung vor Live**. Die Aktenzeichen
wurden extern geprüft (echt + korrekt zitiert, nichts fabriziert) — der Review wird eine
Bestätigung, keine Korrektur:
- `/nutzungsausfall-unkostenpauschale` (`38167c58` + `7688c9af`) — § 249 BGB, § 287 ZPO;
  Unkostenpauschale „rund 20–30 €, ~25 €" als richterliche Schätzung (**keine Garantie**).
- `/stundenverrechnungssatz` (`1f32f334` + `7688c9af`) — § 249 BGB + § 254 Abs. 2 BGB;
  **BGH VI ZR 53/09** (VW-Urteil, 20.10.2009) + **VI ZR 91/09** (BMW-Urteil, 23.02.2010).

Beide zeigen **keinen** „Entwurf"-Hinweis. Impressum/Datenschutz (Commit 10) ist anwaltlich
freigegeben. **Operativ:** Postfach `team@autounfall.io` aktiv schalten; HRB-Nummer (AG Köln)
+ USt-IdNr. nachtragen, sobald eingetragen.

**Partnerkanzlei-Linie (Commit 18):** Die Kanzlei wird auf allen **Standalone**-Seiten generisch
als „unsere Verkehrsrechts-Partnerkanzlei" geführt (Name + `lex-drive.com`-Link entfernt).
**Ausnahme:** die 8 **Vergleich-Seiten** behalten die namentliche Nennung — bei vergleichender
Werbung ist die namentliche Transparenz nach **UWG § 6** gerade geboten. → **RA Genter sollte die
Vergleich-Seiten eigens auf UWG-§-6-Konformität prüfen** (objektiv, nachprüfbar, nicht herabsetzend);
das ist der eigentliche Rechts-Hotspot im Cluster.

## 5 · Platzhalter (nicht scharf in diesem Deploy)
Monika-FAB + Gutachter-Finder-Embed (Commit 17) rendern in **Produktion `null`**
(`NODE_ENV`-Guard) → kein sichtbarer Platzhalter für Nutzer. Der **andere Dev-Account**
baut sie scharf (siehe TODO-Kommentare in `components/placeholders/*` + die MONIKA-*-Specs).
Das `LeadFormClient` auf `/gutachter-finden` bleibt aktiv (Leads laufen weiter).

## 6 · Post-Deploy (Cowork/Aaron)
1. Verifizierungs-Tags sind live → GSC/Bing/Ahrefs **„Bestätigen"**.
2. Sitemap `https://autounfall.io/sitemap.xml` in GSC + Bing einreichen.
3. IndexNow-Ping: `node scripts/indexnow-ping.mjs` (alle Sitemap-URLs).
4. Request-Indexing nach §7.

## 7 · Request-Indexing-Liste (Head-Terms zuerst)
GSC „Indexierung beantragen", in dieser Reihenfolge:
1. `/stundenverrechnungssatz` **+** `/versicherer-decoder/stundensatz-gekuerzt` (neu, ~900 Vol, AI-Overview)
2. `/merkantile-wertminderung`, `/verbringungskosten`, `/upe-aufschlaege`, `/nutzungsausfall`
3. `/nutzungsausfall-unkostenpauschale` (A5, neu)
4. `/vergleich` + die 8 `/vergleich/*`, `/kba-schluesselnummer`
5. Decoder-Cluster `/versicherer-decoder/*` (jetzt Head↔Decoder-verlinkt)
6. Rest der ~100 noch nicht indexierten Routen
au.io = Ratgeber-Portal — **kein** GBP/Local.

## 8 · Reproduzierbare Audits
- Inbound ≥2 je Route: `/tmp/au-inbound-audit.mjs` (liest `.next/server/app/*.html`, zählt distinct-source-Inbound) → 0 von 153 Routen <2.
- Answer-Capsule + FAQPage je Head-Term: node-Extraktion `quick-answer-prose` + `"@type":"Question"` → alle 7 grün (44–68 W Capsule, 3–7 FAQ).
- Generierte-Datei-Guard: §2 Prüfbefehl.

---
*Erstellt von Claude Code, 2026-06-12. Kein Push/Merge durch Claude Code — Merge + Deploy führt der Deploy-Account aus.*
