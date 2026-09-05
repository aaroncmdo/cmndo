// Zustellstatus transaktionaler Mails (email_log) aus den Resend-Webhook-Ereignissen.
// Pure Logik — der Route-Handler macht nur den Lookup und den Write.
//
// WARUM ES DAS GIBT (Befund 05.09.2026): Der Resend-Webhook laeuft nachweislich (cold_mail_sends traegt
// 'zugestellt'/'geklickt'), wirft die Ereignisse fuer TRANSAKTIONALE Mails aber weg — er sucht nur in
// cold_mail_sends. Auf prod standen dadurch 542 Mails aus 30 Tagen auf 'sent' und KEINE auf zugestellt:
// ein Bounce an eine falsche Kundenadresse war unsichtbar, und ein Prod-Smoke konnte nie belegen, dass
// eine Kunden-Mail wirklich ankam. Der Resend-API-Schluessel taugt dafuer nicht — er ist auf Senden
// beschraenkt ("This API key is restricted to only send emails", HTTP 401 auf jedem Lese-Endpunkt).

/** Werte des email_log_status_check (Migration 20260905220705). */
export type EmailLogStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained'

/**
 * Rang wie bei cold_mail_sends: Webhooks kommen OUT-OF-ORDER an und werden von Svix RETRIED. Ohne Rang
 * wuerde ein spaet eintreffendes 'delivered' einen bereits gesetzten Bounce ueberschreiben.
 * 'failed' bleibt bewusst niedrig (1): es beschreibt die UEBERGABE an den Provider, nicht die Zustellung —
 * ein danach eintreffendes Provider-Ereignis ist die genauere Auskunft.
 */
const RANG: Record<EmailLogStatus, number> = {
  pending: 0,
  sent: 1,
  failed: 1,
  delivered: 2,
  bounced: 3,
  complained: 3,
}

/** Resend-Ereignis -> email_log-Status. null = kein Status-Update (z.B. email.delivery_delayed, contact.*). */
export function mapResendEventFuerEmailLog(typ: string): EmailLogStatus | null {
  switch (typ) {
    case 'email.sent':
      return 'sent'
    case 'email.delivered':
      return 'delivered'
    case 'email.bounced':
      return 'bounced'
    case 'email.complained':
      return 'complained'
    // Oeffnungen und Klicks werden fuer transaktionale Mails bewusst NICHT gespeichert: sie haengen am
    // Tracking-Pixel, sagen nichts ueber die Zustellung und waeren in email_log ein neues Datum ueber das
    // Leseverhalten von Kunden. cold_mail_sends braucht sie fuer die Sequenz-Logik, email_log nicht.
    default:
      return null
  }
}

/** Nur aufwaerts aktualisieren -> idempotent (derselbe Event nochmal = kein Write). */
export function sollEmailLogStatusUebernehmen(aktuell: string | null | undefined, neu: EmailLogStatus): boolean {
  const rangAktuell = RANG[(aktuell ?? '') as EmailLogStatus] ?? 0
  return RANG[neu] > rangAktuell
}
