# Handoff — Sprachumschalter Marketing-i18n, Fortsetzung (28.05.2026)

> **Für die nächste Session.** Setzt das erste Handoff fort
> (`docs/27.05.2026/handoff-i18n-switcher-marketing.md`, PR #1864, gemergt).
> Deckt die Tranchen seither + den Anthropic-Credit-Workaround + zwei neue Lessons ab.
> **Memory-Anker:** `[[project_i18n_switcher_marketing]]` · `[[project_doc48_url_prefix_migration]]`.

## 0 · TL;DR

Fast die gesamte **handgebaute** Marketing-Surface ist jetzt mehrsprachig (de + en/tr/ar/ru/pl)
über den globalen Cookie-Switcher (`claimondo-locale`). Heute (27.→28.05.) zusätzlich gemergt/offen:
Recht/Schaden-Spokes, Fahrzeugtypen, kfz-gutachter-Subtree, Kosten/Tools/Report. Offen bleiben nur
noch die strukturell anderen Fälle: dynamisches `kfz-gutachter/[stadt]`, die MDX-Content-Collection
und der große `WizardClient`.

**Zwei wichtige Betriebs-Fakten:**
1. **Der Projekt-`ANTHROPIC_API_KEY` (für `translate.mjs`) ist am Credit-Limit** (`400 credit balance too low`). Übersetzt wird seither **subagent-driven** (s. §3). Bis Aaron auflädt, ist die Pipeline tot — der Subagent-Weg ist der Standard-Fallback und skaliert.
2. **Diese i18n-Arbeit IST Doc 48 Phase 1.** Phase 3 (URL-Prefix `/tr/` etc.) darf NIE vor Native-Übersetzung laufen (SEO-Penalty). Englisch bleibt aktiv (Aaron-Override §3.1).

## 1 · PR-Ledger (i18n-Switcher)

| Tranche | PR | Stand |
|---|---|---|
| Wave A — Startseite + Nav | #1841 + Hotfix #1850 | ✅ gemergt |
| Wave B — vorteile/wie-es-funktioniert/faq/ueber-uns | #1853 | ✅ gemergt |
| Wave C — gutachter-finden/beratung-anfragen/gutachter-partner | #1860 | ✅ gemergt |
| Shared-Components (AnswerCapsule/CTA/Wizard-Toggle/DynamicWizard) | #1862 | ✅ gemergt |
| Handoff-1 (Doc) | #1864 | ✅ gemergt |
| Recht/Schaden-Spokes (4 JSX-Spokes) | #1870 | ✅ gemergt |
| Fahrzeugtypen (e-auto/lkw/motorrad) | #1873 | ✅ gemergt |
| kfz-gutachter/*-Subtree (6 Seiten) | #1881 | ✅ gemergt |
| **Kosten/Tools/Report (4 Seiten)** | **#1883** | 🔄 **offen → Merge-Watcher** |
| Dieses Handoff | (neu) | 🔄 offen |

`de.json` hat aktuell **~1410 Keys** je Locale, `check:i18n` grün über alle 5 Zielsprachen.

## 2 · Der wiederholbare Tranchen-Workflow (verfeinert)

1. **Branch stacken:** Da `de.json` + die 5 Locale-Files geteilt sind und PRs nacheinander vom
   Merge-Watcher gemergt werden, neue Tranche auf die **vorige Tranchen-Branch** stacken
   (`git switch -c kitta/i18n-<x> kitta/i18n-<vorige>`), NICHT auf staging — sonst de.json-Konflikt.
2. **Scannen + Scope:** je Kandidat `wc -l` + grep auf `export default async`, `use client`,
   `claimondo-mdx`/`MarkdownRenderer` (MDX→Content-Collection-Tranche), `service-pitch`. Nur
   **handgebaute JSX-Server-Pages** sind „einfache" Tranchen.
3. **Wiring via Subagenten** (subagent-driven-development, 2 Seiten/Subagent, sequenziell wegen
   de.json): sichtbarer JSX-Text → `t()`/`t.raw()`/`t.rich()`; neue de.json-Namespaces (per-page).
4. **Übersetzen — subagent-driven** (s. §3, da Pipeline tot): 5 parallele Subagenten (1/Locale,
   verschiedene Files → kein Race) füllen en/tr/ar/ru/pl.
5. **`npm run check:i18n`** muss grün sein (Key-Parität + Vollständigkeit; CI-Gate).
6. **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (exit 0).
7. **Smoke en + ar:** Dev-Server (`npx next dev -p 30xx`) + Playwright/curl mit Cookie
   `claimondo-locale=<loc>`, Screenshot je Seite. **Jede Route, auch die scheinbar trivialen.**
8. **Rebase + PR:** sobald die Stack-Basis-PR gemergt ist (`gh pr view <n> --json state`):
   `git fetch && git rebase --onto origin/staging kitta/i18n-<vorige> kitta/i18n-<x>` → nur der
   eigene Delta bleibt → `git push -u` → `gh pr create --base staging`.

## 3 · Übersetzung subagent-driven (Credit-Workaround — WICHTIG)

`scripts/i18n/translate.mjs` (Projekt-`ANTHROPIC_API_KEY`) liefert `400 credit balance too low`.
**Fallback (Lesson 6):** Übersetzung via Subagenten auf dem **eigenen Agent-Runtime** (separate
Abrechnung). Pro Ziel-Locale ein Subagent, der:
- `scripts/i18n/glossary.md` (Brand-Voice + Terminologie) + die neuen Namespaces in `de.json` liest,
- die Namespaces strukturidentisch übersetzt + **programmatisch** (Node `JSON.parse`→setzen→
  `JSON.stringify(obj,null,2)`) in `<loc>.json` schreibt (NICHT per Edit-Tool — Curly-Quote-Bug),
- Key-Parität + JSON-Validität selbst prüft, Temp-Script löscht.
- **Die 5 Locale-Files sind verschieden → alle 5 Subagenten PARALLEL** (kein Race).
- Regeln je Sprache: `" "` (en/tr), `„ "` (pl), `« »` (ru/ar); Вы/Pan-Pani/Siz/MSA; §/BGH-Az/€/
  Marken/Datum **wörtlich**; `<strong>`-Tags + ICU-`{var}` + leere Strings erhalten.

Wenn Aaron die Credits auflädt: die Pipeline (`npm run i18n:translate`) geht wieder + ist
token-effizienter (gebatcht, gecachtes System-Prompt). Bis dahin = Subagenten.

## 4 · Lessons (vollständig)

1. **Geteilte/Client-gerenderte Komponenten = `useTranslations`** (isomorph), nie `getTranslations`
   (server-only → crasht im Client-Bundle; brach `/faq` via LandingTopbar).
2. **~~translate.mjs zerschoss Arrays~~ GEFIXT:** `coerceArrays(deData, updated)`-Post-Process in
   `scripts/i18n/translate.mjs` zieht die Array-Struktur von de nach (idempotent). Inline-Workaround obsolet.
3. **`service-pitch.ts` (SSoT) NICHT angefasst** — de-Werte in Messages kopiert (dokumentierte
   de-Drift). Doc 48 §5.2 will es langfristig in Messages migrieren (Folge-Punkt).
4. **JEDE Route smoken — auch client-gerenderte.** Build-grün ≠ render-grün (s. Lesson 7).
5. **`'use client'`-Const-Export-Falle:** eine zu `'use client'` gewordene Komponente darf keine
   Daten-Konstante exportieren, die ein Server-Parent importiert (→ Client-Reference-Crash, z.B.
   `PARTNER_FAQ`). Konstante in Plain-Modul auslagern.
6. **Übersetzung via Subagenten = providerunabhängiger Fallback** bei Credit-Limit (s. §3).
7. **async Server-Page (DB-Fetch) MUSS `getTranslations` (await), NICHT `useTranslations`.**
   `vermittlungsportale-vergleich` awaitet Live-`svNetz` → der synchrone Hook brach beim
   SSR-Streaming (`Expected a suspended thenable` → HTTP 500, **Build war grün**, nur Smoke fand's).
   Inverse zu Lesson 1. **Vor Wiring prüfen: `export default async function Page`? → getTranslations.**

**Stacking-Lesson:** nach jedem Merge ist der lokale Branch „N commits ahead" (Squash-Artefakt) —
nie neu pushen (Orphan). Rebase-`--onto origin/staging` über die (gemergte) Stack-Basis ist der
saubere Weg, nur den eigenen Delta zu behalten.

## 5 · Pro Tranche erhaltene Konventionen (DEUTSCH lassen)

- `export const metadata` / `generateMetadata` (SEO-kanonisch; mit der `seo-content-meta-desc`-Session
  koordinieren, falls Metadata-i18n irgendwann drankommt).
- ALLE JSON-LD-Argumente (`serviceSchema`/`faqPageSchema`/`articleSchema`/`howToSchema`/
  `breadcrumbsSchema`) + die reingegebenen Konstanten.
- **Dual-Use-Konstanten** (eine Konstante speist Schema UND sichtbares Rendering): deutsche Konstante
  fürs Schema behalten (ggf. `_SCHEMA`-Suffix), sichtbares Rendering auf `t.raw` umstellen.
- `StickyCallBar quelle`, `PHONE_*`, `WHATSAPP_HREF`, `href`, `className`, Icons, §/BGH-Az/€/
  Datum/Eigennamen/Marken. Bei Daten-Arrays: `href`/Icon als parallele Code-Konstante per Index;
  `.map((t) =>`-Parameter umbenennen (Kollision mit `const t`).

## 6 · NOCH OFFEN (Resume-Reihenfolge-Vorschlag)

| # | Tranche | Files | Notiz |
|---|---|---|---|
| a | **kfz-gutachter/[stadt]** | `src/app/kfz-gutachter/[stadt]/page.tsx` (724 Z, **pitch=4**) | Dynamisch + zieht aus `service-pitch.ts` + Hyperlocal-Daten. Doc 48 §5.3: Eigennamen (Stadt/Bezirk/Gericht/Autobahn) bleiben Code, nur rahmende Sätze übersetzen. Multi-Session-Fingerabdrücke (doc38-hyperlocal, seo-meta) → vor Edit Kollision prüfen. **Eigene, sorgfältige Tranche.** |
| b | **Content-Collection** | `haftpflicht/page.tsx` (Hub) · `haftpflicht/[slug]` · `kfz-haftpflicht-schaden` · `decoder` · `ratgeber` + shared `src/components/content/*` | Body ist **Markdown** (`src/content/claimondo/**`) → braucht übersetzte `.md` ODER (Doc 48 §5.4) einen `<MdxLanguageBanner>` auf nicht-de-Locales + nur die `content/*`-Chrome-Komponenten i18n. Große, eigene Strecke. |
| c | **WizardClient** | `src/components/onboarding/WizardClient.tsx` (746 Z) | Großer eingebetteter Funnel, **shared mit kunde-onboarding-Portal** → sorgfältig smoken (Portal!). |
| — | Metadata-i18n (`<title>`/`<meta>`/OG) | — | Separater SEO-Task, mit `seo-content-meta-desc` koordinieren. Out-of-Scope dieser Strecke. |

## 7 · Bekannte Interim-Limitierungen (Native-Review-Kandidaten, kein Blocker)

- **Maschinelle/Subagent-Übersetzungen** sind Interim — Doc 48 Phase 2 = Native-Review vor URL-Prefix.
- **`schadensreport-2026`**: die Daten-/BGH-Tabellenzeilen (dt. Rechts-Fachbegriffe „UPE-Aufschläge",
  „Verbringungskosten" etc.) bleiben deutsch (Schema-/Citation-Konstanten). Headers + Prosa übersetzt.
- **`service-pitch.ts`-de-Drift** (Lesson 3) — langfristig in Messages migrieren (Doc 48 §5.2).
- **Seiten werden `ƒ Dynamic`** (Cookie-Read) statt statisch — gewollt + akzeptiert seit Wave A;
  `metadata` bleibt statisch → SEO-HTML voll-SSR.

## 8 · Stehende Constraints + Koordination

- PRs **immer `--base staging`**, nie main. **Diese Session merged NICHT** (Merge-Watcher squash-merged
  grüne PRs + löscht Branch). Echte Umlaute in UI-Strings. 7-Punkte-Audit im Commit-Body. Co-Author
  `Claude Opus 4.7 (1M context)`. Vercel nie erwähnen. DDL nur via supabase-CLI.
- **Andere aktive Sessions** (Stand 28.05.) auf eigenen Branches: `cmm44-claim-phase`, `linkedin-bot`/
  `org-sameas-wikidata`, `consent-cmp-oss-spec`, `datenschutz-v2-page`, `fix-company-email`/`whatsapp-href`.
  Keine fassen `src/i18n/messages/*` oder die Marketing-Seiten-Bodies an → keine Kollision. Bei
  `[stadt]` (Tranche a) aber `doc38-hyperlocal` + `seo-content-meta-desc` beachten.

## 9 · Session-Hygiene (bei diesem Handoff)

- Working-Tree clean. Letzte Tranche-Branch `kitta/i18n-kosten-tools-report` = PR #1883 (gepusht,
  beim Watcher). Dieses Handoff auf `kitta/i18n-handoff-2`.
- **5 Stashes existieren, alt/fremd** (LP-/Wizard-Branches anderer Streams: `aar-lp-*`,
  `aar-wizard-*`, `aar-kunde-gutachten-werte`) — NICHT aus dieser Strecke, liegen gelassen.
- Keine Dev-Server, keine `_smoke-*`-Artefakte offen.

---
**Referenzen:**
`docs/27.05.2026/handoff-i18n-switcher-marketing.md` (Handoff-1) ·
`docs/27.05.2026/text-audit/00-MASTER-text-audit-2026-05-27.md` (Zahlenkonflikte offen) ·
Doc 48 (URL-Prefix-Spec, lokal/Notion) · `scripts/i18n/{translate.mjs,check-complete.mjs,glossary.md}` ·
Memory: `project_i18n_switcher_marketing`, `project_doc48_url_prefix_migration`.
