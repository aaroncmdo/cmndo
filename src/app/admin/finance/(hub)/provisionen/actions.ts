'use server'

// AAR-92: Maik-Provisionen Server Actions
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/guards'
import { revalidatePath } from 'next/cache'

// Dashboard-Audit (29.06.): Diese Mutationen hatten nur eine `if (!user)`-Pruefung, keinen
// Rollen-Guard. Da provisionen_maik-RLS auch kundenbetreuer/dispatch das Schreiben erlaubt,
// konnten Nicht-Admins confirm/pay/reverse aufrufen. requireRole(['admin']) schliesst das
// (Defense-in-Depth; eine RLS-Verschaerfung auf admin-only waere ein separater Migration-Follow-up).

export async function setCpl(provisionId: string, cpl: number): Promise<{ success: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { success: false, error: guard.error ?? 'Nicht berechtigt' }
  const supabase = await createClient()

  if (cpl < 0) return { success: false, error: 'CPL muss >= 0 sein' }

  const { error } = await supabase
    .from('provisionen_maik')
    .update({ cpl_actual: cpl, updated_at: new Date().toISOString() })
    .eq('id', provisionId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/finance')
  return { success: true }
}

export async function confirmProvision(provisionId: string): Promise<{ success: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { success: false, error: guard.error ?? 'Nicht berechtigt' }
  const supabase = await createClient()

  const { error } = await supabase
    .from('provisionen_maik')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', provisionId)
    .eq('status', 'pending')

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/finance')
  return { success: true }
}

/**
 * AAR-153: Bulk-Übergang confirmed → paid für alle Provisionen eines Monats.
 * Aaron zahlt Maik meist in einem Rutsch pro Monat aus. Dieser Endpunkt
 * markiert alle confirmed-Provisionen des Monats als paid und setzt paid_at.
 * Pending- und reversed-Einträge bleiben unberührt.
 */
export async function markMonthAsPaid(
  monat: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { success: false, count: 0, error: guard.error ?? 'Nicht berechtigt' }
  const supabase = await createClient()

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('provisionen_maik')
    .update({ status: 'paid', paid_at: now, updated_at: now })
    .eq('monat', monat)
    .eq('status', 'confirmed')
    .select('id')

  if (error) return { success: false, count: 0, error: error.message }
  revalidatePath('/admin/finance')
  return { success: true, count: (data ?? []).length }
}

export async function reverseProvision(provisionId: string, grund: string): Promise<{ success: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { success: false, error: guard.error ?? 'Nicht berechtigt' }
  const supabase = await createClient()

  const { error } = await supabase
    .from('provisionen_maik')
    .update({
      status: 'reversed',
      reversed_grund: grund || 'Manuelle Reversion',
      updated_at: new Date().toISOString(),
    })
    .eq('id', provisionId)
    .neq('status', 'paid')

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/finance')
  return { success: true }
}
