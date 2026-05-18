'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

// Lead-Server-Action für die kfzgutachter-Ads-Landeseite (A/B-Test Variante B).
// Spiegelt das Webhook-Pattern von submitStadtLead, Result-Object (AGENTS.md
// §Server-Actions). source + lp_variant fest gesetzt für die Tracking-
// Differenzierung im Lead-Webhook (A/B-Plan §F).

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
})

export async function submitKfzgutachterLead(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; field?: 'name' | 'phone' | 'city' }> {
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Eingaben unvollständig',
      field: (issue?.path[0] as 'name' | 'phone' | 'city' | undefined) ?? undefined,
    }
  }

  const webhookUrl = process.env.LEAD_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('LEAD_WEBHOOK_URL fehlt — kfzgutachter-Lead wird nicht versendet')
    return { ok: false, error: 'Konfigurationsfehler — bitte rufen Sie an: 0221 25906530' }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...parsed.data,
        source: 'kfzgutachter-ads-lp',
        lp_variant: 'test_b',
        timestamp: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      return { ok: false, error: 'Übermittlung fehlgeschlagen — bitte rufen Sie an: 0221 25906530' }
    }
  } catch (err) {
    console.error('kfzgutachter-Lead-Webhook-Fehler:', err)
    return { ok: false, error: 'Netzwerk-Fehler — bitte versuchen Sie es erneut' }
  }

  revalidatePath('/admin/leads')
  return { ok: true }
}
