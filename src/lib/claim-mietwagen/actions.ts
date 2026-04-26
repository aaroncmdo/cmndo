'use server'

// AAR-838: Claim-Mietwagen Server-Actions

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type MietwagenStatus = 'beantragt' | 'genehmigt' | 'aktiv' | 'beendet' | 'abgelehnt' | 'storniert'

const ERLAUBTE_UEBERGAENGE: Record<MietwagenStatus, MietwagenStatus[]> = {
  beantragt:  ['genehmigt', 'abgelehnt', 'storniert'],
  genehmigt:  ['aktiv', 'storniert'],
  aktiv:      ['beendet', 'storniert'],
  beendet:    [],
  abgelehnt:  [],
  storniert:  [],
}

export async function legeMietwagenAn(
  claimId: string,
  input: {
    fallId: string
    fahrzeugklasse?: string
    anbieter?: string
    mietvertrag_nr?: string
    beginn_datum?: string
    ende_datum?: string
    tagespreis_netto?: number
    erstattbar_max_tage?: number
    notiz?: string
  },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: user } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('claim_mietwagen')
    .insert({
      claim_id:            claimId,
      status:              'beantragt',
      fahrzeugklasse:      input.fahrzeugklasse ?? null,
      anbieter:            input.anbieter ?? null,
      mietvertrag_nr:      input.mietvertrag_nr ?? null,
      beginn_datum:        input.beginn_datum ?? null,
      ende_datum:          input.ende_datum ?? null,
      tagespreis_netto:    input.tagespreis_netto ?? null,
      erstattbar_max_tage: input.erstattbar_max_tage ?? null,
      notiz:               input.notiz ?? null,
      created_by_user_id:  user.user?.id ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/faelle/${input.fallId}`)
  return { ok: true, id: data.id }
}

export async function updateMietwagenStatus(
  mietwagenId: string,
  neuerStatus: MietwagenStatus,
  extra?: { tatsaechlichesEnde?: string },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: current, error: fetchErr } = await supabase
    .from('claim_mietwagen')
    .select('status, claim_id')
    .eq('id', mietwagenId)
    .single()

  if (fetchErr || !current) return { ok: false, error: fetchErr?.message ?? 'Nicht gefunden' }

  const erlaubt = ERLAUBTE_UEBERGAENGE[current.status as MietwagenStatus] ?? []
  if (!erlaubt.includes(neuerStatus)) {
    return { ok: false, error: `Übergang ${current.status} → ${neuerStatus} nicht erlaubt` }
  }

  const updates: Record<string, unknown> = { status: neuerStatus }
  if (neuerStatus === 'beendet' && extra?.tatsaechlichesEnde) {
    updates.tatsaechliches_ende = extra.tatsaechlichesEnde
  }

  const { error } = await supabase
    .from('claim_mietwagen')
    .update(updates)
    .eq('id', mietwagenId)

  if (error) return { ok: false, error: error.message }

  // claim_id → fall_id über Supabase-Join
  const { data: claim } = await supabase
    .from('claims')
    .select('fall_id')
    .eq('id', current.claim_id)
    .single()

  if (claim?.fall_id) revalidatePath(`/faelle/${claim.fall_id}`)
  return { ok: true }
}

export async function setErstattung(
  mietwagenId: string,
  input: {
    fallId: string
    erstattungsbetrag: number
    erstattung_am: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('claim_mietwagen')
    .update({
      erstattet_durch_vs: true,
      erstattungsbetrag:  input.erstattungsbetrag,
      erstattung_am:      input.erstattung_am,
    })
    .eq('id', mietwagenId)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/faelle/${input.fallId}`)
  return { ok: true }
}

export async function setGesamtkostenNetto(
  mietwagenId: string,
  input: { fallId: string; betrag: number },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('claim_mietwagen')
    .update({ gesamtkosten_netto: input.betrag })
    .eq('id', mietwagenId)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/faelle/${input.fallId}`)
  return { ok: true }
}
