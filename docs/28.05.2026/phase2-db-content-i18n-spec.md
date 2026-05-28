# Phase 2 — DB-Content-i18n: Spec (zur Freigabe)

**Datum:** 2026-05-28 · **Autor-Session:** i18n-Strecke (Doc 48) · **Status:** ENTWURF — wartet auf Aaron-Entscheidungen (D1–D3)
**Vorgänger:** Phase 1 komplett gemergt/offen (content/*-Chrome #1915, Marketing-Metadata #1923, Hubs-Metadata #1933). Phase 1 = code-level UI-Chrome via Cookie-Switcher.

## 0 · Was Phase 2 ist — und was NICHT

Phase 2 = **nutzersichtbare, DB-/template-getriebene Inhalte** in de/en/tr/ar/ru/pl, die NICHT code-level UI-Chrome sind.

**NICHT in diesem Spec (bewusst):**
- **Content-Collection / MDX-Artikel-Bodies** (haftpflicht/decoder/cornerstones/versicherer `*.md`). → Architektur-Konflikt: Sprint-1 (`feature/sprint-1-versicherer-hubs`) ändert aktiv `claimondo-mdx.ts` + baut den `versicherer/*`-Cluster; und Sprint-1s TR-Pilot (Welle 4) ist laut deren Marker explizit „erst mit Doc-48/i18n-Session reconcilen" — plus **offene Grundsatzentscheidung URL-Prefix-Locales (Doc 48) vs Cookie**. Eigener Strang, nach Sprint-1-Merge + Architektur-Entscheid.
- Legal-MD, PDF, Auth-Mails — bleiben deutsch (Phase-1-Konvention).

## 1 · Datenmodell (verifiziert per Recon)

**A. Wizard-Config (DB):**
- `onboarding_phasen` — Spalten u.a. `titel`, `eyebrow`, `beschreibung` (+ `flow_key`, `phase_key`, `reihenfolge`, `conditional_on`). Migration `20260510135215_onboarding_phasen_felder_tables.sql`.
- `onboarding_felder` (FK `phase_id`) — `label`, `hint`, `placeholder`, `optionen` (JSONB, enthält user-sichtbare Dropdown/Radio-Labels), `db_target` (JSONB), `typ`, `pflicht`.
- Loader: `src/lib/onboarding/load-needed-phases.ts` (nested select beider Tabellen). Render: `src/components/onboarding/WizardClient.tsx` (`phase.titel/beschreibung`, `feld.label/placeholder`). Typen: `src/components/onboarding/types.ts`.
- **Chrome** des Wizards ist bereits i18n (Phase 1, #1899/#1904, Cookie). NUR die DB-Inhalte fehlen.

**B. Notification-Templates (Code, hardcoded de):**
- Email: `src/lib/email/google/templates/*.tsx` (~30 react-email, deutsche Prosa). Send: `src/lib/email/google/flows.ts`.
- Channels: `src/lib/notifications/channels/{email,whatsapp,web-push}.ts` + `templates/*.ts`, `switch(eventType)` baut deutsche Strings. Worker: `src/app/api/notifications/process/route.ts`. Recipients: `src/lib/notifications/fan-out.ts` (`computeRecipients` — **holt KEINE sprache**). Kein Locale-Branch.

**C. Locale-Quelle:** `sprache` auf `flow_links`/`leads`/`claims` (**nicht** `profiles` — „Profile hat keine eigene Sprache", `kunde/layout.tsx`). `resolveFlowLocale(flowSprache, leadSprache)` (flow_link > lead > 'de'). Session-UI: Cookie `claimondo-locale`. 6 Locales: `src/i18n/locales.ts`.

**D. Existierender DB-Translation-Mechanismus:** KEINER (keine `_en`-Spalten, kein `*_translations`, kein JSONB-translations). Muss eingeführt werden.

## 2 · Vorgeschlagene Aufteilung

| Track | Umfang | Größe | Abhängigkeit |
|---|---|---|---|
| **A — Wizard-Config** | `onboarding_phasen`/`onboarding_felder`-Inhalte | klein, self-contained | keine |
| **B — Notification-Templates** | Email/WhatsApp/Push-Templates + Locale-Plumbing durch die Pipeline | größer | Track-A-Pattern + Pipeline-Umbau |

**Empfehlung: Track A zuerst** (kleinste Migration, vervollständigt die Wizard-i18n, kein fremder Code), Track B als eigener Spec/PR danach.

## 3 · Track A — Wizard-Config (Detail)

### D1 (ENTSCHEIDUNG) — Storage
**Empfohlen: JSONB-Spalte `i18n` auf `onboarding_phasen` + `onboarding_felder`.**
Form (nur Nicht-de; de bleibt in den Basis-Spalten):
```jsonc
// onboarding_phasen.i18n
{ "en": { "titel": "...", "eyebrow": "...", "beschreibung": "..." }, "tr": { ... }, "ar": { ... }, "ru": { ... }, "pl": { ... } }
// onboarding_felder.i18n
{ "en": { "label": "...", "hint": "...", "placeholder": "...", "optionen": { "<key>": "<label>" } }, ... }
```
- **Warum:** 1 Spalte/Tabelle (leichteste Migration), passt zu bestehenden JSONB-Spalten (`optionen`/`db_target`), keine Joins, neue Locale = nur Daten. Alternative (separate `*_i18n`-Tabelle) = mehr Overhead für kleine Config-Tabellen; per-Locale-Spalten = Spalten-Explosion (verworfen).

### D2 (ENTSCHEIDUNG) — Locale-Quelle für den Wizard
**Empfohlen: Cookie `claimondo-locale` (`getLocale`)** — konsistent mit dem bereits i18n'd Wizard-Chrome (`useTranslations`), damit Chrome + Inhalt in EINER Sprache erscheinen. Die Case-`sprache` (leads/claims) ist die relevante Quelle für Notifications/Magic-Link (Track B), nicht für die In-Session-Anzeige.

### Migration (AGENTS.md Regel 2 — Supabase-**Plugin** `apply_migration`, NICHT CLI)
`ALTER TABLE onboarding_phasen ADD COLUMN i18n jsonb;` + dito `onboarding_felder`. Nullable, default null. Danach `list_migrations` → File exakt auf getrackte Version benennen (Twin-Drift-Vermeidung).

### Reader-Umbau (`load-needed-phases.ts`)
Loader bekommt `locale` (Cookie). Pro Zeile mergen: `titel = row.i18n?.[locale]?.titel ?? row.titel` (de-Fallback) — analog `beschreibung/eyebrow/label/hint/placeholder` + `optionen`-Labels. `WizardClient`/`types.ts` unverändert (bekommen weiter `titel`/`label`).

### Übersetzung
de-Basis-Zeilen lesen → `i18n`-JSONB pro Locale füllen (subagent-driven, wie Phase 1; Glossar `scripts/i18n/glossary.md`). Schreiben via Supabase-Plugin (`UPDATE ... SET i18n = ...`) ODER Seed-Migration. §/BGH/Eigennamen verbatim.

### Smoke
Wizard (`/gutachter-finden` + `/kunde/onboarding-details`) de/en/ar: Phasen-Titel/Feld-Labels lokalisiert, de byte-identisch, RTL ok, Pflichtfeld-Validierung intakt. Screenshot Pflicht (Wizard ist auth-/render-kritisch).

## 4 · Track B — Notification-Templates (Skizze, eigener Folge-Spec)
- **Locale-Plumbing:** `fan-out.ts:computeRecipients` muss je Empfänger die `sprache` laden (claims/leads.sprache — **nicht** Cookie, Notifications sind async/ohne Request) und an `channels/*` + Email-Templates durchreichen.
- **Template-i18n:** entweder next-intl server-side (`getTranslations` mit explizitem Locale) ODER per-Locale-Template-Varianten. Email-TSX (~30) + Channel-Switch übersetzen.
- Größer + berührt die Notification-Infra → separater Spec/PR nach Track A.

## 5 · Risiken / Offene Punkte
- **D1** (JSONB vs Tabelle) + **D2** (Cookie vs Case-sprache) + **D3**: Track-A-only zuerst, Track B separat — bitte bestätigen.
- `onboarding_felder.optionen` enthält user-sichtbare Labels → müssen mitübersetzt werden (im `i18n`-Blob). Struktur der `optionen` vor Reader-Umbau final verifizieren.
- Migration NUR via Supabase-Plugin (Regel 2). DB ist shared → vor Reader-Deploy Spalte additiv, Reader mit de-Fallback (kein Breaking).
- Kollisions-Check vor Start: `onboarding_phasen/felder` + `load-needed-phases.ts` + `WizardClient` — aktuell keine andere Session dort (Sprint-1 = Content-MDX). Live nachprüfen.

## 6 · Vorgeschlagene Reihenfolge
1. **Track A:** Migration (2× `i18n` jsonb) → Reader-Merge (Cookie-Locale, de-Fallback) → Seed-Übersetzung 5 Locales → Build + Wizard-Smoke de/en/ar → PR `--base staging`.
2. **Track B:** eigener Spec (Locale-Plumbing) → PR.
