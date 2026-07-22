// Read-only Claim-Detail-ViewModel fuer den flottenmanager — streng firma- UND fahrzeug-gated.
// Security: kein RLS (Admin/Service-Role-Client), daher zwei Gates:
//   (1) Fahrzeug muss zur Firma gehoeren (flotten_fahrzeuge),
//   (2) der Claim muss GENAU zu diesem Fahrzeug gehoeren (claim.vehicle_id === vehicleId).
// Gibt null zurueck sobald ein Gate nicht passt (kein Cross-Firma/Cross-Fahrzeug-Leak).
//
// Reuse rollen-generischer Bausteine (statt die kunde-hardcoded Zonen): Dokument-Sichtbarkeit
// getSichtbarFuerRolle('flottenmanager') + die Kontakt-Loader getSvKontakt/getKbKontakt.
// Dokumente sind fall-gekeyt -> fall_id via faelle_claim_bridge.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSichtbarFuerRolle } from '@/lib/dokumente/sichtbarkeit'
import { getSvKontakt, getKbKontakt, type SvKontakt, type KbKontakt } from '@/lib/kunde/get-kontakt'
import { getStorageUrl } from '@/lib/storage/url'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type FlottenClaimDokument = {
  id: string
  typ: string | null
  dateiname: string | null
  hochgeladenAm: string | null
  url: string | null
}

export type FlottenClaimView = {
  claimId: string
  fallId: string | null
  claimNummer: string | null
  status: string | null
  schadentag: string | null
  schadensHoeheNetto: number | null
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  sv: SvKontakt | null
  kb: KbKontakt | null
  dokumente: FlottenClaimDokument[]
}

type DocRow = {
  id: string
  dokument_typ: string | null
  original_filename: string | null
  storage_path: string | null
  sichtbar_fuer: string[] | null
  hochgeladen_am: string | null
}

export async function getFlottenClaimView(
  db: AnyDb,
  firmaId: string,
  vehicleId: string,
  claimId: string,
): Promise<FlottenClaimView | null> {
  // Gate 1: Fahrzeug gehoert zur Firma?
  const { data: ownerRow } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
  if (!ownerRow) return null

  // Gate 2: Claim gehoert GENAU zu diesem Fahrzeug?
  const { data: claimRow } = await db
    .from('claims')
    .select('id,claim_nummer,operative_status,schadentag,schadens_hoehe_netto,vehicle_id,sv_id,kundenbetreuer_id')
    .eq('id', claimId)
    .maybeSingle()
  const claim = claimRow as Record<string, unknown> | null
  if (!claim || claim.vehicle_id !== vehicleId) return null

  const { data: vehRow } = await db
    .from('vehicles')
    .select('kennzeichen_aktuell,hersteller,modell_haupttyp')
    .eq('id', vehicleId)
    .maybeSingle()
  const veh = (vehRow ?? {}) as Record<string, unknown>

  // fall_id via Bridge (fall_dokumente ist fall-gekeyt).
  const { data: bridgeRow } = await db
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const fallId = ((bridgeRow as Record<string, unknown> | null)?.fall_id as string | null) ?? null

  // Dokumente — fall-gescoped, gefiltert auf die fuer 'flottenmanager' sichtbaren, nicht geloescht.
  let dokumente: FlottenClaimDokument[] = []
  if (fallId) {
    const { data: docRows } = await db
      .from('fall_dokumente')
      .select('id,dokument_typ,original_filename,storage_path,sichtbar_fuer,hochgeladen_am,geloescht_am')
      .eq('fall_id', fallId)
      .is('geloescht_am', null)
      .order('hochgeladen_am', { ascending: false })
    const sichtbar = getSichtbarFuerRolle((docRows ?? []) as DocRow[], 'flottenmanager')
    dokumente = await Promise.all(
      sichtbar.map(async (d) => ({
        id: d.id,
        typ: d.dokument_typ ?? null,
        dateiname: d.original_filename ?? null,
        hochgeladenAm: d.hochgeladen_am ?? null,
        url: d.storage_path ? await getStorageUrl(db, 'fall-dokumente', d.storage_path) : null,
      })),
    )
  }

  const sv = await getSvKontakt(db, (claim.sv_id as string | null) ?? null)
  const kb = await getKbKontakt(db, (claim.kundenbetreuer_id as string | null) ?? null)

  return {
    claimId: claim.id as string,
    fallId,
    claimNummer: (claim.claim_nummer as string | null) ?? null,
    status: (claim.operative_status as string | null) ?? null,
    schadentag: (claim.schadentag as string | null) ?? null,
    schadensHoeheNetto: (claim.schadens_hoehe_netto as number | null) ?? null,
    kennzeichen: (veh.kennzeichen_aktuell as string | null) ?? null,
    hersteller: (veh.hersteller as string | null) ?? null,
    modell: (veh.modell_haupttyp as string | null) ?? null,
    sv,
    kb,
    dokumente,
  }
}
