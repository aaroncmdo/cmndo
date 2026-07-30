// Server-Loader fuer die Werkstatt-Matching-Engine (Spec B, Aaron 14.07.).
// Holt die Kandidaten + loest die Fahrzeugklasse auf; das RANKING selbst ist pure und getestet
// (rank-vorschlaege.ts). Diese Datei ist die einzige Stelle, die beides zusammenbringt.

import { createAdminClient } from '@/lib/supabase/admin'
import { ermittleReparaturbedarf } from '@/lib/werkstatt/bedarf/ermittle-bedarf'
import { filterEchteWerkstaetten } from '@/lib/werkstatt/finder'
import { applyNetzwerkPraeferenz } from '@/lib/netzwerk/apply-netzwerk-praeferenz'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'
import {
  rankeWerkstattVorschlaege,
  type MatchingKontext,
  type WerkstattKandidat,
  type WerkstattVorschlag,
} from './rank-vorschlaege'

// ⚠ createAdminClient() ist UNGETYPT -> tsc prueft diesen String NICHT. Er wurde am 14.07. gegen die
// prod-DB geprobt (Regel aus reference-supabase-select-strings-untyped-admin-client): ein falscher
// Spaltenname liefert einen STILLEN PostgREST-400 mit data=null, den kein Test faengt.
// `email` NUR fuer den Test-Werkstatt-Filter (istInterneEmail) — nie an den Client.
const SELECT_COLS =
  'id,name,adresse_strasse,adresse_plz,adresse_ort,telefon,lat,lng,status,faehigkeiten,verifiziert,marken,ist_freie_werkstatt,fahrzeug_gruppen,google_rating,google_review_count,email'

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
  /**
   * Kunden-/Flow-Surfaces MUESSEN nurEchte=true setzen: sonst sieht ein echter Kunde die
   * Test-/internen Werkstaetten (email-basiert, SSoT interne-identitaet.ts). Dispatch/Admin rufen
   * ohne den Filter und sehen alle. Das muss zwischen "anbieten" und "Auswahl validieren"
   * DECKUNGSGLEICH sein — sonst wird eine angebotene Werkstatt beim Auswaehlen abgelehnt.
   */
  nurEchte?: boolean
  /**
   * D1 (Aaron 27.07.): Anzeige-Umkreis in km um den Anker. Weglassen = MAX_UMKREIS_KM (50,
   * korrekt fuer alle Kunden-Surfaces); null = ungecappt (nur interne Tools).
   */
  maxUmkreisKm?: number | null
  /**
   * P2-T6 (Netzwerk): Owner-Knoten (profiles.id) fuer die relationale "Dein Netzwerk"-Partition.
   * null/undefined = No-op (exakt dieselbe Rangfolge wie bisher). K12: die Partition laeuft als
   * ALLERLETZTER Schritt nach dem Ranking, K10: EIN Freund-Batch pro Aufruf.
   */
  ownerProfilId?: string | null
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

  const rows = (werkstaettenRes.data ?? []) as unknown as Array<
    WerkstattKandidat & { email: string | null }
  >
  const kandidaten = input.nurEchte ? filterEchteWerkstaetten(rows) : rows

  const kontext: MatchingKontext = {
    fahrzeugGruppe,
    marke: input.marke,
    bedarf: input.bedarf,
    bedarfConfidence: input.bedarfConfidence,
    anker: input.anker,
    maxUmkreisKm: input.maxUmkreisKm,
  }

  const vorschlaege = rankeWerkstattVorschlaege(kandidaten, kontext, input.limit)
  if (!input.ownerProfilId) return vorschlaege

  // K10: 1 Batch — Freund-Werkstatt-Ids (werkstaetten.id) des Owners. K12: Partition als
  // allerletzter Schritt, stabile Reihenfolge innerhalb beider Gruppen bleibt erhalten.
  const freundIds = await ladeFreundKandidatIds(admin, input.ownerProfilId, 'werkstatt')
  // WerkstattVorschlag.passt = Engine-Qualifikation -> als `qualifiziert` durchreichen
  // (nur qualifizierte Freunde floaten — Engine-Fit schlaegt Freundschaft, Design §5.2).
  return applyNetzwerkPraeferenz(
    vorschlaege.map((v) => ({ ...v, qualifiziert: v.passt })),
    freundIds,
  )
}

