# Handoff — Sprachumschalter Marketing-i18n, Fortsetzung 2 (28.05.2026)

> **Für die nächste Session.** Setzt Handoff-2 fort
> (`docs/28.05.2026/handoff-i18n-switcher-fortsetzung.md`, PR #1885, gemergt).
> **Memory-Anker (durable, auto-geladen):** `[[project_i18n_switcher_marketing]]` · `[[project_doc48_url_prefix_migration]]`.

## 0 · TL;DR
Diese Session trieb die i18n-Strecke vom Marketing-Kern **in die App + Content-Collection**. **Der Onboarding-Wizard ist code-level i18n-komplett.** Content-Collection hat den Sprach-Banner (Slice 1); offen sind nur noch die `content/*`-Chrome (Slice 2) + die nutzerbasierte Phase 2.

| Tranche | PR | Stand |
|---|---|---|
| a — `kfz-gutachter/[stadt]` | #1894 | ✅ gemergt |
| c — `WizardClient`-Chrome | #1899 | ✅ gemergt |
| c-Folge — `wizard_fields` (Feld-Sub-Komponenten) | #1904 | ✅ gemergt |
| b — Content-Collection `MdxLanguageBanner` (Slice 1) | #1909 | ✅ gemergt |
| Dieses Handoff | (neu) | 🔄 offen |

`de.json` = **1543 Keys** je Locale, `check:i18n` grün. Neue Namespaces: `kfz_gutachter_stadt` (84), `onboarding_wizard` (15), `wizard_fields` (27), `mdx_banner` (1). Reuse: `common.zurueck`/`weiter`/`loeschen`.

## 1 · Was jede Tranche gemacht hat
- **#1894 `kfz_gutachter_stadt`** — async Server-Page → `getTranslations` (Lesson 7). Eigennamen/Stadt-Daten (`s.*`)/§/BGH/€/BVSK bleiben Code bzw. ICU-Vars (Doc 48 §5.3). Dual-Use (`PROZESS_STEPS`→HowTo, `buildStadtFaq`→FAQPage) deutsch fürs Schema, sichtbar via `t.raw`. `[stadt]` = `ƒ Dynamic` trotz generateStaticParams+dynamicParams=false.
- **#1899 `onboarding_wizard`** — `WizardClient` (Client → `useTranslations`). `validatePhase` liefert Feld-Label, Caller baut `t('pflichtfeld',{label})`. `GlassStepIndicator` (nur WizardClient nutzt es) mitgenommen → `schritt_indikator`.
- **#1904 `wizard_fields`** — FileField/SignatureField/SlotField/Zb1UploadField (nur WizardClient). SlotField Monats-/Wochentag-Labels via Message-Collections (`slot_months` Array[12], `slot_weekdays` Map mit DEUTSCHEN Lookup-Keys Mo..So + lokalisierten Werten) — keine Datums-/TZ-Logik geändert. Einfache Felder = kein Hardcoded-Chrome.
- **#1909 `mdx_banner`** — `<MdxLanguageBanner>` (Client, self-hide auf `de` via `useLocale`) auf allen 6 Content-Routes (haftpflicht Hub+[slug], decoder Hub+[slug], ratgeber, kfz-haftpflicht-schaden). Body + Chrome bleiben deutsch.

## 2 · NOCH OFFEN (Resume-Reihenfolge)
1. **b Slice 2 — content/*-Chrome-i18n** (direkte Folge zu #1909): `ConversionAnchorBlock` (~15 Inline-Strings + `ANCHOR_*`-SSoT aus `src/lib/seo/conversion-handoff.ts`), `ClusterHubGrid` (6 Cluster-Labels + „Wähle dein Thema"), `AssetHero` („Kurz erklärt:"/Redaktion-Byline/Trust-Chip), `SpokeCtaBand`, `InlineCheckCta`. Eigener `content`-Namespace. SSoT per Lesson 3 nach Messages kopieren (conversion-handoff.ts NICHT anfassen). Grep UNTERZÄHLT Chrome (→-/lowercase-Strings) → pro Komponente lesen. content/*-Components werden NUR von Content-Pages genutzt.
2. **Phase 2 — DB-/Daten-Content** (nutzerbasiert via `profiles.sprache`, NICHT Cookie): Markdown-Bodies (`src/content/claimondo/**`), `phases`/onboarding_felder (Wizard-Phasen-Titel + Feld-Labels), Mitteilungs-Templates. Eigener großer Track (Native-Übersetzung).
3. **Metadata-i18n** (`<title>`/`<meta>`/OG) — separater SEO-Task, mit `seo-content-meta-desc` koordinieren.

## 3 · Übersetzung subagent-driven (Credit-Workaround)
Projekt-`ANTHROPIC_API_KEY` (translate.mjs) am Credit-Limit → 5 parallele Subagenten (1/Locale, verschiedene Files), lesen `scripts/i18n/glossary.md` + de-Namespace, schreiben programmatisch (`JSON.parse→set→JSON.stringify(obj,null,2)`) in `<loc>.json` (NICHT per Edit — Curly-Quote-Bug), prüfen Key-Parität selbst. Bei 1-Key-Namespaces: self-translate ok.

## 4 · Lessons (neu)
1. **Stale-dep nach `rebase --onto origin/staging`** — staging kann neue Deps haben (hier `vanilla-cookieconsent`), Worktree-node_modules stale → Build bricht `Module not found` in FREMDEM Code (ConsentManager). Fix: `rm -rf .next && npm ci` (NICHT inkrementelles `npm install` — ließ `@vercel/turbopack-next`-Font kaputt). Nach Rebase package.json auf neue Deps prüfen.
2. **Stacking→Rebase** — bei offener Vorgänger-PR auf deren Branch stacken (sonst locale-Tail-Konflikt). Nach Merge: `git rebase --autostash --onto origin/staging <prev> <branch>` (--autostash wegen fremdem M settings.local.json). Alle Vorgänger gemergt → frisch von origin/staging.
3. **ICU `{var}` formatiert NUMBERS locale-spezifisch** (2024→„2.024") → numerische Felder als `String()`. Kleine 1-stellige Zahlen safe.
4. **Object-Lookup-Collections** (`slot_weekdays` {Mo..So}) — KEYS deutsch lassen (Lookup gegen Daten), nur VALUES übersetzen. check:i18n validiert Objekt-Keys, aber NICHT Array-Längen (Array=1 Leaf) → separat verifizieren.
5. **de.json mittig editieren, Locales am Tail** (programmatisch). de.json NIE programmatisch re-stringify-en (zerlegt Inline-Arrays → Riesen-Diff). Order-Mismatch egal (check:i18n ist key-set-basiert).
6. **Write-erzeugte Files können verschwinden** (Smoke-.mjs + dieses Handoff sind beim Branch-Switch verschwunden — fremder git-clean/Race im Multi-Session-Worktree). Robust: per Bash-Heredoc schreiben UND im selben Call `git add`/ausführen (kein Lösch-Fenster). Memory-Anker ist der durable Backup.
7. **`useLocale()` self-hide** — UI nur für nicht-de (Banner) als Client-Komponente `if(useLocale()==='de') return null`; Pages rendern unbedingt, sie verbirgt sich selbst.

## 5 · Konventionen (unverändert)
PRs immer `--base staging`, nie main. Diese Strecke merged NICHT selbst (Merge-Watcher). Echte Umlaute. 7-Punkte-Audit im Commit. Co-Author `Claude Opus 4.7 (1M context)`. Vercel nie erwähnen. Build-Gate `NODE_OPTIONS=--max-old-space-size=8192 npm run build`. Smoke en+ar (+de-Baseline) mit Cookie `claimondo-locale`, Screenshot je Route.

## 6 · Smoke-Artefakte
Protokolle: `docs/28.05.2026/smoke-i18n-{stadt,wizard,wfields,banner}/SMOKE-AUDIT.md` (in diesem PR). Screenshots + `scripts/smoke-i18n-*.mjs` liegen lokal/untracked (nach Worktree-Removal weg) — bei Bedarf via `next start -p 3021` + die `.mjs` neu erzeugen.

## 7 · Koordination
Sprint-1 „Versicherer-Hubs" hat content-i18n NIE gemergt → Tranche b clean. Aktive Sessions (cmm44-mp6*, linkedin-bot) fassen `src/i18n/messages/*`, `content/*` oder die Wizard-Surface nicht an → Slice 2 kollisionsfrei startbar.

---
**Referenzen:** Handoff-2 (`docs/28.05.2026/handoff-i18n-switcher-fortsetzung.md`) · `scripts/i18n/{translate.mjs,check-complete.mjs,glossary.md}` · Doc 48 (Notion) · Memory `project_i18n_switcher_marketing`.
