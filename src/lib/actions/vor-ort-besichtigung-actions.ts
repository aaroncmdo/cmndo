'use server'

// CMM-49 faelle-DROP (Writer #3 VorOrtPanel): die SV-Vor-Ort-Erfassung schrieb FIN + Kilometerstand
// nach faelle.{fin_vin,kilometerstand} — beide reader-frei (v_claim_full liest vehicles.fin /
// vehicles.aktueller_kilometerstand) -> die SV-Eingabe versickerte (latenter Bug). Diese Action
// routet sie kanonisch auf vehicles (admin; Muster == ocr-fahrzeugschein CMM-68). Das frueher
// mitgeschriebene status='besichtigung' war vestigial (Status-Transition laeuft ueber dispatch-fall-
// actions + gutachter_termine.besichtigung_gestartet_am, NICHT faelle.status) und entfaellt.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureVehicleFromFin, ensureVehicleForClaim } from '@/lib/vehicles/ensure-vehicle'

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/**
 * Speichert die Vor-Ort-Erfassung (FIN + Kilometerstand) eines SV kanonisch auf `vehicles`.
 * Ownership: der eingeloggte Nutzer muss Case-Zugriff haben — geprueft via RLS-gated Bridge-Read
 * (spiegelt die bisherige faelle-RLS von VorOrtPanel). Der vehicles-Write laeuft danach mit dem
 * Admin-Client (wie ocr-fahrzeugschein), weil der SV i.d.R. keine direkte vehicles-RLS hat.
 */
export async function speichereVorOrtBesichtigung(
  fallId: string,
  daten: { fin?: string | null; kilometerstand?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return { ok: false, error: 'Nicht angemeldet' }

  // Ownership-Gate: RLS-gated Bridge-Read == Case-Access (fall_id == bridge.fall_id).
  const { data: bridge } = await supabase
    .from('faelle_claim_bridge')
    .select('claim_id')
    .eq('fall_id', fallId)
    .maybeSingle()
  const claimId = (bridge as { claim_id?: string | null } | null)?.claim_id ?? null
  if (!claimId) return { ok: false, error: 'Kein Zugriff auf diesen Fall' }

  const finRaw = daten.fin?.trim().toUpperCase() ?? ''
  const finValid = VIN_REGEX.test(finRaw)
  const km =
    typeof daten.kilometerstand === 'number' && Number.isFinite(daten.kilometerstand)
      ? daten.kilometerstand
      : null
  if (!finValid && km == null) return { ok: true } // nichts zu speichern

  const admin = createAdminClient()
  if (finValid) {
    // FIN -> dedup-Row (ON CONFLICT(fin)) inkl. Kilometerstand; claims.vehicle_id auf die FIN-Row.
    const veh = await ensureVehicleFromFin({
      fin: finRaw,
      snapshot: { kilometerstand: km, finQuelle: 'gutachter_vor_ort', finExtrahiertAm: new Date().toISOString() },
      db: admin,
    })
    if (!veh.ok) return { ok: false, error: veh.error }
    const { error } = await admin.from('claims').update({ vehicle_id: veh.vehicleId }).eq('id', claimId)
    if (error) return { ok: false, error: error.message }
  } else {
    // Kein FIN, aber Kilometerstand -> bestehendes Fahrzeug enrichen bzw. Stub anlegen.
    const veh = await ensureVehicleForClaim({ claimId, snapshot: { kilometerstand: km }, db: admin })
    if (!veh.ok) return { ok: false, error: veh.error }
  }
  return { ok: true }
}
