'use server'

// AAR-837: Claim-Payments Server Actions
//
// AAR-839-Hinweis: claim_payments dokumentiert nur Buchhaltung — KEINE
// Phase-Wirkung. Phase 8_auszahlung fällt in AAR-839 weg, claim_payments
// triggert nach AAR-839-Migration keinen Phase-Wechsel mehr. KB sieht die
// Zahlungs-Liste und entscheidet manuell über markClaimAsReguliert()
// (AAR-840). Daher: KEIN Phase-Trigger-Code in dieser Datei, kein
// status-basiertes Routing das auf Phase abzielt.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PaymentStatus = 'ausstehend' | 'teilweise' | 'erhalten' | 'final' | 'abgelehnt'

const ERLAUBTE_UEBERGAENGE: Record<PaymentStatus, PaymentStatus[]> = {
  ausstehend: ['teilweise', 'erhalten', 'abgelehnt'],
  teilweise:  ['erhalten', 'abgelehnt'],
  erhalten:   ['final'],
  final:      [],
  abgelehnt:  [],
}

export async function legeZahlungAn(
  claimId: string,
  params?: {
    forderungsbetrag?: number | null
    notiz?: string | null
    createdByUserId?: string | null
  },
): Promise<{ ok: boolean; error?: string; paymentId?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('claim_payments')
    .insert({
      claim_id:           claimId,
      status:             'ausstehend',
      forderungsbetrag:   params?.forderungsbetrag  ?? null,
      notiz:              params?.notiz              ?? null,
      created_by_user_id: params?.createdByUserId   ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true, paymentId: data.id }
}

export async function updatePaymentStatus(
  paymentId: string,
  neuerStatus: PaymentStatus,
  params?: {
    zahlungseingangAm?: string | null
    zahlungsweg?: 'überweisung' | 'scheck' | 'bar' | 'verrechnung' | null
    zahlungsreferenz?: string | null
    notiz?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: aktuell, error: fetchErr } = await supabase
    .from('claim_payments')
    .select('status')
    .eq('id', paymentId)
    .single()

  if (fetchErr || !aktuell) return { ok: false, error: fetchErr?.message ?? 'Zahlung nicht gefunden' }

  const erlaubt = ERLAUBTE_UEBERGAENGE[aktuell.status as PaymentStatus] ?? []
  if (!erlaubt.includes(neuerStatus)) {
    return { ok: false, error: `Übergang von '${aktuell.status}' zu '${neuerStatus}' nicht erlaubt` }
  }

  const updates: Record<string, unknown> = { status: neuerStatus }
  if (params?.zahlungseingangAm != null) updates.zahlungseingang_am  = params.zahlungseingangAm
  if (params?.zahlungsweg       != null) updates.zahlungsweg          = params.zahlungsweg
  if (params?.zahlungsreferenz  != null) updates.zahlungsreferenz     = params.zahlungsreferenz
  if (params?.notiz             != null) updates.notiz                = params.notiz

  const { error } = await supabase
    .from('claim_payments')
    .update(updates)
    .eq('id', paymentId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true }
}

export async function setErhaltenerBetrag(
  paymentId: string,
  betrag: number,
  zahlungseingangAm?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('claim_payments')
    .update({
      erhaltener_betrag:  betrag,
      zahlungseingang_am: zahlungseingangAm ?? new Date().toISOString(),
    })
    .eq('id', paymentId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/faelle')
  return { ok: true }
}
