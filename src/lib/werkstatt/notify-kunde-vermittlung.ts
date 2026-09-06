// Token-Audit-Skip: Email-Template (inline-HTML) — raw Markenfarbe in style-Attributen,
//   wie alle Email-Generation-Files (Mail-Clients koennen kein Tailwind/CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//   Whitelabel-Branding (resolveEmailBranding) = dokumentierter Follow-up.

// Phase 1 Follow-up: Kunden-Benachrichtigung bei Reparatur-Werkstatt-Zuweisung.
// Ergaenzt die bestehende In-App-Mitteilung (vermittleWerkstatt) um WhatsApp + Email.
// Besonders wichtig fuer LEADS ohne Portal-Account: die sehen die In-App-Mitteilung
// nie — WhatsApp/Email ist dort der EINZIGE Kanal.
//
// Bewusst direkter sendWhatsApp/sendEmail-Pfad (kein registry/sendCommunication):
// haelt die Aenderung auf neue Files begrenzt (keine Edits an geteiltem
// registry.ts/legacy-texts.ts) und spiegelt das Schwester-Pattern
// src/lib/werkstatt/notify-freigabe.ts (inline-branded HTML).
//
// Sender sind injizierbar (deps) -> ohne echten Versand testbar.

import { sendWhatsApp } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email/google/client'

// Repo-Muster: lokales escapeHtml pro Template-File (vgl. notify-new-lead.ts:125,
// kanzlei/email-fallback.ts:152) — es gibt keinen geteilten Export. Schuetzt gegen
// Stored-XSS-in-Mail durch extern befuellte Lead-/Werkstatt-Daten (vgl. Review von
// notify-freigabe.ts: buildFreigabeEmailHtml).
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

export type WerkstattInfo = {
  name: string
  /** bereits zusammengesetzt: "Strasse, PLZ Ort" */
  adresse?: string | null
  telefon?: string | null
}

export type NotifyDeps = {
  sendWhatsApp: typeof sendWhatsApp
  sendEmail: typeof sendEmail
}

const defaultDeps: NotifyDeps = { sendWhatsApp, sendEmail }

/** WhatsApp-Freitext (Du-Ansprache, konsistent zur In-App-Mitteilung aus Phase 1). */
export function buildKundeVermittlungWhatsApp(args: {
  vorname?: string | null
  werkstattName: string
  adresse?: string | null
  telefon?: string | null
  /** Rolle, die im Auftrag des Kunden vermittelt hat (fuer die Einleitung). */
  imAuftragVon?: string | null
}): string {
  const anrede = args.vorname?.trim() ? `Hallo ${args.vorname.trim()},` : 'Hallo,'
  const intro =
    args.imAuftragVon === 'gutachter'
      ? `${anrede} Ihr Gutachter hat für Sie eine Reparatur-Werkstatt organisiert:`
      : `${anrede} wir haben Ihnen eine Reparatur-Werkstatt vermittelt:`
  const zeilen: Array<string | null> = [
    intro,
    '',
    args.werkstattName,
    args.adresse?.trim() ? args.adresse.trim() : null,
    args.telefon?.trim() ? `Tel.: ${args.telefon.trim()}` : null,
    '',
    'Die Werkstatt kümmert sich um die Reparatur Ihres Fahrzeugs. Bei Fragen können Sie uns jederzeit hier antworten.',
    '',
    'Ihr Claimondo-Team',
  ]
  return zeilen.filter((z): z is string => z !== null).join('\n')
}

