# WELLEN_PLAN — Portal-i18n Welle 1

**Zweck:** Copy-Paste-Prompts für Claude Code, ein Block pro Welle. Nach jeder Welle: Build-Gate + Test + Commit + Freigabe.

**Branch:** `kitta/aar-<nr>-portal-i18n-kunde` (Linear-Ticket anlegen). PR **immer gegen `staging`** (Memory `pr_gegen_staging`). Nie direct-push `main` (Regel 1).

**Reihenfolge:** strikt sequenziell. Welle 0 Pflicht. Migrationen (W1) zuerst, sonst brechen Reader.

---

## Welle 0 — Kontext laden (KEIN CODE)

```
Du arbeitest am Claimondo-Repo (Branch kitta/aar-<nr>-portal-i18n-kunde).
Lies in dieser Reihenfolge:
1. _specs/portal-i18n/CONTEXT.md
2. _specs/portal-i18n/CONTRACT.md
3. _specs/portal-i18n/DB_MIGRATION.md
4. _specs/portal-i18n/WELLEN_PLAN.md
5. src/i18n/request.ts, src/i18n/locales.ts, src/lib/actions/set-locale.ts
6. src/lib/supabase/middleware.ts (x-pathname), src/proxy.ts (Route-Taxonomie)
7. src/lib/branding/token-theme.ts (Token-Trace-Vorbild für F-03)
8. src/app/flow/[token]/page.tsx + actions.ts (Lead/flow_link, finalizeKundeSetup)
9. src/components/shared/LanguageSwitcher.tsx, src/components/i18n/SprachBanner.tsx
10. scripts/i18n/translate.mjs + scripts/i18n/glossary.md

DANN — KEIN Code — beantworte:
1. 5-Satz-Zusammenfassung des Ziels von Welle 1.
2. Live-DB-Check ausführen (DB_MIGRATION.md §oben): Werteformat von leads.sprache + flow_links.sprache. Welche Werte kommen real vor? (steuert normalizeToLocale)
3. Existiert schon ein service-role-Supabase-Helper? (grep) Pfad nennen oder „muss neu".
4. Existiert profiles.sprache / content_translations schon? (information_schema live)
5. Eine Frage, falls etwas widersprüchlich ist.

STOPP. Warte auf Freigabe für Welle 1.
```

**DoD:** DB-Wertecheck dokumentiert, Freigabe erteilt.

---

## Welle 1 — Resolution-Kern + Migrationen

**Referenz CONTRACT:** F-01, F-02, F-03, F-04, F-05, F-10, F-40, F-50 (Resolution)

```
WELLE 1 — Locale-Resolution-Kern + Migrationen. Referenz CONTRACT F-01..05, F-10, F-40, F-50.

MIGRATIONEN ZUERST (DB_MIGRATION.md, via Supabase-Plugin apply_migration — NICHT CLI db push, NICHT raw execute_sql-DDL):
A. apply_migration({ name: 'add_profiles_sprache', query: <SQL Migration 1> }).
B. apply_migration({ name: 'content_translations', query: <SQL Migration 2> }).
C. list_migrations → die je vergebene Version <V> ablesen; File supabase/migrations/<V>_<name>.sql committen (Dateiname == getrackte Version, Twin-Drift-Schutz).
D. Types via generate_typescript_types (oder aufschieben). NICHT manuell strippen.
E. Empirisch proben (execute_sql READ): SELECT auf beide Objekte; CHECK testen (Insert 'xx' muss fehlschlagen).

CODE:
E. src/i18n/locale-source.ts (F-01): classifyLocaleSource(pathname) + extractTokenFromPath(pathname). Reine Funktionen, KEINE next/headers-Imports. Token-Routen-Prefixe exakt aus CONTRACT F-01. /kunde/re-termin + /kunde/termin müssen 'token' liefern (Vorrang vor /kunde='profile').
F. src/i18n/resolve-locale.ts (F-02/F-03): normalizeToLocale(value) (nutzt isLocale + Alias-Map aus dem realen DB-Wertebereich von Welle 0), resolveUserLocale() (cache(), createClient, getUser, select('sprache')), resolveLocaleFromToken(pathname) (cache(), Token→Lead-FK-Trace analog token-theme.ts). Jeder Fehlerpfad → null, kein Throw.
G. src/i18n/request.ts (F-04): source-aware Orchestrierung exakt wie CONTRACT F-04 Snippet. DB-Read nur bei source !== 'cookie'. Fallback resolved → cookie → DEFAULT_LOCALE.
H. src/lib/supabase/middleware.ts (F-05): x-pathname garantiert vor dem Public-Path-Early-Return setzen + über beide Returns durchreichen. Auth/2FA/Subdomain unverändert.
I. Tests (F-50): src/i18n/__tests__/locale-source.test.ts (Route-Matrix), resolve-locale.test.ts (normalizeToLocale + Kaskade mit gemocktem Supabase). Vitest.

REGELN:
- next.config.ts NICHT anfassen (kein URL-Prefix). src/proxy.ts NICHT anfassen.
- Marketing/login-Verhalten muss identisch bleiben (nur Cookie-Pfad).
- Server-Actions/Reads error-geguarded, nie Crash auf kritischem request.ts-Pfad.

TESTS:
- npm run build grün (voller Build).
- npm test grün (neue + bestehende).
- Manuell: Marketing-Page lädt unverändert; /kunde (eingeloggter Test-User mit profiles.sprache='en') rendert englische Marketing-/shared-Strings (sofern schon gekeyed) bzw. zumindest locale='en' im html-lang.

COMMIT: feat(AAR-<nr>): Portal-i18n W1 — source-aware Locale-Resolution + profiles.sprache + content_translations
(Audit-Block laut AGENTS.md anhängen.)

Arbeite autonom, fixe Fehler selbst, melde dich erst wenn implementiert + getestet.
```

