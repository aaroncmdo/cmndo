// T4 (operativer-schaden-flow): Flottenmanager per WhatsApp benachrichtigen, sobald ein
// Schaden ueber die Schadenkarte gemeldet wurde. Sendet an die whatsapp_nummer(n) der
// aktiven FM-Konten der Firma (T2). Bewusst direkt via sendWhatsAppText (kein sendNachricht):
// dessen WA-Cache haengt an lead/profile/gfa — die Konto-Nummer wuerde den profiles-Cache
// verfaelschen. Fail-soft: kein Fehler bricht den Caller (der Gegner-Submit).
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { getFlottenmanagerWhatsappNummern } from './konto-firma'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')

/** Baut den WhatsApp-Text fuer die FM-Schaden-Benachrichtigung (pure, testbar). */
export function buildFmSchadenNotifText(opts: {
  kennzeichen: string | null
  fahrzeug: string | null
  gegnerName: string | null
  gegnerKennzeichen: string | null
  vehicleUrl: string
}): string {
  const fahrzeugLabel =
    opts.kennzeichen && opts.fahrzeug
      ? `${opts.kennzeichen} (${opts.fahrzeug})`
      : opts.kennzeichen || opts.fahrzeug || 'unbekannt'
  const gegnerLabel = opts.gegnerKennzeichen
    ? `${opts.gegnerName || 'unbekannt'} · ${opts.gegnerKennzeichen}`
    : opts.gegnerName || 'unbekannt'
  return [
    'Neuer Schaden über Ihre Netzwerkkarte gemeldet.',
    '',
    `Fahrzeug: ${fahrzeugLabel}`,
    `Unfallgegner: ${gegnerLabel}`,
    '',
    `Details: ${opts.vehicleUrl}`,
  ].join('\n')
}

/**
 * Benachrichtigt ALLE aktiven Flottenmanager der Firma per WhatsApp ueber einen via
 * Schadenkarte gemeldeten Schaden. Link zur Fahrzeug-Detail + Eckdaten.
 * Fail-soft: Sende-Fehler werden geloggt, brechen aber nie den Caller. Ohne hinterlegte
 * WA-Nummer passiert nichts (sent:0, total:0).
 */
export async function notifyFlottenmanagerSchadenGemeldet(opts: {
  firmaId: string
  vehicleId: string
  kennzeichen: string | null
  fahrzeug: string | null
  gegnerName: string | null
  gegnerKennzeichen: string | null
}): Promise<{ sent: number; total: number }> {
  const admin = createAdminClient()
  const nummern = await getFlottenmanagerWhatsappNummern(admin, opts.firmaId)
  if (nummern.length === 0) return { sent: 0, total: 0 }

  const text = buildFmSchadenNotifText({
    kennzeichen: opts.kennzeichen,
    fahrzeug: opts.fahrzeug,
    gegnerName: opts.gegnerName,
    gegnerKennzeichen: opts.gegnerKennzeichen,
    vehicleUrl: `${APP_URL}/flotte/fahrzeug/${opts.vehicleId}`,
  })

  let sent = 0
  for (const nummer of nummern) {
    try {
      const r = await sendWhatsAppText(nummer, text)
      if (r.ok) sent++
      else console.error('[fm-schaden-notif] WA-Send fehlgeschlagen:', r.error)
    } catch (err) {
      console.error('[fm-schaden-notif] WA-Send warf:', err)
    }
  }
  return { sent, total: nummern.length }
}
