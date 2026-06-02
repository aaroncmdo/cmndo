'use client'

// Chat-Inbox P2: Default-Mark-Read-Strategie ueber den Browser-Client (RLS-scoped).
// Deckt beide Scope-Modi (fall / kanal-allowlist). Consumer koennen via Prop eine
// eigene Strategie injizieren (z. B. der Kunde-Pfad seine Server-Action).

import { createClient } from '@/lib/supabase/client'
import { buildMarkReadSpec } from '@/lib/chat/thread/mark-read'
import type { ChatScope } from '@/lib/chat/thread/scope'

export async function standardMarkRead(scope: ChatScope, userId: string): Promise<void> {
  const supabase = createClient()
  const spec = buildMarkReadSpec(scope, userId)
  if (spec.mode === 'fall') {
    if (spec.fallIds.length === 0) return
    await supabase
      .from('nachrichten')
      .update({ gelesen: true })
      .in('fall_id', spec.fallIds)
      .in('kanal', spec.kanaele)
      .eq('gelesen', false)
      .neq('sender_id', spec.excludeSenderId)
  } else {
    await supabase
      .from('nachrichten')
      .update({ gelesen: true })
      .eq('kanal', spec.kanal)
      .eq('empfaenger_id', spec.empfaengerId)
      .eq('gelesen', false)
  }
}
