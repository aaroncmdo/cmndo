# i18n-Phasenplan — Übersetzungen Website + App

**Stand:** 10.05.2026
**Aaron-Briefing:** Erst gesamte Website (Phase 1), dann nutzerbasiert die App (Phase 2).

## Ausgangslage

| Locale | Status | Inhalt |
|---|---|---|
| `de` | ✅ vollständig | Original — Single Source of Truth |
| `en` | ✅ vollständig | menschlich übersetzt |
| `ar` | ✅ vollständig | menschlich übersetzt |
| `tr` | ⚠️ DE-Fallback (Phase 1A) | identisch mit DE — User sieht deutschen Text |
| `pl` | ⚠️ DE-Fallback (Phase 1A) | identisch mit DE — User sieht deutschen Text |
| `ru` | ⚠️ DE-Fallback (Phase 1A) | identisch mit DE — User sieht deutschen Text |

**Außerdem:** Keine der 8 Marketing-Pages (`/`, `/vorteile`, `/wie-es-funktioniert`, `/faq`, `/ueber-uns`, `/kfz-gutachter`, `/gutachter-finden`, `/gutachter-partner`, `/schadensreport-2026`) nutzt direkt `getTranslations`. Nur shared Components (`LandingHero`, `LandingFooter`, `LandingTopbar`) tun das. **Hardcoded deutsche Strings** dominieren in den Page-Files.

## Phase 1 — Gesamte Website

### Phase 1A — Quick-Fix (heute, 30 Min) ✅ erledigt
- TR/PL/RU mit DE-Fallback gefüllt (statt leerer Skelette)
- User sehen wenigstens deutschen Text in diesen Sprachen, kein leerer Bildschirm + kein next-intl-MISSING_MESSAGE-Crash
- Bestehende EN/AR-Übersetzungen unangetastet
- LanguageSwitcher zeigt weiterhin alle 6 Sprachen

### Phase 1B — String-Extraktion (~2-3 Tage)
**Ziel:** Alle hardcoded Strings in Marketing-Pages → next-intl-Keys.

Reihenfolge nach Traffic-Erwartung:
1. `/` (Landing) — höchste Priorität, +HauptseiteClient
2. `/gutachter-finden` — Self-Dispatch-Funnel (Conversion-relevant)
3. `/ueber-uns` — Brand + GEO-Entitäts-Definition
4. `/schadensreport-2026` — GEO-Daten-Page
5. `/kfz-gutachter` + Sub-Pages (kosten, ablauf, wertminderung, [stadt])
6. `/vorteile`, `/wie-es-funktioniert`, `/faq`, `/gutachter-partner`
7. Legal-Pages (impressum/datenschutz/agb/nutzungsbedingungen) — kommen aus Markdown-Files, niedrige Priorität

**Pattern pro Page:**
```typescript
// Vorher (hardcoded):
<h1>Vollständige Schadensregulierung — auf Augenhöhe.</h1>

// Nachher:
import { getTranslations } from 'next-intl/server'
const t = await getTranslations('ueber_uns')
<h1>{t('hero.headline')}</h1>
```

Keys nach Hierarchie: `<page>.<section>.<element>` (z.B. `ueber_uns.hero.headline`).

### Phase 1C — Übersetzungen (parallel zu 1B)

Nach jeder Page-Migration: neue Keys via DeepL-API in TR/PL/RU/EN/AR übersetzen lassen, dann manuelle Review (besonders rechtliche/marketing-sensitive Stellen).

**Tooling-Optionen:**
- **DeepL API** — beste Qualität für DE→EN/PL/RU, weniger gut für TR/AR
- **OpenAI GPT-4o** — guter Domänen-Kontext (Versicherung, Recht)
- **Manuell** — für rechtliche Texte (BGH-Bezüge, AGB) sicherer

Empfehlung: GPT-4o-Pipeline mit Prompt „Du übersetzt für eine deutsche Kfz-Schadensregulierungs-Plattform. Behalte juristische Fachbegriffe (§249 BGB, BVSK, DAT) bei. Tone: vertrauensvoll, technisch-präzise, deutsch-direkt-Style."

### Phase 1D — Quality-Pass

- Pseudo-Localization-Test (jeder Marketing-Page in jeder Sprache durchklicken)
- RTL-Test für AR (`dir="rtl"` greift schon im layout.tsx)
- Datums-/Zahlen-Formatting prüfen (next-intl's `useFormatter`)
- LanguageSwitcher-Cookie-Persistenz testen

## Phase 2 — Gesamte App (nutzerbasiert)

**Scope:** alle 4 Portale (Admin, Dispatch, Gutachter, Kunde) plus Onboarding-Wizard, Fallakte, Inbox, Termine.

**Wichtig:** App-Übersetzungen sind nutzerbasiert — der Locale kommt aus `profiles.sprache` statt Cookie. Anderer Trigger als Marketing-Site.

**Reihenfolge:**
1. **Kunde-Portal** — höchste Priorität (mehr internationale Mandanten als andere Rollen)
2. **Onboarding-Wizard** — kritisch für Schadens-Aufnahme
3. **Termine + Fallakte** — Status-Updates, WhatsApp-Templates
4. **Gutachter-Portal** — überwiegend deutsch (SVs sind regional)
5. **Admin/Dispatch** — kann zuletzt, intern arbeiten alle deutsch

**Tooling:** gleiche Pipeline wie Phase 1, plus DB-getriebene Translations für dynamische Inhalte (z.B. Mitteilungs-Templates pro Locale in `nachrichten_templates_i18n` Tabelle).

## Wann womit beginnen?

**Phase 1B + 1C parallel** — pro Page Migration und sofort übersetzen lassen, dann Code-Review + Live. Pro Page ~3-5 Stunden inkl. Übersetzung.

Phase 2 nach Phase 1 — App-Übersetzungen brauchen erst die Foundation (next-intl-Patterns) die in Phase 1 etabliert wird.
