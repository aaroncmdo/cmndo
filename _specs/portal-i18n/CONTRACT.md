# CONTRACT — Portal-i18n Welle 1

**Format pro Funktion:** F-XX → INPUT → AKTION → ERGEBNIS → AKZEPTANZ → Welle

Streams: A=Resolution-Kern · B=Persistenz/Wechsel · C=Formatting · D=String-Extraktion · E=Falldaten-MT · F=Tests/Guardrails

---

## STREAM A — Locale-Resolution-Kern

### F-01: `classifyLocaleSource(pathname)` + Route-Taxonomie
**Datei:** `src/i18n/locale-source.ts` (neu)
**INPUT:** `pathname: string | null`
**AKTION:** Reine Funktion, klassifiziert die Route:
- Token-Routen (Prefix-Match): `/flow/`, `/upload/dokumente/`, `/upload/zb1/`, `/kunde/re-termin/`, `/ablehnen/`, `/kunde-termin`, `/kunde/termin`, `/sv` → `'token'`
- Auth-Profil-Routen (Welle 1): `/kunde` (aber NICHT die Token-Sub-Routen `/kunde/re-termin`, `/kunde/termin`) → `'profile'`
- sonst (inkl. `null`, Marketing, `/login`) → `'cookie'`
Plus Export `extractTokenFromPath(pathname)` → `{ kind: 'flow'|'upload-dokumente'|'upload-zb1'|'re-termin'|'ablehnen', token: string } | null`.
**ERGEBNIS:** `LocaleSource = 'cookie' | 'profile' | 'token'`
**AKZEPTANZ:**
- `/kunde/re-termin/abc` → `'token'` (Token-Match hat Vorrang vor `/kunde`)
- `/kunde/dashboard` → `'profile'`
- `/` , `/login`, `/faq` → `'cookie'`
- Reine Funktion, keine Imports aus `next/headers` (testbar ohne Request-Kontext)
**Welle:** 1

### F-02: `resolveUserLocale()`
**Datei:** `src/i18n/resolve-locale.ts` (neu)
**INPUT:** keine (nutzt Request-Kontext)
**AKTION:** In React `cache()` gewrappt. Erstellt Supabase-Server-Client (`src/lib/supabase/server.ts` `createClient()`), `auth.getUser()`; bei User: `select('sprache').from('profiles').eq('id', user.id).single()`. Ergebnis durch `normalizeToLocale()`.
**ERGEBNIS:** `Promise<Locale | null>` (null = kein User / keine/ungültige Sprache → Caller fällt auf Cookie zurück)
**AKZEPTANZ:**
- Bei fehlendem User → `null`, kein Throw
- `cache()` greift: zwei Aufrufe im selben Request = ein DB-Read
- Liest **nur** `sprache` (kein `select('*')`)
**Welle:** 1

### F-03: `resolveLocaleFromToken(pathname)`
**Datei:** `src/i18n/resolve-locale.ts` (neu)
**INPUT:** `pathname: string`
**AKTION:** `extractTokenFromPath()` (F-01); je nach `kind` den passenden FK-Pfad gehen (spiegelt `src/lib/branding/token-theme.ts`):
- `flow` → `flow_links.token` → `flow_links.sprache` (direkt) bzw. `→ lead_id → leads.sprache`
- `upload-dokumente` → `dokument_upload_anfragen.token → lead_id → leads.sprache`
- `upload-zb1` → `leads.zb1_token → leads.sprache`
- `re-termin` / `ablehnen` → entsprechender Token→Lead-Pfad
Ergebnis durch `normalizeToLocale()`. In `cache()` gewrappt.
**ERGEBNIS:** `Promise<Locale | null>`
**AKZEPTANZ:**
- Unbekannter/abgelaufener Token → `null`, kein Throw
- Nutzt service-role NICHT zwingend nötig (Token-Lookup ist public-readable wie beim Branding); konsistent zu `token-theme.ts`-Pattern
- `flow_links.sprache` Werteformat vorab live geprüft (CONTEXT §2)
**Welle:** 1 (Logik) / 4 (End-to-End-Verifikation mit echten Tokens)

