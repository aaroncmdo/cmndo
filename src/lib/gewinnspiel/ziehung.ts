import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Fisher-Yates auf einer Kopie, gespeist aus node:crypto.
 *
 * Bewusst NICHT Math.random(): hier werden Geldwerte verteilt, und die Ziehung
 * muss im Streitfall als zufaellig verteidigbar sein.
 *
 * Exportiert, damit die Auswahl ohne Datenbank testbar ist.
 */
export function waehleGewinner<T>(lostopf: T[], anzahl: number): T[] {
  const kopie = [...lostopf]
  const ziel = Math.min(anzahl, kopie.length)
  for (let i = 0; i < ziel; i++) {
    // randomInt(max) ist exklusiv; kopie.length - i ist hier immer >= 1.
    const j = i + randomInt(kopie.length - i)
    ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
  }
  return kopie.slice(0, ziel)
}

export type ZiehungsErgebnis = {
  ok: boolean
  gezogen: number
  /** Groesse des Lostopfs zum Ziehungszeitpunkt — auch bei 0 Gewinnern relevant. */
  lostopfGroesse: number
  error?: string
}

/**
 * Zieht bis zu `preise_pro_tag` Gewinner aus den verifizierten, offenen
 * Teilnahmen der aktiven Kampagne.
 *
 * "Bis zu": bei Unterdeckung werden weniger gezogen. Das ist der Normalfall,
 * nicht die Ausnahme — beim Start liegt der gesamte teilnahmeberechtigte
 * Bestand bei rund 29 Personen (Spec 3.2), und die Teilnahmebedingungen sind
 * entsprechend als "bis zu 3 Gewinner" formuliert.
 *
 * Nur verifizierte Teilnahmen (whatsapp_verifiziert_am gesetzt) kommen in den
 * Topf: sonst koennte jemand mit einer fremden Nummer gewinnen.
 */
export async function fuehreZiehungDurch(userId: string): Promise<ZiehungsErgebnis> {
  const supabase = createAdminClient()

  const { data: kampagne, error: kampagneError } = await supabase
    .from('gewinnspiel_kampagnen')
    .select('id, preise_pro_tag')
    .eq('aktiv', true)
    .maybeSingle()

  if (kampagneError) return { ok: false, gezogen: 0, lostopfGroesse: 0, error: kampagneError.message }
  if (!kampagne) return { ok: false, gezogen: 0, lostopfGroesse: 0, error: 'Keine aktive Kampagne.' }

  const { data: lostopf, error: lostopfError } = await supabase
    .from('gewinnspiel_teilnahmen')
    .select('id')
    .eq('kampagne_id', kampagne.id)
    .eq('status', 'offen')
    .not('whatsapp_verifiziert_am', 'is', null)

  if (lostopfError) return { ok: false, gezogen: 0, lostopfGroesse: 0, error: lostopfError.message }

  const kandidaten = lostopf ?? []
  if (kandidaten.length === 0) return { ok: true, gezogen: 0, lostopfGroesse: 0 }

  const gewinner = waehleGewinner(kandidaten, kampagne.preise_pro_tag)
  const jetzt = new Date().toISOString()

  let gezogen = 0
  for (const g of gewinner) {
    const { data, error } = await supabase
      .from('gewinnspiel_teilnahmen')
      .update({
        status: 'nachweis_offen',
        gezogen_am: jetzt,
        gezogen_von_user_id: userId,
        ziehung_lostopf_groesse: kandidaten.length,
        nachweis_token: randomUUID(),
      })
      .eq('id', g.id)
      // Schutz gegen Doppelziehung: klickt jemand zweimal (oder zwei Admins
      // gleichzeitig), trifft der zweite Versuch keine Zeile mehr.
      .eq('status', 'offen')
      .select('id')

    if (error) {
      console.error('[gewinnspiel] Gewinner markieren:', g.id, error)
      continue
    }
    if (!data || data.length === 0) continue // war bereits gezogen
    gezogen += 1
  }

  return { ok: true, gezogen, lostopfGroesse: kandidaten.length }
}
