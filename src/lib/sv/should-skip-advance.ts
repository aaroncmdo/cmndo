// AAR-offline Slice 1b: pure CAS invariant for the offline replay of
// completeAndAdvance. Lives in its OWN module (NOT in tages-session.ts, which is
// a 'use server' file — a sync export there would break the build / become an
// invalid server action). No Supabase / DOM imports -> node-unit-testable.

/**
 * Returns true when the session ADVANCE must be skipped because the session is
 * no longer on the termin being completed (already advanced / finished).
 * `expectedTerminId === undefined` means "no guard requested" (online path) -> never skip.
 */
export function shouldSkipAdvance(
  currentAktuellerTerminId: string | null,
  expectedTerminId: string | undefined,
): boolean {
  if (expectedTerminId === undefined) return false
  return currentAktuellerTerminId !== expectedTerminId
}
