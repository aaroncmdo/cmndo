# Design — Mehrsprachiger Magic-Link-Flow (i18n Strategie B, claimant-facing)

> **Datum:** 2026-05-26 · **Basis:** i18n-Audit (`docs/26.05.2026/i18n-audit.md`), Strategie **B** (claimant-facing), Tier **Magic-Link-Flow** · **Architektur-Entscheid:** Scoped `NextIntlClientProvider` (Aaron-Freigabe).

## 1 · Ziel

Ein **nicht-deutschsprachiger Geschädigter**, der seinen WhatsApp/Email-**Magic-Link** öffnet, erlebt den Schaden-/Upload-Flow **in seiner Sprache** — als echte Übersetzung, nicht als Google-Translate-Banner.

**In-Scope-Surface:**
- `src/app/flow/[token]/FlowWizardKfz.tsx` (819 Z., der Wizard — Hauptbrocken)
- `src/app/flow/signatur/[token]/SignaturPage.tsx`
- `src/app/upload/zb1/[token]/page.tsx` + `src/app/upload/dokumente/[token]/page.tsx` (+ deren Client-Teile)

**Out-of-Scope** (bewusst, Tier-Wahl): Kunde-Portal, Marketing/SEO, per-Sprach-URLs/hreflang, interne Portale (admin/dispatch/gutachter/makler/kanzlei), Emails, PDFs.

## 2 · Ausgangslage (aus dem Audit)

- **Empfänger-Sprache ist bereits bekannt** (AAR-316): `flow/[token]/page.tsx` löst `flow_links.sprache > lead.sprache > 'de'`. `sprache`-Codes (Dispatch `Phase1Qualifizierung` `SPRACHEN`): `de, tr, ar, ru, pl, en` **(= exakt unsere 6 next-intl-Locales)** + `other` (🌐).
- Heute: hardcoded-deutscher Wizard + `src/components/i18n/SprachBanner.tsx` (Google-Translate-Fallback, rendert nur bei `sprache !== 'de'`).
- next-intl-Infra vorhanden + 6 Locales je 383 Keys, 0 Lücken. Verwaiste `flow.{step0-4,progress,common}`-Keys (×6 übersetzt, aktuell 0 Live-Konsum außer `flow.abort`) — **Kandidaten zur Wiederverwendung**.

## 3 · Architektur — Scoped Provider

**Locale-Auflösung** (eine reine Funktion, testbar):
```
resolveFlowLocale(flowLink?.sprache, lead?.sprache) -> Locale
  sprache ∈ {de,en,tr,ar,ru,pl}  -> diese Locale
  'other' | null | unbekannt     -> 'de'   (+ SprachBanner-Fallback bleibt)
```

**Übergabe an next-intl** (kein Cookie, keine URL):
- `flow/[token]/page.tsx` (Server Component) ermittelt `flowLocale`, lädt die zugehörigen Messages (`getMessages({locale: flowLocale})` bzw. `import(./messages/${flowLocale}.json)`) und wrappt den Client-Wizard:
  ```tsx
  <NextIntlClientProvider locale={flowLocale} messages={flowMessages} timeZone="Europe/Berlin">
    <FlowWizardKfz … />
  </NextIntlClientProvider>
  ```
  → der **innere** Provider überschreibt die globale (cookie-basierte) Locale nur für den Flow-Subtree. Globaler Cookie-Locale bleibt unberührt.
- Server-gerenderte Texte in `page.tsx`/`SignaturPage` nutzen `getTranslations({locale: flowLocale, namespace})`.
- **RTL:** für `ar` muss der Flow-Container `dir="rtl"` setzen (Arabisch). Property am Wrapper, nicht global.
- **`other`/`de`:** Provider mit `de`; `SprachBanner` (Google-Translate) **bleibt als Rest-Fallback** nur für `other`/unbekannt erhalten — für die 5 echten Sprachen wird der Banner ausgeblendet (echte Übersetzung ersetzt ihn).

## 4 · Message-Struktur