---

## Welle 2 — Persistenz & Wechsel

**Referenz CONTRACT:** F-11, F-12, F-13

```
WELLE 2 — Sprach-Persistenz & Switcher. Referenz CONTRACT F-11, F-12, F-13.

A. src/app/flow/[token]/actions.ts — finalizeKundeSetup (F-11): Lead-sprache (schon geladen) durch normalizeToLocale; beim profiles-Upsert sprache mitsetzen, nur wenn valide. Ungültig/fehlend → weglassen (bleibt null). Result-Shape unverändert.
B. src/lib/actions/set-locale.ts (F-12): zusätzlich zum Cookie bei eingeloggtem User profiles.sprache updaten (try/catch um DB-Write; Cookie gewinnt fürs UX). revalidatePath('/', 'layout') bleibt.
C. src/app/kunde/layout.tsx bzw. Kunde-Shell + Magic-Link-Header (F-13): LanguageSwitcher (src/components/shared/LanguageSwitcher.tsx) sichtbar einhängen.

REGELN:
- Anonyme Nutzer: set-locale bleibt Cookie-only (heutiges Verhalten).
- LanguageSwitcher-Signatur nicht ändern (andere Consumer).

TESTS:
- npm run build grün.
- Neuer Kunde aus Lead mit sprache='tr' (Test-Lead anlegen) → nach finalizeKundeSetup: SELECT sprache FROM profiles = 'tr' (DB-Verifikation, nicht nur UI).
- Eingeloggt Sprache via Switcher auf 'en' wechseln → SELECT sprache FROM profiles = 'en' UND Cookie = 'en'.

COMMIT: feat(AAR-<nr>): Portal-i18n W2 — stille Lead-Sprach-Vorbelegung + persistenter Switcher
```

---

## Welle 3 — Kunde-Portal + Onboarding + Formatting

**Referenz CONTRACT:** F-20, F-21, F-30, F-31, F-32, F-34, F-35 (Kunde)

```
WELLE 3 — Kunde-Portal + Onboarding extrahieren + Formatting. Referenz CONTRACT F-20, F-21, F-30, F-31, F-32, F-34, F-35.

A. src/lib/i18n/format.ts (F-20): formatCurrency/formatDate/formatDateTime + localeToBcp47. Unit-Test.
B. src/i18n/messages/de.json (F-30): Namespaces common, kunde, onboarding hinzufügen (echte DE-Strings). Gerüst auch in en/tr/ar/ru/pl (vor Pipeline notfalls DE-Fallback, damit kein MISSING_MESSAGE-Crash).
C. src/app/kunde/** (F-31) + kundensichtbare shared Components: Inline-Deutsch → t('kunde.*'). Server: getTranslations; Client: useTranslations. toast.*/Server-Action-error-Strings mit.
D. src/app/kunde/onboarding/OnboardingWizard.tsx + Sub (F-32): Steps, KATEGORIE_LABELS, DOC_INFO → onboarding.*.
E. Label-/Status-Maps (F-34): user-sichtbare Maps → Catalog; DB-Enum-WERTE unangetastet.
F. de-DE-Sweep (F-21): in src/app/kunde/** alle Intl/​toLocale*-Hardcodes auf format.ts mit aktiver Locale umstellen.
G. Pipeline (F-35): neue Fachbegriffe → scripts/i18n/glossary.md; npm run i18n:translate; juristisch/finanziell sensible Strings markieren für manuellen Review.

REGELN:
- NUR src/app/kunde/**, Onboarding, kundensichtbare shared Components + messages/*.json + format.ts + glossary.md anfassen. KEINE internen Portale, KEINE Emails/PDFs.
- Keys nach <area>.<section>.<element>.

TESTS:
- npm run build grün.
- /kunde mit Locale 'en' (Test-User sprache='en'): keine sichtbaren deutschen Hardcodes (Screenshot-Auswertung). 'ar' → dir="rtl".
- grep: kein 'de-DE'-Literal mehr in src/app/kunde/**.

COMMIT: feat(AAR-<nr>): Portal-i18n W3 — Kunde-Portal + Onboarding lokalisiert + locale-aware Formatting
```

