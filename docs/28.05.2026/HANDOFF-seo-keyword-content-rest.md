# Handoff: SEO Keyword-Content — Reststrecke

**Datum:** 2026-05-28
**Von:** Session 5b725119 (Tracking-Fixes + SEO-Content-Start)
**Für:** frische, fokussierte Folge-Session
**Quelle:** SEO-Master-Synthese (GSC + Ads + Ahrefs, 28.05.) + Plan `docs/superpowers/plans/2026-05-28-seo-keyword-content-abc.md` (via #1948 in staging)

---

## ✅ STATUS-UPDATE — Reststrecke erledigt (Folge-Session, 28.05. abends)

Die unten beschriebene Reststrecke ist **gebaut** (je PR gegen `staging`, Build grün, Smoke + Screenshots):

| Item | Page | PR |
|---|---|---|
| Informational | `/kfz-gutachter/sachverstaendiger-vs-gutachter` | #1962 |
| Informational | `/kfz-gutachter/autoschaden-soforthilfe` | #1964 |
| Informational | `/kfz-gutachter/gutachten-service` | #1965 |
| B2B (gebündelt) | `/gutachter-partner/neukundengewinnung` + `/marketing` | #1969 |
| Inbound-Folge-PR | 3× `/kfz-gutachter/*` ins Hub-Pillar-Grid | s. offene PRs |

**#6 Konkurrenten-Diversion (`/alternative/[konkurrent]`): GESTRICHEN** (Entscheidung Aaron, 28.05.) — wird nicht gebaut.

de.json/Sitemap wurden an **distinkten Ankern** ergänzt → die PRs mergen konfliktfrei. **Die Reststrecke ist damit abgeschlossen; die untenstehende „Offen"-Liste ist historisch.**

---

## TL;DR

Aus der SEO-Synthese sind die nicht-kannibalisierenden, unowned Keyword-Items zu bauen. **Erledigt:** Goldkeyword-Decoder (gemergt) + B2B-Page `leads-generieren` (PR offen). **Offen:** 2 weitere B2B-Ratgeber, 3 informational Ratgeber, Konkurrenten-Diversion. Jedes ist reine Wiederholung eines bewährten Musters — Rezept + Stolpersteine unten, exakt befolgen, dann ist jede Page ~1 PR.

---

## Status der PRs (Stand 28.05. ~21:30)

| PR | Inhalt | Status |
|---|---|---|
| #1948 | SEO-Plan-Doc + Decoder `kfz-gutachter-kosten-tabelle` (H8.11) + Test-Count 10→11 | **GEMERGT** (staging) |
| #1954 | B2B-Ratgeber `/gutachter-partner/leads-generieren` | offen (Review) |
| #1935 | LP Consent-Mode-v2 `set` via gtag() (nicht tracking-SEO, eigener Strang) | offen |
| #1944 | Stadt-Seiten Conversion → GA4 (nicht tracking-SEO, eigener Strang) | offen |

---

## Reststrecke (genau diese bauen)

**B2B-Ratgeber** (clustern unter `/gutachter-partner/<topic>`, Sie-Form, CTA → `/gutachter-partner`):
1. `/gutachter-partner/neukundengewinnung` — Keyword „neukundengewinnung kfz sachverständiger/gutachter" (GSC Pos 68–84). Sektionen: Auslastungs-Problem → Kanäle → Claimondo-Modell (regionale Freischaltung, kein CPL-Risiko) → FAQ.
2. `/gutachter-partner/marketing` — „marketing/kundenakquise für kfz-gutachter" (Pos 70–83). Sektionen: Offline vs. Online → lokale SEO/Bewertungen → Plattform-Distribution → FAQ.

**Informational Ratgeber** (clustern unter `/kfz-gutachter/<topic>` — das Section existiert: ablauf/kosten/wertminderung/online-kfz-gutachten/vermittlungsportale-vergleich):
3. `/kfz-gutachter/sachverstaendiger-vs-gutachter` — „sachverständiger vs gutachter unterschied".
4. `/kfz-gutachter/autoschaden-soforthilfe` — „autoschaden was tun / 5 Soforterledigungen".
5. `/kfz-gutachter/gutachten-service` — „kfz gutachten service".
   - ⚠️ `wie-laeuft-ein-kfz-gutachten-ab` aus der Synthese NICHT bauen → `/kfz-gutachter/ablauf` deckt das ab (Kannibalisierung).

**Konkurrenten-Diversion** (UWG-GATE):
6. `/alternative/[konkurrent]` (unfallpaten, mb-gutachter, dreckmann-thom, kfz-gutachtenzentrale-deutschland, station-janssen). Muster: `kfz-gutachter/vermittlungsportale-vergleich` (objektiv, Gesetze/Urteile zitieren, `rel="nofollow noopener"`, belegbare Aussagen, keine Herabsetzung). **Erst nach Aaron + juristischer Freigabe live (bis dahin `noindex`).**

---

## Das bewährte Rezept

### Variante A — i18n-Topic-Page (für alle Ratgeber 1–5)

**Vorlage 1:1 kopieren:** `src/app/kfz-gutachter/ablauf/page.tsx`. Aufbau: `generateMetadata` (page_meta-Keys) → German-Konstanten NUR für JSON-LD → `useTranslations('<namespace>')` für sichtbaren Text → JSON-LD (`serviceSchema`/`howToSchema`/`faqPageSchema`/`breadcrumbsSchema` aus `@/lib/seo/jsonld`) → Hero/`AnswerCapsule`/Sektionen/FAQ/CTA/`LandingFooter`/`StickyCallBar`.

Schritte je Page:
1. **page.tsx** anlegen (`src/app/<pfad>/page.tsx`), Vorlage adaptieren. `buildLanguageAlternates(<canonical>)` + canonical setzen.
2. **`src/i18n/messages/de.json` an ZWEI Stellen** (additiv, neuer Namespace):
   - im `page_meta`-Block (~Z.654): `"<ns>": { title, description, og_title, og_description }`
   - als Top-Level-Content-Namespace (~Z.2998): `"<ns>": { breadcrumb_hub, breadcrumb_current, hero_h1, hero_intro, antwort_capsule, schritte[], faq_h2, faqs[], cta_* }`. **`faqs` muss inhaltlich = die German-FAQ-Konstante im page.tsx** (JSON-LD == Display).
   - **Sichtbaren Text NIE hardcoden** — alles via `t()`. Echte Umlaute. B2B = Sie-Form ([[project_b2b_tov]]).
3. **Discoverability (Pflicht, AGENTS.md):**
   - `/kfz-gutachter/*` → Eintrag in `src/app/sitemap.ts` (manuelles Array) + interner Link (z.B. crosslinks auf Geschwister-Topic-Pages).
   - `/gutachter-partner/*` → **NICHT in main-sitemap** (subdomain-isoliert gutachter.claimondo.de). Stattdessen Inbound-Link vom Pillar `PartnerContent.tsx` (Link-Label als i18n-Key in `gutachter_partner.content.*`; `import Link from 'next/link'` ist dort NICHT default vorhanden).
4. **Build:** `rm -rf .next; NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün (Compiled + TypeScript + N static pages, +1 pro neuer Route). Output-File lesen, **nicht `| tail`** (maskiert Exit).
5. **Smoke (Playwright, Page ist host-unabhängig):** `next start` via `.claude/skills/webapp-testing/scripts/with_server.py`, dann Detail-Page HTTP 200 + H1 + **keine rohen i18n-Keys** + Inbound-Link vorhanden + **Screenshot prüfen**.
6. Eigener Branch off staging, Commit (7-Punkt-Audit), PR `--base staging`.

### Variante B — Decoder (.md, additiv) — falls ein Topic als Versicherer-Brief-Decoder passt

`src/content/claimondo/decoder/<slug>.md`, Frontmatter wie `kfz-gutachter-kosten-tabelle.md` (type: decoder, cluster H8, nummer H8.n, primary/secondary_keywords, insurer_phrases, keyFacts, last_legal_review: pending). Auto-discovered → Route `/decoder/<slug>` + `/decoder`-Index automatisch. **Test-Count in `src/lib/content/__tests__/claimondo-mdx.test.ts` hochziehen** (getDecoder + getAllAssets). Decoder-Hero rendert den Einleitungs-Blockquote als Plain-Text → **kein inneres `**` im `> **Kurz erklärt:** …`-Blockquote** (sonst rohe Sternchen; site-weiter Fix läuft separat, s.u.).

---

## Kritische Stolpersteine (NICHT wieder entdecken)

1. **`de.json` ist heiß** — die i18n-Sessions (98e5a06e u.a.) schreiben es parallel um. Neue Keys additiv unter neuen Namespaces (mergen meist sauber); mit Rebase rechnen.
2. **Pro PR ein FRISCHER Branch off staging.** Branches werden nach Merge auto-gelöscht; ein Re-Push auf einen gemergten Branch legt einen **Orphan** an (mir 2× passiert: `kitta/lp-ads-consent-extras`, `kitta/seo-keyword-content-abc` — beide löschbar).
3. **Build:** Default-Heap (~4 GB) reicht NICHT für den Monorepo-TS-Check → `--max-old-space-size=8192` (sonst Exit 134 OOM trotz „Compiled successfully").
4. **Build im Hintergrund OHNE `| tail`** — sonst maskiert `tail` den Exit-Code (roter Build sieht grün aus).
5. **`/gutachter-partner` ist subdomain-isoliert** → nicht in main-sitemap; Discoverability via Pillar-Inbound-Link.
6. **Kannibalisierung prüfen** — vor jeder neuen Page checken, ob `/kfz-gutachter/<topic>` oder `/decoder/<slug>` das Keyword schon abdeckt (ablauf, kosten, wertminderung, online, vermittlungsportale-vergleich existieren).
7. **Decoder-Hero = Plain-Text-Snippet** (`extractSnippet` claimondo-mdx.ts:139 strippt nur das Label, AssetHero rendert plain) → kein Inline-`**` im Einleitungs-Blockquote.

---

## Koordination (NICHT trampeln)

- **Hyperlocal-Städte-Cluster** (NRW B1 der Synthese) → aktive Hub-Session (Doc 38, HYPERLOCAL_DATA). NICHT bauen.
- **Decoder-Set** thematisch sprint-1 (4d7e685c) — neue Decoder sind additiv (auto-discovery), aber Count-Test ist geteilt.
- **`de.json` / Topic-Page-Text** → i18n-Sessions aktiv.
- **Site-weiter `**`-Hero-Fix** → Session a3315756 ist auf `kitta/snippet-inline-markdown` (vermutlich genau dieser Fix). NICHT die shared content-lib anfassen.
- **Konkurrenten-Diversion** → UWG-Freigabe durch Aaron/Partnerkanzlei vor Live.

---

## Aufräumen
Remote-Orphan-Branches löschen: `kitta/lp-ads-consent-extras`, `kitta/seo-keyword-content-abc` (Commits sind in staging / auf Folge-Branches erhalten).
