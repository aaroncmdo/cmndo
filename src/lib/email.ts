import { sendEmail as sendViaHelper } from '@/lib/email/google/client'

type EmailPayload = {
  to: string
  subject: string
  heading: string
  lines: string[]
  ctaLabel?: string
  ctaUrl?: string
}

function buildHtml({ heading, lines, ctaLabel, ctaUrl }: Omit<EmailPayload, 'to' | 'subject'>) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;">
      <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Claimondo</span>
    </div>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px 24px;">
      <h1 style="color:#fff;font-size:18px;font-weight:600;margin:0 0 16px;">${heading}</h1>
      ${lines.map(l => `<p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 8px;">${l}</p>`).join('')}
      ${ctaLabel && ctaUrl ? `
      <div style="margin-top:24px;">
        <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;">${ctaLabel}</a>
      </div>` : ''}
    </div>
    <p style="color:#52525b;font-size:11px;margin-top:24px;text-align:center;">
      &copy; ${new Date().getFullYear()} Claimondo &middot; Automatische Benachrichtigung
    </p>
  </div>
</body>
</html>`
}

export async function sendEmail(payload: EmailPayload) {
  await sendViaHelper({
    to: payload.to,
    subject: payload.subject,
    html: buildHtml(payload),
    empfaengerTyp: 'admin',
    template: 'convenience_notification',
  })
}

// ─── Pre-built notification emails ─────────────────────────────────────────

export async function emailNeuerFall(adminEmail: string, fallNummer: string, schadensart: string) {
  await sendEmail({
    to: adminEmail,
    subject: `Neuer Fall: ${fallNummer}`,
    heading: 'Neuer Schadensfall eingegangen',
    lines: [
      `Fallnummer: <strong style="color:#fff">${fallNummer}</strong>`,
      `Schadensart: <strong style="color:#fff">${schadensart}</strong>`,
      'Der Fall wurde erstellt und wartet auf Bearbeitung.',
    ],
    ctaLabel: 'Fall öffnen',
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/admin/dispatch`,
  })
}

export async function emailSvZugewiesen(svEmail: string, fallNummer: string, kundenName: string, adresse: string) {
  await sendEmail({
    to: svEmail,
    subject: `Neuer Auftrag: ${fallNummer}`,
    heading: 'Neuer Gutachterauftrag',
    lines: [
      `Fallnummer: <strong style="color:#fff">${fallNummer}</strong>`,
      `Kunde: <strong style="color:#fff">${kundenName}</strong>`,
      `Adresse: <strong style="color:#fff">${adresse}</strong>`,
      'Bitte vereinbaren Sie einen Termin mit dem Kunden.',
    ],
    ctaLabel: 'Auftrag ansehen',
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/gutachter`,
  })
}

export async function emailGutachtenEingegangen(adminEmail: string, fallNummer: string) {
  await sendEmail({
    to: adminEmail,
    subject: `Gutachten eingegangen: ${fallNummer}`,
    heading: 'Gutachten eingegangen',
    lines: [
      `Für Fall <strong style="color:#fff">${fallNummer}</strong> wurde ein Gutachten hochgeladen.`,
      'Bitte prüfen Sie das Gutachten im Filmcheck.',
    ],
    ctaLabel: 'Zum Filmcheck',
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/admin/dispatch`,
  })
}

export async function emailFilmcheckBestanden(kanzleiEmail: string, fallNummer: string) {
  await sendEmail({
    to: kanzleiEmail,
    subject: `Filmcheck bestanden: ${fallNummer}`,
    heading: 'Neuer Fall zur Bearbeitung',
    lines: [
      `Fall <strong style="color:#fff">${fallNummer}</strong> hat den Filmcheck bestanden.`,
      'Alle Unterlagen sind vollständig. Bitte übernehmen Sie die rechtliche Bearbeitung.',
    ],
    ctaLabel: 'Fall-Paket öffnen',
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}/admin/dispatch`,
  })
}

export async function emailFallAbgeschlossen(kundenEmail: string, fallNummer: string, betrag: string) {
  await sendEmail({
    to: kundenEmail,
    subject: `Ihr Fall ${fallNummer} wurde reguliert`,
    heading: 'Ihr Schadensfall wurde reguliert',
    lines: [
      `Gute Nachrichten! Ihr Fall <strong style="color:#fff">${fallNummer}</strong> wurde erfolgreich reguliert.`,
      `Regulierungsbetrag: <strong style="color:#34d399">${betrag}</strong>`,
      'Vielen Dank für Ihr Vertrauen in Claimondo.',
    ],
  })
}
