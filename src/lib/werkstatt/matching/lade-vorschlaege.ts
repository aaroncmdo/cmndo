// Server-Loader fuer die Werkstatt-Matching-Engine (Spec B, Aaron 14.07.).
// Holt die Kandidaten + loest die Fahrzeugklasse auf; das RANKING selbst ist pure und getestet
// (rank-vorschlaege.ts). Diese Datei ist die einzige Stelle, die beides zusammenbringt.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  rankeWerkstattVorschlaege,
  type MatchingKontext,
  type WerkstattKandidat,
  type WerkstattVorschlag,
} from './rank-vorschlaege'

// ⚠ createAdminClient() ist UNGETYPT -> tsc prueft diesen String NICHT. Er wurde am 14.07. gegen die
// prod-DB geprobt (Regel aus reference-supabase-select-strings-untyped-admin-client): ein falscher
// Spaltenname liefert einen STILLEN PostgREST-400 mit data=null, den kein Test faengt.
const SELECT_COLS =
  'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten,verifiziert,marken,ist_freie_werkstatt,fahrzeug_gruppen'

/**
 * EU-/KBA-Fahrzeugklasse (Feld J: M1, N1, L3e, ...) -> Reparatur-Gruppe (pkw, transporter, lkw, ...).
 * Das Mapping liegt in der Tabelle `fahrzeugklassen`, nicht im Code -> ohne Deploy pflegbar.
 */
export async function reparaturGruppeFuer(fahrzeugklasse: string | null): Promise<string | null> {
  if (!fahrzeugklasse) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('fahrzeugklassen')
    .select('reparatur_gruppe')
    .eq('eu_klasse', fahrzeugklasse.trim())
    .maybeSingle()
  if (error) {
    console.error('[werkstatt-matching] fahrzeugklassen:', error.message)
    return null
  }
  return (data?.reparatur_gruppe as string | null) ?? null
}

/**
 * Die bis zu 5 passendsten Werkstaetten — gerankt, jede mit sichtbaren Gruenden.
 * Ranking: Marke ("BMW markengebunden schlaegt freie Werkstatt") > Gewerke-Fit > Fahrzeug-Gruppe >
 * verifiziert > Entfernung zum FAHRZEUGSTANDORT.
 */
export async function ladeWerkstattVorschlaege(input: {
  /** EU-Klasse aus dem Fahrzeugschein (leads/vehicles.fahrzeugklasse). */
  fahrzeugklasse: string | null
  /** Automarke (leads.fahrzeug_hersteller / vehicles.hersteller). */
  marke: string | null
  /** Gewerke-Bedarf (bedarf_kategorien) + dessen Confidence (bedarf_confidence). */
  bedarf: string[]
  bedarfConfidence: number
  /** Geo-Anker = FAHRZEUGSTANDORT (wo das Auto steht), NICHT der Besichtigungsort. */
  anker: { lat: number; lng: number } | null
  limit?: number
}): Promise<WerkstattVorschlag[]> {
  const admin = createAdminClient()

  const [werkstaettenRes, fahrzeugGruppe] = await Promise.all([
    admin.from('werkstaetten').select(SELECT_COLS).eq('status', 'aktiv'),
    reparaturGruppeFuer(input.fahrzeugklasse),
  ])

  if (werkstaettenRes.error) {
    console.error('[werkstatt-matching] werkstaetten:', werkstaettenRes.error.message)
    return []
  }

  const kontext: MatchingKontext = {
    fahrzeugGruppe,
    marke: input.marke,
    bedarf: input.bedarf,
    bedarfConfidence: input.bedarfConfidence,
    anker: input.anker,
  }

  return rankeWerkstattVorschlaege(
    (werkstaettenRes.data ?? []) as unknown as WerkstattKandidat[],
    kontext,
    input.limit,
  )
}
