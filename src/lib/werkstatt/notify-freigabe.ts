// Token-Audit-Skip: Email-HTML braucht Inline-Hex (Email-Clients unterstuetzen kein var()/Tailwind).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//
// Werkstatt-Benachrichtigung bei Reparaturfreigabe (in-app Glocke + E-Mail). Schliesst die
// "halbe Schleife": vorher kippte nur der Status in "Meine Vermittlungen" (passiv) — jetzt
// bekommt die Werkstatt aktiv das Gruene Licht. NON-CRITICAL: der Caller wrappt in try/catch,
// damit ein Sende-Fehler den Status-Update (reparatur_freigegeben_am) nicht atomar bricht.
// Datenrahmen = bereits in "Meine Vermittlungen" sichtbar (Kennzeichen/Fahrzeug) -> kein neues PII.

import { createAdminClient } from '@/lib/supabase/admin'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'
import { sendEmail } from '@/lib/email/google/client'

const APP_URL = 'https://app.claimondo.de'

export async function notifyWerkstattReparaturfreigabe(claimId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: claim } = await admin
    .from('claims')
    .select('werkstatt_id, lead_id')
    .eq('id', claimId)
    .maybeSingle<{ werkstatt_id: string | null; lead_id: string | null }>()
  if (!claim?.werkstatt_id) return // nicht werkstatt-vermittelt -> nichts zu benachrichtigen

  const { data: werkstatt } = await admin
    .from('werkstaetten')
    .select('user_id, email, name')
    .eq('id', claim.werkstatt_id)
    .maybeSingle<{ user_id: string | null; email: string | null; name: string | null }>()
  if (!werkstatt) return

  let kennzeichen: string | null = null
  let fahrzeug: string | null = null
  if (claim.lead_id) {
    const { data: lead } = await admin
      .from('leads')
      .select('kennzeichen, fahrzeug_hersteller, fahrzeug_modell')
      .eq('id', claim.lead_id)
      .maybeSingle<{ kennzeichen: string | null; fahrzeug_hersteller: string | null; fahrzeug_modell: string | null }>()
    kennzeichen = lead?.kennzeichen ?? null
    fahrzeug = [lead?.fahrzeug_hersteller, lead?.fahrzeug_modell].filter(Boolean).join(' ') || null
  }

  const fallLabel = kennzeichen ?? fahrzeug ?? 'Ihre Vermittlung'

  // 1) In-App (Glocke im Werkstatt-Portal). createMitteilung wirft nicht (returnt null bei Fehler).
  if (werkstatt.user_id) {
    await createMitteilung({
      empfaenger_id: werkstatt.user_id,
      empfaenger_rolle: 'werkstatt',
      kategorie: 'update',
      titel: 'Reparatur freigegeben',
      inhalt: `Der Fall ${fallLabel} ist freigegeben — Sie können mit der Reparatur beginnen.`,
      kontext_typ: 'claim',
      kontext_id: claimId,
      route_url: '/werkstatt/vermittlungen',
      icon: '🔧',
      prioritaet: 'hoch',
    })
  }

  // 2) E-Mail (erreicht die Werkstatt auch offline). Eigenes try/catch, damit ein Mail-Fehler
  // die bereits erstellte In-App-Mitteilung nicht "ueberschreibt".
  if (werkstatt.email) {
    try {
      await sendEmail({
        to: werkstatt.email,
        subject: 'Reparatur freigegeben – Sie können starten',
        html: buildFreigabeEmailHtml(werkstatt.name, fallLabel, fahrzeug),
        template: 'reparatur_freigabe_werkstatt',
        empfaengerTyp: 'admin',
      })
    } catch (err) {
      console.error('[notifyWerkstattReparaturfreigabe] email failed:', err)
    }
  }
}

// Lead-/Werkstatt-Daten sind extern befuellt (OCR / Public-QR-Flow) -> vor HTML-Interpolation
// escapen (Repo-Muster, identisch zu src/lib/leads/notify-new-lead.ts).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildFreigabeEmailHtml(werkstattName: string | null, fallLabel: string, fahrzeug: string | null): string {
  const anrede = werkstattName ? `Hallo ${escapeHtml(werkstattName)}-Team,` : 'Hallo,'
  const fahrzeugLine = fahrzeug
    ? `<p style="margin:0 0 8px;color:#4b5563;font-size:14px;">Fahrzeug: ${escapeHtml(fahrzeug)}</p>`
    : ''
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1B3E;">
    <div style="background:#0D1B3E;padding:24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;">Reparatur freigegeben</h1>
    </div>
    <div style="padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="margin:0 0 16px;">${anrede}</p>
      <p style="margin:0 0 8px;">das Gutachten ist abgeschlossen und die Reparatur für <strong>${escapeHtml(fallLabel)}</strong> wurde freigegeben.</p>
      ${fahrzeugLine}
      <p style="margin:16px 0;">Sie können jetzt mit der Reparatur beginnen.</p>
      <a href="${APP_URL}/werkstatt/vermittlungen" style="display:inline-block;background:#0D1B3E;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Zu meinen Vermittlungen</a>
      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Diese E-Mail wurde automatisch von Claimondo gesendet.</p>
    </div>
  </div>`
}
