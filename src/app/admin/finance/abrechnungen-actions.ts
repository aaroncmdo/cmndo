'use server'

import { createClient } from '@/lib/supabase/server'
import { generiereMarketingAbrechnung, generiereKanzleiAbrechnungen } from '@/lib/finance/abrechnungen-generator'
import { generateAbrechnungPDF } from '@/lib/finance/abrechnung-pdf'
import { sendMarketingAbrechnung, sendKanzleiMonatsAbrechnung } from '@/lib/email/google/flows'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { revalidatePath } from 'next/cache'

export async function markiereAlsBezahlt(abrechnungId: string, betrag: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('abrechnungen')
    .update({
      status: 'bezahlt',
      bezahlt_am: new Date().toISOString(),
      bezahlt_betrag: betrag,
      updated_at: new Date().toISOString(),
    })
    .eq('id', abrechnungId)

  if (error) throw new Error(error.message)

  // KFZ-151: Auto-Resolve aller offenen Tasks zu dieser Abrechnung
  try {
    await resolveTasksForEntity('abrechnung', abrechnungId, 'Rechnung bezahlt')
  } catch (err) { console.error('[KFZ-151] resolveTasks abrechnung bezahlt:', err) }

  revalidatePath('/admin/finance')
}

export async function storniereAbrechnung(abrechnungId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('abrechnungen')
    .update({ status: 'storniert', updated_at: new Date().toISOString() })
    .eq('id', abrechnungId)

  if (error) throw new Error(error.message)

  // KFZ-151: Auto-Resolve aller offenen Tasks zu dieser Abrechnung
  try {
    await resolveTasksForEntity('abrechnung', abrechnungId, 'Rechnung storniert')
  } catch (err) { console.error('[KFZ-151] resolveTasks abrechnung storniert:', err) }

  revalidatePath('/admin/finance')
}

export async function manuellVersenden(abrechnungId: string) {
  const supabase = await createClient()
  const { data: abr } = await supabase
    .from('abrechnungen')
    .select('id, empfaenger_typ, pdf_path')
    .eq('id', abrechnungId)
    .single()

  if (!abr) throw new Error('Abrechnung nicht gefunden')

  // PDF generieren falls noch nicht vorhanden
  if (!abr.pdf_path) {
    await generateAbrechnungPDF(abrechnungId)
  }

  // Versenden
  if (abr.empfaenger_typ === 'marketing') {
    await sendMarketingAbrechnung(abrechnungId)
  } else if (abr.empfaenger_typ === 'kanzlei') {
    await sendKanzleiMonatsAbrechnung(abrechnungId)
  }

  revalidatePath('/admin/finance')
}

export async function manuellGenerieren(monat: string, typ: 'marketing' | 'kanzlei') {
  if (typ === 'marketing') {
    const result = await generiereMarketingAbrechnung(monat)
    if (result) {
      await generateAbrechnungPDF(result.abrechnungId)
    }
  } else {
    const results = await generiereKanzleiAbrechnungen(monat)
    for (const r of results) {
      await generateAbrechnungPDF(r.abrechnungId)
    }
  }

  revalidatePath('/admin/finance')
}
