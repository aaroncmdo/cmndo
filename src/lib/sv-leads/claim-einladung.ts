// Claim-Einladung: Admin ladet sv_leads mit Kontakt ein, ihr Profil
// auf claimondo.de zu beanspruchen. Nur auf Admin-Klick (kein Auto-Send,
// DSGVO/Spam-Schutz). Non-critical Sends (WA + Email) in eigenem try/catch.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendEmail } from '@/lib/email/google/client'

// Claim-Link: /sv/registrieren (kein ?lead= — die Seite unterstuetzt den
// Query-Param noch nicht; der SV sucht sich selbst. Sobald die Seite
// ?lead= liest, kann die URL hier auf
// `${base}/sv/registrieren?lead=${leadId}` umgestellt werden.)
function buildClaimLink(leadId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  // NOTE: Claim-Page liest ?lead= derzeit NICHT aus (SvRegistrierenClient
  // startet immer auf Schritt 'suche'). URL fuehrt zur Suche, der SV
  // findet sich selbst. Wenn ?lead= implementiert wird, leadId als Param anhaengen.
  void leadId // leadId bleibt Parameter fuer spaetere Erweiterung
  return `${base}/sv/registrieren`
}

type SvLeadEinladungResult =
  | { ok: true; gesendet: boolean }
  | { ok: false; error: string }

/**
 * Laed einen sv_lead und schickt (wenn moeglich) eine Einladung per WA und/oder
 * Email. Gibt `gesendet: false` zurueck wenn kein Kontakt vorhanden (haeufig bei
 * Excel-Importen). Alle Kanal-Sends non-critical (eigener try/catch).
 *
 * Design-Entscheidung: kein Auto-Send — nur auf expliziten Admin-Klick aufrufbar.
 */
export async function ladeSvLeadEinladung(
  leadId: string,
): Promise<SvLeadEinladungResult> {
  const admin = createAdminClient()

  const { data: lead, error: loadErr } = await admin
    .from('sv_leads')
    .select('id, name, vorname, telefon, email, claim_status, konvertiert_zu_sv_id')
    .eq('id', leadId)
    .single()

  if (loadErr || !lead) {
    return { ok: false, error: 'SV-Lead nicht gefunden.' }
  }

  // Gate: nur offene, nicht konvertierte Leads einladen
  if (lead.claim_status !== 'offen' || lead.konvertiert_zu_sv_id !== null) {
    return { ok: false, error: 'Lead ist nicht (mehr) offen.' }
  }

  const telefon = lead.telefon as string | null
  const email = lead.email as string | null

  // Kein Kontakt (typisch bei Importen)
  if (!telefon && !email) {
    return { ok: true, gesendet: false }
  }

  const claimLink = buildClaimLink(leadId)
  const name = (lead.vorname as string | null) ?? (lead.name as string | null) ?? 'Sachverständiger'

  const waText =
    `Hallo ${name},\n\n` +
    `Sie sind als Kfz-Gutachter bei Claimondo gelistet — beanspruchen Sie Ihr Profil und erhalten Sie neue Aufträge:\n\n` +
    `${claimLink}\n\n` +
    `Mit freundlichen Grüßen\nDas Claimondo-Team`

  let waGesendet = false
  let emailGesendet = false

  // WhatsApp (non-critical)
  if (telefon) {
    try {
      const waResult = await sendWhatsAppText(telefon, waText)
      if (waResult.ok) {
        waGesendet = true
      } else {
        console.error('[claim-einladung] WhatsApp-Send fehlgeschlagen:', waResult.error)
      }
    } catch (err) {
      console.error('[claim-einladung] WhatsApp-Sub-Op fehlgeschlagen:', err)
    }
  }

  // Email (non-critical)
  if (email) {
    try {
      const anrede = name !== 'Sachverständiger' ? `Hallo ${name},` : 'Hallo,'
      const emailHtml =
        `<p>${anrede}</p>` +
        `<p>Sie sind als Kfz-Gutachter bei Claimondo gelistet — beanspruchen Sie Ihr Profil und erhalten Sie neue Aufträge:</p>` +
        `<p><a href="${claimLink}">${claimLink}</a></p>` +
        `<p>Mit freundlichen Grüßen<br>Das Claimondo-Team</p>`

      await sendEmail({
        to: email,
        subject: 'Beanspruchen Sie Ihr Claimondo-Profil',
        html: emailHtml,
        fallId: null,
        empfaengerTyp: 'sv',
        template: 'sv_lead_einladung',
      })
      emailGesendet = true
    } catch (err) {
      console.error('[claim-einladung] Email-Sub-Op fehlgeschlagen:', err)
    }
  }

  return { ok: true, gesendet: waGesendet || emailGesendet }
}
