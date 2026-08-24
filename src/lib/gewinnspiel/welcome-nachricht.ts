import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNachricht } from '@/lib/whatsapp/send'

/**
 * Deckel pro Lauf. Baileys ist eine inoffizielle WhatsApp-Anbindung, und
 * Massen-Outbound an fremde Nummern ist der klassische Sperr-Ausloeser. Ein
 * Ban traefe nicht nur das Gewinnspiel, sondern die laufende
 * Fall-Kommunikation ueber dieselbe Nummer (Aaron 23.08.: bewusst dieselbe
 * Nummer, "aktuell laeuft nicht viel darueber").
 *
 * Der Versand ist zusaetzlich admin-getriggert, also durch einen Menschen
 * getaktet — es gibt keinen Cron, der unbeaufsichtigt hochfaehrt.
 */
const STANDARD_LIMIT = 25

const WELCOME_TEXT =
  'Hallo! Ihre Teilnahme an unserem täglichen Gewinnspiel ist eingegangen: ' +
  'Wir verlosen jeden Tag 3 × 50 € Gutschein unter allen Teilnehmern mit ' +
  'unverschuldetem Unfall. Antworten Sie kurz auf diese Nachricht, dann ist ' +
  'Ihre Teilnahme bestätigt. Viel Glück! Ihr Claimondo-Team'

export type WelcomeErgebnis = {
  ok: boolean
  gesendet: number
  /** Offene Teilnahmen, bei denen der Versand scheiterte (meist: kein WhatsApp). */
  fehlgeschlagen: number
  error?: string
}

/**
 * Schickt die Willkommens-Nachricht an alle offenen Teilnahmen, die noch keine
 * bekommen haben, und markiert den Sendezeitpunkt.
 *
 * Die eigentliche Verifikation passiert NICHT hier: sie gilt erst, wenn der
 * Teilnehmer antwortet (Inbound setzt whatsapp_verifiziert_am). Diese Funktion
 * eroeffnet nur den Kanal.
 *
 * Kein Fallback auf SMS/E-Mail: Zweck ist die Verifikation der Mobilnummer per
 * WhatsApp. Ist WhatsApp nicht erreichbar, bleibt die Teilnahme unverifiziert
 * und damit ausserhalb des Lostopfs — sichtbar in den Admin-Kennzahlen.
 */
export async function sendeWelcomeFuerOffeneTeilnahmen(
  limit: number = STANDARD_LIMIT,
): Promise<WelcomeErgebnis> {
  const supabase = createAdminClient()

  const { data: offene, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .select('id, telefon_normalisiert, anfrage_id, lead_id')
    .eq('status', 'offen')
    .is('whatsapp_gesendet_am', null)
    .limit(limit)

  if (error) {
    console.error('[gewinnspiel] offene Teilnahmen lesen:', error)
    return { ok: false, gesendet: 0, fehlgeschlagen: 0, error: error.message }
  }

  let gesendet = 0
  let fehlgeschlagen = 0

  for (const teilnahme of offene ?? []) {
    // entity bestimmt, wo der WA-Verfuegbarkeits-Cache und das Audit-Log
    // haengen. 'gfa' = gutachter_finder_anfragen, 'lead' = leads.
    const entity = teilnahme.anfrage_id ? ('gfa' as const) : ('lead' as const)
    const entityId = teilnahme.anfrage_id ?? teilnahme.lead_id
    if (!entityId) {
      console.error('[gewinnspiel] Teilnahme ohne Quelle:', teilnahme.id)
      fehlgeschlagen += 1
      continue
    }

    const res = await sendNachricht({
      entity,
      entityId,
      phone: teilnahme.telefon_normalisiert,
      text: WELCOME_TEXT,
      templateKey: 'gewinnspiel_welcome',
      empfaengerRolle: 'kunde',
    })

    if (!res.ok) {
      console.error('[gewinnspiel] Welcome fehlgeschlagen:', teilnahme.id, res.error)
      fehlgeschlagen += 1
      continue
    }
    gesendet += 1

    const { error: updateError } = await supabase
      .from('gewinnspiel_teilnahmen')
      .update({ whatsapp_gesendet_am: new Date().toISOString() })
      .eq('id', teilnahme.id)
      .select('id')

    if (updateError) {
      // Der Send ist raus, nur die Markierung fehlt. Beim naechsten Lauf wuerde
      // dieselbe Person erneut angeschrieben — deshalb laut loggen.
      console.error('[gewinnspiel] Sendezeitpunkt markieren:', teilnahme.id, updateError)
    }
  }

  return { ok: true, gesendet, fehlgeschlagen }
}
