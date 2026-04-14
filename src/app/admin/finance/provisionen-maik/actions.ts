'use server'

// AAR-92: Maik-Provisionen Server Actions
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setCpl(provisionId: string, cpl: number): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  if (cpl < 0) return { success: false, error: 'CPL muss >= 0 sein' }

  const { error } = await supabase
    .from('provisionen_maik')
    .update({ cpl_actual: cpl, updated_at: new Date().toISOString() })
    .eq('id', provisionId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/finance/provisionen-maik')
  return { success: true }
}

export async function confirmProvision(provisionId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('provisionen_maik')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', provisionId)
    .eq('status', 'pending')

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/finance/provisionen-maik')
  return { success: true }
}

export async function reverseProvision(provisionId: string, grund: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

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
  revalidatePath('/admin/finance/provisionen-maik')
  return { success: true }
}
