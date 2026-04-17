// AAR-436: Zentrales Usage-Logging für Anthropic-Calls.
//
// Fire-and-forget-Pattern — Logging darf den eigentlichen User-Flow nie
// blockieren oder crashen. Der Admin-Client (Service-Role) wird genutzt,
// weil `ai_usage_log` clientseitig Write-verboten ist.

import { createAdminClient } from '@/lib/supabase/admin'

export type AnthropicUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export type UsageLogInput = {
  endpoint: string
  model: string
  fallId?: string | null
  usage: AnthropicUsage
}

export async function logAiUsage(entry: UsageLogInput): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('ai_usage_log').insert({
      endpoint: entry.endpoint,
      model: entry.model,
      fall_id: entry.fallId ?? null,
      input_tokens: entry.usage.input_tokens ?? 0,
      output_tokens: entry.usage.output_tokens ?? 0,
      cache_creation_input_tokens: entry.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: entry.usage.cache_read_input_tokens ?? 0,
    })
  } catch (err) {
    // Bewusst swallowen — Usage-Log darf den Request nie brechen.
    console.error('[AAR-436] ai_usage_log insert fehlgeschlagen:', err)
  }
}
