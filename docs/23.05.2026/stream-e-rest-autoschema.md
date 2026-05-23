# Stream E-Rest — autoSchemaGraph (FAQPage + speakable aus dem Body)

**Datum:** 2026-05-23 · **Branch:** `kitta/streame-autoschema-rest` (off clean staging)
**Sprint:** LLM-Visibility (Doc 31) · **Quell-Spec:** Doc 25 Gap 2 + Doc 29 Hebel 3 · Stream-Brief `stream-E-schema-auto.md`
**Vorarbeit (gemergt):** Stream-E-core #1573 = `citation[]` + `dateModified` im Article-Fallback.

## Was gebaut wurde

Content-Assets **ohne** handgepflegten `## Schema (JSON-LD)`-Block (18 Haftpflicht-Spokes der Cluster H6/H7 + die 8 SV-Spokes) bekamen bisher nur das generische `articleSchema`. E-Rest reichert diesen Fallback an:

- **`extractFaqPairs(body)`** (`claimondo-mdx.ts`): parst die `## Häufige Fragen`-Sektion (`**Frage?**` + Antwortzeilen) zu Q&A-Paaren. **CRLF-normalisiert** (Windows-Working-Tree = `\r\n`, sonst leeres Match — siehe Lessons). Markdown-Links → reiner Text.
- **`autoSchemaGraph(articleArgs, faqPairs)`** (`jsonld.ts`): baut bei vorhandenen FAQ-Paaren ein `@graph` = `Article` (+ `speakable`) + `FAQPage` (nutzt das bestehende `faqPageSchema`). Gibt `null` zurück, wenn keine Paare → Caller bleibt beim `articleSchema`. **try/catch** → kein Build-Break durch invalides FAQ-Markup (Doc 31 R2).
- **`ContentJsonLd`**: neuer optionaler `body`-Prop. Priorität: (1) hand-gepflegtes @graph, (2) Auto-@graph, (3) articleSchema. Verdrahtet in `haftpflicht/[slug]`, `decoder/[slug]`, `sachverstaendige/[slug]` (Cornerstones haben immer manuelles Schema → unberührt). Haftpflicht/Decoder bekamen zusätzlich `citations`+`dateModified` im Fallback (konsistent mit SV-Route/#1573).

## Scope-Entscheidungen (bewusst)

- **Kein HowTo-Auto-Gen:** Die Fallback-Path-Assets (H6/H7-Szenarien + SV) sind FAQ-only, kein Schritt-Content; Prozess-Cornerstones haben manuelles Schema. Auto-HowTo würde nie/falsch feuern → ausgelassen.
- **speakable = Überschriften-Selektoren (`h1`,`h2`)** vorerst. Die feineren `.citation-box`- und FAQ-Antwort-Selektoren brauchen die CitationBox-Klasse aus **Stream D** → folgen dort.
- Manuell-Schema-Assets (51) unverändert — `autoSchemaGraph` feuert nur auf dem Fallback-Pfad.

## Verifikation (empirisch)

- `tsc --noEmit` exit 0 · `vitest` 15/15 (inkl. neue extractFaqPairs-Tests + CRLF-Regression + Asset-Count-Fix 69→77) · `next build` exit 0 · `token-audit` 0 Verstöße.
- Dev-Smoke (`next dev`, JSON-LD gegrept):
  - `/haftpflicht/parkplatz` (no-schema) → `@graph` mit **FAQPage + 3 Question + SpeakableSpecification** ✓
  - `/haftpflicht/spurwechsel` (no-schema) → FAQPage + 3 Question ✓
  - `/sachverstaendige/bvsk` (SV, keine FAQ) → **kein** FAQPage, Article + citation ✓
  - Manuell-Schema-Spokes (`4-wochen-frist`) → unverändert (manuelles @graph).
- Reine JSON-LD-Änderung → sichtbare UI unverändert (HTTP 200, gleicher MarkdownRenderer/ConversionAnchorBlock).

## Nebenbefund gefixt

`claimondo-mdx.test.ts` behauptete `getAllAssets()===69` — seit Pillar-C (#1565, +8 SV) faktisch **77**. Stale-Test auf 77 (2/57/10/8) korrigiert + `getSachverstaendige`-Assertion ergänzt.

## Lessons

- **CRLF-Falle:** Parser auf MD-Bodies müssen `\r\n` normalisieren — der vitest-SAMPLE nutzte `\n` und war grün, der echte Windows-Working-Tree-Body (`\r\n`) lieferte 0 Paare. Erst der Dev-Smoke (FAQPage fehlte) hat es gefangen. CRLF-Regressionstest ergänzt.
- `faqPageSchema` existierte bereits (`{frage,antwort}`) — wiederverwendet statt Duplikat (tsc-Redeclare-Fehler hat das gefangen).
