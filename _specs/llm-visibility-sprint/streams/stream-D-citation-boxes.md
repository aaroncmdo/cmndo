# Stream D — CitationBox + 87 Embeddings (Hebel 1)

**Sprint:** 1 · **Tag:** 3–4 · **Owner:** Aaron (Mapping, 4 h) + Claude Code (Component + Embedding, 3 h) · **Aufwand:** 7 h
**Quell-Spec:** Doc 29 Hebel 1 + Doc 30 §8
**Brand-Library:** `src/lib/seo/brand-fakten-library.ts` (56 Saetze, F1–F56)
**Mapping-File:** `src/data/citation-box-mapping.ts` (Skelett aus Stream 0 — M6 befuellen)

## Auftrag

1. Aaron: 87 Spokes/Decoder/Cornerstones jeweils auf 4 Faktensatz-IDs mappen (`CITATION_BOX_MAPPING`)
2. Claude Code: `<CitationBox sentences={getFakten(getMappingFor(slug))} />`-Component bauen
3. Claude Code: in 4 Render-Routen embedden (nach AssetHero, vor MarkdownRenderer)
4. CSS-Klasse `.citation-box` als speakable-Schema-Selector

## DoD

- `citation-box-mapping.ts` vollstaendig (87 Slugs)
- CitationBox rendert in 5 zufaelligen Stichproben-Spokes
- speakable-Selector im DOM messbar

## Validation

- 5 zufaellige Spokes zeigen 4 Faktensaetze als Blockquote
- `curl /haftpflicht/4-wochen-frist | grep "citation-box" | wc -l` → ≥ 1

## Fallback (Doc 31 v2 R13)

Wenn 87er-Mapping zu viel: 8 Cluster-Boxen statt 87 Einzel-Mappings (auf 30 Min reduziert).
