'use server'

// AAR-468 C2: Server-Action für den Lead-Insert aus Schritt 1 des
// Self-Service-Flows. Validiert mit Zod, löst Promo-Cookie zu
// promotion_code_id auf, erkennt Eigenverschulden → Disqualifikation.
// Rückgabe immer { success: boolean; ... } — nie throw.

import { createClient } from '@/lib/supabase/server'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { readPromoCookie, isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { resolvePromoCodeToId } from '@/lib/flow/resolve-promo'
import { schritt1Schema, type Schritt1Input } from '@/lib/flow/schemas/schritt1'

type CreateLeadResult =
  | { success: true; leadId: string; abortToSelbstverschulden: boolean }
  | { success: false; error: string }

export async function createLeadFromSchritt1(
  input: Schritt1Input,
  voiceInputQuelle: boolean,
): Promise<CreateLeadResult> {
  const parsed = schritt1Schema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
    }
  }

  const data = parsed.data
  const isAbort = data.schuldfrage === 'eigenverantwortung'

  const locale = await getLocaleCookie()

  let promotionCodeId: string | null = null
  const promoCookie = await readPromoCookie()
  if (promoCookie && isValidPromoCodeFormat(promoCookie)) {
    promotionCodeId = await resolvePromoCodeToId(promoCookie)
  }

  const supabase = await createClient()

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      unfalldatum: data.unfalldatum,
      unfallort: data.unfallort,
      schadentyp: data.schadentyp,
      schadenhergang: data.schadenhergang,
      polizei_vor_ort: data.polizei_vor_ort,
      polizei_aktenzeichen: data.polizei_aktenzeichen || null,
      schuldfrage: data.schuldfrage,
      fahrzeug_hersteller: data.fahrzeug_hersteller,
      fahrzeug_modell: data.fahrzeug_modell,
      fahrzeug_baujahr: data.fahrzeug_baujahr,
      fahrzeug_standort_plz: data.fahrzeug_standort_plz,
      vorname: data.vorname,
      nachname: data.nachname,
      email: data.email,
      telefon: data.telefon,
      sprache: locale,
      source_channel: 'self_service',
      qualifizierungs_phase: 'erstkontakt',
      status: isAbort ? 'disqualifiziert' : 'neu',
      disqualifiziert: isAbort ? true : false,
      disqualifikations_grund_key: isAbort ? 'eigenverantwortung' : null,
      disqualifiziert_am: isAbort ? new Date().toISOString() : null,
      promotion_code_id: promotionCodeId,
      voice_input_quelle: voiceInputQuelle,
    })
    .select('id')
    .single()

  if (error || !lead) {
    return {
      success: false,
      error: error?.message ?? 'Lead konnte nicht angelegt werden',
    }
  }

  return {
    success: true,
    leadId: lead.id,
    abortToSelbstverschulden: isAbort,
  }
}
