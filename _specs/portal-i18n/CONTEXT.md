# CONTEXT — Portal-i18n Welle 1: Kunde-Portal + Magic-Link nutzerbasiert übersetzen

**Spec-Version:** 1.0
**Erstellt:** 2026-05-29
**Vorgänger-Doku:** `docs/i18n-phase-plan.md` (Phase 2 „Gesamte App nutzerbasiert" — diese Spec ist die ausführbare Form davon)
**Grundsatz aus AGENTS.md:** App-Übersetzungen sind **nutzerbasiert** (`profiles.sprache`), Marketing bleibt **cookie-basiert** (`claimondo-locale`).

---

## 0. Worum es geht (Kurzfassung)

Claimondo hat bereits eine produktive i18n-Foundation: **next-intl v4.9.1**, 6 Locales (`de, en, tr, ar, ru, pl`), RTL für Arabisch, ein cookie-getriebener `LanguageSwitcher` und eine **Anthropic-Claude-Übersetzungs-Pipeline** mit Fachbegriff-Glossar (`scripts/i18n/translate.mjs` + `scripts/i18n/glossary.md`). Übersetzt sind aber **nur Marketing-/Landing-Pages**. Jedes authentifizierte Portal hardcodet Deutsch.

Diese Spec übersetzt das **Kunde-Portal + die Magic-Link-Strecken** (`/flow`, `/upload/*`) nutzerbasiert in alle 6 Sprachen, persistiert die Sprache pro Nutzer in einer neuen Spalte `profiles.sprache`, und führt eine **On-Demand-Maschinenübersetzung für Falldaten** (Chat, Notizen, kundensichtbare Freitexte) als klar gekennzeichnete Anzeige-Hilfe ein.

**Bewusst NICHT in dieser Welle:** interne Portale (Admin/Dispatch/Gutachter), Email-Templates, PDFs. Siehe §10.

---

## 1. Was wird gebaut

Sechs zusammenhängende Streams:

1. **Locale-Resolution-Kern:** `src/i18n/request.ts` wird **source-aware** — eine einzige Stelle, die je Route die richtige Quelle wählt:
   - **Magic-Link-Routen** (`/flow/[token]`, `/upload/**/[token]`, `/kunde/re-termin/[token]`, `/ablehnen/[token]`) → Token aus dem Pfad parsen → `flow_links.sprache` / `leads.sprache` (spiegelt die Token-Trace-Logik des Branding-Resolvers in `src/lib/branding/token-theme.ts`).
   - **Authentifiziertes Kunde-Portal** (`/kunde`) → `auth.getUser()` → `profiles.sprache` (in React `cache()` gewrappt, einmal pro Request).
   - **Sonst** (Marketing, `/login`, alles andere) → `claimondo-locale`-Cookie — **unverändert**.

2. **Persistenz & Wechsel:** Neue Spalte `profiles.sprache`. Bei Account-Erstellung wird die Sprache **still aus `leads.sprache` vorbelegt** (kein zusätzlicher Onboarding-Schritt). Im Portal kann der Kunde sie über den bestehenden `LanguageSwitcher` jederzeit ändern.

3. **Locale-aware Formatting:** Helfer `formatCurrency` / `formatDate` / `formatDateTime`, die die aktive Locale nutzen statt hartem `de-DE`. Sweep der `de-DE`-Hardcodes in den Welle-1-Oberflächen.

4. **String-Extraktion:** Alle hardcoded deutschen Strings im Kunde-Portal, Onboarding-Wizard und den Magic-Link-Strecken → next-intl-Keys. Übersetzung via bestehende Claude-Pipeline.

5. **Falldaten-Maschinenübersetzung (voll):** Generischer, content-adressierter Übersetzungs-Cache (`content_translations`) + Server-Action + `TranslatableText`-Komponente. Wird auf **alle kundensichtbaren Freitexte** angewendet (Chat/`nachrichten`, Fall-Notizen, kundeneingegebene Beschreibungen, Status-Kommentare).

6. **Tests & Guardrails:** i18n-Smoke für Kunde-Portal + Magic-Link in allen 6 Sprachen (+ RTL für `ar`), Unit-Tests für Resolver/Format/Cache, CI-Gate gegen fehlende Keys.

---

## 2. Dateizugriff — was darf geändert werden, was nicht

### Neu anzulegen

**Locale-Resolution:**
- `src/i18n/locale-source.ts` — reine Helfer: `classifyLocaleSource(pathname)` → `'cookie' | 'profile' | 'token'`, Route-Taxonomie-Konstanten, Token-Extraktion aus Pfad.
- `src/i18n/resolve-locale.ts` — `resolveUserLocale()` (auth → `profiles.sprache`, `cache()`), `resolveLocaleFromToken(pathname)` (Token → Lead-FK-Trace), `normalizeToLocale(value)` (mappt DB-Werte sicher auf `Locale | null`).

**Formatting:**
- `src/lib/i18n/format.ts` — `formatCurrency(value, locale)`, `formatDate(date, locale)`, `formatDateTime(date, locale)`.

**Falldaten-MT:**
- `src/lib/i18n/translate-content.ts` — `'use server'` Action `translateContent(sourceText, targetLocale, meta?)`; content-adressierter Cache-Lookup + Anthropic-Aufruf mit Glossar-System-Prompt.
- `src/components/i18n/TranslatableText.tsx` — `'use client'` Anzeige-Komponente mit „Automatisch übersetzt · Original anzeigen"-Toggle.

**Tests:**
- `src/i18n/__tests__/locale-source.test.ts`, `src/i18n/__tests__/resolve-locale.test.ts`
- `src/lib/i18n/__tests__/format.test.ts`, `src/lib/i18n/__tests__/translate-content.test.ts`
- `scripts/smoke/kunde-i18n-smoke.mjs` — Playwright-Smoke analog zu `scripts/smoke/marketing-i18n-smoke.mjs`.

**Migrationen (via supabase-CLI, siehe DB_MIGRATION.md):**
- `profiles.sprache` Spalte
- `content_translations` Tabelle

### Erweitern (bestehende Dateien)

- `src/i18n/request.ts` — Orchestrierung source-aware machen (Kern dieser Spec).
- `src/lib/supabase/middleware.ts` — `x-pathname`-Header garantiert **vor** dem Public-Path-Early-Return setzen (Zeile ~33), damit `request.ts` ihn auf ALLEN Routen lesen kann.
- `src/lib/actions/set-locale.ts` — bei eingeloggten Nutzern zusätzlich `profiles.sprache` schreiben + revalidieren; anonym → Cookie-only (unverändert).
- `src/app/flow/[token]/actions.ts` — `finalizeKundeSetup` schreibt `profiles.sprache` aus der Lead-Sprache (still vorbelegt).
- `src/app/kunde/layout.tsx` (bzw. der Kunde-Shell-Consumer) — `LanguageSwitcher` einhängen.
- `src/i18n/messages/{de,en,tr,ar,ru,pl}.json` — neue Namespaces `kunde`, `onboarding`, `flow`, `upload`, `common`.
- Kunde-Portal-, Onboarding- und Magic-Link-Komponenten — Strings → Keys (Liste in CONTRACT Stream D).
- `scripts/i18n/glossary.md` — falls neue Fachbegriffe aus dem App-Kontext auftauchen.

### NICHT anfassen

- `next.config.ts` — **kein** next-intl-URL-Prefix-Mode aktivieren (würde Subdomain-/Proxy-Routing + alle DE-URLs brechen; bewusste AAR-459-Entscheidung).
- `src/proxy.ts` — Subdomain-/Domain-Routing bleibt unverändert (nur `middleware.ts` bekommt die 1-Zeilen-Header-Garantie).
- Marketing-Pages + deren Cookie-Locale-Logik — laufen unverändert weiter.
- Interne Portale `src/app/admin/**`, `src/app/dispatch/**`, `src/app/gutachter/**`, `src/app/faelle/**`, `src/app/kanzlei/**`, `src/app/mitarbeiter/**` — **kein** String-Touch in dieser Welle.
- Email-Templates `src/lib/email/**` und PDF-Generatoren (`abrechnung-pdf.tsx`, `contract-pdf.tsx`, `kanzlei/generate-pdf.tsx`) — separate Welle (§10).
- Bestehende Marketing-Message-Keys — nur ergänzen, nicht umbenennen.

### Heikel — explizite Bestätigung / Live-Check vor Änderung

- `src/i18n/request.ts` — läuft bei **jedem** Server-Render. DB-Reads nur auf authentifizierten/Token-Routen, hart gecacht, mit Cookie→`de`-Fallback. Latenz ist kritischer Pfad (§8 Regel B3).
- `leads.sprache` / `flow_links.sprache` **Werteformat** — vor F-11/F-03 live in der DB prüfen (`SELECT DISTINCT sprache FROM leads`): sind es Codes (`de`, `tr`) oder Klartext (`Deutsch`, `Türkisch`)? `normalizeToLocale` muss den realen Wertebereich abdecken. Siehe `feedback_information_schema_check` (Memory).
- `content_translations` RLS — Zugriff nur via service-role im Server-Action; Clients lesen/schreiben die Tabelle **nicht** direkt (§8 Regel B6).

---

## 3. Tech-Stack & Konventionen

```
FRONTEND:
- Next.js 16.2.1 App Router, React Server Components Standard
- TypeScript strict, keine Inline-Styles für Komponenten (siehe Komponenten-Set-Policy)
- next-intl v4.9.1 (Cookie-basiert für Marketing, profiles.sprache für App — KEIN URL-Prefix)
- Tailwind (claimondo-Tokens), Whitelabel via var(--brand-*)

i18n:
- LOCALES = ['de','en','tr','ar','ru','pl'], DEFAULT_LOCALE = 'de' (src/i18n/locales.ts)
- Server: getTranslations('namespace') aus 'next-intl/server'
- Client: useTranslations('namespace') aus 'next-intl'
- Keys nach Hierarchie: <area>.<section>.<element> (z.B. kunde.dashboard.titel)
- Übersetzungs-Pipeline: npm run i18n:translate (Anthropic claude-sonnet-4-6, incremental, liest glossary.md)

SUPABASE:
- DDL NUR via supabase-CLI-Migration (AGENTS.md Regel 2) — npx supabase migration new + db push
- DB-Spalten snake_case, Code camelCase
- Server-Actions: { ok: boolean; error?: string } (AGENTS.md Server-Actions-Pattern), revalidatePath nicht vergessen

TESTING:
- Vitest (vitest.config.ts), Playwright (playwright.config.ts)
- Smoke-Scripts unter scripts/smoke/, Screenshot-Pflicht bei UI-Smokes (Memory feedback_smoke_screenshot_pflicht)
```

---

## 4. Architektur-Entscheidungen (warum so)

### E1 — Resolution im `request.ts`, NICHT per nested NextIntlClientProvider
Verifiziert (next-intl v4.9.1): ein verschachtelter `NextIntlClientProvider({locale, messages})` re-lokalisiert **nur Client-Komponenten**. Server-Komponenten im Subtree lesen weiter die **ambient** Locale aus `request.ts`. Der Workaround `setRequestLocale`/`setCachedRequestLocale` mutiert einen geteilten Cache zur Render-Zeit → Race-Risiko bei parallelen Renders (vgl. AAR-600-Lektion). **Konsequenz:** Alle Quellen werden zentral in `request.ts` aufgelöst (inkl. Token-Routen über den im Pfad enthaltenen Token). Damit funktionieren `useTranslations()`/`getTranslations()` überall korrekt ohne Per-Page-Verdrahtung.

### E2 — Cookie-Modell bleibt, keine URL-Prefixe
URL-Prefixe (`/de`, `/en`) würden das Subdomain-/Proxy-Routing in `src/proxy.ts` brechen (Prefix müsste vor Domain-Dispatch + `updateSession` gestrippt werden) und widersprechen der bewussten AAR-459-Entscheidung. Cookie + `profiles.sprache` decken den Bedarf vollständig ab.

### E3 — `x-pathname` existiert schon
`src/lib/supabase/middleware.ts` setzt `x-pathname` bereits (~Zeile 33). `request.ts` kann ihn via `headers()` lesen, um die Route zu klassifizieren. Eine 1-Zeilen-Garantie (Header vor dem Public-Path-Early-Return setzen) stellt sicher, dass er auf allen Routen anliegt.

### E4 — Falldaten-MT content-adressiert
Cache-Schlüssel = `(source_hash, target_locale)` mit `source_hash = sha256(sourceText)`. Vorteile: (a) **keine per-Tabelle-RLS** nötig — der Hash ist eine Capability (wer den Hash hat, hat den Quelltext bereits gesehen), (b) **Auto-Invalidierung** bei Edit (neuer Text → neuer Hash). `source_table`/`source_id`/`field` werden nur als nullable Metadaten für Debugging/Cleanup gespeichert, nicht als Zugriffsschlüssel.

### E5 — Übersetzung der App via bestehende Claude-Pipeline
Kein neuer Vendor. `npm run i18n:translate` füllt `en/tr/ar/ru/pl` aus `de` mit Glossar-Enforcement. Juristisch/finanziell sensible Strings bekommen manuellen Review.

---

## 5. State Machine / Locale-Auflösungs-Logik

```
Request kommt rein
  │
  ├─ x-pathname lesen (Fallback: kein Header → Cookie-Pfad)
  │
  ├─ classifyLocaleSource(pathname):
  │     • Token-Route?  → resolveLocaleFromToken(pathname)  → Locale | null
  │     • /kunde (auth)? → resolveUserLocale()              → Locale | null
  │     • sonst          → 'cookie'
  │
  └─ Auflösungs-Kaskade (erste nicht-null gewinnt):
        resolved (profile|token)  →  claimondo-locale Cookie  →  DEFAULT_LOCALE ('de')
```

`profiles.sprache` ist Single Source of Truth für eingeloggte Kunden. Cookie ist Fast-Path/Fallback und wird bei Login/Wechsel mit `profiles.sprache` gespiegelt.

---

## 6. Externe Systeme

- **Anthropic Claude API** (`ANTHROPIC_API_KEY`) — schon im Einsatz für `scripts/i18n/translate.mjs` (Build-Zeit) **und neu** für `translate-content.ts` (Laufzeit, On-Demand-Falldaten). Aggressives Caching via `content_translations` begrenzt Kosten.
- Keine weiteren neuen Integrationen.

---

## 7. Sprach-Wertebereich & Migration der bestehenden Cookie-Nutzer

- `profiles.sprache` ist `nullable`. `null` → Fallback auf Cookie → `de`. Bestehende Nutzer behalten also ihr Verhalten, bis sie einmal aktiv wählen oder ihr Account aus einem Lead mit gesetzter Sprache entsteht.
- `leads.sprache` Werteformat wird vor F-11/F-03 live geprüft (§2 „Heikel"). `normalizeToLocale` mappt sicher; unbekannte Werte → `null` (→ Fallback).

---

## 8. Business-Regeln (kritisch)

### B1 — Falldaten-MT ist Anzeige-Hilfe, NIE rechtsverbindlich
Der **deutsche Originaltext ist und bleibt Single Source of Truth** und wird immer gespeichert und angezeigt. Maschinenübersetzungen sind klar gekennzeichnet („Automatisch übersetzt · Original anzeigen") und fließen **niemals** in generierte rechtliche Dokumente, PDFs oder die SA. Begründung: Schadensregulierungs-Produkt — fehlerhafte MT darf nicht bindend werden.

### B2 — Marketing-Locale bleibt cookie-basiert
Die source-aware Logik in `request.ts` darf das Verhalten auf Marketing-/`/login`-Routen **nicht** ändern. Cookie-Pfad = exakt heutiges Verhalten.

### B3 — `request.ts` ist kritischer Pfad
DB-Reads (getUser + profiles, Token-Trace) nur auf den dafür klassifizierten Routen, in `cache()` gewrappt, nie auf Marketing/Public. Fehlende Header / DB-Fehler → graceful Fallback auf Cookie → `de`, nie Crash.

### B4 — Server-Actions-Pattern einhalten
`setLocaleAction` und `translateContent` liefern `{ ok: boolean; ... }`, kein `throw` (AGENTS.md). `revalidatePath` bei jedem Write nachziehen.

### B5 — Kein DE-Fallback-Leak in den Catalogs
Neue Namespaces müssen in **allen 6** `messages/*.json` existieren. Fehlende Keys → CI-Gate (F-52) bricht. Übergangsweise DE-Fallback ist akzeptabel (next-intl rendert sonst MISSING_MESSAGE-Crash), wird aber als „untranslated" markiert.

### B6 — `content_translations`-Zugriff nur server-seitig
RLS aktiviert, **keine** Client-Policies. Lesen/Schreiben ausschließlich über service-role im Server-Action `translateContent`. Verhindert Cache-Poisoning (Client könnte sonst falsche Übersetzung für einen Hash schreiben).

### B7 — Whitelabel nicht brechen
Magic-Link-Strecken lösen heute Branding über Token-Trace auf (`token-theme.ts`). Die Locale-Token-Auflösung nutzt **dieselben** FK-Pfade, koexistiert aber unabhängig — Branding-Verhalten bleibt unverändert.

---

## 9. Akzeptanz-Schwellwerte

- `npm run build` läuft grün (voller Build, nicht nur tsc — Route-/Layout-/Server-Action-Änderungen, AGENTS.md Audit-Punkt 1).
- Vitest: Unit-Tests für `classifyLocaleSource`, `resolveUserLocale`-Kaskade, `normalizeToLocale`, `formatCurrency/Date`, `translateContent` (Cache-Hit/Miss + Hash).
- `scripts/smoke/kunde-i18n-smoke.mjs`: Kunde-Portal + `/flow` + `/upload` in allen 6 Locales laden, **mit Screenshot-Auswertung**; `ar` rendert `dir="rtl"`; keine `MISSING_MESSAGE`-Leaks, keine unaufgelösten `{vars}`.
- Marketing-Smoke (`marketing-i18n-smoke.mjs`) bleibt grün (Regression B2).
- Sprachwechsel im Kunde-Portal persistiert in `profiles.sprache` (DB-Verifikation, nicht nur UI).
- Neuer Kunde aus Lead mit `sprache='tr'` → Portal startet auf Türkisch ohne manuellen Wechsel.
- Falldaten-MT: Chat-Nachricht auf Deutsch, Viewer-Locale `tr` → Toggle erscheint, Klick zeigt türkische Übersetzung, Original-Toggle zeigt DE zurück; zweiter Aufruf = Cache-Hit (kein erneuter Anthropic-Call).

---

## 10. Out of Scope (bewusst, spätere Wellen)

- **Interne Portale** (Admin/Dispatch/Gutachter/Kanzlei/Mitarbeiter) — eigene Welle; Personal arbeitet deutsch.
- **Email-Templates** (37 Stück) + **PDF-Generatoren** (3) — eigene „Emails/PDFs pro Empfänger"-Spec; benötigt Threading eines `locale`-Arguments durch `flows.ts` + Generatoren.
- **React-Native-App** — eigenes Expo-Projekt im Parent-Dir, keine i18n-Infra; separate Strategie für geteilten Message-Katalog.
- **URL-Prefix-Locales / hreflang für App-Routen** — nicht nötig (App ist auth-gated, kein SEO).
