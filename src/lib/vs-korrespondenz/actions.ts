'use server'

// AAR-837: VS-Korrespondenz Server Actions
//
// AAR-839-Hinweis: typ + status werden beim INSERT parallel gepflegt.
// `typ` bestimmt Phase-Routing in calc_claims_phase() (forderung →
// 6_vs_forderung, mahnung_*/klage_androhung → 7_vs_eskalation). Nach
// AAR-839 wird die Function so umgeschrieben dass jede vs_korrespondenz-
// Row Phase 6 triggert; `typ` bleibt für Detail-UI/Eskalations-Visualisierung
// erhalten.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type VskStatus = 'gesendet' | 'wartet_auf_antwort' | 'ohne_antwort_abgelaufen' | 'beantwortet' | 'archiviert'
export type VskTyp    = 'forderung' | 'mahnung_1' | 'mahnung_2' | 'klage_androhung' | 'sonstige'

export async function legeKorrespondenzAn(
  claimId: string,
  params: {
    richtung: 'eingehend' | 'ausgehend'
    kanal: 'email' | 'post' | 'fax' | 'telefon' | 'portal'
    betreff?: string | null
    versicherung?: string | null
    aktenzeichen?: string | null
    notiz?: string | null
    attachmentUrl?: string | null
    datum?: string | null
    typ?: VskTyp | null
    wartetAufAntwortBis?: string | null
    createdByUserId?: string | null
  },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = await createClient()

  const status: VskStatus =
    params.richtung === 'ausgehend' && params.wartetAufAntwortBis
      ? 'wartet_auf_antwort'
      : 'gesendet'

  const { data, error } = await supabase
    .from('vs_korrespondenz')
    .insert({
      claim_id:               claimId,
      richtung:               params.richtung,
      kanal:                  params.kanal,
      betreff:                params.betreff              ?? null,
      versicherung:           params.versicherung         ?? null,
      aktenzeichen:           params.aktenzeichen         ?? null,
      notiz:                  params.notiz                ?? null,
      attachment_url:         params.attachmentUrl        ?? null,
      datum:                  params.datum                ?? new Date().toISOString(),
      typ:                    params.typ                  ?? null,
      status,
      wartet_auf_antwort_bis: params.wartetAufAntwortBis  ?? null,
      created_by_user_id:     params.createdByUserId      ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true, id: data.id }
}

export async function updateKorrespondenzStatus(
  korrespondenzId: string,
  status: VskStatus,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('vs_korrespondenz')
    .update({ status })
    .eq('id', korrespondenzId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true }
}