/** Claimondo-branded Inline-HTML. Alle extern befuellten Werte sind escaped. */
export function buildKundeVermittlungEmailHtml(args: {
  vorname?: string | null
  werkstattName: string
  adresse?: string | null
  telefon?: string | null
  /** Rolle, die im Auftrag des Kunden vermittelt hat (fuer die Einleitung). */
  imAuftragVon?: string | null
}): string {
  const NAVY = '#0D1B3E'
  const BG = '#f8f9fb'
  const anrede = args.vorname?.trim() ? `Hallo ${escapeHtml(args.vorname.trim())},` : 'Hallo,'
  const name = escapeHtml(args.werkstattName)
  const adresse = args.adresse?.trim() ? escapeHtml(args.adresse.trim()) : null
  const telefon = args.telefon?.trim() ? escapeHtml(args.telefon.trim()) : null

  const werkstattZeilen = [
    `<div style="font-weight:600;color:${NAVY};font-size:16px;">${name}</div>`,
    adresse ? `<div style="color:#4573A2;margin-top:4px;">${adresse}</div>` : '',
    telefon ? `<div style="color:#4573A2;margin-top:2px;">Tel.: ${telefon}</div>` : '',
  ].join('')

  return `<!doctype html>
<html lang="de">
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;">Claimondo</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">${anrede}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${args.imAuftragVon === 'gutachter' ? 'Ihr Gutachter hat für Sie eine Reparatur-Werkstatt organisiert:' : 'wir haben Ihnen eine Reparatur-Werkstatt für Ihr Fahrzeug vermittelt:'}</p>
          <div style="background:${BG};border-radius:12px;padding:18px 20px;margin-bottom:20px;">${werkstattZeilen}</div>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Die Werkstatt kümmert sich um die Reparatur Ihres Fahrzeugs. Bei Fragen sind wir jederzeit für Sie da.</p>
          <p style="margin:24px 0 0;font-size:15px;">Ihr Claimondo-Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Benachrichtigt den Kunden ueber die zugewiesene Reparatur-Werkstatt via WhatsApp
 * (wenn Telefon vorhanden) und Email (wenn Email vorhanden). Jeder Kanal ist einzeln
 * non-critical gekapselt — ein Send-Fehler darf die Zuweisung NICHT zuruecknehmen.
 */
export async function notifyKundeWerkstattVermittlung(
  args: {
    kunde: KundeKontakt
    werkstatt: WerkstattInfo
    fallId?: string | null
    /** Rolle, die im Auftrag des Kunden vermittelt hat (null = Kunde selbst / Standard). */
    imAuftragVon?: string | null
  },
  deps: NotifyDeps = defaultDeps,
): Promise<{ whatsapp: boolean; email: boolean }> {
  const { kunde, werkstatt } = args
  const result = { whatsapp: false, email: false }

  if (kunde.telefon?.trim()) {
    try {
      const msg = buildKundeVermittlungWhatsApp({
        vorname: kunde.vorname,
        werkstattName: werkstatt.name,
        adresse: werkstatt.adresse,
        telefon: werkstatt.telefon,
        imAuftragVon: args.imAuftragVon,
      })
      // sendWhatsApp normalisiert die Nummer intern (E.164).
      const r = await deps.sendWhatsApp(kunde.telefon.trim(), msg)
      result.whatsapp = r.success
    } catch (err) {
      console.warn('[notifyKundeWerkstattVermittlung] WhatsApp fehlgeschlagen (non-fatal):', err)
    }
  }

  if (kunde.email?.trim()) {
    try {
      const html = buildKundeVermittlungEmailHtml({
        vorname: kunde.vorname,
        werkstattName: werkstatt.name,
        adresse: werkstatt.adresse,
        telefon: werkstatt.telefon,
        imAuftragVon: args.imAuftragVon,
      })
      await deps.sendEmail({
        to: kunde.email.trim(),
        subject: 'Ihre Reparatur-Werkstatt steht fest',
        html,
        template: 'werkstatt_vermittlung_kunde',
        empfaengerTyp: 'kunde',
        fallId: args.fallId ?? null,
      })
      result.email = true
    } catch (err) {
      console.warn('[notifyKundeWerkstattVermittlung] Email fehlgeschlagen (non-fatal):', err)
    }
  }

  return result
}
