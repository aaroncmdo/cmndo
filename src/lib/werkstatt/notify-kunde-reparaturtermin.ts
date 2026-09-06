// Token-Audit-Skip: Email-Template (inline-HTML) — raw Markenfarbe in style-Attributen,
//   wie alle Email-Generation-Files (Mail-Clients koennen kein Tailwind/CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// SP2 Task 5: Kunden-Benachrichtigung bei Reparaturtermin-Status-Wechsel.
// Drei Ereignisse: bestaetigt / anruf_erbeten / abgelehnt.
// Sender injizierbar (deps) -> ohne echten Versand testbar.
// Liest Kontaktdaten des Kunden per Service-Role-Client (claims hat keine
// werkstatt-RLS-Policy — der regulaere Session-Client liefert 0 Zeilen).

import { sendEmail } from '@/lib/email/google/client'
import { createNotification } from '@/lib/notifications'
import type { SupabaseClient } from '@supabase/supabase-js'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const DATETIME = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
})

function fmtTermin(iso: string): string {
  return `${DATETIME.format(new Date(iso))} Uhr`
}

export type ReparaturterminEreignis = 'werkstatt_vorschlag' | 'bestaetigt' | 'anruf_erbeten' | 'abgelehnt' | 'erledigt'

export type NotifyKundeReparaturterminDeps = {
  sendEmail: typeof sendEmail
  createNotification: typeof createNotification
}

const defaultDeps: NotifyKundeReparaturterminDeps = { sendEmail, createNotification }

