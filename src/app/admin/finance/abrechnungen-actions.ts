'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { generiereKanzleiAbrechnungen } from '@/lib/finance/abrechnungen-generator'
import { generateAbrechnungPDF } from '@/lib/finance/abrechnung-pdf'
import { sendKanzleiMonatsAbrechnung } from '@/lib/email/google/flows'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { revalidatePath } from 'next/cache'

// Write-Path-Audit (28.06.): Diese Finance-Actions hatten KEINEN Rollen-Guard (nur
// createClient/RLS). Da `abrechnungen` 0 Write-RLS-Policy hat, war der createClient-Write
// sogar funktional tot (RLS denied → 0 Rows, still ok:true). Das parallele File
// admin/abrechnungen/actions.ts ist admin-geguardet — hier nachgezogen: requireRole(['admin'])
// + admin-client (so wirkt der Write + ist autorisiert). Kein Privilege-Escalation-Risiko mehr.

export async function markiereAlsBezahlt(
  abrechnungId: string,
  betrag: number,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  const { error } = await createAdminClient()
    .from('abrechnungen')
    .update({
      status: 'bezahlt',
      bezahlt_am: new Date().toISOString(),
      bezahlt_betrag: betrag,
      updated_at: new Date().toISOString(),
    })
    .eq('id', abrechnungId)

  if (error) return { ok: false, error: error.message }

  // KFZ-151: Auto-Resolve aller offenen Tasks zu dieser Abrechnung
  try {
    await resolveTasksForEntity('abrechnung', abrechnungId, 'Rechnung bezahlt')
  } catch (err) { console.error('[KFZ-151] resolveTasks abrechnung bezahlt:', err) }

  revalidatePath('/admin/finance')
  return { ok: true }
}

export async function storniereAbrechnung(
  abrechnungId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  const { error } = await createAdminClient()
    .from('abrechnungen')
    .update({ status: 'storniert', updated_at: new Date().toISOString() })
    .eq('id', abrechnungId)

  if (error) return { ok: false, error: error.message }

  // KFZ-151: Auto-Resolve aller offenen Tasks zu dieser Abrechnung
  try {
    await resolveTasksForEntity('abrechnung', abrechnungId, 'Rechnung storniert')
  } catch (err) { console.error('[KFZ-151] resolveTasks abrechnung storniert:', err) }

  revalidatePath('/admin/finance')
  return { ok: true }
}

export async function manuellVersenden(
  abrechnungId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  const { data: abr } = await createAdminClient()
    .from('abrechnungen')
    .select('id, empfaenger_typ, pdf_path')
    .eq('id', abrechnungId)
    .single()

  if (!abr) return { ok: false, error: 'Abrechnung nicht gefunden' }

  if (!abr.pdf_path) {
    await generateAbrechnungPDF(abrechnungId)
  }

  if (abr.empfaenger_typ === 'kanzlei') {
    await sendKanzleiMonatsAbrechnung(abrechnungId)
  }

  revalidatePath('/admin/finance')
  return { ok: true }
}

export async function manuellGenerieren(
  monat: string,
  _typ: 'kanzlei' = 'kanzlei',
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Nicht berechtigt' }

  try {
    const results = await generiereKanzleiAbrechnungen(monat)
    for (const r of results) {
      await generateAbrechnungPDF(r.abrechnungId)
    }
    revalidatePath('/admin/finance')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Generierung fehlgeschlagen' }
  }
}
