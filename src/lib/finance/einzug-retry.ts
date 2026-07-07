// 2026-07-03: Reine, testbare Kern-Logik fuer den idempotenten Lastschrift-
// Einzug-Retry (Cron src/app/api/cron/abrechnung-einzug/route.ts).
//
// Bug-Kontext: der Cron filterte `einzug_versucht_am IS NULL` und setzte
// `einzug_versucht_am` auf JEDEM Fehlerzweig -> ein einziger TRANSIENTER Fehler
// (3DS/Netz/Stripe-5xx) schloss die Abrechnung dauerhaft vom Einzug aus =
// Umsatz-Leak. Fix: fehlgeschlagene Einzuege innerhalb eines Faelligkeits-
// Fensters erneut versuchen — aber IDEMPOTENT: einen bereits angelegten
// PaymentIntent per Status auf eine Aktion mappen statt blind neu anzulegen
// (sonst Doppelbelastung).

/** Tage nach Faelligkeit, in denen ein fehlgeschlagener Einzug weiter retry-t wird. */
export const EINZUG_RETRY_WINDOW_TAGE = 5
/** Mindest-Stunden zwischen zwei Einzugs-Versuchen derselben Abrechnung (schuetzt vor Mehrfach-Laeufen/Tag). */
export const EINZUG_POLL_COOLDOWN_H = 20

export type EinzugPiAction = 'paid' | 'pending' | 'retry'

/**
 * Mappt einen Stripe-PaymentIntent-Status auf die naechste Einzugs-Aktion.
 * Kern des Doppelbelastungs-Schutzes: wird ein bestehender PI VOR dem Neu-Anlegen
 * abgefragt, entscheidet dieser Mapper, ob er bezahlt ist, noch laeuft (nicht neu
 * anlegen!) oder terminal-nicht-erfolgreich (sicher neuer Versuch) ist.
 *
 * - 'paid'    : PI ist durch (auch async via 3DS) -> als bezahlt markieren, KEIN neuer Charge.
 * - 'pending' : PI laeuft noch (processing / requires_action / requires_confirmation /
 *               requires_capture) -> NICHT neu anlegen, naechsten Lauf erneut pollen.
 * - 'retry'   : PI terminal-nicht-erfolgreich (canceled / requires_payment_method /
 *               unbekannt) -> ein neuer Einzugsversuch ist sicher.
 */
export function piStatusToEinzugAction(status: string): EinzugPiAction {
  switch (status) {
    case 'succeeded':
      return 'paid'
    case 'processing':
    case 'requires_action':
    case 'requires_confirmation':
    case 'requires_capture':
      return 'pending'
    default:
      // canceled | requires_payment_method | unbekannt -> neuer Versuch (idempotent, alter PI terminal)
      return 'retry'
  }
}

/** ISO-Datum (YYYY-MM-DD) fuer den Beginn des Retry-Fensters, `refMs` Tage-basiert. */
export function retryFensterStartDatum(refMs: number, tage: number = EINZUG_RETRY_WINDOW_TAGE): string {
  return new Date(refMs - tage * 86_400_000).toISOString().slice(0, 10)
}

/** ISO-Timestamp fuer den Poll-Cooldown-Cutoff (Versuche aelter als dieser sind wieder faellig). */
export function pollCooldownCutoff(refMs: number, stunden: number = EINZUG_POLL_COOLDOWN_H): string {
  return new Date(refMs - stunden * 3_600_000).toISOString()
}

export type EinzugCreateBranch = 'paid' | 'im_einzug' | 'fehlgeschlagen'

/**
 * Klassifiziert den Status eines FRISCH ERSTELLTEN Einzugs-PaymentIntent in
 * einen abrechnungen.status-Wert. Anders als piStatusToEinzugAction (Retrieve/
 * Re-Charge-Entscheidung) entscheidet dies nach dem confirm-Aufruf:
 *   - succeeded  -> 'paid'          (Karte sofort durch)
 *   - processing -> 'im_einzug'     (SEPA eingereicht, settled asynchron; KEIN Fehler)
 *   - sonst      -> 'fehlgeschlagen'(requires_action/-payment_method/canceled/unbekannt)
 */
export function einzugBranchFuerPiStatus(status: string): EinzugCreateBranch {
  if (status === 'succeeded') return 'paid'
  if (status === 'processing') return 'im_einzug'
  return 'fehlgeschlagen'
}