### F-04: `request.ts` source-aware Orchestrierung
**Datei:** `src/i18n/request.ts` (erweitern)
**INPUT:** keine (getRequestConfig)
**AKTION:**
```ts
const hdrs = await headers()
const pathname = hdrs.get('x-pathname')
const source = classifyLocaleSource(pathname)
let resolved: Locale | null = null
if (source === 'profile') resolved = await resolveUserLocale()
else if (source === 'token' && pathname) resolved = await resolveLocaleFromToken(pathname)
const cookieLocale = isLocale(cookieVal) ? cookieVal : null
const locale = resolved ?? cookieLocale ?? DEFAULT_LOCALE
const messages = (await import(`./messages/${locale}.json`)).default
return { locale, messages }
```
**ERGEBNIS:** `{ locale, messages }` mit korrekter Quelle je Route
**AKZEPTANZ:**
- Marketing/`/login`: identisch zu heute (nur Cookie)
- DB-Reads ausschließlich bei `source !== 'cookie'`
- Jeder Fehlerpfad → Cookie → `de`, nie Crash
**Welle:** 1

### F-05: `x-pathname`-Garantie in der Middleware
**Datei:** `src/lib/supabase/middleware.ts` (erweitern)
**INPUT:** —
**AKTION:** Sicherstellen, dass `requestHeaders.set('x-pathname', request.nextUrl.pathname)` **vor** dem Public-Path-Early-Return liegt und über **beide** Return-Pfade durchgereicht wird (`NextResponse.next({ request: { headers: requestHeaders }})`).
**ERGEBNIS:** `x-pathname` auf allen Routen verfügbar
**AKZEPTANZ:**
- Auf einer Public-Route ist `x-pathname` im Server-Context lesbar
- Keine Änderung am Auth-/2FA-/Subdomain-Verhalten
**Welle:** 1

---

## STREAM B — Persistenz & Wechsel

### F-10: Migration `profiles.sprache`
**Datei:** `supabase/migrations/<ts>_add_profiles_sprache.sql` (siehe DB_MIGRATION.md)
**INPUT:** —
**AKTION:** `ALTER TABLE profiles ADD COLUMN sprache text` mit `CHECK (sprache IN ('de','en','tr','ar','ru','pl'))`, nullable, kein Default. Danach `npx supabase db push`, dann `npm run` Typegen (oder MCP `generate_typescript_types`) → `database.types.ts` aktualisieren.
**ERGEBNIS:** Spalte live, Types kennen `sprache: string | null` auf `profiles`
**AKZEPTANZ:**
- CHECK greift (Insert mit `'xx'` schlägt fehl)
- Bestehende Zeilen → `null`
- Type-Regen NICHT manuell strippen (Memory: Types=DB)
**Welle:** 1

### F-11: Stille Sprach-Vorbelegung bei Account-Erstellung
**Datei:** `src/app/flow/[token]/actions.ts` (`finalizeKundeSetup`, erweitern)
**INPUT:** bestehende Account-Daten + Lead-Kontext (Token → Lead bereits aufgelöst)
**AKTION:** Lead-`sprache` ermitteln (aus dem schon geladenen Lead/flow_link), durch `normalizeToLocale()`; beim `profiles`-Upsert `sprache` mitsetzen (nur wenn valide, sonst weglassen → bleibt `null`).
**ERGEBNIS:** Neuer Kunde hat `profiles.sprache` = Lead-Sprache (falls vorhanden)
**AKZEPTANZ:**
- Lead ohne/mit ungültiger Sprache → `profiles.sprache = null` (kein Crash)
- Kein zusätzlicher Onboarding-UI-Schritt
- Server-Action-Result-Shape unverändert
**Welle:** 2

### F-12: `setLocaleAction` schreibt `profiles.sprache` für eingeloggte Nutzer
**Datei:** `src/lib/actions/set-locale.ts` (erweitern)
**INPUT:** `newLocale: string`
**AKTION:** Wie bisher Cookie setzen. Zusätzlich: `auth.getUser()`; bei User `update profiles set sprache = newLocale where id = user.id`. `revalidatePath('/', 'layout')` bleibt.
**ERGEBNIS:** `{ success: boolean; locale: Locale; error?: string }` (Signatur unverändert)
**AKZEPTANZ:**
- Anonym → nur Cookie (heutiges Verhalten)
- Eingeloggt → Cookie **und** DB; DB-Fehler bricht den Cookie-Wechsel nicht (try/catch um DB-Write, Cookie gewinnt fürs UX)
- Bestehende `LanguageSwitcher`-Aufrufe funktionieren unverändert
**Welle:** 2

### F-13: `LanguageSwitcher` im Kunde-Portal + Magic-Link-Headern
**Datei:** `src/app/kunde/layout.tsx` (bzw. Kunde-Shell) + Magic-Link-Page-Header (`/flow`, `/upload/*`) (erweitern)
**INPUT:** —
**AKTION:** Bestehenden `src/components/shared/LanguageSwitcher.tsx` an sichtbarer Stelle einhängen (Header/Topbar des Kunde-Portals; in Magic-Link-Strecken neben/statt dem `SprachBanner`).
**ERGEBNIS:** Kunde kann Sprache jederzeit wechseln; Wechsel persistiert (F-12)
**AKZEPTANZ:**
- Sichtbar für Rolle Kunde (UI-Erreichbarkeit, AGENTS.md Audit-Punkt 2)
- Auf Magic-Link-Routen wechselt der Switcher die Token-Locale-Anzeige (Cookie als Override für die anonyme Session)
**Welle:** 2

