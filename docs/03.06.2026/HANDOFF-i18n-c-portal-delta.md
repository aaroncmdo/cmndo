# Handoff — Portal-i18n (P4-C) · Delta-Addendum zum bestehenden Spec

**Stand:** 2026-06-03 · **Für:** die i18n-/portal-i18n-Session · **Von:** cdd8f4f3 (AAR-956 P4-Lane)

> **Wichtig:** Das ist **kein neues Spec** — die Portal-i18n-Strecke ist bereits voll spezifiziert. Dies hier ergänzt nur, **was sich seit dem 29.05. geändert hat** (P4-A/§3a/P4-D) und **eine neue i18n-Dimension**, die mein ①-Step einführt.

---

## 🌟 North Star (bestehend, unverändert)

Kunde-Portal + Magic-Link-Strecken (`/flow`, `/upload/*`) **nutzerbasiert** in 6 Sprachen (`de/en/tr/ar/ru/pl`, RTL für `ar`). `profiles.sprache` = SSoT für eingeloggte Kunden; Magic-Link via Token→`leads.sprache`/`flow_links.sprache`-Trace; Marketing bleibt cookie-basiert. Falldaten-MT (Chat/Notizen) als gekennzeichnete Anzeige-Hilfe.

**Die ausführbare Strecke = `_specs/portal-i18n/`:**
- `CONTEXT.md` (das Warum + Architektur-Entscheide E1–E5 + Business-Regeln B1–B7)
- `CONTRACT.md` (F-01..F-52 Feature-IDs)
- `DB_MIGRATION.md` (profiles.sprache + content_translations)
- `WELLEN_PLAN.md` (**6 Copy-Paste-Wellen W0–W6**, strikt sequenziell)
- Plan: `docs/plans/2026-05-29-portal-i18n.md`

**Der i18n-Session folgt diesem Wellen-Plan.** Dieses Handoff sagt nur, was in W3/W4 jetzt **mehr** zu tun ist.

---

## ⚠️ Korrektur am Spec (Regel-2-Drift)

`WELLEN_PLAN.md` W1 sagt „Migrationen via **supabase-CLI** (`npx supabase migration new` + `db push`)". **Das ist überholt** — AGENTS.md Regel 2 (Aaron-Entscheid 28.05., NACH der Spec-Erstellung 29.05. teils, aber jetzt verbindlich): **DDL/Seeds via Supabase-Plugin `apply_migration`**, nicht CLI (CLI macht im Multi-Worktree-Setup Auth/Link/Drift-Ärger). Also: alle i18n-Migrationen (profiles.sprache, content_translations, **+ die Config-Feld-i18n-Seeds unten**) über das Plugin, dann File nach getrackter Version benennen.

---

## 📦 Was P4 seit dem 29.05. hinzugefügt hat (die Deltas)

### Delta 1 — `/flow`-Wizard hat NEUE Steps (W4-Scope F-33 wächst)
`FlowWizardKfz` ist nicht mehr der 4-Step-Wizard der Spec. Seit §3a/P4-A:
- **`FlowQualiStep`** (§3a, Schuldfrage), **`FlowSlotStep`** (§3a, Slot-Picker), **`KaskoEndansicht`** (`@/components/self-service/`) — deutsche Inline-Strings.
- **`FlowFeststellungStep`** (P4-A, `src/app/flow/[token]/FlowFeststellungStep.tsx`) — nutzt bewusst Fallbacks: `t.has('step_feststellung.heading') ? t(...) : 'Ein paar Angaben zu Ihrem Schaden'` (+ `step_feststellung.sub`, `common.speichern`). **→ diese Keys in alle 6 `messages/*.json` (Namespace `flow`/`common`).** Sobald die Keys da sind, greift automatisch i18n statt Fallback.
- W4-Extraktion (F-33) muss diese Komponenten mit abdecken (nicht nur das was am 29.05. existierte).

### Delta 2 — NEUE i18n-Dimension: **config-getriebene Feld-Labels** (kritisch, nicht in der Spec)
Mein ①-Step (`FlowFeststellungStep`) rendert die **`lead-erfassung`(audience kunde)-Felder via dem geteilten `FieldRenderer`**. Die Feld-**Labels** (z.B. „Personenschaden?", „Auslandskennzeichen des Gegners?") kommen **NICHT aus `messages/*.json`**, sondern aus **`onboarding_felder.label`** (deutsch) — lokalisiert via **`onboarding_felder.i18n`** (`localizeFeld()` in `src/lib/onboarding/lade-flow-phasen.ts`).
- **Folge:** Für tr/ar/… zeigt der Kunden-① **deutsche Feld-Labels**, solange `onboarding_felder.i18n` für die `lead-erfassung`-Felder nicht geseedet ist. Das ist ein **eigener Pfad neben** dem next-intl-Message-Katalog.
- **Muster existiert:** Migrationen **`onboarding_i18n_columns`** (`20260528175439`) + **`onboarding_i18n_seed`** (`20260528183021`) haben das für die `beauftragung`/`kunde-onboarding`-Flows gemacht. Die i18n-Session muss **denselben Seed für `lead-erfassung`(kunde-sichtbare Felder)** ergänzen (via Plugin-Migration).
- **→ W3 (Onboarding) oder W4 (flow) erweitern:** „config-Feld-Labels für `lead-erfassung` i18n-seeden" als eigener Task. `localeFeld` ist schon da — es fehlen nur die `i18n`-JSON-Werte pro Feld.

