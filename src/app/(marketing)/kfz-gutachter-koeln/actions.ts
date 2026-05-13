'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
})

export async function submitKoelnLead(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Eingaben ungültig' }

  const webhookUrl = process.env.LEAD_WEBHOOK_URL
  if (!webhookUrl) {
    console.error('LEAD_WEBHOOK_URL fehlt — Lead wird nicht versendet')
    return { ok: false, error: 'Konfigurationsfehler — bitte später erneut versuchen' }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...parsed.data,
        source: 'kfz-gutachter-koeln-ads',
        timestamp: new Date().toISOString(),
      }),
    })
    if (!res.ok) return { ok: false, error: 'Übermittlung fehlgeschlagen — bitte rufen Sie an: 0221 25906530' }
  } catch (err) {
    console.error('Lead-Webhook-Fehler:', err)
    return { ok: false, error: 'Netzwerk-Fehler — bitte versuchen Sie es erneut' }
  }

  revalidatePath('/admin/leads')
  return { ok: true }
}