---

## STREAM C — Formatting

### F-20: Locale-aware Format-Helfer
**Datei:** `src/lib/i18n/format.ts` (neu)
**INPUT:** Wert + Locale (bzw. via next-intl `getFormatter`/`useFormatter`)
**AKTION:** `formatCurrency(value: number, locale: Locale)` (EUR), `formatDate(date, locale)`, `formatDateTime(date, locale)`. Intern `Intl.NumberFormat(localeToBcp47(locale), …)` / `Intl.DateTimeFormat`. `localeToBcp47`: `de→de-DE, en→en-GB, tr→tr-TR, ar→ar, ru→ru-RU, pl→pl-PL`.
**ERGEBNIS:** lokalisierte Strings
**AKZEPTANZ:**
- `formatCurrency(1234.5,'de')` → `1.234,50 €`; `(…, 'en')` → englisches Format
- Server- UND Client-nutzbar (reine Funktion + Intl)
**Welle:** 3

### F-21: `de-DE`-Sweep in Welle-1-Oberflächen
**Dateien:** Kunde-Portal + Magic-Link-Komponenten mit `Intl.NumberFormat('de-DE')` / `toLocaleDateString('de-DE')` / date-fns `{locale: de}`
**INPUT:** —
**AKTION:** Harte `de-DE`-Aufrufe in den Welle-1-Flächen durch F-20-Helfer mit aktiver Locale ersetzen. Interne Portale + Emails/PDFs **nicht** anfassen.
**ERGEBNIS:** Kundensichtbare Zahlen/Daten in der Nutzer-Locale
**AKZEPTANZ:**
- Kein verbleibender `de-DE`-Literal in `src/app/kunde/**`, `src/app/flow/**`, `src/app/upload/**` (grep)
- `git status`: keine Edits außerhalb der Welle-1-Flächen
**Welle:** 3

---

## STREAM D — String-Extraktion

### F-30: Message-Namespaces scaffolden
**Datei:** `src/i18n/messages/{de,en,tr,ar,ru,pl}.json` (erweitern)
**INPUT:** —
**AKTION:** Neue Top-Level-Namespaces in **allen 6** Files anlegen: `common` (Buttons/Status/generische Labels), `kunde`, `onboarding`, `flow`, `upload`. Initial nur in `de.json` mit echten Strings; die 5 anderen via Pipeline (F-35).
**ERGEBNIS:** Namespace-Gerüst
**AKZEPTANZ:** `de.json` valides JSON, Namespaces existieren in allen 6 Files (auch wenn anfangs DE-Fallback)
**Welle:** 3

### F-31: Kunde-Portal-Strings → Keys
**Dateien:** `src/app/kunde/**` (61 Files), kundensichtbare shared Components
**INPUT:** —
**AKTION:** Inline-Deutsch (JSX-Text, Button-/Labels, `toast.*`, Server-Action-`error:`-Strings) → `t('kunde.<section>.<element>')`. Server-Komponenten `getTranslations`, Client `useTranslations`.
**ERGEBNIS:** Kunde-Portal sprachschaltbar
**AKZEPTANZ:**
- Keine sichtbaren deutschen Hardcodes mehr in `/kunde` bei Locale `en` (Smoke)
- `KundeTrackingClient`-Status etc. aus Catalog
**Welle:** 3

### F-32: Onboarding-Wizard-Strings → Keys
**Datei:** `src/app/kunde/onboarding/OnboardingWizard.tsx` + Sub-Components
**INPUT:** —
**AKTION:** Step-Labels (`Willkommen/Ihr Fall/Termin/Dokumente/Fertig`), `KATEGORIE_LABELS`, `DOC_INFO` (warum/wo-Texte) → `onboarding.*`-Keys.
**ERGEBNIS:** Wizard vollständig lokalisiert
**AKZEPTANZ:** Alle 5 Steps + Doc-Erklärungen in `en`/`tr` korrekt; Emojis bleiben
**Welle:** 3

