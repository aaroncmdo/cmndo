// Diagnose-Luecke-Fix (Handoff melde-schaden 11.07.): die harte Reservierung
// (bucheTerminFlow) loggte ihren Fehlgrund NUR via console.error -> ohne VPS-Zugriff
// nicht diagnostizierbar (der Reporter hatte keinen). Dieser Klassifikator mappt die
// interne Fehlermeldung auf einen SICHEREN, stabilen Grund-Code fuer die API-Response,
// sodass ein simpler curl/Smoke sofort sieht WARUM `reserviert:false` ist — ohne rohe
// DB-Fehlermeldungen (Schema-Details) nach aussen zu leaken.

export type ReservierungsGrund = 'test_sv_guard' | 'slot_belegt' | 'link_ungueltig' | 'nicht_reserviert'

export function klassifiziereReservierungsGrund(
  fehler: string | null | undefined,
): ReservierungsGrund | null {
  if (!fehler) return null
  const f = fehler.toLowerCase()
  // Test-SV-Guard (src/lib/testdaten/test-sv-guard.ts): echt-Lead <-> Test-SV blockiert.
  if (f.includes('test-guard') || f.includes('test-sachverst')) return 'test_sv_guard'
  // Slot belegt / vergeben (pruefeBelegungStrict oder 23P01-EXCLUSION).
  if (f.includes('belegt') || f.includes('vergeben')) return 'slot_belegt'
  // FlowLink ungueltig/abgelaufen (resolveFlowLead).
  if (f.includes('ungültig') || f.includes('ungueltig') || f.includes('abgelaufen')) return 'link_ungueltig'
  // Alles andere (inkl. roher DB-Message) -> generischer Code, KEIN Leak.
  return 'nicht_reserviert'
}