---

## Welle 4 — Magic-Link-Strecken + Token-Locale End-to-End

**Referenz CONTRACT:** F-33, F-35 (Flow/Upload), F-03-Verifikation

```
WELLE 4 — Magic-Link lokalisieren + Token-Locale verifizieren. Referenz CONTRACT F-33, F-35, F-03.

A. messages/de.json: Namespaces flow, upload (F-30-Rest).
B. src/app/flow/[token]/** (FlowWizardKfz etc.) (F-33): Inline-Deutsch → flow.*. SprachBanner-Rolle klären (LanguageSwitcher übernimmt aktiven Wechsel; Banner ggf. nur Hinweis oder entfernen).
C. src/app/upload/dokumente/[token]/**, src/app/upload/zb1/[token]/** (F-33): → upload.*.
D. npm run i18n:translate (F-35 Flow/Upload).
E. F-03 End-to-End: echten Test-Token eines Leads mit sprache='tr' öffnen → Strecke rendert türkisch OHNE Cookie. Bei abgelaufenem/ungültigem Token → Fallback de, kein Crash.

REGELN:
- Branding-Token-Trace (token-theme.ts) NICHT verändern — Locale-Trace läuft parallel.
- Kein DE-Fallback-Leak: neue Keys in allen 6 Files.

TESTS:
- npm run build grün.
- /flow/<tr-token> türkisch; /upload/dokumente/<token> lokalisiert; ar → rtl.
- /flow/<invalid> → de, kein Crash.

COMMIT: feat(AAR-<nr>): Portal-i18n W4 — Magic-Link-Strecken lokalisiert + Token-Locale-Auflösung live
```

---

## Welle 5 — Falldaten-Maschinenübersetzung

**Referenz CONTRACT:** F-41, F-42, F-43

```
WELLE 5 — Falldaten-MT (Anzeige-Hilfe). Referenz CONTRACT F-41, F-42, F-43.

A. service-role-Client: existierenden Helper nutzen oder createServiceClient() ergänzen (nur server-seitig, SUPABASE_SERVICE_ROLE_KEY, NIE ins Client-Bundle — Memory use_server_konstanten beachten: Konstanten/Types nicht aus 'use server' exportieren).
B. src/lib/i18n/translate-content.ts (F-41, 'use server'): translateContent(sourceText, targetLocale, meta?). targetLocale='de' → Original. sha256-Hash. Cache-Lookup (service-role) → Hit zurück. Miss → Anthropic (claude-sonnet-4-6, Glossar-System-Prompt analog translate.mjs) → Insert → zurück. Result { ok, text, cached } | { ok:false, error }. Kein Throw.
C. src/components/i18n/TranslatableText.tsx (F-42, 'use client'): useLocale(); wenn ≠ sourceLocale Button „Übersetzen" → translateContent → Anzeige + Label „Automatisch übersetzt · Original anzeigen" (Toggle). Label-Strings aus common.*. Loading/Error → Original sichtbar.
D. Einhängen (F-43): kundensichtbare Freitexte im Kunde-Portal — Chat/nachrichten (MultiChannelChat-Pfad verifizieren), Fall-Notizen, kundeneingegebene Beschreibungen, Status-Kommentare. NICHT in PDF-/SA-/Email-Render-Pfade (B1).

REGELN:
- content_translations NUR via service-role (B6). Anthropic-Key nie clientseitig.
- Original ist SSoT, immer angezeigt/gespeichert; MT nie in rechtliche Dokumente (B1).

TESTS:
- npm run build grün; Unit-Test translateContent Cache-Hit/Miss (Anthropic-Spy: 2. Aufruf = kein Call).
- Manuell: DE-Chat-Nachricht, Viewer tr → Toggle übersetzt; Original-Toggle zeigt DE; 2. Übersetzung = Cache-Hit.
- grep: kein TranslatableText in src/lib/email/**, PDF-Generatoren, SA-Render.

COMMIT: feat(AAR-<nr>): Portal-i18n W5 — On-Demand-Falldaten-Maschinenübersetzung (Anzeige-Hilfe)
```

