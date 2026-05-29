// Aaron-Direktive 2026-05-20: bei JEDER public Lead-Anlage geht zusaetzlich
// raus:
//   1. Email an info@claimondo.de mit Subject "Neuer Lead aus <source>: <name>"
//   2. WhatsApp via Baileys an +491633628571 + +4917620289514
//
// Der Helper ist fire-and-forget — sowohl Email- als auch WA-Failures werden
// nur als console.error geloggt, der Caller (Lead-Anlage) bleibt erfolgreich.
// AGENTS.md §Server-Actions: Notification-Sub-Operations duerfen NICHT den
// Status-Update brechen (non-critical sub-op pattern).
//
// Konsumenten: 4 Eintrittspunkte
//   - src/app/kfzgutachter-lp/actions.ts (Ads-LP, kfzgutachter.claimondo.de)
//   - src/lib/actions/public-rueckruf.ts (Marketing-Pages-Rueckruf-Form)
//   - src/lib/actions/create-lead-from-mini-wizard.ts (/schaden-melden Wizard)
//   - src/lib/actions/konvertiere-anfrage-zu-fall.ts (Self-Dispatch /gutachter-finden)
//
// Aircall-Webhook (Telefon-Inbound) ist BEWUSST nicht angebunden — Aaron will
// dort keine Email/WA-Notification (zuviel Lärm bei jedem Anruf).

import { sendEmail } from '@/lib/email/google/client'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'

const EMAIL_EMPFAENGER = 'info@claimondo.de'
const WA_EMPFAENGER = ['+491633628571', '+4917620289514']
const DISPATCH_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

type ExtraField = { label: string; value: string | null | undefined }

export interface NotifyNewLeadOpts {
  /** Lead-UUID — wird als Link `/dispatch/leads/<id>` rausgegeben. */
  leadId: string
  /** Human-readable Quelle. Erscheint im Email-Subject + WA-Body prominent.
   *  Bsp: "kfzgutachter.claimondo.de (Ads-LP)" oder "Mini-Wizard (/schaden-melden)" */
  source: string
  /** "Vorname Nachname" oder nur was vorhanden ist. */
  name: string
  phone: string | null
  email?: string | null
  /** Stadt oder PLZ — beides moeglich. */
  city?: string | null
  /** Fahrzeug-Hinweis (z.B. "pkw", "Volkswagen Golf"). */
  fahrzeug?: string | null
  /** UTMs aus dem Form-Submit (utm_source, utm_medium, ...). */
  utm?: Record<string, string | null | undefined>
  /** Beliebige Zusatzfelder die ans Ende der Email-Tabelle + WA-Body kommen. */
  extraFields?: ExtraField[]
}

export async function notifyNewLead(opts: NotifyNewLeadOpts): Promise<void> {
  const leadUrl = `${DISPATCH_BASE_URL}/dispatch/leads/${opts.leadId}`
  const cleanExtras = (opts.extraFields ?? []).filter((f) => f.value && f.value.trim?.() !== '')
  const utmEntries = Object.entries(opts.utm ?? {}).filter(([, v]) => v && String(v).trim() !== '')

  // ─── Email an info@claimondo.de ──────────────────────────────────────
  try {
    const html = `
      <h2 style="margin:0 0 8px 0">Neuer Lead aus ${escapeHtml(opts.source)}</h2>
      <p style="margin:0 0 16px 0;color:#444">${escapeHtml(opts.name)}</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td><strong>Quelle</strong></td><td>${escapeHtml(opts.source)}</td></tr>
        <tr><td><strong>Name</strong></td><td>${escapeHtml(opts.name)}</td></tr>
        <tr><td><strong>Telefon</strong></td><td>${escapeHtml(opts.phone ?? '—')}</td></tr>
        ${opts.email ? `<tr><td><strong>Email</strong></td><td>${escapeHtml(opts.email)}</td></tr>` : ''}
        ${opts.city ? `<tr><td><strong>Stadt / PLZ</strong></td><td>${escapeHtml(opts.city)}</td></tr>` : ''}
        ${opts.fahrzeug ? `<tr><td><strong>Fahrzeug</strong></td><td>${escapeHtml(opts.fahrzeug)}</td></tr>` : ''}
        ${cleanExtras.map((f) => `<tr><td><strong>${escapeHtml(f.label)}</strong></td><td>${escapeHtml(String(f.value))}</td></tr>`).join('')}
        ${utmEntries.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(String(v))}</td></tr>`).join('')}
      </table>
      <p style="margin-top:16px"><a href="${leadUrl}">Lead im Dispatch-Portal oeffnen</a></p>
      <p style="color:#666;font-size:12px">Lead-ID: ${opts.leadId}</p>
    `
    const text = [
      `Neuer Lead aus ${opts.source}`,
      ``,
      `Quelle: ${opts.source}`,
      `Name: ${opts.name}`,
      `Telefon: ${opts.phone ?? '—'}`,
      opts.email ? `Email: ${opts.email}` : null,
      opts.city ? `Stadt/PLZ: ${opts.city}` : null,
      opts.fahrzeug ? `Fahrzeug: ${opts.fahrzeug}` : null,
      ...cleanExtras.map((f) => `${f.label}: ${f.value}`),
      ...utmEntries.map(([k, v]) => `${k}: ${v}`),
      ``,
      `Lead: ${leadUrl}`,
      `Lead-ID: ${opts.leadId}`,
    ].filter(Boolean).join('\n')
    await sendEmail({
      to: EMAIL_EMPFAENGER,
      subject: `Neuer Lead aus ${opts.source}: ${opts.name}`,
      html,
      text,
    })
  } catch (err) {
    console.error(
      '[notify-new-lead] Email an info@claimondo.de fehlgeschlagen (nicht kritisch):',
      (err as Error).message,
    )
  }

  // ─── WhatsApp via Baileys an feste Empfaenger ────────────────────────
  try {
    const waLines = [
      `🔔 Neuer Lead`,
      `Quelle: ${opts.source}`,
      ``,
      `👤 ${opts.name}`,
      opts.phone ? `📞 ${opts.phone}` : null,
      opts.city ? `📍 ${opts.city}` : null,
      opts.fahrzeug ? `🚗 ${opts.fahrzeug}` : null,
      ...cleanExtras.map((f) => `• ${f.label}: ${f.value}`),
      ``,
      leadUrl,
    ].filter(Boolean) as string[]
    const waText = waLines.join('\n')
    await Promise.all(
      WA_EMPFAENGER.map(async (phone) => {
        const r = await sendWhatsAppText(phone, waText)
        if (!r.ok) {
          console.error(
            `[notify-new-lead] Baileys-WA an ${phone} fehlgeschlagen:`,
            r.code,
            r.error,
          )
        }
      }),
    )
  } catch (err) {
    console.error(
      '[notify-new-lead] WhatsApp-Notify fehlgeschlagen (nicht kritisch):',
      (err as Error).message,
    )
  }
}

// Minimaler HTML-Escape — nicht user-input-frei, aber Lead-Daten kommen aus
// dem Form-Submit, also defense-in-depth gegen Mojibake/Tags im Email-Client.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
