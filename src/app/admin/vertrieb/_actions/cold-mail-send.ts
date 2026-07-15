'use server'
// Cold-Mailer S0: manueller Single-Send einer Cold-Mail an einen Partner-Lead.
// Bewusst getrennt von sendeVertriebMail (transaktionale Vorlagen-Mail via sendEmail):
// eigene Sende-Subdomain zur Reputations-Isolation, Pflicht-Abmeldelink,
// Suppression-Gate und Verlauf in cold_mail_sends statt email_log.
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { protokolliereAktivitaet } from '@/app/admin/partner-leads/actions'
import { buildMergeVars, renderMerge } from '@/lib/cold-mail/merge'
import { sendColdMail } from '@/lib/cold-mail/send'
import { renderColdMailHtml } from '@/lib/cold-mail/render-shell'
import { createOptoutToken } from '@/lib/cold-mail/optout-token'

export async function sendeColdMailAnLead(
  leadId: string,
  input: { betreff: string; bodyHtml: string },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const { supabase } = guard

  if (!input.betreff.trim() || !input.bodyHtml.trim()) {
    return { ok: false, error: 'Betreff und Text dürfen nicht leer sein.' }
  }

  // Spalten gegen die prod-DB verifiziert (der Client ist ungetypt -> tsc prueft
  // Select-Strings NICHT; ein Tippfehler waere ein stiller 400).
  const { data: lead, error: leadErr } = await supabase
    .from('partner_leads')
    .select('id, email, ansprechpartner_email, ansprechpartner_vorname, ansprechpartner_nachname, ansprechpartner_position, firma, ort, rolle')
    .eq('id', leadId)
    .single()
  if (leadErr || !lead) return { ok: false, error: 'Lead nicht gefunden.' }

  const empfaenger = (lead.ansprechpartner_email?.trim() || lead.email?.trim() || '').toLowerCase()
  if (!empfaenger) {
    return { ok: false, error: 'Kein Empfänger hinterlegt (weder Ansprechpartner- noch Firmen-E-Mail).' }
  }

  // Opt-out-Gate — MUSS fail-closed sein: laeuft die Abfrage auf einen Fehler,
  // ist `data` null und ein `if (supp)`-Check wuerde die Mail durchlassen, also an
  // jemanden senden, der widersprochen hat (UWG). Darum error separat abfangen.
  const { data: supp, error: suppErr } = await supabase
    .from('cold_mail_suppression')
    .select('email')
    .eq('email', empfaenger)
    .maybeSingle()
  if (suppErr) {
    console.error('[sendeColdMailAnLead] Suppression-Pruefung fehlgeschlagen:', suppErr)
    return { ok: false, error: 'Opt-out-Prüfung fehlgeschlagen — es wurde nichts gesendet.' }
  }
  if (supp) return { ok: false, error: 'Empfänger ist abgemeldet (Opt-out).' }

  const vars = buildMergeVars(lead)
  const betreff = renderMerge(input.betreff, vars)
  const bodyGemergt = renderMerge(input.bodyHtml, vars)

  // Pfad-Gotcha: NICHT '/abmelden/...' — das wird per 301 auf die Marketing-Domain
  // geschickt und 404t dort (tote Zone). Analog wochenreportOptOutUrl.
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
  const abmeldeUrl = `${base}/partner-abmelden/${createOptoutToken(empfaenger)}`
  const html = await renderColdMailHtml({ bodyHtml: bodyGemergt, abmeldeUrl })

  const res = await sendColdMail({ to: empfaenger, subject: betreff, html, abmeldeUrl, leadId })
  if (!res.ok) return { ok: false, error: res.error }

  // Ab hier non-critical: die Mail IST raus — kein Folgefehler darf das umkehren.
  // Der Supabase-Client wirft nicht, er liefert {error} -> beides behandeln.
  try {
    const { error: logErr } = await supabase.from('cold_mail_sends').insert({
      lead_id: leadId,
      empfaenger_email: empfaenger,
      betreff,
      body_snapshot: html,
      resend_message_id: res.messageId,
      status: 'gesendet',
    })
    if (logErr) console.error('[sendeColdMailAnLead] Verlauf-Insert fehlgeschlagen (non-fatal):', logErr)
  } catch (err) {
    console.error('[sendeColdMailAnLead] Verlauf-Insert warf (non-fatal):', err)
  }

  // Bis die "Cold-Mails"-Sektion in S3 existiert, ist das Aktivitaets-Log die
  // einzige Stelle, an der ein Versand im Lead sichtbar wird.
  try {
    await protokolliereAktivitaet(leadId, 'email', `Cold-Mail gesendet: ${betreff}`)
  } catch (err) {
    console.error('[sendeColdMailAnLead] Aktivitaets-Log fehlgeschlagen (non-fatal):', err)
  }

  revalidatePath('/admin/vertrieb')
  return { ok: true }
}
