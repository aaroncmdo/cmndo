'use server'
// Vertrieb-CRM P3: sendet die (ggf. editierte) Vorlage an den Lead-Ansprechpartner und
// protokolliert den Versand im Aktivitaets-Log. nurExterneEmpfaenger greift in sendEmail
// (interne Test-Adressen werden im Live-Mode gefiltert) — hier KEIN allowInternalRecipient.
import { requireRole } from '@/lib/auth/guards'
import { sendEmail } from '@/lib/email/google/client'
import { protokolliereAktivitaet } from '@/app/admin/partner-leads/actions'
import { revalidatePath } from 'next/cache'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function sendeVertriebMail(input: {
  leadId: string
  to: string
  betreff: string
  body: string
}): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const to = input.to.trim()
  if (!to) return { ok: false, error: 'Keine Empfänger-Adresse hinterlegt.' }
  if (!input.betreff.trim() || !input.body.trim()) {
    return { ok: false, error: 'Betreff und Text dürfen nicht leer sein.' }
  }

  const html = input.body
    .split('\n')
    .map((z) => (z.trim() === '' ? '' : escapeHtml(z)))
    .join('<br>')
  try {
    await sendEmail({ to, subject: input.betreff, html, text: input.body })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'E-Mail-Versand fehlgeschlagen.' }
  }

  // Non-critical: ein Log-Fehler bricht den Versand nicht.
  try {
    await protokolliereAktivitaet(input.leadId, 'email', `Mail gesendet: ${input.betreff}`)
  } catch (err) {
    console.error('[sendeVertriebMail] Activity-Log fehlgeschlagen (non-fatal):', err)
  }

  revalidatePath('/admin/vertrieb')
  return { ok: true }
}
