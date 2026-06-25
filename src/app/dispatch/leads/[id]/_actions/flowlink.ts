'use server'

// AAR-143/AAR-956: thin Wrapper um sendFlowLinkMultiChannelCore. Dispatch nutzt
// den RLS-Client (createClient) — Dispatcher haben Voll-Zugriff auf leads. Der
// Versand-Core liegt jetzt in @/lib/start-link/send-flowlink-multichannel und
// wird auch vom KB-Konsultations-Cockpit (mit service-role-Client) genutzt.

import { createClient } from '@/lib/supabase/server'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { revalidatePath } from 'next/cache'

export async function sendFlowLinkMultiChannel(
  leadId: string,
  kanal: 'whatsapp' | 'sms' | 'email',
  telefonOverride?: string | null,
): Promise<{ success: boolean; error?: string; token?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const res = await sendFlowLinkMultiChannelCore(supabase, leadId, kanal, user.id, telefonOverride)
  if (res.success) {
    revalidatePath(`/dispatch/leads/${leadId}`)
    revalidatePath('/dispatch/dashboard')
  }
  return res
}