// In-App-Texte je Ereignis (nutzersichtbar — echte Umlaute).
const INAPP_TEXT: Record<ReparaturterminEreignis, { titel: string; text: string }> = {
  werkstatt_vorschlag: {
    titel: 'Terminvorschlag der Werkstatt',
    text: 'Ihre Werkstatt hat einen Reparaturtermin vorgeschlagen — bitte bestätigen.',
  },
  bestaetigt: {
    titel: 'Reparaturtermin bestätigt',
    text: 'Ihre Werkstatt hat den vorgeschlagenen Termin bestätigt.',
  },
  anruf_erbeten: {
    titel: 'Werkstatt meldet sich',
    text: 'Ihre Werkstatt möchte den Termin telefonisch mit Ihnen abstimmen.',
  },
  abgelehnt: {
    titel: 'Reparaturtermin abgelehnt',
    text: 'Ihre Werkstatt konnte den vorgeschlagenen Termin nicht annehmen.',
  },
  erledigt: {
    titel: 'Ihre Reparatur ist abgeschlossen',
    text: 'Die Werkstatt hat die Reparatur abgeschlossen. Den Beleg können Sie im Portal herunterladen.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML-Builder (rein, testbar)
// ─────────────────────────────────────────────────────────────────────────────

export function buildKundeReparaturterminEmailHtml(args: {
  vorname?: string | null
  ereignis: ReparaturterminEreignis
  bestaetigterTermin?: string | null
}): { html: string; betreff: string } {
  const NAVY = '#0D1B3E'
  const BG = '#f8f9fb'
  const anrede = args.vorname?.trim() ? `Hallo ${escapeHtml(args.vorname.trim())},` : 'Hallo,'

  let inhalt: string
  let betreff: string

  if (args.ereignis === 'werkstatt_vorschlag') {
    const terminZeile = args.bestaetigterTermin?.trim()
      ? `<p style="margin:0 0 16px;font-size:15px;">Vorgeschlagener Termin: <strong>${escapeHtml(fmtTermin(args.bestaetigterTermin.trim()))}</strong></p>`
      : ''
    betreff = 'Die Werkstatt hat einen Termin vorgeschlagen'
    inhalt = `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">die Werkstatt hat einen Reparaturtermin für Sie vorgeschlagen.</p>
      ${terminZeile}
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Bitte bestätigen Sie den Termin in Ihrem Claimondo-Portal. Passt er nicht, können Sie die Werkstatt direkt anrufen oder einen Rückruf vereinbaren.</p>`
  } else if (args.ereignis === 'bestaetigt') {
    const terminZeile = args.bestaetigterTermin?.trim()
      ? `<p style="margin:0 0 16px;font-size:15px;">Ihr bestätigter Reparaturtermin: <strong>${escapeHtml(fmtTermin(args.bestaetigterTermin.trim()))}</strong></p>`
      : ''
    betreff = 'Ihr Reparaturtermin ist bestätigt'
    inhalt = `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">die Werkstatt hat Ihren Wunschtermin für die Reparatur bestätigt.</p>
      ${terminZeile}
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Bitte erscheinen Sie pünktlich zur vereinbarten Zeit. Bei Rückfragen zur Reparatur wenden Sie sich direkt an die Werkstatt oder schreiben Sie uns hier.</p>`
  } else if (args.ereignis === 'anruf_erbeten') {
    betreff = 'Die Werkstatt meldet sich bei Ihnen'
    inhalt = `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">die Werkstatt wird sich in Kürze telefonisch bei Ihnen melden, um einen Reparaturtermin zu vereinbaren.</p>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Bitte halten Sie Ihr Telefon bereit. Bei Fragen sind wir jederzeit für Sie da.</p>`
  } else if (args.ereignis === 'erledigt') {
    betreff = 'Ihre Reparatur ist abgeschlossen'
    inhalt = `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">die Werkstatt hat die Reparatur an Ihrem Fahrzeug erfolgreich abgeschlossen.</p>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Die Schlussrechnung steht Ihnen jetzt im Claimondo-Portal zum Herunterladen bereit. Melden Sie sich einfach an und rufen Sie Ihren Fall auf.</p>`
  } else {
    betreff = 'Reparaturtermin konnte nicht bestätigt werden'
    inhalt = `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">leider konnte die Werkstatt Ihren Wunschtermin nicht bestätigen.</p>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Bitte kontaktieren Sie uns, damit wir gemeinsam einen neuen Termin finden können.</p>`
  }

  return { html: `<!doctype html>
<html lang="de">
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;">Claimondo</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">${anrede}</p>
          ${inhalt}
          <p style="margin:24px 0 0;font-size:15px;">Ihr Claimondo-Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, betreff }
}

// ─────────────────────────────────────────────────────────────────────────────
// Haupt-Notify (Service-Role fuer claim-Read)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liest Kontaktdaten des Claim-Owners via Service-Role und verschickt Email
 * (non-fatal). WhatsApp-Erweiterung ist als Follow-up vorgesehen.
 *
 * @param args.svc  Service-Role-Client (kein auth-aware — claims ohne werkstatt-RLS)
 */
export async function notifyKundeReparaturtermin(
  args: {
    claimId: string
    ereignis: ReparaturterminEreignis
    bestaetigterTermin?: string | null
    svc: SupabaseClient
  },
  deps: NotifyKundeReparaturterminDeps = defaultDeps,
): Promise<{ email: boolean; inApp: boolean }> {
  const result = { email: false, inApp: false }

  // Kontaktdaten des Kunden via Service-Role lesen
  const { data: claim } = await args.svc
    .from('claims')
    .select('geschaedigter_user_id, lead_id')
    .eq('id', args.claimId)
    .maybeSingle()

  if (!claim) return result

  // In-App-Benachrichtigung (nur bei Kunde-Account; unabhaengig von der Email; non-fatal).
  // Accountlose Leads bekommen nur die Email (Lead-Fallback unten).
  if (claim.geschaedigter_user_id) {
    try {
      const { titel, text } = INAPP_TEXT[args.ereignis]
      await deps.createNotification(
        claim.geschaedigter_user_id as string,
        'reparatur_termin',
        titel,
        text,
        `/kunde/faelle/${args.claimId}`,
      )
      result.inApp = true
    } catch (err) {
      console.warn('[notifyKundeReparaturtermin] In-App fehlgeschlagen (non-fatal):', err)
    }
  }

  // Versuch 1: Profil des eingeloggten Kunden
  let vorname: string | null = null
  let email: string | null = null

  if (claim.geschaedigter_user_id) {
    const { data: profil } = await args.svc
      .from('profiles')
      .select('vorname, email')
      .eq('id', claim.geschaedigter_user_id)
      .maybeSingle()
    vorname = (profil as unknown as { vorname: string | null } | null)?.vorname ?? null
    email = (profil as unknown as { email: string | null } | null)?.email ?? null
  }

  // Versuch 2: Lead-Daten als Fallback
  if (!email && claim.lead_id) {
    const { data: lead } = await args.svc
      .from('leads')
      .select('vorname, email')
      .eq('id', claim.lead_id)
      .maybeSingle()
    if (!vorname) vorname = (lead as unknown as { vorname: string | null } | null)?.vorname ?? null
    email = (lead as unknown as { email: string | null } | null)?.email ?? null
  }

  if (!email?.trim()) return result

  try {
    const { html, betreff } = buildKundeReparaturterminEmailHtml({
      vorname,
      ereignis: args.ereignis,
      bestaetigterTermin: args.bestaetigterTermin,
    })
    await deps.sendEmail({
      to: email.trim(),
      subject: betreff,
      html,
      template: `reparaturtermin_${args.ereignis}`,
      empfaengerTyp: 'kunde',
      fallId: null,
    })
    result.email = true
  } catch (err) {
    console.warn('[notifyKundeReparaturtermin] Email fehlgeschlagen (non-fatal):', err)
  }

  return result
}
