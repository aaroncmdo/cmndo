# Stream F + H — FAQ-Stems + VR-Bait (Render)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamfh-faq-vrbait` (off clean staging)
**Quell-Spec:** Doc 29 Hebel 2 (F) + Hebel 7 (H) · Stream-Briefs F/H · Mapping-Daten aus #1583.
Beide Streams in **einem** PR (kleine Komponenten, gleiche Routen → weniger überlappende PRs).

## Stream F — FaqStems (Hebel 2)
- **`FaqStems`-Component:** rendert die gemappten Doc-13-Test-Prompts (`FAQ_STEMS_MAPPING[slug]`) als sichtbaren FAQ-Block (`<dl>` Q&A) **plus eigenes FAQPage-Schema** (`faqPageSchema`). Princeton-GEO: exakte Nutzerfrage + Antwort auf der Seite → AI matched die Frage. `null` bei leerem Mapping.
- Gemappte Spokes: sv-kosten, geschaedigte-primaer, anwaltskosten-erstattung, wertminderung (haftpflicht), unser-sachverstaendiger (decoder), kfz-haftpflicht-schaden (cornerstone).

## Stream H — VrBaitBlock (Hebel 7)
- **`VrBaitBlock`-Component:** platziert die versicherer-spezifischen Bait-Sätze (`VR_BAIT_MAPPING[slug]`, aufgelöst aus Fakten-Library F46–F50) crawlbar als Block. AI-Test „HUK kürzt Wertminderung" matched über den F46-Anker. `null` bei leerem Mapping.
- Gemappte Spokes: reparaturkosten, wertminderung-nicht, werkstatt-netz, unser-sachverstaendiger (decoder), sv-kosten (haftpflicht), pruefdienstleister (SV).

## Einbettung
Beide Komponenten in alle 5 Content-Routen, **nach `MarkdownRenderer`, vor `ConversionAnchorBlock`** (Content-Position). Null-safe → nur die gemappten Slugs rendern etwas; unmapped (z.B. ratgeber) rendert nichts.

## Verifikation
- `tsc` 0 · `token-audit` 0 · `next build` **exit 0** (303/303 static pages).
- Dev-Smoke: `/haftpflicht/sv-kosten` → FAQ-Block (Doc-13-Prompt „Brauche ich … eigenen Kfz-Gutachter?") + VrBait-Block + FAQPage-Schema; `/sachverstaendige/pruefdienstleister` → VrBait mit HUK/F46-Anker; `/ratgeber` (unmapped) → kein Block (null-safe). Screenshot sv-kosten geprüft (FaqStems + VrBait sauber).

## Merge-Hinweis
Off staging; #1587 (WA) + #1591 (Stream D) noch offen, fassen dieselben 5 Routen an. Import-/Render-Additionen sind additiv → Auto-Merge konfliktarm bzw. trivial auflösbar (alle Imports + alle Render-Zeilen behalten).

## Damit ist die Doc-29/30-GEO-Strecke komplett
CitationBox (D) + FaqStems (F) + VrBait (H) rendern jetzt alle drei Mapping-Datensätze aus #1583. Plus C-Rest (ConversionAnchorBlock), E-Rest (FAQPage/speakable), Stream B + Sweeps (brand-constants).
