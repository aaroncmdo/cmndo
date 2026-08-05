'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { bindeSchadenkarteAnFahrzeug } from '@/lib/schadenkarte/schadenkarte'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { fmDarfStornieren } from '@/lib/flotte/fm-storno-erlaubt'
import { updateFahrzeugStammdaten, type FahrzeugStammdatenForm } from '@/lib/flotte/mutate-flotte'
import {
  erstelleFlottenSchadenLead,
  flowLinkFuerClaimFortsetzung,
  flowLinkFuerLeadFortsetzung,
  storniereFlottenSchadenLead,
} from '@/lib/flotte/schaden-fortsetzung'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

/**
 * Bindet eine gescannte Schadenkarte an DIESES Fahrzeug (Fahrzeug-Detailseite,
 * Flottenmanager). Fahrzeug-Ownership + firma_id/Status der Karte prueft
 * bindeSchadenkarteAnFahrzeug (kanonisches Gate in der Lib).
 */
export async function bindeKarteFuerFahrzeug(
  token: string,
  vehicleId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await bindeSchadenkarteAnFahrzeug(db, {
    token,
    fahrzeugId: vehicleId,
    firmaId: firma.id,
    userId: user.id,
  })
  if (res.ok) {
    revalidatePath(`/flotte/fahrzeug/${vehicleId}`)
    revalidatePath('/flotte/karten')
  }
  return res
}

/**
 * Speichert die vom Flottenmanager bearbeiteten Fahrzeug-Stammdaten (Detailseite).
 * Ownership + Validierung liegen in updateFahrzeugStammdaten (flotten_fahrzeuge-Gate).
 */
export async function speichereFahrzeugStammdaten(
  vehicleId: string,
  form: FahrzeugStammdatenForm,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const res = await updateFahrzeugStammdaten(db, { firmaId: firma.id, vehicleId, form })
  if (res.ok) {
    revalidatePath(`/flotte/fahrzeug/${vehicleId}`)
    revalidatePath('/flotte')
  }
  return res
}

/**
 * Storniert einen (versehentlich, z.B. durch einen Fahrer via Schadenkarte)
 * angelegten Schaden — Flottenmanager-Selbstbedienung, aber NUR frueh-stufig
 * (fmDarfStornieren). Storno laeuft ausschliesslich ueber die State-Machine-Engine
 * (transitionFallStatus -> 'storniert'), nie als direkter operative_status-Write.
 * Ownership: der Claim muss zu einem Fahrzeug der FM-Firma gehoeren.
 */
export async function storniereFahrzeugSchaden(
  claimId: string,
  vehicleId: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }
  if (!grund.trim()) return { ok: false, error: 'Bitte einen Grund angeben.' }

  // Ownership: Fahrzeug muss zur Firma gehoeren.
  const { data: owner } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firma.id)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
  if (!owner) return { ok: false, error: 'Fahrzeug gehört nicht zu Ihrer Flotte.' }

  // Claim muss zu genau diesem Fahrzeug gehoeren + frueh-stufig sein.
  const { data: claimRow } = await db
    .from('claims')
    .select('id, vehicle_id, operative_status')
    .eq('id', claimId)
    .maybeSingle()
  const claim = claimRow as
    | { id: string; vehicle_id: string | null; operative_status: string | null }
    | null
  if (!claim || claim.vehicle_id !== vehicleId) {
    return { ok: false, error: 'Schaden gehört nicht zu diesem Fahrzeug.' }
  }
  if (!fmDarfStornieren(claim.operative_status)) {
    return {
      ok: false,
      error:
        'Dieser Schaden ist bereits in Bearbeitung und kann nicht mehr selbst storniert werden. Bitte kontaktieren Sie den Support.',
    }
  }

  // Engine ist fall_id-keyed -> fall_id via Bridge (jeder Claim hat eine Bridge-Row).
  const { data: bridgeRow } = await db
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const fallId = (bridgeRow as { fall_id?: string | null } | null)?.fall_id ?? null
  if (!fallId) return { ok: false, error: 'Schaden konnte nicht aufgelöst werden.' }

  // Storno NUR ueber die Engine (Operative-Status-Write-Gate). Sie wirft bei
  // ungueltigem Uebergang -> in ein Result-Object fangen.
  try {
    await transitionFallStatus(fallId, 'storniert', { grund: grund.trim(), user_id: user.id })
  } catch (err) {
    console.error('[storniereFahrzeugSchaden] transition fehlgeschlagen:', err)
    return { ok: false, error: 'Storno fehlgeschlagen. Bitte kontaktieren Sie den Support.' }
  }

  revalidatePath(`/flotte/fahrzeug/${vehicleId}`)
  return { ok: true }
}

/**
 * Lead-first (Aaron 23.07.): „Schaden melden" erzeugt NUR einen baren Lead + FlowLink (kein
 * Upfront-Claim, kein schuldfrage-Vorsetzen). Die Haftpflicht/Kasko-Weiche faellt db-driven im
 * /flow; am /flow-Ende entsteht Claim (Haftpflicht→SV) bzw. Werkstatt-Auftrag (Kasko/Selbstzahler).
 * Der Client navigiert auf /flow/[token]. IMMER neuer Lead (ein Fahrzeug hat mehrere Vorfaelle).
 */
export async function meldeNeuenFlottenSchaden(
  vehicleId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const res = await erstelleFlottenSchadenLead({ vehicleId, userId: user.id })
  if (res.ok) revalidatePath(`/flotte/fahrzeug/${vehicleId}`)
  return res
}

/**
 * §2d „Schaden vervollständigen" (Claim-Detail): setzt einen bestehenden Claim db-driven ueber
 * /flow fort. Liefert den FlowLink-Token seines Leads → Client navigiert auf /flow/[token].
 */
export async function meldeSchadenVervollstaendigen(
  claimId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  return flowLinkFuerClaimFortsetzung(claimId, user.id)
}

/**
 * Draft-Resume (Aaron 24.07.): setzt einen baren Schaden-Entwurf ueber /flow fort. Liefert den
 * FlowLink-Token → Client navigiert auf /flow/[token]. Die Claim-Konvertierung passiert am /flow-Ende.
 */
export async function setzeSchadenEntwurfFort(
  leadId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  return flowLinkFuerLeadFortsetzung(leadId, user.id)
}

/**
 * Draft-Storno (Aaron 24.07.): verwirft einen baren Schaden-Entwurf (Lead 'disqualifiziert' +
 * FlowLink ablaufen). vehicleId nur fuer revalidatePath. Auth + Ownership liegen in der Lib.
 */
export async function storniereSchadenEntwurf(
  leadId: string,
  vehicleId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const res = await storniereFlottenSchadenLead(leadId, user.id)
  if (res.ok) revalidatePath(`/flotte/fahrzeug/${vehicleId}`)
  return res
}
