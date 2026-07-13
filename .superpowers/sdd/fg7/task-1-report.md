# Task 1 Report — Pure SV-SLA completion derivation

## Status

DONE

## Files Created

1. `src/lib/sla/sv-completion.ts` — pure module exporting `SvSlaTyp`, `OPERATIVE_STATUS_ORDER`, `SV_SLA_COMPLETE_AT`, `SvCompletionInputs`, and `deriveSvSlaCompletion`.
2. `src/lib/sla/sv-completion.test.ts` — 17 vitest cases covering all specified test scenarios.

## TDD Steps Executed

### Step 1: Test file written first (RED)

Command: `npx vitest run src/lib/sla/sv-completion.test.ts`

Output (RED):
```
 FAIL  src/lib/sla/sv-completion.test.ts [ src/lib/sla/sv-completion.test.ts ]
Error: Cannot find module './sv-completion' imported from .../sv-completion.test.ts
 Test Files  1 failed (1)
      Tests  no tests
   Start at  16:01:37
   Duration  1.95s
```

RED confirmed.

### Step 2: Implementation written

`src/lib/sla/sv-completion.ts` created with:
- `OPERATIVE_STATUS_ORDER` — 20-entry linearization per brief verbatim (onboarding … abgeschlossen)
- `SV_SLA_COMPLETE_AT` — 4-entry map per brief
- `deriveSvSlaCompletion` — terminal check first (explicit `abgeschlossen`/`storniert` before rank), then `termin_bestaetigung` `hasConfirmedTermin` shortcut, then rank comparison

### Step 3: Tests GREEN

Command: `npx vitest run src/lib/sla/sv-completion.test.ts`

Output (GREEN):
```
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  16:02:14
   Duration  1.63s (transform 195ms, setup 0ms, import 259ms, tests 17ms, environment 0ms)
```

17/17 passed.

### Step 4: Typecheck

Command (PowerShell): `$env:NODE_OPTIONS='--max-old-space-size=8192'; npx tsc --noEmit`

Output: (empty — clean exit code 0, no errors)

## Self-Review

- `storniert` is NOT in `OPERATIVE_STATUS_ORDER` (indexOf -> -1). The explicit terminal check at the top of `deriveSvSlaCompletion` catches both `storniert` and `abgeschlossen` BEFORE the rank comparison. Without this guard, `storniert` would get rank -1 and not be suppressed — exactly the correctness hazard called out in the brief.
- `termin_bestaetigung` with `hasConfirmedTermin=true` + `operativeStatus=null` returns `true` correctly: the `hasConfirmedTermin` branch returns early before any rank comparison.
- `termin_bestaetigung` with `hasConfirmedTermin=false` falls through to rank comparison against `'besichtigung'` threshold (rank 5), so `sv-termin` (rank 4) correctly returns `false` and `besichtigung` (rank 5) correctly returns `true`.
- `reparatur-laeuft` (Selbstzahler-Reparatur axis, not in `OPERATIVE_STATUS_ORDER`) gets rank -1 -> `false` (conservative). Intentionally excluded per brief.
- Module is PURE: zero imports of supabase, tracker, or any async dependency.

## Changes After Self-Review

None. Initial implementation passed all 17 cases on first run.

## Concerns

None. The implementation is minimal, correct, and pure.
