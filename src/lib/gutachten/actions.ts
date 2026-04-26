'use server'

// AAR-833: Gutachten Server Actions — beauftragen, Status-Transitions, stornieren

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type GutachtenStatus = 'beauftragt' | 'besichtigt' | 'in_erstellung' | 'final' | 'storniert'

// Erlaubte Status-Übergänge
const ERLAUBTE_UEBERGAENGE: Record<GutachtenStatus, GutachtenStatus[]> = {
  beauftragt:    ['besichtigt', 'storniert'],
  besichtigt:    ['in_erstellung', 'storniert'],
  in_erstellung: ['final', 'storniert'],
  final:         [],
  storniert:     [],
}

export async function beauftrageGutachten(
  claimId: string,
  svId: string,
  params?: {
    besichtigungstermin?: string | null
    notiz?: string | null
    auftragsnummer?: string | null
    createdByUserId?: string | null
  },
): Promise<{ ok: boolean; error?: string; gutachtenId?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gutachten')
    .insert({
      claim_id:            claimId,
      sv_id:               svId,
      status:              'beauftragt',
      besichtigungstermin: params?.besichtigungstermin ?? null,
      notiz:               params?.notiz ?? null,
      auftragsnummer:      params?.auftragsnummer ?? null,
      created_by_user_id:  params?.createdByUserId ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true, gutachtenId: data.id }
}

export async function updateGutachtenStatus(
  gutachtenId: string,
  neuerStatus: GutachtenStatus,
  params?: {
    besichtigtAm?: string | null
    fertiggestelltAm?: string | null
    unterschriebenAm?: string | null
    gesamtSchadensbetrag?: number | null
    berichtPdfUrl?: string | null
    unterschriftSvUrl?: string | null
    notiz?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: aktuell, error: fetchErr } = await supabase
    .from('gutachten')
    .select('status, claim_id')
    .eq('id', gutachtenId)
    .single()

  if (fetchErr || !aktuell) return { ok: false, error: fetchErr?.message ?? 'Gutachten nicht gefunden' }

  const erlaubt = ERLAUBTE_UEBERGAENGE[aktuell.status as GutachtenStatus] ?? []
  if (!erlaubt.includes(neuerStatus)) {
    return { ok: false, error: `Übergang von '${aktuell.status}' zu '${neuerStatus}' nicht erlaubt` }
  }

  const updates: Record<string, unknown> = { status: neuerStatus }
  if (neuerStatus === 'besichtigt' && params?.besichtigtAm)     updates.besichtigt_am        = params.besichtigtAm
  if (neuerStatus === 'final'      && params?.fertiggestelltAm) updates.fertiggestellt_am    = params.fertiggestelltAm
  if (neuerStatus === 'final'      && params?.unterschriebenAm) updates.unterschrieben_am    = params.unterschriebenAm
  if (params?.gesamtSchadensbetrag != null)                     updates.gesamt_schadensbetrag = params.gesamtSchadensbetrag
  if (params?.berichtPdfUrl  != null)                           updates.bericht_pdf_url       = params.berichtPdfUrl
  if (params?.unterschriftSvUrl != null)                        updates.unterschrift_sv_url   = params.unterschriftSvUrl
  if (params?.notiz != null)                                    updates.notiz                 = params.notiz

  const { error } = await supabase
    .from('gutachten')
    .update(updates)
    .eq('id', gutachtenId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true }
}

export async function storniereGutachten(
  gutachtenId: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: aktuell, error: fetchErr } = await supabase
    .from('gutachten')
    .select('status')
    .eq('id', gutachtenId)
    .single()

  if (fetchErr || !aktuell) return { ok: false, error: fetchErr?.message ?? 'Gutachten nicht gefunden' }
  if (aktuell.status === 'storniert') return { ok: false, error: 'Gutachten ist bereits storniert' }
  if (aktuell.status === 'final')     return { ok: false, error: 'Finalisiertes Gutachten kann nicht storniert werden' }

  const { error } = await supabase
    .from('gutachten')
    .update({ status: 'storniert', notiz: grund })
    .eq('id', gutachtenId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true }
}

export async function assignLaeufer(
  gutachtenId: string,
  laeuferReportId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gutachten')
    .update({ laeufer_report_id: laeuferReportId })
    .eq('id', gutachtenId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true }
}
