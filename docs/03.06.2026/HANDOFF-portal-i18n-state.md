# HANDOFF — Portal-i18n (Kunde-Portal) · Gesamt-Stand 2026-06-03

**Einstiegspunkt für die Folge-Session.** Die ausführbare Spec liegt unverändert unter `_specs/portal-i18n/` (CONTEXT/CONTRACT/DB_MIGRATION/WELLEN_PLAN) + `docs/plans/2026-05-29-portal-i18n.md`. Dieses Doc sagt nur **wo wir stehen** und **was als Nächstes geht** — der Rest ist gerade blockiert.

---

## 0. TL;DR

Kunde-Portal + Magic-Link nutzerbasiert in 6 Locales (`de/en/tr/ar/ru/pl`). **Die String-Extraktion + Resolution-Infra ist auf `staging`** (#2365). **Der Sprach-Switcher (F-12/F-13) ist mergebar** (#2370). Was bleibt, hängt an **drei externen Blockern**: Anthropic-Credits (echte Übersetzungen), DB-Zugang (Config-i18n-Seeds), und einer aktiven aar-956-/flow-Kollision (W4-Flow). **Kein DB-freier Code mehr offen, der nicht kollidiert.**

---

## 1. Status pro Welle / Teil

| Teil | Status | Wo |
|---|---|---|
| **W1** source-aware Locale-Resolution + 2 Migrationen (`profiles.sprache`, `content_translations`) | ✅ **auf staging** | #2365 (gemergt) |
| **W2 F-11** stille Lead-Sprach-Vorbelegung (`finalizeKundeSetup`, IS-NULL-geguardet) | ✅ **auf staging** | #2365 |
| **W2 F-12/F-13** Sprach-Switcher (`set-locale.ts` + `LanguageSwitcher` + Mount) | 🔜 **mergebar** | **#2370** (`kitta/portal-i18n-kunde-switcher`) |
| **W3 F-20** `format.ts` (locale-aware Intl-Helfer) | ✅ staging | #2365 |
| **W3 F-30/31/32/34** Kunde-Portal-String-Extraktion (onboarding · fall · termine · tracking · shell · settings, ~24 Files, `kunde.*`/`onboarding.*`) | ✅ staging | #2365 |
| **W3 F-21** de-DE-Sweep (Daten → `useFormatter`/`getFormatter`, Berliner TZ) | ✅ staging | #2365 |
| **Delta 1** (aar-956) `flow.step_feststellung.*` Keys | ✅ staging | #2365 |
| **W4** `/upload` (dokumente + zb1) | ✅ **schon erledigt** | **#1816** ("Flow P3 — 2 Upload-Seiten mehrsprachig") |
| **W4** `/flow` Wizard-Steps (FlowWizardKfz + Quali/Slot/Kasko) | ⏳ **offen, BLOCKIERT** | Kollision: aktiver aar-956-/flow-Strang (cdd8f4f3) |
| **W3/W4 echte Übersetzungen** en/tr/ar/ru/pl | ⛔ **BLOCKIERT** | Anthropic-Credits = 0 (DE-Fallback aktiv, kein MISSING_MESSAGE) |
| **W5** Falldaten-MT (`translate-content.ts` + `TranslatableText`) | ⬜ offen | braucht Credits **+** DB (`content_translations`) |
| **W6** i18n-Smoke + CI-Key-Gate | ⬜ offen | Smoke braucht App+DB |
| **Delta 2/3** `onboarding_felder.i18n`-Seed (`lead-erfassung` + `auslandskennzeichen`) | ⛔ **BLOCKIERT** | DB-Seed (Supabase-MCP down + Aaron-DB-Stopp) |
| **Delta 4** Pflichtdok-Labels | ⛔ **BLOCKIERT** | **reklassifiziert**: kunde-Labels kommen aus `dokument_katalog.label` (DB-Config, AAR-323), NICHT aus den DOC_DEFINITIONS-Code-Konstanten → gehört zu DB-Config-i18n (`dokument_katalog.i18n`) |

---

## 2. Was als Nächstes geht — sobald der jeweilige Blocker fällt

1. **Anthropic-Credits wieder da** → `npm run i18n:translate` **einmal** laufen lassen (incremental, füllt ALLE DE-Fallback-Keys en/tr/ar/ru/pl — `kunde.*`, `onboarding.*`, `flow.step_feststellung`, + ~170 vorbestehende Marketing-Platzhalter). Danach `npm run check:i18n` + Marketing-Smoke als Regression. (Fleet-Marker: `coordination_anthropic_credits_exhausted`.)
2. **DB-Zugang frei** → via **Supabase-Plugin `apply_migration`** (Regel 2, NICHT CLI) die Config-i18n-Seeds:
   - **Delta 2/3**: `onboarding_felder.i18n` für die `lead-erfassung`(audience kunde)-Felder + `auslandskennzeichen` — Muster: Migrationen `20260528175439` (`onboarding_i18n_columns`) + `20260528183021` (`onboarding_i18n_seed`). `localizeFeld()` in `src/lib/onboarding/lade-flow-phasen.ts` ist schon da, es fehlen nur die `i18n`-JSON-Werte pro Feld.
   - **Delta 4**: analog `dokument_katalog.i18n` für die Pflichtdok-Labels (gleicher Mechanismus, nicht Messages).
3. **aar-956-/flow-Strang fertig** (cdd8f4f3 / dispatch-flowlink-Kanonik) → **W4-Flow-Extraktion**: `src/app/flow/[token]/{FlowWizardKfz,FlowQualiStep,FlowSlotStep}.tsx` + `KaskoEndansicht` (`@/components/self-service/`) → `flow.*`-Keys (Namespace existiert). FlowFeststellungStep nutzt schon `t()` (Delta 1). **Vorher koordinieren** — die /flow-Files sind aar-956s aktive Fläche.
4. **W5** Falldaten-MT (Credits+DB): `content_translations`-Tabelle existiert schon (#2365). `translate-content.ts` (service-role, sha256-Cache) + `TranslatableText`-Toggle, eingehängt in kundensichtbare Freitexte (Chat/`nachrichten` — Pfad bei Umsetzung greppen, Memory `project_multi_channel_inbox`). NICHT in PDF/SA/Email (B1).
5. **W6** Smoke (App+DB): `scripts/smoke/kunde-i18n-smoke.mjs` (Muster `marketing-i18n-smoke.mjs`) gegen `app.staging.claimondo.de`, alle 6 Locales, `ar`→rtl, kein MISSING_MESSAGE. + CI-Key-Gate (analog `check:token-audit`).

---

## 3. Verifizierte Fakten / Stolperfallen (nicht erneut hinterfragen)

- **Marketing-Split #2121 hat `LanguageSwitcher` + `src/lib/actions/set-locale.ts` aus dem Monolith nach `claimondo-marketing/` ausgelagert** (waren marketing-only). Deshalb wurde der Switcher in #2365 bewusst gedroppt und in **#2370 app-scoped neu angelegt** (`src/components/i18n/LanguageSwitcher.tsx` + `src/lib/actions/set-locale.ts`, schreibt Cookie `claimondo-locale` **+** `profiles.sprache`). `database.types.ts` **hat** `profiles.sprache` inzwischen → clean typed update, kein Cast.
- **`request.ts` (staging)** liest source-aware: `resolved(profile|token) ?? cookie(claimondo-locale) ?? DEFAULT`. Auf `/kunde` = source `profile` → `resolveUserLocale()` → `profiles.sprache`.
- **`/upload` ist schon mehrsprachig (#1816)** — nicht nochmal extrahieren. `MultiSlotUploadClient`/`Zb1UploadClient` nutzen `useTranslations` + scoped `NextIntlClientProvider(flowLocale)` (Strategie B, `resolve-flow-locale` + `load-messages`).
- **Zwei i18n-Mechanismen nicht verwechseln:** Component-Strings = `messages/*.json` (next-intl). **Config-Feld-Labels** (`onboarding_felder`, `dokument_katalog`) = DB-Spalte `.i18n` via `localizeFeld()` → eigene Plugin-Migration. Delta 2/3/4 sind der zweite Mechanismus.
- **#2365-Inhalt war kurz „gemerged aber nicht auf staging"** (Force-Push während staging→main, `pr_state_nicht_production_stand`). Inzwischen sauber drauf (verifiziert: de.json 46 Top-Level mit `kunde`/`onboarding`, format.ts, Migrationen).
- **DE-Fallback ist Pflicht** in allen 6 Files (sonst MISSING_MESSAGE-Crash, CONTRACT B5). Neue Keys IMMER in alle 6 (de echt, Rest DE bis Translate-Lauf). `check:i18n` ist der Key-Parität-Gate.
- **Worktree-Gate** (kein voller Build — OOMt): `npx tsc --noEmit` + `npm run check:i18n` + `npm run check:component-set -- --ratchet`. Kein Runtime-Smoke ohne App+DB.

---

## 4. Pointers

- **Spec:** `_specs/portal-i18n/{CONTEXT,CONTRACT,DB_MIGRATION,WELLEN_PLAN}.md` + `docs/plans/2026-05-29-portal-i18n.md`
- **PRs:** #2365 (Extraktion, **gemergt**) · **#2370** (Switcher, **mergebar** — `kitta/portal-i18n-kunde-switcher`)
- **i18n-Infra:** `src/i18n/{request,locales,load-messages}.ts`, `src/i18n/messages/*.json` (6), `src/lib/i18n/{format.ts,locale-cookie.ts,resolve-flow-locale.ts}`, `scripts/i18n/{translate.mjs,check-complete.mjs,glossary.md}`
- **Config-Feld-i18n:** `src/lib/onboarding/lade-flow-phasen.ts` (`localizeFeld`), Migrationen `20260528175439`+`20260528183021` als Seed-Vorlage
- **Worktree:** `.claude/worktrees/portal-i18n-spec` (node_modules vorhanden)
- **Branch dieses Handoffs:** `kitta/portal-i18n-handoff`

## 5. Lektion für Folge-Sessions (Multi-Session-Hygiene)

- **Subagent-Dispatches:** Agenten IMMER absolute Worktree-Pfade geben + „keine relativen Pfade / nicht in den Main-Checkout schreiben". Relative Pfade landen sonst im geteilten Main-Checkout (Inzident 29.05., Memory `feedback_workflow_agent_cwd_contamination`).
- **Datei-Kollision** (Hook, 30-Min-Zeitfenster ab letztem Touch): nicht selbst forcen — Aaron tippt `force-edit-collision`; sonst Fenster abwarten. PR-Konflikte mit parallel-gemergten Branches via Owner-Merge `origin/staging` → beide Seiten behalten → tsc + check:i18n.
