import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { qualifiziertFuerGewinnspiel } from './qualifikation'

export type RegistriereInput = {
  quelle: { anfrageId: string } | { leadId: string }
  telefon?: string | null
  schuldfrage?: string | null
  schuldEinschaetzung?: string | null
  /** Vom Teilnehmer im Formular gewaehlte Praemie (Aaron 23.08.: die Wahl
   *  faellt bei der TEILNAHME, nicht erst beim Gewinn). Wird gegen die
   *  Praemien der aktiven Kampagne geprueft — eine fremde oder inaktive ID
   *  wird verworfen, nicht uebernommen. */
  praemieId?: string | null
}

export type RegistriereErgebnis = {
  ok: boolean
  teilnahmeId?: string
  /** Gesetzt, wenn bewusst nichts angelegt wurde. Kein Fehler. */
  uebersprungen?: string
  error?: string
}

/**
 * Legt fuer einen qualifizierenden Lead eine Gewinnspiel-Teilnahme an.
 *
 * NON-FATAL by design: jeder Aufrufer ist ein Schadenmeldungs-Pfad. Ein Fehler
 * hier darf die Meldung nie verhindern — deshalb liefert die Funktion immer ein
 * Result-Object und wirft nie.
 *
 * Dedup laeuft ueber den Unique-Index (kampagne_id, telefon_normalisiert):
 * ein Zweit-Insert derselben Nummer schlaegt mit 23505 fehl und gilt als
 * 'bereits_teilgenommen' — das ist der Normalfall bei einem zweiten Kontakt
 * derselben Person, kein Fehler.
 */
export async function registriereTeilnahme(
  input: RegistriereInput,
): Promise<RegistriereErgebnis> {
  const qual = qualifiziertFuerGewinnspiel({
    telefon: input.telefon,
    schuldfrage: input.schuldfrage,
    schuldEinschaetzung: input.schuldEinschaetzung,
  })
  if (!qual.qualifiziert) return { ok: true, uebersprungen: qual.grund }

  const supabase = createAdminClient()

  const { data: kampagne, error: kampagneError } = await supabase
    .from('gewinnspiel_kampagnen')
    .select('id')
    .eq('aktiv', true)
    .maybeSingle()

  if (kampagneError) {
    console.error('[gewinnspiel] Kampagne lesen:', kampagneError)
    return { ok: false, error: kampagneError.message }
  }
  if (!kampagne) return { ok: true, uebersprungen: 'keine_aktive_kampagne' }

  // Praemien-Wahl gegen die Kampagne pruefen. Ohne diese Pruefung koennte ein
  // manipulierter Submit eine beliebige fremde Praemien-ID setzen. Faellt die
  // Pruefung durch, entsteht die Teilnahme trotzdem — der Lead ist wichtiger
  // als die Wahl, und der Admin kann sie beim Gewinn nachtragen.
  let praemieId: string | null = null
  if (input.praemieId) {
    const { data: praemie } = await supabase
      .from('gewinnspiel_praemien')
      .select('id')
      .eq('id', input.praemieId)
      .eq('kampagne_id', kampagne.id)
      .eq('aktiv', true)
      .maybeSingle()
    praemieId = praemie?.id ?? null
    if (!praemieId) {
      console.warn('[gewinnspiel] Praemien-Wahl verworfen (unbekannt/inaktiv):', input.praemieId)
    }
  }

  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .insert({
      kampagne_id: kampagne.id,
      anfrage_id: 'anfrageId' in input.quelle ? input.quelle.anfrageId : null,
      lead_id: 'leadId' in input.quelle ? input.quelle.leadId : null,
      telefon_normalisiert: qual.telefonNormalisiert!,
      gewaehlte_praemie_id: praemieId,
      status: 'offen',
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = Unique-Verletzung: diese Nummer nimmt in dieser Kampagne schon
    // teil. Erwarteter Normalfall, kein Fehler — aber ein verwertbarer Hinweis:
    // die AKTUELLE Anfrage ist nachweislich eine Wiederholung derselben Person.
    // Das Gewinnspiel ist dagegen geschuetzt (nur ein Los), die Dispatch-Queue
    // bekommt aber trotzdem einen zweiten Lead. Aaron 23.08.: "jetzt nur
    // sichtbar machen" — deshalb Marker statt Zusammenlegen.
    if (error.code === '23505') {
      await markiereWiederholung(supabase, input.quelle)
      return { ok: true, uebersprungen: 'bereits_teilgenommen' }
    }
    console.error('[gewinnspiel] Teilnahme anlegen:', error)
    return { ok: false, error: error.message }
  }

  return { ok: true, teilnahmeId: data.id }
}

/**
 * Setzt den Wiederholungs-Marker auf der Quelle (Anfrage oder Lead).
 *
 * Non-fatal: der Marker ist ein Hinweis fuer Dispatch, keine Steuerung. Schlaegt
 * er fehl, ist die Meldung trotzdem vollstaendig — deshalb nur geloggt.
 */
async function markiereWiederholung(
  supabase: ReturnType<typeof createAdminClient>,
  quelle: RegistriereInput['quelle'],
): Promise<void> {
  const jetzt = new Date().toISOString()
  const tabelle = 'anfrageId' in quelle ? 'gutachter_finder_anfragen' : 'leads'
  const id = 'anfrageId' in quelle ? quelle.anfrageId : quelle.leadId

  const { error } = await supabase
    .from(tabelle)
    .update({ wiederholung_erkannt_am: jetzt })
    .eq('id', id)
    .select('id')

  if (error) console.error('[gewinnspiel] Wiederholungs-Marker (non-fatal):', error)
}
