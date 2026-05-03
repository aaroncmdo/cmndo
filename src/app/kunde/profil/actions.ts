'use server'

// AAR-703: Kunde-Profil-Update — Telefon + sekundäre Email.
// Login-Email (profiles.email) ist read-only an dieser Stelle, weil sie an
// auth.users.email gebunden ist und ein Wechsel via Supabase-Verifikations-
// flow läuft, nicht via Profile-Update.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type UpdateKundeProfilInput = {
  telefon?: string | null
  zweit_email?: string | null
}

export async function updateKundeProfil(
  data: UpdateKundeProfilInput,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Validation: zweit_email muss valide aussehen wenn gesetzt
  if (data.zweit_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.zweit_email.trim())) {
    return { success: false, error: 'Ungültige Email-Adresse' }
  }

  const updates: Record<string, unknown> = {}
  if (data.telefon !== undefined) updates.telefon = data.telefon?.trim() || null
  if (data.zweit_email !== undefined) updates.zweit_email = data.zweit_email?.trim() || null

  if (Object.keys(updates).length === 0) return { success: true }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/kunde/profil')
  return { success: true }
}
