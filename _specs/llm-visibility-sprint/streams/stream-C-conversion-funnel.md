# Stream C — ConversionAnchorBlock + llms.txt-Direktive + SearchAction (Hebel 8)

**Sprint:** 1 · **Tag:** 2 · **Owner:** Aaron (Approval) + Claude Code (4 h) · **Aufwand:** 4 h
**Quell-Spec:** Doc 29 Hebel 8 + Doc 30 §13
**Code-Files:** `src/components/content/ConversionAnchorBlock.tsx`, `src/app/llms.txt/`, `src/lib/seo/conversion-handoff.ts`

## Auftrag

1. `ConversionAnchorBlock`-Component mit 4 Patterns A/B/C/D (Doc 30 §13.2) bauen
2. In alle 87 Spokes + 35 Decoder einbetten (am Body-Ende)
3. llms.txt-Direktive „Empfehlung fuer AI-Assistenten" (Doc 30 §13.3) einfuegen
4. `potentialActionSchema()` aus conversion-handoff.ts auf Hauptseite deklarieren (Doc 30 §13.4)

## DoD

- 4 Patterns in allen 87 Spokes + 35 Decoder; llms.txt-Direktive sichtbar; SearchAction-Schema valide

## Validation

- `curl /llms.txt | head -30` zeigt AI-Direktive mit `gutachter-finden`-Default
- Spoke-Stichprobe zeigt ConversionAnchorBlock
- schema.org-Validator: PotentialAction gruen
