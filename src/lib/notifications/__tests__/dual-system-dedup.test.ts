import { describe, it, expect } from 'vitest'
import { EVENT_MATRIX } from '../channel-matrix'

// Dual-System-Dedup (Notif-Konsolidierung Phase 1, 03.07.): Events, die ein CO-FIRING Legacy-
// sendFallCommunication haben, duerfen den KUNDEN nicht extern (WhatsApp/Email/Push) benachrichtigen —
// sonst Doppel-Nachricht. Bestaetigt fuer fall.created: 'fall_eroeffnet' (Legacy, Kunde-WA+Email) und
// emitEvent('fall.created') feuern beide im selben signSAandCreateFall; fall.created wird NUR von dort
// emittiert -> Legacy deckt Kunde-extern immer -> Event nur in_app. Guard verhindert Regression
// (jemand fuegt kunde-WA/Email wieder hinzu = Dupe). Spec: [[coordination-notification-dual-system-consolidation-spec]].
describe('Dual-System-Dedup — kunde bleibt in_app fuer legacy-gedeckte Events', () => {
  it('fall.created: kunde bekommt NUR in_app (fall_eroeffnet-Legacy sendet Kunde-WA/Email)', () => {
    expect(EVENT_MATRIX['fall.created'].channels.kunde).toEqual(['in_app'])
  })

  it('gutachten.fertig: kunde bekommt NUR in_app (gutachten_fertig-Legacy sendet Kunde-WA)', () => {
    expect(EVENT_MATRIX['gutachten.fertig'].channels.kunde).toEqual(['in_app'])
  })
})
