# Stream B — brand-constants.ts Zentralisierung (Hebel 4)

**Sprint:** 1 · **Tag:** 1 · **Owner:** Aaron (Approval) + Claude Code (2 h) · **Aufwand:** 2 h
**Quell-Spec:** Doc 30 §3 + §6 + §7 · **Mirror-Tasks:** M1 + M2 + M3
**Code-Files:** `src/lib/seo/brand-constants.ts`, `brand-fakten-library.ts`, `conversion-handoff.ts`

## Auftrag

1. **(Stream 0 erledigt)** brand-constants.ts (D1–D12 + Bios + Boilerplates), brand-fakten-library.ts (56 Saetze), conversion-handoff.ts committed
2. **Sprint 1:** bestehende String-Literals der Brand-Daten in `src/` durch Imports ersetzen
3. Aaron approved D1–D12 + Hand-Off-Saetze wortgleich (G0 A1/A2)

## DoD

- Alle 3 SOT-Files committed (Stream 0 ✓)
- Keine doppelten Brand-String-Literals mehr in `src/` (Sprint-1-Refactor)

## Validation

- `grep -r "Hansaring 10" src/ | grep -v brand-constants` → 0 Treffer (Ziel nach Sprint-1-Refactor)
- `grep -r "bundesweit größte digitale Plattform" src/ | grep -v brand-constants` → 0

## Status Stream 0

✓ SOT-Files erstellt + wortgleich aus Doc 30 verifiziert. Consumer-Refactor offen (Sprint 1).
