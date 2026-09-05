'use server'

// Kasko-WB Phase 1 (Spec §7): Dispatcher korrigiert Versicherer/Tarif/Bindung. Schreibt Lead UND den
// bereits konvertierten Claim (ueberschreibend) — spiegleQualiAufClaim fuellt nur leere Felder und
// saveStammdaten kennt keinen Claim-Sync; beides liesse die Korrektur im Lead versanden, waehrend
// Kunde/Werkstatt/SV den Claim lesen (Scan: "Antwort landet im Lead, gelesen wird der Claim").

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildReQualifikationPatch } from '@/lib/self-service/disqualifikation-patch'
import { leseKaskoAltStand } from '@/lib/kasko-wb/persistenz'
import { requireRole } from '@/lib/auth/guards'

export type KaskoTarifDispatchPatch = {
  eigene_versicherung_marke_id: string | null
  eigene_versicherung_name: string | null
  eigene_kasko_tarif_id: string | null
  eigene_kasko_tarif_name: string | null
  freie_werkstattwahl: boolean | null
  eigene_versicherung: 'ja' | 'nein' | null
}

export async function speichereKaskoTarifDispatch(
  leadId: string,
  patch: KaskoTarifDispatchPatch,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['dispatch', 'admin', 'kundenbetreuer'])
  if (!guard.success) return { ok: false, error: guard.error }
  const admin = createAdminClient()
  const werte = { ...patch, werkstattbindung_quelle: 'dispatcher' }
  // Review W5: Override auf „frei"/„unbekannt" hebt eine Disqualifikation wegen Werkstattbindung auf (nur diese —
  // ein manuell/anders disqualifizierter Lead bleibt es). Die Vermittlungssperre faellt damit ebenfalls.
  let leadWerte: Record<string, unknown> = werte
  if (patch.freie_werkstattwahl !== false) {
    // Review #5864 (Befund 7): Read-Fehler nicht verschlucken; konvertierter Lead -> 'umgewandelt' statt 'neu'.
    const { data: altRow, error: altErr } = await admin
      .from('leads')
      .select('disqualifiziert_grund_key, konvertiert_zu_claim_id, konvertiert_zu_fall_id')
      .eq('id', leadId)
      .maybeSingle()
    if (altErr) return { ok: false, error: altErr.message }
    const alt = leseKaskoAltStand(altRow)
    if (alt && alt.disqualifiziertGrundKey === 'werkstattbindung') {
      leadWerte = { ...werte, ...buildReQualifikationPatch({ konvertiert: alt.konvertiert }) }
    }
  }
  const { error } = await admin.from('leads').update(leadWerte as never).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  const { error: claimErr } = await admin.from('claims').update(werte as never).eq('lead_id', leadId)
  if (claimErr) return { ok: false, error: `Lead gespeichert, Claim nicht: ${claimErr.message}` }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}
