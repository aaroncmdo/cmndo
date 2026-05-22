// Reine Logik fuer den matelso-Webhook — kein DB-/HTTP-Zugriff, voll testbar.
import crypto from 'node:crypto'

export type MatelsoCallStatus = 'answered' | 'missed' | 'voicemail' | 'failed' | 'other'

/**
 * Normalisiert matelsos callStatus (Werte tarifabhaengig) auf eine kleine
 * Menge. Das Original wird separat in matelso_calls.status_raw gespeichert,
 * daher ist diese Abbildung best-effort und darf nie werfen.
 */
export function normalizeMatelsoStatus(raw: string | undefined | null): MatelsoCallStatus {
  const s = (raw ?? '').toLowerCase().trim()
  if (!s) return 'other'
  if (s.includes('voicemail') || s.includes('mailbox')) return 'voicemail'
  if (/no-?answer/.test(s)) return 'missed' // no-answer, noanswer
  if (s.includes('miss') || s.includes('cancel') || s.includes('reject') || s.includes('abandon')) return 'missed'
  if (s.includes('busy') || s.includes('fail')) return 'failed'
  if (s.includes('answer') || s.includes('complete') || s.includes('connect')) return 'answered'
  return 'other'
}

/**
 * Idempotenz-Schluessel fuer matelso_calls.external_call_id (UNIQUE).
 * Prio: matelso call_id. Fallback: stabiler Hash aus from+zeitpunkt.
 * Letzter Fallback: zufaellig (keine Idempotenz, aber kein UNIQUE-Clash).
 * `from` = anrufer_nummer aus dem matelso-Payload.
 */
export function buildDedupKey(input: { callId?: string | null; from?: string | null; zeitpunkt?: string | null }): string {
  const callId = (input.callId ?? '').trim()
  if (callId) return `matelso:${callId}`
  const from = (input.from ?? '').trim()
  const zeitpunkt = (input.zeitpunkt ?? '').trim()
  if (from && zeitpunkt) {
    const h = crypto.createHash('sha256').update(`${from}|${zeitpunkt}`).digest('hex').slice(0, 24)
    return `matelso:fallback:${h}`
  }
  return `matelso:nokey:${crypto.randomUUID()}`
}

/** Notification-Ziel: Lead-Detail vor Fall-Detail. */
export function pickNotificationLink(leadId: string | null, fallId: string | null): string | undefined {
  if (leadId) return `/dispatch/leads/${leadId}`
  if (fallId) return `/faelle/${fallId}`
  return undefined
}

/** Titel + Beschreibung der Dispatch-Notification (nutzersichtbar — Umlaute). */
export function buildCallNotificationText(args: {
  fromNumber: string
  quelle: string | null
  status: string
  duration: number | null
}): { titel: string; beschreibung: string } {
  const titel = args.fromNumber
    ? `Eingehender Anruf von ${args.fromNumber}`
    : 'Eingehender Anruf mit unterdrückter Nummer'
  const beschreibung = [args.quelle ?? 'Quelle unbekannt', `Status: ${args.status}`, `Dauer: ${args.duration ?? 0}s`].join(' · ')
  return { titel, beschreibung }
}
