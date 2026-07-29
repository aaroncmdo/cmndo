// Werkstatt-Onboarding-Drip — Merge-Vars-Builder + dynamischer SV-Resolver.
//
// SV-Aufloesung (nur fuer sv_vorstellung) laeuft NICHT ueber findeBestePerson (Dispatch-
// internes Scoring, leaky SvMatchCandidate), sondern ueber `planeTerminOeffentlich`
// (AAR-941 Self-Service-Matching-Modul, `@/lib/sv-matching-modul`) — dieselbe leak-sichere,
// geo-geankte Quelle, die auch /flow speist (EIN Matching-Pfad, kein Duplikat). Sie liefert
// bereits die kundensichere `OeffentlichesSvProfil[]`-Projektion: `vorname` (kein Nachname),
// `profilbild`, Bewertungen — aber KEIN `region`/Kontakt-Feld (die kommen aus der
// Werkstatt-Row bzw. bleiben leer, s.u.).
import { planeTerminOeffentlich } from '@/lib/sv-matching-modul'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WerkstattMergeVars, TemplateKey } from '@/lib/email/google/templates/aktivierung/types'

export type WerkstattRow = {
  id: string
  name: string
  adresse_ort: string | null
  lat: number | null
  lng: number | null
}

export type DripConfig = {
  ansprechpartner: string // Nicolas
  tel: string
  portalBaseUrl: string
}

export async function buildWerkstattMergeVars(args: {
  db: SupabaseClient
  werkstatt: WerkstattRow
  templateKey: TemplateKey
  config: DripConfig
}): Promise<WerkstattMergeVars> {
  const { werkstatt, templateKey, config } = args
  const base: WerkstattMergeVars = {
    werkstattName: werkstatt.name,
    ansprechpartner: config.ansprechpartner,
    tel: config.tel,
    portalLink: `${config.portalBaseUrl}/werkstatt`,
  }

  if (templateKey !== 'sv_vorstellung') return base

  const { lat, lng } = werkstatt
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ...base, sv: null }

  const svs = await planeTerminOeffentlich({ lat: lat as number, lng: lng as number })
  if (svs.length === 0) return { ...base, sv: null }

  const bester = svs[0]
  return {
    ...base,
    sv: {
      name: bester.vorname,
      region: werkstatt.adresse_ort ?? 'deiner Region',
      photoUrl: bester.profilbild ?? undefined,
      // planeTerminOeffentlich projiziert keinen Kontakt/Telefon (leak-sicher) —
      // die SvVorstellung-Mail zeigt keinen direkten SV-Kontakt vor Terminvereinbarung.
      contact: '',
    },
  }
}
