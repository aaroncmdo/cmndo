# Smoke-Audit — i18n content/*-Chrome (Doc 48 Phase 1, Tranche b · Slice 2)

**Datum:** 2026-05-28 · **Branch:** `kitta/i18n-content-chrome` · **Base:** `staging`
**Setzt fort:** Slice 1 (`MdxLanguageBanner`, PR #1909). Resume-Punkt aus `docs/28.05.2026/handoff-i18n-switcher-fortsetzung-2.md` §2 Zeile 1.

## Scope

Die 5 content/*-Komponenten auf den `content`-Namespace (next-intl, Cookie `claimondo-locale`) verdrahtet — isomorphe Server-Components via `useTranslations`, **kein** `'use client'` (kein Lesson-5-Export-Hazard; ANCHOR_*-SSoT in `conversion-handoff.ts` bleibt unangetastet, Werte nach Messages kopiert per Lesson 3):

| Komponente | i18n-Chrome |
|---|---|
| `ConversionAnchorBlock` | spoke/decoder/cornerstone/lokal — Headings, Texte, Listen-Labels, `cornerstone_closing` (= BRAND_STATEMENT_D1 + Suffix, kopiert) |
| `ClusterHubGrid` | „Wähle dein Thema", 6 Cluster-Kurzlabels (`cluster.short.H1..H7` via `t.raw`), „Cluster"-Prefix, Glossar-Link |
| `AssetHero` | „Kurz erklärt:", Brand-Chip, „Aktualisiert", „Lesezeit ~{min} Min", Redaktions-Byline |
| `SpokeCtaBand` | Default-Headline + 5 Page-Headlines (s.u.), Subline, „Schaden online melden" |
| `InlineCheckCta` | Heading, Text, Button |

**Zusätzlich** (sonst hätte die SpokeCtaBand-i18n auf genau diesen Routes German-Headline + übersetzte Subline gemischt): 5 hartkodierte deutsche `headline=`-Props in den Content-Hubs nach `content.cta_band.headline_*` verdrahtet — `decoder`, `ratgeber`, `sachverstaendige`, `haftpflicht`, `kfz-haftpflicht-schaden` (alle non-async Server-Pages → `useTranslations`).

`content`-Namespace: 48 Keys, in `de.json` **mittig** nach `mdx_banner` eingefügt (Lesson 5, kollisions-arm), in en/tr/ar/ru/pl am Tail (subagent-driven, programmatisch geschrieben — Lesson 6).

## Gates

- **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → exit 0 (alle Content-Routes `ƒ Dynamic`, erwartet wg. Cookie-Read).
- **Typecheck:** `tsc --noEmit` → exit 0.
- **check:i18n:** 5/5 Locales OK, je **1591 Keys** (1543 + 48), volle Parität.
- **HTML-Entity-Sweep** (`content`-Subtree, alle 5 Locales): 0 Entities.

## Smoke (Playwright, `next start -p 3027`, Cookie `claimondo-locale`)

**Matrix:** 6 Routes × {de, en, ar} = 18 Page-Loads. **HARD FAILURES: 0** (kein Raw-Key-`content.*`, kein `{stadt}`/`{min}`-ICU-Leak, keine HTML-Entity in keinem Body).

Routes: `/kfz-haftpflicht-schaden` (Pillar: AssetHero + ClusterHubGrid + cornerstone-Anchor + CTA), `/haftpflicht/wertminderung` (Spoke: AssetHero + spoke-Anchor + InlineCheckCta + Default-CTA), `/decoder/wertminderung-nicht` (decoder-Anchor), `/decoder` + `/ratgeber` (verdrahtete Hub-Headlines), `/kosten-kfz-gutachten` (Regression: Marketing-Page nutzt Shared-Komponenten).

### Befunde

- **de:** byte-identisch zum Original — alle Strings exakt deutsch, korrekte verdrahtete Headlines (Pillar „… Wir regeln deinen ganzen Schaden", Ratgeber „… Ihren ganzen Schaden", Decoder-Hub „Genau diesen Brief bekommen?…", Spoke-Default „Hol dir, was dir zusteht").
- **en:** alle Chrome-Strings übersetzt (ClusterHubGrid „Choose your topic" + Liability basics/Deadlines/…, AssetHero „In brief:", Anchor „What you can do right now"/„Find an expert on the map:", InlineCheckCta „Has the deadline already passed?"/„Check your claim ›", CTA „We settle your entire claim"/„Report damage online"). `§ 249 BGB`, `0 €`, `Köln`, `Claimondo`, BGH-Az. verbatim.
- **ar:** `dir=rtl` auf allen Routes, RTL-Layout korrekt (ClusterHubGrid-Karten + InlineCheckCta gespiegelt, Button links). Arabisch übersetzt, `§ 249 BGB`/`0 €`/`Köln`/`Claimondo` verbatim erhalten.
- **Regression `/kosten-kfz-gutachten`:** eigene Page-Headline (anderer Namespace) weiterhin korrekt; Shared `ConversionAnchorBlock` rendert jetzt auch hier lokalisiert (Verbesserung). Kein Bruch.

Präsenz-Checks pro Komponente (de/en/ar) alle `true`; Screenshots (element-clips + fullpage) lokal unter `smoke-content-shots/` (untracked, nach Worktree-Removal weg — Lesson 6).

### Bewusst deutsch (out of scope, erwartet)

- **Markdown-Artikel-Bodies, Asset-Titel, Snippets, Spoke-Listen-Titel** (`s.title`) — Phase-2 (DB/Content, nutzerbasiert). Der Slice-1-`MdxLanguageBanner` kündigt das en/ar-Nutzern an.
- **`clusterLabel()`-Langform-Tooltip** — SSoT in `claimondo-mdx.ts` (sitemap/llms), nicht angefasst (Lesson 3).

### Bekannte kosmetische Punkte (Follow-up, nicht blockierend)

1. **AssetHero-Datum** bleibt `de-DE`-Format („18. Mai 2026") auch in en/ar → „Updated 18. Mai 2026" mischt Label/Monat. Bewusst: `useFormatter` mit Locale könnte via konfigurierte timeZone den de-Tag verschieben (TZ-Gotcha) → de-Byte-Identität gefährdet. Datum-Lokalisierung = separater TZ-sicherer Folge-Schritt, war nicht im Handoff-Scope.
2. **ar/RTL-Bidi:** in den deutschen Spoke-Listen-Titeln (Phase-2-Content) ordnen eingebettete LTR-Rechtsverweise visuell um (`§ 823 BGB` → „BGB 823 §"). Betrifft Content-Daten, nicht das übersetzte Chrome; löst sich mit Phase-2-Übersetzung.

## Verdikt

Slice 2 erfüllt den Handoff-Scope vollständig + macht den Sprachumschalter auf den Content-Routes für das gesamte Komponenten-Chrome wirksam. de unverändert, en/ar/tr/ru/pl vollständig (check:i18n grün), 0 Leaks, RTL ok. **Bereit für Review-PR gegen `staging` (Merge via Merge-Watcher, nicht selbst).**
