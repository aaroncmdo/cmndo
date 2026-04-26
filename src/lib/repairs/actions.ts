'use server'

// AAR-835: Repairs Server Actions — anlegen, Status-Transitions, Kosten

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type RepairStatus = 'geplant' | 'in_arbeit' | 'abgeschlossen' | 'storniert'

const ERLAUBTE_UEBERGAENGE: Record<RepairStatus, RepairStatus[]> = {
  geplant:       ['in_arbeit', 'storniert'],
  in_arbeit:     ['abgeschlossen', 'storniert'],
  abgeschlossen: [],
  storniert:     [],
}

export async function legeReparaturAn(
  claimId: string,
  params?: {
    werkstattId?: string | null
    gutachtenId?: string | null
    auftragsnummer?: string | null
    geplanterBeginn?: string | null
    kostenvoranschlag?: number | null
    notiz?: string | null
    createdByUserId?: string | null
  },
): Promise<{ ok: boolean; error?: string; repairId?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('repairs')
    .insert({
      claim_id:           claimId,
      status:             'geplant',
      werkstatt_id:       params?.werkstattId        ?? null,
      gutachten_id:       params?.gutachtenId        ?? null,
      auftragsnummer:     params?.auftragsnummer     ?? null,
      geplanter_beginn:   params?.geplanterBeginn    ?? null,
      kostenvoranschlag:  params?.kostenvoranschlag  ?? null,
      notiz:              params?.notiz              ?? null,
      created_by_user_id: params?.createdByUserId    ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true, repairId: data.id }
}

export async function updateRepairStatus(
  repairId: string,
  neuerStatus: RepairStatus,
  params?: {
    tatsaechlicherBeginn?: string | null
    abgeschlossenAm?: string | null
    notiz?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: aktuell, error: fetchErr } = await supabase
    .from('repairs')
    .select('status')
    .eq('id', repairId)
    .single()

  if (fetchErr || !aktuell) return { ok: false, error: fetchErr?.message ?? 'Reparatur nicht gefunden' }

  const erlaubt = ERLAUBTE_UEBERGAENGE[aktuell.status as RepairStatus] ?? []
  if (!erlaubt.includes(neuerStatus)) {
    return { ok: false, error: `Übergang von '${aktuell.status}' zu '${neuerStatus}' nicht erlaubt` }
  }

  const updates: Record<string, unknown> = { status: neuerStatus }
  if (neuerStatus === 'in_arbeit'     && params?.tatsaechlicherBeginn) updates.tatsaechlicher_beginn = params.tatsaechlicherBeginn
  if (neuerStatus === 'abgeschlossen' && params?.abgeschlossenAm)      updates.abgeschlossen_am      = params.abgeschlossenAm
  if (params?.notiz != null)                                            updates.notiz                 = params.notiz

  const { error } = await supabase
    .from('repairs')
    .update(updates)
    .eq('id', repairId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true }
}

export async function setKostenvoranschlag(
  repairId: string,
  betrag: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('repairs')
    .update({ kostenvoranschlag: betrag })
    .eq('id', repairId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true }
}

export async function setTatsaechlicheKosten(
  repairId: string,
  betrag: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('repairs')
    .update({ tatsaechliche_kosten: betrag })
    .eq('id', repairId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true }
}