- Namespace **`flow.*`** erweitern: verwaiste `flow.step*`-Keys gegen die realen FlowWizardKfz-Schritte prüfen → passende **wiederverwenden**, fehlende **ergänzen**. (Rettet einen Teil des Audit-Ballasts.)
- Upload-Seiten: Keys unter **`flow.upload.*`** (oder neuer `upload.*`-Namespace — im Plan entscheiden).
- Quelle bleibt `de.json`; `npm run i18n:translate` füllt `en/tr/ar/ru/pl` (Claude + `glossary.md`). Glossar ggf. um Flow-/Rechts-Begriffe ergänzen.

## 5 · CI-Key-Completeness-Gate

Neues Script `scripts/i18n/check-complete.mjs` (+ npm `check:i18n` + CI-Step): verifiziert, dass **alle 6 Locales identische Key-Sets** haben (0 fehlend/0 extra vs `de`). Verhindert, dass künftig untersetzte Keys live gehen. (Heute 0 Lücken — Gate hält das durch.)

## 6 · Phasen (jeweils eigener PR gegen staging)

- **P1 — Infra:** `resolveFlowLocale` (+ vitest), Scoped-Provider in `flow/[token]/page.tsx`, RTL für `ar`, `SprachBanner` nur noch für `other`. Noch ohne Wizard-Strings (Wizard zeigt vorerst de in der Hülle) → klein, verifizierbar.
- **P2 — FlowWizardKfz (groß):** 819 Z. deutsche UI → `flow.*`-Keys extrahieren (Reuse verwaister Keys), `useTranslations` verdrahten, `i18n:translate` laufen lassen.
- **P3 — Signatur + 2 Upload-Seiten:** analog.
- **P4 — CI-Gate + Banner-Cleanup + Abschluss-Smoke.**

## 7 · Testing-Strategie

- **Unit (vitest, node-env):** `resolveFlowLocale` — alle 7 sprache-Werte + null → erwartete Locale.
- **Key-Completeness:** `check:i18n` grün (Teil von P4, lokal + CI).
- **E2E/Smoke:** Flow-Routes brauchen einen echten `flow_links`-Token (DB). Ansatz: Test-/Seed-flow_link mit `sprache='tr'` → `/flow/<token>` rendert türkische Wizard-Strings (Dev-Smoke + Screenshot). Wo Token-Seed zu teuer: Provider-Verdrahtung über die `resolveFlowLocale`-Unit + ein Render-Smoke mit erzwungenem Provider-Locale absichern. (Repo-Konvention: kein jsdom → entweder Playwright gegen echten Token oder React-Element-Tree-Inspektion wie `CardLink.test`.)

## 8 · Edge-Cases

- `sprache` = `other`/null/unbekannter Code → `de` + Google-Translate-Banner bleibt.
- Key fehlt in einer Locale → CI-Gate verhindert es; Runtime-Fallback next-intl = Key/`de` (nicht leer).
- `ar` ohne `dir="rtl"` → Layout-Bruch → RTL ist Pflicht-Teil von P1.
- Nested-Provider: innerer `NextIntlClientProvider` muss die globale Locale für den Subtree wirklich überschreiben — **in P1 mit echtem Render verifizieren** (next-intl unterstützt Nesting; falls nicht sauber, Fallback = Flow-Route ohne globalen Provider rendern).

## 9 · Offene Impl-Details (im Plan klären)

- `flow.upload.*` vs eigener `upload.*`-Namespace.
- Glossar-Erweiterung (Flow-/Rechtsbegriffe: „Sicherungsabtretung", „Vollmacht", „Wertminderung" konsistent je Sprache).
- Genauer Reuse-Grad der verwaisten `flow.step*`-Keys (erst beim Extrahieren von FlowWizardKfz messbar).

## 10 · Nicht-Ziele / bewusst weggelassen (YAGNI)

Keine per-Sprach-URLs, kein hreflang-Umbau (separater SEO-Task — Audit §5), keine Portal-/Marketing-/Email-Übersetzung. `sprache='other'` bekommt KEINE 7. Sprache — bleibt Google-Translate-Fallback.

---

*Design-Grundlage: i18n-Audit 2026-05-26. Brainstorming-Skill (Superpowers v5.1.0). Nächster Schritt: writing-plans → Implementierungsplan P1–P4.*
