'use server'

// CMM-42: VS-Korrespondenz erfassen.
//
// Ein Eintrag pro VS-Kontakt (Anruf, Email, Brief, Fax, Portal). Bisher
// fehlte das UI komplett — vs_korrespondenz existiert seit AAR-823, hatte
// aber keinen Writer. Diese Action ist die Bruecke zwischen externen
// Salesforce-/Telefon-Workflows und der Claimondo-Akte.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ErfasseVsKorrespondenzInput = {
  claimId: string
  fallId: string
  richtung: 'eingehend' | 'ausgehend'
  kanal: 'email' | 'post' | 'fax' | 'telefon' | 'portal'
  datum: string
  versicherung?: string | null
  aktenzeichen?: string | null
  betreff?: string | null
  notiz?: string | null
  /** Naechste erwartete VS-Antwort (z.B. zugesagte Zahlung) */
  naechsteFrist?: string | null
}

export async function erfasseVsKorrespondenz(
  input: ErfasseVsKorrespondenzInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!input.claimId || !input.fallId) return { ok: false, error: 'Claim oder Fall fehlt' }
  if (!input.richtung || !input.kanal || !input.datum) return { ok: false, error: 'Pflichtfelder fehlen' }

  const supabase = await createClient()
  const { data: userResult } = await supabase.auth.getUser()
  const userId = userResult.user?.id ?? null
  if (!userId) return { ok: false, error: 'Nicht angemeldet' }

  // RLS-Policy aus AAR-823 erlaubt Insert fuer Admin und betreuenden KB.
  const { error } = await supabase.from('vs_korrespondenz').insert({
    claim_id: input.claimId,
    richtung: input.richtung,
    kanal: input.kanal,
    datum: input.datum,
    versicherung: input.versicherung?.trim() || null,
    aktenzeichen: input.aktenzeichen?.trim() || null,
    betreff: input.betreff?.trim() || null,
    notiz: input.notiz?.trim() || null,
    naechste_frist: input.naechsteFrist || null,
    created_by_user_id: userId,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle/${input.fallId}`)

  return { ok: true }
}
