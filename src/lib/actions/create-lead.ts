'use server'

// AAR-468 C2: Server-Action für den Lead-Insert aus Schritt 1 des
// Self-Service-Flows. Validiert mit Zod, löst Promo-Cookie zu
// promotion_code_id auf, erkennt Eigenverschulden → Disqualifikation.
// Rückgabe immer { success: boolean; ... } — nie throw.

import { createAdminClient } from '@/lib/supabase/admin'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { readPromoCookie, isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { resolvePromoCodeToId } from '@/lib/flow/resolve-promo'
import { schritt1Schema, type Schritt1Input } from '@/lib/flow/schemas/schritt1'
import { createMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'

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

  // Admin-Client für INSERT: /schaden-melden ist öffentlich (auch anonym), daher kein
  // Auth-Kontext vorhanden — RLS würde anon-INSERT blockieren. Zod-Validation schützt.
  const admin = createAdminClient()

  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      unfalldatum: data.unfalldatum,
      unfallort: data.unfallort,
      schadentyp: data.schadentyp,
      schadens_hergang: data.schadens_hergang,
      polizei_vor_ort: data.polizei_vor_ort,
      polizei_aktenzeichen: data.polizei_aktenzeichen || null,
      schuldfrage: data.schuldfrage,
      fahrzeug_hersteller: data.fahrzeug_hersteller,
      fahrzeug_modell: data.fahrzeug_modell,
      fahrzeug_baujahr: data.fahrzeug_baujahr,
      fahrzeug_standort_plz: data.fahrzeug_standort_plz,
      // AAR-663: Google-Places-Adresse + Koordinaten mitspeichern damit
      // findBestSV Self-Service-Dispatch ohne Phase-2-Geocoding fahren kann.
      fahrzeug_standort_adresse: data.fahrzeug_standort_adresse || null,
      fahrzeug_standort_lat: data.fahrzeug_standort_lat ?? null,
      fahrzeug_standort_lng: data.fahrzeug_standort_lng ?? null,
      fahrzeug_standort_place_id: data.fahrzeug_standort_place_id || null,
      vorname: data.vorname,
      nachname: data.nachname,
      email: data.email,
      telefon: data.telefon,
      sprache: locale,
      source_channel: 'self_service',
      qualifizierungs_phase: 'erstkontakt',
      status: isAbort ? 'disqualifiziert' : 'neu',
      disqualifiziert: isAbort ? true : false,
      disqualifiziert_grund_key: isAbort ? 'eigenverantwortung' : null,
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

  // F-02: Dispatch-User über neuen Lead benachrichtigen (fire-and-forget).
  if (!isAbort) {
    const { data: dispatchers } = await admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'dispatch')
    if (dispatchers?.length) {
      await createMitteilungMulti(
        dispatchers.map((d) => ({ id: d.id as string, rolle: 'dispatch' as const })),
        {
          kategorie: 'update',
          titel: 'Neuer Lead eingegangen',
          inhalt: `${data.vorname} ${data.nachname} – ${data.schadentyp} (${data.unfallort ?? data.fahrzeug_standort_plz})`,
          kontext_typ: 'lead',
          kontext_id: lead.id,
          prioritaet: 'normal',
        },
      )
    }
  }

  return {
    success: true,
    leadId: lead.id,
    abortToSelbstverschulden: isAbort,
  }
}
