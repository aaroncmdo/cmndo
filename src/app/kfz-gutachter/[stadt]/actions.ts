'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

// Shared Stadt-Lead-Server-Action für /kfz-gutachter/[stadt]-Premium-Pages.
// Result-Object-Pattern (AGENTS.md §Server-Actions). Source = kfz-gutachter-<slug>
// für Tracking-/Routing-Differenzierung im Lead-Webhook.

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
  source: z.string().min(2).max(120),
})

export async function submitStadtLead(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Eingaben unvollständig' }
  }

  const webhookUrl = process.env.LEAD_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('LEAD_WEBHOOK_URL fehlt — Stadt-Lead wird nicht versendet')
    return { ok: false, error: 'Konfigurationsfehler — bitte rufen Sie an: 0221 25906530' }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...parsed.data,
        timestamp: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      return { ok: false, error: 'Übermittlung fehlgeschlagen — bitte rufen Sie an: 0221 25906530' }
    }
  } catch (err) {
    console.error('Stadt-Lead-Webhook-Fehler:', err)
    return { ok: false, error: 'Netzwerk-Fehler — bitte versuchen Sie es erneut' }
  }

  revalidatePath('/admin/leads')
  return { ok: true }
}
