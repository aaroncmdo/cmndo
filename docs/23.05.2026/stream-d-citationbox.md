# Stream D — CitationBox (Doc 29 Hebel 1)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamd-citationbox` (off clean staging)
**Quell-Spec:** Doc 29 Hebel 1 + Doc 30 §8 · Stream-Brief `stream-D-citation-boxes.md`
**Voraussetzung:** Mapping-Daten (#1583) + `getFakten`/`getMappingFor` auf staging gemergt.

## Was gebaut wurde

Macht die gemergten citation-box-Mappings sichtbar:
- **`CitationBox`** (`src/components/content/CitationBox.tsx`) — Box mit den 4 zitierfähigen BGH/§-Faktensätzen am **Kopf jeder Spoke** (nach AssetHero, vor dem Body, per Spec). Jeder Satz mit Links-Akzent + BGH-Az./§-Quelle als Chip. Klasse **`.citation-box`** = speakable-Selektor. Rendert `null` bei leerem Mapping (defensiv).
- **Einbettung in 5 Routen:** `haftpflicht/[slug]`, `decoder/[slug]`, `sachverstaendige/[slug]` (`a.slug`), `kfz-haftpflicht-schaden` + `ratgeber` (`SLUG`). `<CitationBox sentences={getFakten(getMappingFor(slug))} />`.
- **speakable vervollständigt:** `autoSchemaGraph` (jsonld.ts, aus E-Rest) nimmt jetzt `.citation-box` in den `cssSelector` (`['h1','h2','.citation-box']`) — der in E-Rest dokumentierte „folgt mit Stream D"-TODO ist erledigt.

## Entscheidungen (Aaron, AskUserQuestion)
- **§249-Default-Box überall** — alle 77 Assets bekommen eine CitationBox. Auf H1/H6/H7 + Personenschaden stehen die §249-Grundrechte (F1/F2/F4, im Mapping `// !`-markiert) — generischer, aber faktisch korrekt + max. GEO-Abdeckung.
- **G0-Wording freigegeben** — auf dieser Basis gebaut.

## Verifikation
- `tsc --noEmit` exit 0 · `check:token-audit` 1681/0 · `next build` **exit 0** (303/303 static pages, diesmal ohne /gutachter-partner-Timeout).
- Dev-Smoke (`next dev`): `/haftpflicht/4-wochen-frist`, `/sachverstaendige/bvsk`, `/kfz-haftpflicht-schaden` → je 1× `.citation-box`, Fakten gerendert (F38 „5 Prozentpunkte" sichtbar). `/haftpflicht/parkplatz` (no-schema) → JSON-LD `speakable.cssSelector` enthält `.citation-box`. Screenshot 4-wochen-frist: Box „Auf einen Blick — gesicherte Fakten" mit 4 Fakten + Quellen-Chips, sauber positioniert.

## Merge-Hinweis
Branch off staging OHNE #1587 (WA-Sweep, offen — fasst dieselben Routen-Files an). Stream-D-Imports/Render bewusst in andere Zeilen-Regionen gelegt (Content-Imports + Render nach AssetHero) als #1587 (jsonld-Import + `const WA`) → Auto-Merge sollte konfliktfrei sein; sonst additive Auflösung (beide behalten).

## Damit ist Stream D live-fähig
Nach Merge rendern die citation-box-Mappings auf allen 77 Content-Seiten. Offen bleiben Stream F (FAQ-Stems) + H (VR-Bait) — separate Komponenten, dieselben Mapping-Daten als Basis.
