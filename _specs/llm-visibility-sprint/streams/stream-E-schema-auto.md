# Stream E — autoSchemaFromBody + citation + speakable (Hebel 3)

**Sprint:** 1 · **Tag:** 3 · **Owner:** Claude Code · **Aufwand:** 4 h
**Quell-Spec:** Doc 25 Gap 2 + Doc 29 Hebel 3
**Code-Files:** `src/lib/content/claimondo-mdx.ts` (Erweiterung)

## Auftrag

1. `autoSchemaFromBody`: aus MDX-Body automatisch FAQPage- + HowTo-Schema generieren
2. `citation[]`-Array pro Asset aus den verlinkten BGH-Az./§-Quellen befuellen
3. `speakable`-Selector auf `.citation-box` + FAQ-Antworten
4. Try/catch + Fallback `articleSchema` bei invalidem FAQ-Markup (Doc 31 v2 R2)

## DoD

- 67 FAQPage + 10 HowTo generiert; alle `citation[]`-Arrays valide

## Validation

- schema.org-Validator gruen fuer Stichprobe (3 Spokes, 1 Cornerstone, 1 Decoder)
- invalides FAQ-Markup faellt auf articleSchema zurueck statt Build-Break