---

## Welle 6 — Smoke + CI-Gate + Polish

**Referenz CONTRACT:** F-51, F-52, F-21-Recheck

```
WELLE 6 — i18n-Smoke + CI-Gate + Polish. Referenz CONTRACT F-51, F-52.

A. scripts/smoke/kunde-i18n-smoke.mjs (F-51, Muster marketing-i18n-smoke.mjs): Kunde-Portal (Test-User) + /flow/<token> + /upload/* in allen 6 Locales gegen app.staging.claimondo.de. Prüft: keine MISSING_MESSAGE, keine unaufgelösten {vars}, positive Marker je Sprache, dir="rtl" für ar, lang-Attribut. Screenshot je Sprache + Auswertung im selben Turn.
B. CI-Gate (F-52): Script messages/*.json vs de.json (collectMissing-Logik aus translate.mjs wiederverwenden); fehlende echte Keys → exit 1. Als CI-Step (analog check:token-audit) verdrahten.
C. Polish: F-21-Recheck (grep de-DE in flow/upload), RTL-Sichtprüfung ar, LanguageSwitcher-Sichtbarkeit alle Welle-1-Flächen, Marketing-Smoke (marketing-i18n-smoke.mjs) als Regression grün.
D. Smoke-Audit-MD: docs/<DD.MM.YYYY>/portal-i18n-smoke.md mit Befunden + Screenshots (Memory smoke_audit_mds).

TESTS:
- alle 6 Sprachen Kunde + Magic-Link grün (Screenshots).
- Marketing-Smoke grün (Regression B2).
- künstlich entfernter Key → CI rot.

COMMIT: feat(AAR-<nr>): Portal-i18n W6 — i18n-Smoke + Missing-Key-CI-Gate + Polish
```

---

## Notfall-Prompts

### request.ts macht Marketing langsam / ändert Marketing-Verhalten
```
Regression B2/B3 verletzt. Prüfe src/i18n/request.ts: classifyLocaleSource MUSS für Marketing/login 'cookie' liefern → KEIN DB-Read. Nur source 'profile'/'token' dürfen getUser/Token-Trace auslösen. x-pathname fehlt? → Cookie-Pfad. Verifiziere mit einem Marketing-Request: kein Supabase-Call im Log.
```

### Server-Komponente zeigt falsche Sprache trotz Provider
```
Erwartetes Verhalten (E1): nested NextIntlClientProvider re-lokalisiert NUR Client-Komponenten. Wenn eine Server-Komponente falsch lokalisiert ist, liegt es an request.ts (ambient locale), NICHT am Provider. NICHT setRequestLocale einbauen (Race-Risiko). Fix in request.ts-Auflösung.
```

### content_translations vom Client lesbar
```
B6 verletzt. content_translations darf KEINE authenticated/anon-Policies haben. Zugriff nur service-role im Server-Action. Prüfe Migration: ENABLE RLS, keine CREATE POLICY. Prüfe translate-content.ts nutzt service-role-Client, nicht den normalen createClient.
```

### leads.sprache mappt nicht auf Locale
```
normalizeToLocale deckt den realen Wertebereich nicht ab. Führe SELECT DISTINCT sprache FROM leads aus, erweitere die Alias-Map (z.B. 'Deutsch'→'de', 'Türkisch'→'tr'). Unbekannt → null (Fallback), NIE raten.
```

---

## Status-Tracking

| Welle | Start | Ende | Commit-SHA | Reviewer | Status |
|---|---|---|---|---|---|
| 0 | _ | _ | n/a | Aaron | ⬜ |
| 1 | _ | _ | _ | Aaron | ⬜ |
| 2 | _ | _ | _ | Aaron | ⬜ |
| 3 | _ | _ | _ | Aaron | ⬜ |
| 4 | _ | _ | _ | Aaron | ⬜ |
| 5 | _ | _ | _ | Aaron | ⬜ |
| 6 | _ | _ | _ | Aaron | ⬜ |
