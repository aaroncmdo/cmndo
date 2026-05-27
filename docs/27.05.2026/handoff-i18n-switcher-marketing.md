# Handoff — Globaler Sprachumschalter, Marketing-Seiten i18n (27.05.2026)

> **Für die nächste Session.** Status, Mechanik, hart erkaufte Lessons und die Rest-Tranchen
> des globalen Sprachumschalter-Rollouts. Lies das, bevor du eine neue i18n-Tranche startest.

## 1 · Mission

Aaron-Auftrag (27.05.): *„text einmal übersetzen damit die Funktion, wenn ich die Sprache wechsle,
auch vollständig wirkt."* Die i18n-**Infra** lief längst (Cookie `claimondo-locale` → globaler
`NextIntlClientProvider`), aber die **sichtbaren** Marketing-Seiten waren hardcodiert deutsch
(0 `useTranslations`) → der Umschalter zeigte fast nichts. Diese Strecke verdrahtet die Seiten Seite
für Seite (in „Wellen"/Tranchen) auf Message-Keys, damit der Wechsel real durchschlägt.

**Abgrenzung:** Das ist NICHT die Magic-Link-Strategie-B (`[[project_i18n_magic_link_flow]]`,
token-only Flow/Upload/Signatur). Das hier ist der GLOBALE Cookie-Switcher für die öffentlichen
Marketing-Seiten.

## 2 · Status (Stand 27.05. ~17:40)

| Welle | Seiten | PR | Stand |
|---|---|---|---|
| Wave A | Startseite (`HauptseitePremium` + 4 Sektionen + StickyCallBar + Lead-Form) + globale Topbar-Nav | #1841 + Hotfix #1850 | ✅ **gemergt** |
| Wave B | `/vorteile` · `/wie-es-funktioniert` · `/faq` · `/ueber-uns` | #1853 | ✅ **gemergt** |
| Wave C | `/gutachter-finden` · `/beratung-anfragen` · `/gutachter-partner` (B2B-Sie) | #1860 | ✅ **gemergt** (14:49Z) |
| Shared-Components | `AnswerCapsule` (10 Seiten) · `BeratungVereinbarenButton` · `KartenWizardToggle` · `DynamicWizard` | #1862 | ✅ **gemergt** (15:36Z) |

**Es ist aktuell KEIN i18n-PR offen.** Alle vier Wellen sind auf `origin/staging`
(`7a968374`). Checkpoint bewusst gesetzt — Aaron testet staging, bevor die nächste Tranche startet.

### de.json-Namespaces (live)
`home`, `nav`, `vorteile`, `wie_es_funktioniert`, `faq`, `ueber_uns`, `gutachter_finden`,
`beratung_anfragen`, `gutachter_partner`, `shared` (8 Keys: `antwort_label`, `beratung_vereinbaren`,
`wizard_toggle.*`, `wizard_fehler_laden`, `wizard_keine_phasen`), plus Strategie-B: `flow`, `upload`, `common`.

⚠️ **Namens-Falle:** Es gibt `gutachter_finden` (NEU, diese Strecke, die Seite) **und**
`gutachter_finder` (ALT, die Marketing-Karten-Komponente) **und** `landing` (TOTE alte Landing,
nur `landing.footer` noch live — HauptseitePremium ersetzte sie am 13.05.). Nicht verwechseln.

## 3 · Mechanik (wie der Switcher funktioniert)

- **Locale-Quelle:** Cookie `claimondo-locale` (KEIN URL-Prefix). `src/i18n/request.ts`
  `getRequestConfig` **ignoriert** sein `locale`-Argument und liest den Cookie.
- **Provider:** EIN globaler `NextIntlClientProvider` in `src/app/layout.tsx`.
- **Hooks:**
  - `useTranslations('ns')` — **isomorph** (Server UND Client). **Default für alles.**
  - `getTranslations('ns')` — **nur Server** (async). NUR in echten async Server-Components
    (z.B. DB-Fetch). In Client-Kontext → **Crash**.
  - `t.raw('x')` für Arrays/Objekte, `t.rich(...)` für `<strong>`/Markup, ICU-Interpolation `{var}`.
- **6 Sprachen:** de (Quelle) + en, tr, ar (RTL!), ru, pl. Files: `src/i18n/messages/<loc>.json`.
- **CI-Gate:** `npm run check:i18n` (= `scripts/i18n/check-complete.mjs`) prüft Key-Vollständigkeit
  aller Locales gegen de — fehlende Keys = roter Build.

## 4 · Der wiederholbare Tranchen-Workflow

1. **Frischen Branch off `staging`** (NACHDEM die vorigen PRs gemergt sind — sonst stackst du auf
   ungemergten Commits): `git fetch origin && git switch -c kitta/i18n-<tranche> origin/staging`.
2. **Pro Seite/Komponente ein Implementer-Subagent** (subagent-driven-development): deutsche Strings
   → `t('key')`, neue Keys in `de.json` unter sinnvollem Namespace. Arrays via `t.raw()`.
3. **Übersetzen:** `node scripts/i18n/translate.mjs` → **DANACH SOFORT `fixArrays` laufen** (s.u. Lesson 2).
4. **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (voller Build, nicht nur tsc —
   Next 15 findet Route-Validator-Fehler erst im Build). `npm run check:i18n` muss grün sein.
5. **Smoke JEDE berührte Route, en + ar:** Dev-Server (`PORT=30xx`) + Playwright/curl mit Cookie
   `claimondo-locale=<loc>`, Screenshot/Grep je Seite. **Auch client-gerenderte Routen** (s. Lesson 1+5).
6. **PR `--base staging`** mit 7-Punkte-Audit-Block im Body. **NICHT selbst mergen** (Merge-Watcher).

## 5 · Hart erkaufte Lessons (jede kostete einen Crash)

1. **`getTranslations` ist server-only → crasht im Client-Bundle.** `LandingTopbar` wird von
   `LandingPage` (Server) UND `FaqClient` (`'use client'`) gerendert; als ich sie in Wave A auf
   `getTranslations`/`async` umstellte, brach `/faq` (`getTranslations is not supported in Client
   Components`). **Geteilte Komponenten IMMER `useTranslations`** (isomorph). Hotfix #1850.
2. **`scripts/i18n/translate.mjs` ZERSCHIESST Arrays** → wandelt JSON-Arrays in `{"0":…,"1":…}`-Objekte
   um → `t.raw('x').map()` crasht in den Zielsprachen. **Mitigation: nach JEDEM translate ein
   `fixArrays(de, target)`** (rekursiv: wo `de` ein Array ist, coerce `target` zurück zu Array).
   ⚠️ **Dieses Script ist NICHT eingecheckt** — bisher inline/temp gefahren. **Echter Fix-TODO:**
   `translate.mjs` so patchen, dass es Arrays erhält (dann fällt der Workaround weg). Bis dahin:
   `fixArrays` neu inlinen pro Tranche.
3. **`'use client'`-Const-Export-Falle (Inverse von `[[feedback_use_server_konstanten]]`).** Eine
   Komponente, die `'use client'` wird, darf KEINE Daten-Konstante exportieren, die eine **Server**-Datei
   importiert (server-seitig wird der Export zur Client-Reference → `faqs.map is not a function` im
   JSON-LD-Schema). Vorfall: `PARTNER_FAQ` in `PartnerContent.tsx`. **Fix:** Konstante in ein
   **Plain-Modul** auslagern → `src/components/gutachter-partner/partner-faq.ts`.
4. **`service-pitch.ts` ist SSoT (Startseite + LP + llms + Stadt-Pages) und wurde NICHT angefasst.**
   Für i18n wurden die de-Strings in die Messages **kopiert**. Folge: de-Drift möglich (zwei Quellen).
   **Follow-up:** `src/lib/brand/service-pitch.ts` langfristig locale-parametrisieren, dann Messages
   daraus generieren statt kopieren.
5. **Smoke JEDE Route — auch client-gerenderte.** Der `/faq`-Crash (Lesson 1) schlüpfte durch Wave As
   viewport-only Startseiten-Smoke; erst Wave-B-Smoke fand ihn. In dieser Strecke fing der Smoke
   **3 echte Crashes**, die build-grün durchgegangen wären (LandingTopbar, PARTNER_FAQ, + der
   DynamicWizard-Check). Smoke ist kein Nice-to-have hier.
6. **`/gutachter-partner` Static-Export-Timeout = bekannter Env-Flake** (nicht dein Bug). Im fast/full
   Build kann die statische Generierung dieser Route timeouten; lokal/staging rendert sie sauber.

## 6 · Noch offen — die Rest-Tranchen

Frischen Branch off `staging` je Tranche. Reihenfolge ist Vorschlag (nach Leverage/Risiko):

| # | Tranche | Routen / Files | Notiz |
|---|---|---|---|
| a | **WizardClient** | `src/components/onboarding/WizardClient.tsx` (746 Z) | Der große eingebettete Funnel (Schnell-Anfrage/Onboarding), **shared mit kunde-onboarding-Portal**. Bewusst zurückgestellt — eigene Tranche, sorgfältig smoken (Portal-Seite!). |
| b | **Fahrzeugtypen** | `e-auto-gutachter` · `lkw-gutachter` · `motorrad-gutachter` | Strukturell ähnlich, gut für einen Subagent-Batch. |
| c | **Recht/Schaden-Spokes** | `haftpflicht` (+`[slug]`) · `kfz-haftpflicht-schaden` · `gegnerische-versicherung-zahlt-nicht` · `unverschuldeter-unfall-rechte` · `unfall-was-tun-als-geschaedigter` · `versicherung-schickt-gutachter` | Viel Text, BGH-Az drin (s. §7 Konflikte). |
| d | **Kosten/Tools/Report** | `kosten-kfz-gutachten` · `decoder` · `ersteinschaetzung` · `unfallskizze` · `schadensreport-2026` · `ratgeber` | Tools haben interaktive Client-Teile → genau smoken. |
| e | **kfz-gutachter/\*-Subtree** | `hub` · `ablauf` · `kosten` · `online-kfz-gutachten` · `vermittlungsportale-vergleich` · `wertminderung` · `[stadt]` | `[stadt]` ist dynamisch + zieht aus `service-pitch.ts` (Lesson 4). |
| f | **LP / Stadt / SV** | `kfzgutachter-lp` · `(marketing)/kfz-gutachter-koeln` · `sachverstaendige` (+`[slug]`) | `kfzgutachter-lp` ist eine **Subdomain** (`[[feedback_subdomains_in_ruhe_lassen]]`) — vorsichtig, eigener Host. |

## 7 · Follow-ups / Out-of-Scope (NICHT in dieser Strecke gefixt)

- **Metadata-i18n** (`<title>`/`<meta description>`/OG): separater SEO-Task. ⚠️ **Andere Session
  arbeitet parallel auf `kitta/seo-content-meta-desc`** an meta_descriptions — NICHT kollidieren,
  Metadata-Übersetzung mit der koordinieren statt blind anfassen.
- **`translate.mjs` Array-Erhalt** (Lesson 2) — der echte Fix, der den `fixArrays`-Workaround killt.
- **`service-pitch.ts` locale-parametrisieren** (Lesson 4) — beseitigt die de-Drift.
- **Text-Audit-Zahlenkonflikte** (offen, brauchen Aaron-Entscheidung, dann konsistent über alle
  Locales ziehen): Melde-Dauer (30s/60s/5min), Rückruf (5min/15min), Auszahlung (32 Tage vs
  6–8 Wochen), Bagatellgrenze, BGH-Az-Verifikation. Quelle: `docs/27.05.2026/text-audit/00-MASTER-text-audit-2026-05-27.md`.

## 8 · Stehende Constraints (verbindlich)

- PRs **immer `--base staging`**, nie `main`. **Diese Session merged NICHT** — der benannte
  Merge-Watcher squash-merged grüne PRs + löscht den Branch.
- **Echte Umlaute ä/ö/ü/ß** in allen nutzersichtbaren Strings (de.json + JSX). Backend/Commits frei.
- **7-Punkte-Audit-Block** in jedem Commit-Body. Co-Author:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Vercel nie erwähnen** (nur GitHub). DB-DDL **nur via supabase-CLI**, nie Management-API.
- **Squash-Artefakt:** Nach Merge ist der lokale Branch „N commits ahead" (un-squashte SHAs).
  **Nicht neu pushen** (re-push eines gemergten+gelöschten Branches = Orphan). `git log --branches
  --not --remotes` ist hier voll mit Squash-Noise — kein echtes „unpushed".

## 9 · Koordination (andere aktive Sessions, Stand 27.05.)

- `kitta/seo-content-meta-desc` — meta_descriptions (s. §7, Metadata-Überschneidung beachten).
- `kitta/cmm44-claim-phase-mp4b` — CMM-44-Migration (Portal-/DB-Layer, kein Marketing-Text-Overlap).
- 2× detached — `korrigiert` / `mp4 smoken`.

Diese i18n-Strecke fasst nur Marketing-Seiten-Komponenten + `src/i18n/messages/*` an — keine
Kollision mit CMM-Portal-/DB-Arbeit. Beim Metadata-Task aber mit `seo-content-meta-desc` absprechen.

## 10 · Session-Hygiene (Stand bei diesem Handoff)

- Working-Tree **clean**. Aktueller lokaler Branch `kitta/i18n-shared-components` = vollständig in
  `origin/staging` (Squash #1862), Remote-Branch gelöscht → **nicht neu pushen**.
- **5 Stashes existieren, sind aber alt/fremd** (andere Branches: `aar-lp-fix-geocoding-api`,
  `aar-lp-nrw-hero-redesign`, `aar-kfzgutachter-host-routing`, `aar-wizard-besichtigungsort-geocoding`,
  `aar-kunde-gutachten-werte`) — NICHT aus dieser i18n-Session, daher hier dokumentiert und liegen
  gelassen (gehören zu LP-/Wizard-Work-Streams).

---
**Memory-Anker:** `[[project_i18n_switcher_marketing]]` (Rollout-Status + 5 Lessons),
`[[project_i18n_magic_link_flow]]` (Strategie B, Abgrenzung), `[[project_text_audit_2026_05_27]]`.
