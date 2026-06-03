'use server'

// P2b (dispatch-config-unify): config-getriebener Dispatcher-Save fuer DispatchLeadForm.
// Schreibt geaenderte lead-erfassung-Felder auf den Lead. db_target + erlaubte
// Spalten kommen SERVERSEITIG aus onboarding_felder (Client-Mapping wird NICHT
// vertraut — Allowlist-Aequivalent zu STAMMDATEN_ALLOWED_FIELDS, nur config-getrieben).
//
// Coercion (§D.1): segmented 'true'/'false' -> boolean (bool leads-Spalten);
// number -> Number; '' -> null. zb1-upload wird uebersprungen (der OCR-Endpoint
// schreibt kennzeichen, nicht dieser generische Save). Sentinels _termin/_finalize
// (Termin/SA) sind keine leads-Spalten -> fallen automatisch raus.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { deriveDispatchLeadFelder } from '../_lib/derive-dispatch-felder'
import { ladeLeadErfassungLeadsFelder, coerceLeadErfassungWert } from '@/lib/onboarding/lead-erfassung-allowlist'

export async function saveDispatchLeadFelder(
  leadId: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // SA-Conversion-Lockdown (wie saveStammdaten): nach SA-Unterschrift ist der Fall
  // Source-of-Truth — Lead-Edit wuerde Drift erzeugen.
  const { data: lead } = await supabase
    .from('leads')
    .select('sa_unterschrieben, unfallort_kategorie')
    .eq('id', leadId)
    .maybeSingle()
  if (lead?.sa_unterschrieben) {
    return { ok: false, error: 'Lead ist konvertiert — bitte über die Fallakte editieren.' }
  }

  const feldMap = await ladeLeadErfassungLeadsFelder()
  const update: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(values)) {
    const meta = feldMap.get(key)
    if (!meta) continue // unbekannt / Sentinel / zb1-upload -> skip
    update[meta.spalte] = coerceLeadErfassungWert(meta.typ, raw)
  }

  if (Object.keys(update).length === 0) return { ok: true }

  // P3b: abgeleitete Spalten ergaenzen (Ersatz fuer die Legacy-Actions saveHardGate/
  // saveSchadentyp, die der Cutover entfernt) — polizeibericht_pflicht aus polizei_vor_ort,
  // unfallort_kategorie aus schadentyp (nur wenn leer). Server-berechnet, daher bewusst
  // ausserhalb der Feld-Allowlist. Auto-Disqualifikation bleibt manuell (DispatchGatesPanel).
  Object.assign(
    update,
    deriveDispatchLeadFelder(update, (lead?.unfallort_kategorie as string | null) ?? null),
  )

  update.updated_at = new Date().toISOString()
  const { error } = await supabase.from('leads').update(update).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}