### F-33: Magic-Link-Strecken-Strings → Keys
**Dateien:** `src/app/flow/[token]/**` (FlowWizardKfz etc.), `src/app/upload/dokumente/[token]/**`, `src/app/upload/zb1/[token]/**`
**INPUT:** —
**AKTION:** Inline-Deutsch → `flow.*` / `upload.*`-Keys. `SprachBanner`-Verhältnis klären (Switcher übernimmt; Banner ggf. nur noch Hinweis).
**ERGEBNIS:** Magic-Link-Strecken lokalisiert, Locale aus Token (F-03)
**AKZEPTANZ:** `/flow/<token>` eines TR-Leads rendert türkisch ohne Cookie
**Welle:** 4

### F-34: Label-/Enum-Maps → Catalog
**Dateien:** kundensichtbare Maps (`KATEGORIE_LABELS`, `DOC_INFO`, Status-Label-Maps in Kunde-Flächen)
**INPUT:** —
**AKTION:** User-sichtbare Label-Maps in den Catalog verschieben (Key statt Inline-String). Backend-Enum-**Werte** (DB-Status-Codes) bleiben unangetastet — nur deren **Anzeige** wird lokalisiert.
**ERGEBNIS:** Status/Kategorien lokalisiert, DB-Werte stabil
**AKZEPTANZ:** DB-Status-String unverändert; Anzeige folgt Locale
**Welle:** 3

### F-35: Übersetzungs-Pipeline-Lauf + Glossar
**Dateien:** `scripts/i18n/translate.mjs` (nutzen), `scripts/i18n/glossary.md` (ggf. erweitern), `messages/*.json`
**INPUT:** neue `de.json`-Keys
**AKTION:** `npm run i18n:translate` (incremental) → füllt `en/tr/ar/ru/pl`. Neue App-Fachbegriffe ins Glossar. Juristisch/finanziell sensible Strings → manueller Review-Vermerk.
**ERGEBNIS:** alle 6 Locales gefüllt für die Welle-Flächen
**AKZEPTANZ:** kein `de`-Wert in `tr.json` für neue Keys (außer bewusst beibehaltene Fachbegriffe laut Glossar)
**Welle:** 3 (Kunde/Onboarding) + 4 (Flow/Upload)

---

## STREAM E — Falldaten-Maschinenübersetzung

### F-40: Migration `content_translations` (content-adressierter Cache)
**Datei:** `supabase/migrations/<ts>_content_translations.sql` (siehe DB_MIGRATION.md)
**INPUT:** —
**AKTION:** Tabelle mit `(source_hash text, target_locale text, translated_text text, provider text, model text, source_table text null, source_id text null, field text null, erstellt_am timestamptz default now())`, `UNIQUE(source_hash, target_locale)`. RLS aktiv, **keine** Client-Policies (Zugriff nur service-role, B6).
**ERGEBNIS:** Cache-Tabelle live
**AKZEPTANZ:** Authenticated-Client kann ohne Policy nicht direkt lesen/schreiben; Unique greift
**Welle:** 1 (Migration zusammen mit F-10 batchen)

### F-41: `translateContent` Server-Action
**Datei:** `src/lib/i18n/translate-content.ts` (neu, `'use server'`)
**INPUT:** `sourceText: string`, `targetLocale: Locale`, `meta?: { table?: string; id?: string; field?: string }`
**AKTION:**
1. `targetLocale === 'de'` (Quellsprache) → `{ ok: true, text: sourceText, cached: true }`.
2. `hash = sha256(sourceText)`.
3. service-role-Client: Cache-Lookup `(hash, targetLocale)`. Hit → zurück.
4. Miss → Anthropic-Aufruf (Glossar-System-Prompt analog `translate.mjs`, `claude-sonnet-4-6`) → Übersetzung.
5. Insert in `content_translations` (service-role), `provider='anthropic'`.
6. Rückgabe `{ ok: true, text, cached: false }`. Fehler → `{ ok: false, error }` (kein Throw).
**ERGEBNIS:** `{ ok: true; text: string; cached: boolean } | { ok: false; error: string }`
**AKZEPTANZ:**
- Zweiter Aufruf gleichen Texts/Locale = Cache-Hit (kein Anthropic-Call — via Spy testbar)
- Anthropic-Down → `{ ok:false }`, Caller zeigt Original
- Key nur server-seitig
**Welle:** 5

