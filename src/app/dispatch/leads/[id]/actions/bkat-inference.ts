'use server'

// AAR-504/505: Server-Actions fuer BKat-Inferenz. Zwei Entry-Points:
//
// 1. analyzeBkatForLead(leadId): liest Lead + ggf. Polizeibericht-URLs und
//    fuehrt die OCR-first/LLM-fallback-Analyse. Gibt Ergebnis an UI zurueck.
//    Persistiert NICHTS — nur Vorschlag.
//
// 2. saveBkatUnfallart(leadId, unfallart, schadentyp): Dispatcher bestaetigt
//    die Klassifikation. Schreibt leads.bkat_unfallart + leads.schadentyp.
//    TBNRs werden weiterhin NICHT persistiert.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { inferBkat, type BkatInferenzErgebnis } from '@/lib/bkat/inference'
import type { Database } from '@/lib/supabase/database.types'

type BkatUnfallart = Database['public']['Enums']['bkat_unfallart']

export async function analyzeBkatForLead(
  leadId: string,
): Promise<{ success: boolean; data?: BkatInferenzErgebnis; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, unfallhergang, schadens_hergang, polizei_vor_ort')
    .eq('id', leadId)
    .single()

  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  // unfallhergang und schadens_hergang sind dasselbe Feld in zwei
  // Auspraegungen (Phase-1-Kundenstimme vs Phase-4-technisch). Fuer die
  // Analyse nehmen wir den vollstaendigeren Text.
  const ltext = (lead.unfallhergang as string | null) ?? ''
  const stext = (lead.schadens_hergang as string | null) ?? ''
  const unfallhergang = ltext.length >= stext.length ? ltext : stext

  // Polizeibericht-URLs aus fall_dokumente (wenn Fall bereits existiert)
  // oder direkt aus Flow-Upload-Bucket suchen. Minimal-Scope fuer jetzt:
  // nur fall_dokumente via Admin-Client.
  let polizeibericht_urls: string[] = []
  try {
    const admin = createAdminClient()
    const { data: fall } = await admin
      .from('faelle')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle()
    if (fall?.id) {
      const { data: docs } = await admin
        .from('fall_dokumente')
        .select('dokument_url')
        .eq('fall_id', fall.id)
        .eq('dokument_typ', 'polizeibericht')
        .is('geloescht_am' as never, null)
      polizeibericht_urls = (docs ?? [])
        .map((d) => d.dokument_url as string | null)
        .filter((u): u is string => !!u)
    }
  } catch { /* non-critical */ }

  const result = await inferBkat({
    polizeibericht_urls,
    unfallhergang,
  })

  return { success: true, data: result }
}

export async function saveBkatUnfallart(
  leadId: string,
  unfallart: BkatUnfallart,
  schadentypLegacy: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const updates: Record<string, unknown> = {
    bkat_unfallart: unfallart,
    updated_at: new Date().toISOString(),
  }
  if (schadentypLegacy) {
    updates.schadentyp = schadentypLegacy
  }

  const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}

/**
 * Mapped die 15 bkat_unfallart-Werte auf die 5 Legacy-schadentyp-Werte.
 * Genutzt damit das alte SchadentypPicker-UI weiter greift bis B3b umgebaut
 * ist.
 */
export function bkatToLegacySchadentyp(u: BkatUnfallart): string {
  switch (u) {
    case 'auffahrunfall':
      return 'auffahrunfall'
    case 'vorfahrt':
    case 'kreuzung_rotlicht':
    case 'abbiegen':
      return 'vorfahrtsverletzung'
    case 'spurwechsel':
    case 'ueberholen':
      return 'spurwechsel'
    case 'rueckwaerts_parken':
    case 'einfahren_anfahren':
    case 'dooring':
      return 'parkplatz'
    default:
      return 'sonstiges'
  }
}
