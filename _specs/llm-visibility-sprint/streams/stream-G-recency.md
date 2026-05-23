# Stream G — Recency-Stamp (Hebel 5)

**Sprint:** 1 · **Tag:** 4 · **Owner:** Claude Code · **Aufwand:** 1 h
**Quell-Spec:** Doc 29 Hebel 5
**Code-Files:** `src/components/content/AssetHero.tsx`, `src/lib/content/claimondo-mdx.ts`

## Auftrag

1. `AssetHero` zeigt sichtbare Recency-Zeile („Zuletzt geprueft: <Datum>")
2. `dateModified` im Schema = Build-Datum (bzw. `last_modified` aus Frontmatter)

## DoD

- AssetHero zeigt Recency-Zeile sichtbar; `dateModified` im Schema gesetzt

## Validation

- Stichprobe 3 Spokes: Recency-Zeile sichtbar + `dateModified` im JSON-LD
