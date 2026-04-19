'use server'

// AAR-561 (C12): KB/Admin-Server-Action für Konfrontations-Dispatch-Lite.
// Wird aus der Admin-Prozess-Tab-NachbesichtigungSection (C6/AAR-543) aufgerufen
// wenn der KB einen Kunden-Vorschlag bestätigt und der Kunde via C9 SV-Präsenz
// gewünscht hat. Ruft die geteilte triggerKonfrontationsDispatch-Logik auf.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  triggerKonfrontationsDispatch,
  type TriggerKonfrontationsDispatchResult,
} from '@/lib/dispatch/konfrontations-dispatch-lite'
import type { FallakteRolle } from '@/lib/fall/field-permissions'

export interface TriggerKonfrontationInput {
  fallId: string
  terminIso: string
  dauerMinuten?: number
}

export async function triggerKonfrontationFromAdmin(
  input: TriggerKonfrontationInput,
): Promise<TriggerKonfrontationsDispatchResult> {
  if (!input.fallId) return { success: false, error: 'fallId fehlt' }
  if (!input.terminIso) return { success: false, error: 'terminIso fehlt' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = (profile?.rolle as FallakteRolle | undefined) ?? 'kunde'
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return {
      success: false,
      error: 'Nur Admin/Kundenbetreuer dürfen Konfrontations-Dispatch auslösen',
    }
  }

  const result = await triggerKonfrontationsDispatch({
    fallId: input.fallId,
    terminIso: input.terminIso,
    dauerMinuten: input.dauerMinuten,
    triggeredByProfileId: user.id,
  })

  if (result.success) {
    revalidatePath(`/admin/faelle/${input.fallId}`)
    revalidatePath(`/admin/faelle/${input.fallId}/prozess`)
    revalidatePath(`/gutachter/fall/${input.fallId}`)
  }

  return result
}