### F-42: `TranslatableText`-Komponente
**Datei:** `src/components/i18n/TranslatableText.tsx` (neu, `'use client'`)
**INPUT:** `props: { text: string; sourceLocale?: Locale; meta?: {...} }` + aktive Viewer-Locale (via `useLocale()`)
**AKTION:** Rendert `text`. Wenn Viewer-Locale ≠ `sourceLocale` (default `'de'`): Button „Übersetzen" → ruft `translateContent` → zeigt Übersetzung + Label „Automatisch übersetzt · Original anzeigen" (Toggle zurück zum Original). Zustand lokal gecacht.
**ERGEBNIS:** Inline-Übersetzungs-Toggle, klar gekennzeichnet
**AKZEPTANZ:**
- Original immer 1 Klick entfernt
- Loading-/Fehlerzustand (Fehler → Original bleibt sichtbar)
- Label-String aus `common.*`-Catalog (selbst lokalisiert)
**Welle:** 5

### F-43: `TranslatableText` in kundensichtbare Freitexte einhängen
**Dateien:** Chat-/Nachrichten-Render (`nachrichten` / MultiChannelChat — exakten Pfad bei Umsetzung verifizieren), Fall-Notizen, kundeneingegebene Beschreibungen, Status-Kommentare im Kunde-Portal
**INPUT:** —
**AKTION:** Freitext-Felder durch `TranslatableText` wrappen. **NICHT** in generierte rechtliche Dokumente/PDFs/SA (B1).
**ERGEBNIS:** Kunde kann fremdsprachige Falldaten on-demand übersetzen lassen
**AKZEPTANZ:**
- Chat-DE-Nachricht, Viewer `tr` → Toggle funktioniert
- Kein `TranslatableText` in PDF-/SA-Render-Pfaden (grep)
**Welle:** 5

---

## STREAM F — Tests & Guardrails

### F-50: Unit-Tests
**Dateien:** `src/i18n/__tests__/*.test.ts`, `src/lib/i18n/__tests__/*.test.ts`
**AKTION:** Tests für: `classifyLocaleSource` (Route-Matrix inkl. `/kunde/re-termin`→token), `normalizeToLocale` (Codes + Aliase + Müll→null), Auflösungs-Kaskade (profile→cookie→default), `formatCurrency/Date` pro Locale, `translateContent` Cache-Hit/Miss + Hash-Stabilität.
**ERGEBNIS:** grüne Vitest-Suite
**AKZEPTANZ:** Branch-Coverage der neuen Resolver/Format/Cache-Logik; bestehende Tests grün
**Welle:** 1 (Resolution) + begleitend je Stream

### F-51: i18n-Smoke Kunde + Magic-Link
**Datei:** `scripts/smoke/kunde-i18n-smoke.mjs` (neu, Muster: `marketing-i18n-smoke.mjs`)
**AKTION:** Playwright; Kunde-Portal (Test-User), `/flow/<token>`, `/upload/*` in allen 6 Locales; prüft: keine `MISSING_MESSAGE`, keine unaufgelösten `{vars}`, positive Marker-Strings je Sprache, `dir="rtl"` für `ar`, `lang`-Attribut. **Screenshot je Sprache + Auswertung im selben Turn** (Memory-Pflicht).
**ERGEBNIS:** Smoke-Report + Screenshots
**AKZEPTANZ:** alle 6 Sprachen grün, RTL korrekt; läuft gegen `app.staging.claimondo.de` (Memory: nur staging smoken)
**Welle:** 6

### F-52: CI-Gate fehlende Keys
**Dateien:** `scripts/i18n/` (collectMissing-Logik nutzen), CI-Config
**AKTION:** Script, das `messages/*.json` gegen `de.json` prüft und bei fehlenden Keys (echte Lücken, nicht bewusste Fachbegriffe) fehlschlägt. Als CI-Step verdrahten (analog `check:token-audit`).
**ERGEBNIS:** PRs mit Key-Lücken brechen
**AKZEPTANZ:** künstlich entfernter Key → CI rot
**Welle:** 6

---

## Welle-Zuordnung Zusammenfassung

| Welle | Inhalt | Funktionen |
|---|---|---|
| 0 | Kontext laden + DB-Wertecheck `leads.sprache` | (kein Code) |
| 1 | Resolution-Kern + beide Migrationen + Unit-Tests-Basis | F-01, F-02, F-03, F-04, F-05, F-10, F-40, F-50 (Resolution) |
| 2 | Persistenz & Wechsel | F-11, F-12, F-13 |
| 3 | Kunde-Portal + Onboarding extrahieren + Formatting | F-20, F-21, F-30, F-31, F-32, F-34, F-35 (Kunde) |
| 4 | Magic-Link extrahieren + Token-Locale End-to-End | F-33, F-35 (Flow/Upload), F-03-Verifikation |
| 5 | Falldaten-MT | F-41, F-42, F-43 |
| 6 | Smoke + CI-Gate + Polish (RTL, Formatting-Sweep-Recheck) | F-51, F-52, F-21-Recheck |
