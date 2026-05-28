# Phase 2 / Track A — Wizard-Config i18n (Doc 48)

Datum: 2026-05-28
Branch: `kitta/i18n-phase2-wizard` → PR gegen `staging`

## Ziel

Die dynamische Wizard-Konfiguration (`onboarding_phasen` / `onboarding_felder`)
liegt als DB-Content vor und war bisher nur Deutsch. Track A macht die
nutzersichtbaren Wizard-Strings (Phasen-Titel/Eyebrow/Beschreibung,
Feld-Label/Hint/Placeholder, Options-Label/Description) übersetzbar für die
5 Nicht-de-Locales des Cookie-Switchers (`claimondo-locale`): en, tr, ar, ru, pl.

Out of scope (separat): Track B (Notification-Templates), Content-MDX
(Architektur-Entscheidung URL-Prefix vs. Cookie offen).

## Architektur

JSONB-`i18n`-Spalte additiv auf beiden Tabellen. **de bleibt in den
Basis-Spalten** (`titel`/`label`/…) = Fallback. Reader merged pro Feld:
fehlt eine Übersetzung, greift der de-Wert.

- Migration 1 (`20260528175439_onboarding_i18n_columns`): `ADD COLUMN i18n jsonb`
  auf beiden Tabellen, nullable, additiv. RLS unverändert (public-read deckt ab).
- Migration 2 (`20260528183021_onboarding_i18n_seed`): 28 `UPDATE`s (10 Phasen +
  18 Felder), Übersetzungen für en/tr/ar/ru/pl. Keyed by stabilen
  `flow_key`/`phase_key`/`feld_key` (nicht by id).
- Migration 3 (`20260528183452_onboarding_i18n_seed_fix_dsgvo_pl`): Korrektur,
  siehe Incident unten.
- `src/lib/onboarding/localize.ts`: pure `localizePhase` / `localizeFeld`
  (de → base; sonst locale-override mit Feld-für-Feld-Fallback; Optionen by
  `value`).
- `DynamicWizard.tsx` + `load-needed-phases.ts`: `getLocale()` (next-intl/server,
  liest Cookie) + `i18n` in den Selects + `localize*` im Map. Untypisierter
  Supabase-Client → keine Type-Regen nötig.

Übersetzungen: programmatisch per Subagent generiert (verbatim Tokens
unangetastet: LexDrive, Köln, WhatsApp, 0 EUR, +49 151 12345678,
max@beispiel.de, Max/Mustermann, SA, §249 BGB).

## Incident: Homoglyph-Korruption beim Seed (gefangen + gefixt)

Der 34-KB-Seed wurde von Hand in `apply_migration` transkribiert. Dabei ist in
**genau einem** Feld (`dsgvo_onboarding`, pl-Label) ein kyrillisches Homoglyph
(а/о/д statt lateinisch a/o/d) reingerutscht.

Erkennung (mehrstufig, empirisch — nichts geglaubt, alles geprüft):
1. Gezielter SQL-Check: `i18n->>'pl'|'en'|'tr' ~ '[А-Яа-яЁё]'` → 1 Treffer.
2. `verify-wizard-i18n.mjs`: order-insensitiver Deep-Compare DB ↔ Clean-JSON
   (jsonb reordert Keys → erst kanonisieren, dann vergleichen). Bestätigte:
   **1 von 28** Rows betroffen, 27 byte-identisch.
3. Fix maschinell aus Clean-JSON generiert (kein erneutes Hand-Tippen), als
   Migration 3 appliziert.
4. Re-Verify: **DIFFS: 0**. Plus File-Level-Check: Seed-File ↔ JSON =
   28 statements, 0 mismatches.

Reproduzierbarkeit: das committete Seed-File ist clean; `db reset` spielt
Seed (korrekt) → Fix (No-op) = korrekter Endzustand.

## Build

`npm run build` (worktree): Compiled ✓ (45s), **TypeScript ✓ (81s, 0 Fehler)**,
338/338 static pages, Exit 0.

## Smoke (de/en/ar, /gutachter-finden, Screenshots)

Lokaler `next dev` + Playwright, Cookie `claimondo-locale` gesetzt. Screenshots
in `smoke-wizard-shots/` (nicht committet).

| Locale | dir | Wizard-Titel (Phase „standort") | Ergebnis |
|---|---|---|---|
| de | ltr | „Wo steht das Fahrzeug?" (Basis) | ✓ kein en/ar-Leak |
| en | ltr | „Where is the vehicle located?" | ✓ |
| ar | **rtl** | „أين تقع المركبة؟" | ✓ Layout gespiegelt |

`appError=false` für alle (kein `wizard_fehler_laden`, kein Crash). Beweiskette:
Cookie → getLocale → Loader → localize → DB-i18n (de-Fallback) → gerenderte UI.

Hinweis: Der „Step X of Y"-Eyebrow wird in dieser Sidebar-Variante nicht als
sichtbarer Text gerendert (auch de zeigt kein „Schritt 1") — kein
i18n-Bug, der Titel ist der entscheidende Beweis. Das „8 BGH-Urteile"-Banner
unter der Karte ist ein separater Content-Block (nicht Track A).

## 7-Punkte-Audit

- Build: grün (compile + tsc 0 Fehler + 338 static pages).
- UI-Erreichbarkeit: `/gutachter-finden` (public) + `/kunde/onboarding-details`
  (auth) mounten `DynamicWizard` — kein neuer Einstiegspunkt nötig.
- Redundanz: `localize*` als Shared-Util, von beiden Loadern genutzt (keine
  Duplikation).
- Dead-Code: keiner; Temp-Scripts (build/verify/smoke) nicht committet.
- Spec-Treue: Track A = Wizard-Config i18n, de-Fallback. Track B/Content-MDX
  bewusst draußen.
- Inkonsistenz: Umlaute ok; Result-Pattern n/a (kein Server-Action-Change);
  Nested-FK via `Array.isArray`-Norm beibehalten.
- Regression: rein additive Spalte + de-Fallback → de-Pfad unverändert; en/ar
  empirisch gesmoket; kein RLS-/Auth-Change.
