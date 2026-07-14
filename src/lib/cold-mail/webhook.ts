// Cold-Mailer S3 — Resend-Webhook: reine Logik (Event-Mapping, Status-Rang, Signatur).
// Kein DB-Zugriff -> ohne Netz/DB testbar. Die Route drumherum ist nur die Schale.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type ColdMailSendStatus =
  | 'gesendet'
  | 'zugestellt'
  | 'geoeffnet'
  | 'geklickt'
  | 'bounced'
  | 'beschwerde'

/** Resend-Event -> unser cold_mail_sends.status-CHECK-Vokabular. Unbekannt = ignorieren. */
export function mapResendEvent(typ: string): ColdMailSendStatus | null {
  switch (typ) {
    case 'email.sent':
      return 'gesendet'
    case 'email.delivered':
      return 'zugestellt'
    case 'email.opened':
      return 'geoeffnet'
    case 'email.clicked':
      return 'geklickt'
    case 'email.bounced':
      return 'bounced'
    case 'email.complained':
      return 'beschwerde'
    default:
      // z.B. email.delivery_delayed, contact.* — kein Status-Update, aber auch kein Fehler.
      return null
  }
}

/**
 * Rang der Status. Webhooks kommen OUT-OF-ORDER an und werden von Svix RETRIED —
 * ohne Rang wuerde ein spaet eintreffendes "zugestellt" ein bereits gesetztes
 * "geoeffnet" wieder ueberschreiben (Daten-Rueckschritt).
 *
 * bounced/beschwerde stehen bewusst OBEN: sie loesen die Suppression aus und duerfen
 * niemals von einem nachzuegelnden "zugestellt" verdraengt werden.
 */
const STATUS_RANG: Record<ColdMailSendStatus, number> = {
  gesendet: 1,
  zugestellt: 2,
  geoeffnet: 3,
  geklickt: 4,
  bounced: 5,
  beschwerde: 6,
}

/** Nur aufwaerts aktualisieren -> idempotent (gleicher Event nochmal = kein Write). */
export function sollStatusUebernehmen(aktuell: string, neu: ColdMailSendStatus): boolean {
  const rangAktuell = STATUS_RANG[aktuell as ColdMailSendStatus] ?? 0
  return STATUS_RANG[neu] > rangAktuell
}

/** Alter Timestamp -> Replay. 5 Minuten Toleranz (Svix-Konvention). */
const TOLERANZ_SEK = 5 * 60

/**
 * Verifiziert die Resend-Webhook-Signatur (Svix-Schema).
 *
 * Die `svix`-Lib ist bewusst KEINE Dependency — das Schema ist klein und stabil:
 *   signierter Inhalt = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   Key               = base64-decode(secret ohne "whsec_"-Praefix)
 *   Header            = leerzeichen-getrennte `v1,<base64sig>` (mehrere bei Key-Rotation)
 *
 * WICHTIG fuer den Caller: der ROHE Body muss verwendet werden (request.text()),
 * nicht ein re-serialisiertes JSON.parse -> sonst weicht ein Byte ab und alles bricht.
 */
export function verifyResendSignatur(opts: {
  secret: string
  svixId: string
  svixTimestamp: string
  body: string
  signaturHeader: string
  jetzt?: Date
}): boolean {
  const { secret, svixId, svixTimestamp, body, signaturHeader } = opts
  if (!secret || !svixId || !svixTimestamp || !signaturHeader) return false

  // Replay-Schutz
  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts)) return false
  const jetztSek = Math.floor((opts.jetzt ?? new Date()).getTime() / 1000)
  if (Math.abs(jetztSek - ts) > TOLERANZ_SEK) return false

  let key: Buffer
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  } catch {
    return false
  }
  if (key.length === 0) return false

  const erwartet = createHmac('sha256', key).update(`${svixId}.${svixTimestamp}.${body}`).digest()

  // Der Header kann mehrere Signaturen tragen (Key-Rotation) -> jede pruefen.
  for (const teil of signaturHeader.split(' ')) {
    const [version, sig] = teil.split(',')
    if (version !== 'v1' || !sig) continue
    let geliefert: Buffer
    try {
      geliefert = Buffer.from(sig, 'base64')
    } catch {
      continue
    }
    if (geliefert.length !== erwartet.length) continue
    if (timingSafeEqual(geliefert, erwartet)) return true
  }
  return false
}
