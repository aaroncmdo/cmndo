// Token-Audit-Skip: Email-Template (inline-HTML) — raw Markenfarbe in style-Attributen,
//   wie alle Email-Generation-Files (Mail-Clients koennen kein Tailwind/CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//   Whitelabel-Branding (resolveEmailBranding) = dokumentierter Follow-up.

// SV-Empfehlung: der Gutachter hat 1-3 Werkstaetten fuer den Kunden ausgewaehlt.
// Der Kunde bekommt einen Magic-Link (WhatsApp + Email), auf dem er selbst waehlt.
// Bewusst direkter sendWhatsApp/sendEmail-Pfad (kein registry/sendCommunication) —
// spiegelt das Schwester-Pattern notify-kunde-vermittlung.ts (inline-branded HTML,
// keine Edits an geteiltem registry.ts / template-sids.ts). Deps injizierbar -> testbar.

import { sendWhatsApp } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email/google/client'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type KundeKontakt = {
  vorname?: string | null
  telefon?: string | null
  email?: string | null
}

export type NotifyDeps = {
  sendWhatsApp: typeof sendWhatsApp
  sendEmail: typeof sendEmail
}

const defaultDeps: NotifyDeps = { sendWhatsApp, sendEmail }

function anzahlText(anzahl: number): string {
  return anzahl > 1 ? `${anzahl} passende Werkstätten` : 'eine passende Werkstatt'
}

/** WhatsApp-Freitext (Du-Ansprache, konsistent zu notify-kunde-vermittlung). */
export function buildKundeEmpfehlungWhatsApp(args: {
  vorname?: string | null
  link: string
  anzahl: number
}): string {
  const anrede = args.vorname?.trim() ? `Hallo ${args.vorname.trim()},` : 'Hallo,'
  return [
    `${anrede} dein Gutachter hat ${anzahlText(args.anzahl)} für die Reparatur deines Fahrzeugs ausgewählt.`,
    '',
    'Wähle hier deine Werkstatt aus:',
    args.link,
    '',
    'Dein Claimondo-Team',
  ].join('\n')
}

/** Claimondo-branded Inline-HTML mit CTA-Button auf den Magic-Link. */
export function buildKundeEmpfehlungEmailHtml(args: {
  vorname?: string | null
  link: string
  anzahl: number
}): string {
  const NAVY = '#0D1B3E'
  const BG = '#f8f9fb'
  const anrede = args.vorname?.trim() ? `Hallo ${escapeHtml(args.vorname.trim())},` : 'Hallo,'
  // link ist eine vertrauenswuerdige, selbst gebaute URL (Token = wemp-<uuid>) -> kein User-Input.
  const link = args.link

  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;">Claimondo</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">${anrede}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">dein Gutachter hat ${anzahlText(args.anzahl)} für die Reparatur deines Fahrzeugs ausgewählt. Wähle deine Werkstatt mit einem Klick aus:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="border-radius:12px;background:${NAVY};">
            <a href="${link}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:12px;">Werkstatt auswählen</a>
          </td></tr></table>
          <p style="margin:0 0 8px;font-size:13px;color:#4573A2;line-height:1.5;">Falls der Button nicht funktioniert, öffne diesen Link:<br>${link}</p>
          <p style="margin:24px 0 0;font-size:15px;">Dein Claimondo-Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Benachrichtigt den Kunden ueber die SV-Werkstatt-Empfehlung via WhatsApp (wenn
 * Telefon vorhanden) und Email (wenn Email vorhanden). Jeder Kanal einzeln non-critical
 * — ein Send-Fehler darf die Empfehlung NICHT zuruecknehmen.
 */
export async function notifyKundeWerkstattEmpfehlung(
  args: { kunde: KundeKontakt; link: string; anzahl: number; fallId?: string | null },
  deps: NotifyDeps = defaultDeps,
): Promise<{ whatsapp: boolean; email: boolean }> {
  const { kunde, link, anzahl } = args
  const result = { whatsapp: false, email: false }

  if (kunde.telefon?.trim()) {
    try {
      const msg = buildKundeEmpfehlungWhatsApp({ vorname: kunde.vorname, link, anzahl })
      const r = await deps.sendWhatsApp(kunde.telefon.trim(), msg)
      result.whatsapp = r.success
    } catch (err) {
      console.warn('[notifyKundeWerkstattEmpfehlung] WhatsApp fehlgeschlagen (non-fatal):', err)
    }
  }

  if (kunde.email?.trim()) {
    try {
      const html = buildKundeEmpfehlungEmailHtml({ vorname: kunde.vorname, link, anzahl })
      await deps.sendEmail({
        to: kunde.email.trim(),
        subject: 'Ihr Gutachter empfiehlt eine Werkstatt — bitte auswählen',
        html,
        template: 'werkstatt_empfehlung_kunde',
        empfaengerTyp: 'kunde',
        fallId: args.fallId ?? null,
      })
      result.email = true
    } catch (err) {
      console.warn('[notifyKundeWerkstattEmpfehlung] Email fehlgeschlagen (non-fatal):', err)
    }
  }

  return result
}
