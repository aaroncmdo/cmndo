// Diagnose-Luecke-Fix (Handoff melde-schaden 11.07.): die harte Reservierung
// (bucheTerminFlow) loggte ihren Fehlgrund NUR via console.error -> ohne VPS-Zugriff
// nicht diagnostizierbar (der Reporter hatte keinen). Dieser Klassifikator mappt die
// interne Fehlermeldung auf einen SICHEREN, stabilen Grund-Code fuer die API-Response,
// sodass ein simpler curl/Smoke sofort sieht WARUM `reserviert:false` ist — ohne rohe
// DB-Fehlermeldungen (Schema-Details) nach aussen zu leaken.

import type { PlaneTerminFehlerCode } from '@/lib/termine/engine/plane-termin'

export type ReservierungsGrund = 'test_sv_guard' | 'slot_belegt' | 'link_ungueltig' | 'nicht_reserviert'

export function klassifiziereReservierungsGrund(
  fehler: string | null | undefined,
  code?: PlaneTerminFehlerCode | null,
): ReservierungsGrund | null {
  // Der Engine-Code hat Vorrang (20.09., Regel-4-Probe #5990): die Engine gibt beim Test-SV-Guard
  // seit 12.08. einen kundentauglichen Text OHNE "Test-Guard" zurueck — wer nur den Text liest,
  // meldet 'nicht_reserviert' und die Diagnose-Luecke ist wieder offen.
  if (code === 'test_guard') return 'test_sv_guard'
  if (code === 'belegt') return 'slot_belegt'
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