### Delta 3 — NEUES Feld `auslandskennzeichen` (P4-D)
`onboarding_felder`-Seed `20260603173632`, deutsches Label „Auslandskennzeichen des Gegners?" (audience **beide** → erscheint im Kunden-① **und** im Dispatcher-Form). Beim `lead-erfassung`-i18n-Seed (Delta 2) **mitnehmen**.

### Delta 4 — ② dynamische Pflicht-Dokumente (W3-Scope)
Die post-fall Onboarding-Pflicht-Doks (`lib/claims/data-requirements.ts` `DOC_DEFINITIONS`) haben deutsche Labels („Fahrzeugschein (ZB1)", „Ärztliches Attest", „Polizeibericht", …). Diese sind **Code-Konstanten**, kein Config → über `messages/*.json` (Namespace `onboarding`/`kunde`) lokalisieren (W3 F-31/F-34, Label-Maps-Katalog).

---

## 🧭 Zwei i18n-Mechanismen — nicht verwechseln

| Was | Wo | Wie |
|---|---|---|
| **Component-Strings** (Headings, Buttons, Hinweise, Status-Labels) | `src/i18n/messages/{de,en,tr,ar,ru,pl}.json` | next-intl `useTranslations`/`getTranslations`, Namespaces `flow`/`upload`/`kunde`/`onboarding`/`common` |
| **Config-Feld-Labels** (lead-erfassung / onboarding_felder) | DB-Spalte `onboarding_felder.i18n` (jsonb) | `localizeFeld()` in `lade-flow-phasen.ts`; **eigene Plugin-Migration** zum Seeden |

Delta 2 ist genau der zweite Mechanismus — leicht zu übersehen, weil er nicht im Message-Katalog liegt.

---

## ✅ Empfohlene Reihenfolge

1. **WELLEN_PLAN W0–W2 wie spezifiziert** (Kontext → Resolution-Kern + Migrationen [via **Plugin**, nicht CLI] → Persistenz/Switcher).
2. **W3** wie spezifiziert **+ Delta 2** (config-Feld-i18n-Seed für `lead-erfassung` inkl. `auslandskennzeichen`) **+ Delta 4** (data-requirements DOC-Labels).
3. **W4** wie spezifiziert, aber **+ Delta 1** (die neuen `/flow`-Steps: Quali/Slot/Feststellung/Kasko; konkret die `step_feststellung.*`+`common.speichern`-Keys).
4. **W5/W6** wie spezifiziert.

**Quick-Win sofort (optional, unabhängig):** die `flow.step_feststellung.heading/sub` + `common.speichern`-Keys in alle 6 Message-Files — entfernt meinen deutschen Fallback. Sinnvoll aber erst im W4-Kontext (sonst eine Insel ohne Resolution).

---

## 🔗 Einstiegspunkte / Files

- **Spec:** `_specs/portal-i18n/{CONTEXT,CONTRACT,DB_MIGRATION,WELLEN_PLAN}.md` + `docs/plans/2026-05-29-portal-i18n.md`
- **i18n-Infra:** `src/i18n/{request,locales,load-messages}.ts`, `src/i18n/messages/*.json` (6 Locales), `scripts/i18n/{translate.mjs,glossary.md}`
- **Config-Feld-i18n:** `src/lib/onboarding/lade-flow-phasen.ts` (`localizeFeld`/`localizePhase`), `src/lib/onboarding/localize.ts`, Migrationen `20260528175439`+`20260528183021` als Seed-Vorlage
- **Neue P4-Flächen:** `src/app/flow/[token]/{FlowWizardKfz,FlowFeststellungStep,FlowQualiStep,FlowSlotStep}.tsx`, `src/lib/claims/data-requirements.ts`
- **Branch:** `kitta/aar-<nr>-portal-i18n-kunde` (Linear-Ticket), PR gegen `staging`, nie selbst mergen.

---

## Status der P4-Lane (Kontext, abgeschlossen)
A=#2357 MERGED · D=#2359 MERGED · kunde-Geocoding=#2362 OPEN · Header-Fix=#2363 OPEN · B=entfällt · **C(i18n)=dieses Handoff** · lackfarbe+imagin=imagin-gated (gleiche API, sobald Aaron freischaltet).
