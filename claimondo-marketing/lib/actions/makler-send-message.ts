'use server'

// AAR-488 (M6): Server-Action fuer Makler-Chat. Postet in den bestehenden
// `gruppenchat`-Kanal des Falls. Consent-Gate erzwingt Vollzugriff —
// minimal/widerrufen duerfen nicht posten.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMakler } from '@/lib/makler/queries'

const schema = z.object({
  fallId: z.string().uuid(),
  inhalt: z.string().min(1).max(2000),
})

export type MaklerSendMessageInput = z.infer<typeof schema>

export type MaklerSendMessageResult =
  | { success: true; messageId: string }
  | { success: false; error: string }

export async function maklerSendMessage(
  input: MaklerSendMessageInput,
): Promise<MaklerSendMessageResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Ungültige Eingabe.' }
  }

  const makler = await getCurrentMakler()
  if (!makler) {
    return { success: false, error: 'Makler-Profil nicht gefunden.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Nicht authentifiziert.' }
  }

  // Consent-Gate: nur Vollzugriff darf chatten.
  const { data: consent } = await supabase
    .from('makler_fall_consent')
    .select('consent_scope, widerrufen_am')
    .eq('makler_id', makler.id)
    .eq('fall_id', parsed.data.fallId)
    .maybeSingle()

  if (
    !consent ||
    consent.widerrufen_am ||
    consent.consent_scope !== 'vollzugriff'
  ) {
    return {
      success: false,
      error: 'Kein Vollzugriff-Consent für diesen Fall.',
    }
  }

  const { data: inserted, error } = await supabase
    .from('nachrichten')
    .insert({
      fall_id: parsed.data.fallId,
      kanal: 'gruppenchat',
      sender_id: user.id,
      sender_rolle: 'makler',
      nachricht: parsed.data.inhalt,
      hat_anhang: false,
      is_system: false,
      gelesen: false,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return {
      success: false,
      error: error?.message ?? 'Nachricht konnte nicht gesendet werden.',
    }
  }

  // 13.05.2026 Server-Actions-Audit Fix: Makler-Inbox + Fall-Chat (Admin/SV
  // sehen den Gruppenchat ebenfalls) müssen revalidated werden, sonst sieht
  // niemand die neue Nachricht ohne Hard-Refresh — Realtime-Subscriptions
  // greifen nur für Browser, die den Channel schon offen haben.
  revalidatePath('/makler/nachrichten')
  revalidatePath(`/makler/akten/${parsed.data.fallId}`)
  revalidatePath(`/faelle/${parsed.data.fallId}`)

  return { success: true, messageId: inserted.id }
}
