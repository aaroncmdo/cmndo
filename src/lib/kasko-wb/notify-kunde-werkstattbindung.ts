// Token-Audit-Skip: Email-Template (inline-HTML) — raw Markenfarbe in style-Attributen,
//   wie alle Email-Generation-Files (Mail-Clients koennen kein Tailwind/CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// E6 (Aaron 04.09.): Zusammenfassungs-Mail nach Abbruch wegen Kasko-Werkstattbindung — der Kunde soll das
// „So geht es weiter" schwarz auf weiss haben (Sanktion, Versicherer-Kontakt, Ausnahmen). Muster wie
// src/lib/werkstatt/notify-kunde-vermittlung.ts (inline-branded HTML, injizierbare Deps, non-fatal).

import { sendEmail } from '@/lib/email/google/client'
import type { KaskoBindungsInfo } from './types'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export type WerkstattbindungMailDeps = { sendEmail: typeof sendEmail }
const defaultDeps: WerkstattbindungMailDeps = { sendEmail }

export function buildWerkstattbindungEmailHtml(args: { vorname: string | null | undefined; info: KaskoBindungsInfo }): string {
  const NAVY = '#0D1B3E'
  const BG = '#f8f9fb'
  const anrede = args.vorname?.trim() ? `Hallo ${escapeHtml(args.vorname.trim())},` : 'Hallo,'
  const i = args.info
  const tarif = [i.markeName, i.tarifName ? `Tarif „${i.tarifName}“` : null].filter(Boolean).map((s) => escapeHtml(String(s))).join(' · ')
  const kontakt = [
    i.hotline ? `Schaden-Hotline: ${escapeHtml(i.hotline)}` : null,
    i.schadenEmail ? `E-Mail: ${escapeHtml(i.schadenEmail)}` : null,
    i.webseite ? `Web: ${escapeHtml(i.webseite)}` : null,
  ].filter(Boolean).join('<br>')
  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;">Claimondo</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">${anrede}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Ihr Kasko-Tarif enthält eine Werkstattbindung${tarif ? ` (${tarif})` : ''}. Ihre Versicherung benennt die Reparaturwerkstatt – deshalb vermitteln wir Ihnen keine Werkstatt, damit Ihnen keine Kürzung entsteht.</p>
          <div style="background:${BG};border-radius:12px;padding:18px 20px;margin-bottom:16px;">
            <div style="font-weight:600;color:${NAVY};margin-bottom:6px;">Was das für Sie bedeutet</div>
            <div style="color:#4573A2;line-height:1.5;">${escapeHtml(i.sanktionText)}</div>
          </div>
          <div style="background:${BG};border-radius:12px;padding:18px 20px;margin-bottom:16px;">
            <div style="font-weight:600;color:${NAVY};margin-bottom:6px;">So geht es weiter</div>
            <ol style="margin:0;padding-left:20px;color:#4573A2;line-height:1.6;">
              <li>Schaden bei Ihrer Versicherung melden${kontakt ? `<br>${kontakt}` : ''}</li>
              <li>Partnerwerkstatt benennen lassen${i.partnernetz ? ` (${escapeHtml(i.partnernetz)})` : ''}</li>
              <li>Ausnahmen mit freier Wahl: ${escapeHtml(i.ausnahmenText)}</li>
            </ol>
          </div>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#4573A2;">Maßgeblich sind Ihr Versicherungsschein und Ihre AKB. Diese Einschätzung beruht auf dem Tarifnamen (Stand ${escapeHtml(i.stand)}).</p>
          <p style="margin:24px 0 0;font-size:15px;">Ihr Claimondo-Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function notifyKundeWerkstattbindung(
  args: { kunde: { vorname?: string | null; email?: string | null }; info: KaskoBindungsInfo },
  deps: WerkstattbindungMailDeps = defaultDeps,
): Promise<{ email: boolean }> {
  const email = args.kunde.email?.trim()
  if (!email) return { email: false }
  try {
    await deps.sendEmail({
      to: email,
      subject: 'Ihr Kasko-Tarif: Werkstattbindung – so geht es weiter',
      html: buildWerkstattbindungEmailHtml({ vorname: args.kunde.vorname, info: args.info }),
      template: 'kasko_werkstattbindung_kunde',
      empfaengerTyp: 'kunde',
      fallId: null,
    })
    return { email: true }
  } catch (err) {
    console.warn('[notifyKundeWerkstattbindung] Email fehlgeschlagen (non-fatal):', err)
    return { email: false }
  }
}
