// Token-Audit-Skip: Email-Template (inline-HTML) — raw Markenfarbe in style-Attributen
//   (Mail-Clients koennen kein Tailwind/CSS-Vars). Siehe AGENTS.md §branding-rules.
//
// Workshop-Notify (Email) bei Reparatur-Werkstatt-Zuweisung: die zugewiesene Werkstatt
// erfaehrt per Email vom neuen Reparaturauftrag. Bewusst EMAIL-ONLY — die In-App-Variante
// (createMitteilung empfaenger_rolle 'werkstatt' + Werkstatt-Portal-Inbox) haengt an
// PR #3263 (mitteilungen/types.ts: EmpfaengerRolle += 'werkstatt'). Sobald #3263 in
// staging ist, hier ZUSAETZLICH die In-App-Mitteilung ausloesen (analog notify-freigabe.ts).
// Aaron-Kanal-Entscheid (cfefdf75-Strecke): Werkstatt = In-App + Email, KEIN WhatsApp.
//
// Sender injizierbar (deps) -> ohne echten Versand testbar.

import { sendEmail } from '@/lib/email/google/client'

// Repo-Muster: lokales escapeHtml pro Template-File (vgl. notify-kunde-vermittlung.ts,
// notify-new-lead.ts) — kein geteilter Export. Schuetzt gegen Stored-XSS-in-Mail.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type NotifyWerkstattDeps = { sendEmail: typeof sendEmail }
const defaultDeps: NotifyWerkstattDeps = { sendEmail }

/** Claimondo-branded Inline-HTML. Alle extern befuellten Werte sind escaped. */
export function buildWerkstattAuftragEmailHtml(args: {
  werkstattName: string
  kundeName?: string | null
  /** Link zur Werkstatt-Portal-Auftragsliste (/werkstatt/auftraege, aus cfefdf75 #3263) */
  portalUrl?: string | null
}): string {
  const NAVY = '#0D1B3E'
  const BG = '#f8f9fb'
  const name = escapeHtml(args.werkstattName)
  const kunde = args.kundeName?.trim() ? escapeHtml(args.kundeName.trim()) : null
  const kundeZeile = kunde
    ? `<p style="margin:0 0 16px;font-size:15px;">Kunde: <strong>${kunde}</strong></p>`
    : ''
  const portalZeile = args.portalUrl?.trim()
    ? `<p style="margin:0 0 16px;font-size:15px;"><a href="${escapeHtml(args.portalUrl.trim())}" style="color:#4573A2;font-weight:600;">Auftrag im Werkstatt-Portal ansehen</a></p>`
    : ''

  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;">Claimondo</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">Hallo ${name},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">über Claimondo wurde Ihnen ein neuer Reparaturauftrag zugewiesen.</p>
          ${kundeZeile}
          ${portalZeile}
          <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Der Kunde wird sich für die Terminabstimmung bei Ihnen melden. Bei Fragen sind wir jederzeit für Sie da.</p>
          <p style="margin:24px 0 0;font-size:15px;">Ihr Claimondo-Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Benachrichtigt die zugewiesene Reparatur-Werkstatt per Email ueber den neuen Auftrag.
 * Non-critical (try/catch) — ein Send-Fehler darf die Zuweisung NICHT zuruecknehmen.
 * Gibt {email:false} zurueck wenn keine Werkstatt-Email vorhanden ist.
 */
export async function notifyWerkstattNeuerAuftrag(
  args: {
    werkstatt: { email?: string | null; name: string }
    kunde?: { name?: string | null }
    /** Link zur Werkstatt-Portal-Auftragsliste (/werkstatt/auftraege) */
    portalUrl?: string | null
    fallId?: string | null
  },
  deps: NotifyWerkstattDeps = defaultDeps,
): Promise<{ email: boolean }> {
  const result = { email: false }
  const email = args.werkstatt.email?.trim()
  if (email) {
    try {
      const html = buildWerkstattAuftragEmailHtml({
        werkstattName: args.werkstatt.name,
        kundeName: args.kunde?.name,
        portalUrl: args.portalUrl,
      })
      await deps.sendEmail({
        to: email,
        subject: 'Neuer Reparaturauftrag über Claimondo',
        html,
        template: 'werkstatt_neuer_auftrag',
        fallId: args.fallId ?? null,
        // Auftrags-Notify an die zugewiesene Werkstatt selbst -> Send-Isolation umgehen,
        // sonst erreicht die Mail nie interne/Test-Werkstatt-Konten (@claimondo.de). Der
        // interne Empfaenger ist hier die gewollte Zielperson, kein Bystander-SV. Analog
        // sendWillkommenWerkstatt (flows.ts).
        allowInternalRecipient: true,
      })
      result.email = true
    } catch (err) {
      console.warn('[notifyWerkstattNeuerAuftrag] Email fehlgeschlagen (non-fatal):', err)
    }
  }
  return result
}