/**
 * Der bequeme Einstieg fuer Lead/Claim: laedt Anker + Fahrzeug + Bedarf und liefert die 5 Vorschlaege.
 *
 * ⚠ ANKER-FIX (Aaron 14.07.): Der Geo-Anker ist der FAHRZEUGSTANDORT — wo das Auto steht. Das
 * bestehende findReparaturWerkstaettenForTarget ankert auf besichtigungsort -> unfallort -> plz, also
 * auf dem BESICHTIGUNGSort. Das ist falsch: der Besichtigungsort sagt, wo der Gutachter hinkommt; die
 * Werkstatt muss nah am FAHRZEUG sein. Die beiden Orte koennen weit auseinanderliegen (das Auto steht
 * laengst in einer Halle, waehrend der SV beim Kunden besichtigt).
 * Reihenfolge: fahrzeug_standort -> besichtigungsort -> unfallort (dort steht das Auto evtl. noch).
 */
export async function findWerkstattVorschlaegeFuer(
  target: { target: 'lead' | 'claim'; id: string; nurEchte?: boolean; ownerProfilId?: string | null },
  limit?: number,
): Promise<WerkstattVorschlag[]> {
  const admin = createAdminClient()

  let anker: { lat: number; lng: number } | null = null
  let marke: string | null = null
  let fahrzeugklasse: string | null = null

  if (target.target === 'lead') {
    // ⚠ Select gegen die prod-DB geprobt (ungetypter Admin-Client).
    const { data, error } = await admin
      .from('leads')
      .select(
        'fahrzeug_standort_lat, fahrzeug_standort_lng, besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, fahrzeug_hersteller, fahrzeugklasse',
      )
      .eq('id', target.id)
      .maybeSingle()
    if (error) console.error('[werkstatt-matching] lead:', error.message)
    const l = data as Record<string, unknown> | null
    if (l) {
      anker = ersterAnker([
        [l.fahrzeug_standort_lat, l.fahrzeug_standort_lng],
        [l.besichtigungsort_lat, l.besichtigungsort_lng],
        [l.unfallort_lat, l.unfallort_lng],
      ])
      marke = (l.fahrzeug_hersteller as string | null) ?? null
      fahrzeugklasse = (l.fahrzeugklasse as string | null) ?? null
    }
  } else {
    const { data, error } = await admin
      .from('claims')
      .select('schadenort_lat, schadenort_lng, vehicle_id')
      .eq('id', target.id)
      .maybeSingle()
    if (error) console.error('[werkstatt-matching] claim:', error.message)
    const c = data as Record<string, unknown> | null
    if (c) {
      anker = ersterAnker([[c.schadenort_lat, c.schadenort_lng]])
      // Fahrzeugdaten haengen am vehicle (SSoT nach dem Convert).
      const vehicleId = (c.vehicle_id as string | null) ?? null
      if (vehicleId) {
        const { data: v } = await admin
          .from('vehicles')
          .select('hersteller, fahrzeugklasse')
          .eq('id', vehicleId)
          .maybeSingle()
        marke = ((v as Record<string, unknown> | null)?.hersteller as string | null) ?? null
        fahrzeugklasse =
          ((v as Record<string, unknown> | null)?.fahrzeugklasse as string | null) ?? null
      }
    }
  }

  // Bedarf: Gutachten (conf 100) > Foto-KI > manuell (40) > unbekannt — bestehende Evidenz-Eskalation.
  const bedarf = await ermittleReparaturbedarf(admin, {
    claimId: target.target === 'claim' ? target.id : undefined,
    leadId: target.target === 'lead' ? target.id : undefined,
  })

  return ladeWerkstattVorschlaege({
    fahrzeugklasse,
    marke,
    bedarf: bedarf.kategorien,
    bedarfConfidence: bedarf.confidence,
    anker,
    limit,
    nurEchte: target.nurEchte,
    ownerProfilId: target.ownerProfilId,
  })
}

/** Erster Eintrag mit beiden Koordinaten (Fallback-Kette). */
function ersterAnker(kandidaten: Array<[unknown, unknown]>): { lat: number; lng: number } | null {
  for (const [lat, lng] of kandidaten) {
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
  }
  return null
}
