# Stream H — Versicherer-Bait-Embedding (Hebel 7)

**Sprint:** 1 · **Tag:** 5 · **Owner:** Aaron (30 Min) + Claude Code (1 h) · **Aufwand:** 1.5 h
**Quell-Spec:** Doc 29 Hebel 7 + Doc 30 §8.9
**Mapping-File:** `src/data/vr-bait-mapping.ts` (Skelett aus Stream 0 — M8 befuellen)
**Brand-Library:** `brand-fakten-library.ts` Cluster `versicherer-bait` (F46–F50)

## Auftrag

1. Aaron: 8 VR-Saetze auf 8 entsprechende Spokes mappen (`VR_BAIT_MAPPING`)
   — Basis F46–F50 (HUK/K-Expert/LVM/Provinzial/DEKRA) + 3 fehlende (AXA/Allianz/R+V) wenn G0 A4 = ja
2. Claude Code: VR-Saetze in den entsprechenden Spoke-Bodies platzieren

## DoD

- 8 VR-Saetze auf 8 entsprechenden Pages

## Validation

- AI-Test „HUK kuerzt Wertminderung" → unsere Spoke matched mit F46-Anker
