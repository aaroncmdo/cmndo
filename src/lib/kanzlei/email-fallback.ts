// Token-Audit-Skip: Email-Fallback ohne Tailwind/CSS-Var-Support.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
// AAR-kanzlei Email-Fallback: Email mit Mandat-Stammdaten an die Kanzlei.
//
// Läuft PARALLEL zum Outbound-API-Push (push-mandat.ts), unabhängig davon
// ob der API-Call erfolgreich war. Zweck:
//   - Audit-Trail ab Tag 1 (Kanzlei sieht neue Mandate auch ohne API-Live-Schaltung)
//   - Fallback wenn API offline / HMAC-Fehler / Netzwerk-Probleme
//   - Betreff mit fall_nr ist für die Kanzlei sortier-/filterbar im Posteingang
//
// Betreff-Format: `[CLM-YYYYMMDD-NNN] Neues Mandat: <Vorname> <Nachname>`
// Zieladresse:    Env KANZLEI_EMAIL_TO (default info@claimondo.de während
//                 Migration, später schaden@claimondo.de)
// Trigger:        signSAandCreateFall nach Fall-Insert (nur komplett-Paket)

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'

export type EmailFallbackResult =
  | { success: true; messageId: string }
  | { success: false; error: string; skipped?: boolean }

export async function sendMandatEmailToKanzlei(fallId: string): Promise<EmailFallbackResult> {
  const to = process.env.KANZLEI_EMAIL_TO ?? 'info@claimondo.de'
  const db = createAdminClient()

  const { data: fall, error: fallErr } = await db
    .from('faelle')
    .select(
      'id, fall_nummer, service_typ, kunde_id, kunde_vorname, kunde_nachname, kunde_email, kunde_telefon, kunde_strasse, kunde_plz, kunde_stadt, firma_name, vorsteuerabzugsberechtigt, kennzeichen',
    )
    .eq('id', fallId)
    .maybeSingle()
  if (fallErr || !fall) {
    return { success: false, error: `Fall nicht gefunden: ${fallErr?.message ?? fallId}` }
  }

  // Nur komplett-Paket → Kanzlei. nur_gutachter geht gar nicht erst hierher.
  if ((fall.service_typ as string | null) !== 'komplett') {
    return { success: false, skipped: true, error: 'service_typ_not_komplett' }
  }

  // Anrede aus profiles ziehen (analog push-mandat.ts)
  let anrede: string = ''
  if (fall.kunde_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('anrede')
      .eq('id', fall.kunde_id)
      .maybeSingle()
    anrede = ((profile?.anrede as string | null) ?? '').trim()
  }

  const fallNr = (fall.fall_nummer as string | null) ?? fall.id
  const kundeName = [fall.kunde_vorname, fall.kunde_nachname].filter(Boolean).join(' ') || '—'
  const subject = `[${fallNr}] Neues Mandat: ${kundeName}`

  const firma = !!(fall.firma_name as string | null)
  const vorsteuer = !!(fall.vorsteuerabzugsberechtigt as boolean | null)
  const adresseZeile = [fall.kunde_strasse, [fall.kunde_plz, fall.kunde_stadt].filter(Boolean).join(' ')]
    .filter((v) => v && String(v).trim().length > 0)
    .join(', ')

  const rows: Array<[string, string]> = [
    ['Claimondo Fall-Nr', fallNr],
    ['Anrede', anrede || '—'],
    ['Vorname', (fall.kunde_vorname as string | null) ?? '—'],
    ['Nachname', (fall.kunde_nachname as string | null) ?? '—'],
    ['Adresse', adresseZeile || '—'],
    ['Email', (fall.kunde_email as string | null) ?? '—'],
    ['Telefon', (fall.kunde_telefon as string | null) ?? '—'],
    ['Firma', firma ? (fall.firma_name as string) : 'Nein'],
    ['Vorsteuerabzugsberechtigt', vorsteuer ? 'Ja' : 'Nein'],
    ['Kennzeichen (Halter)', (fall.kennzeichen as string | null) ?? '—'],
  ]

  const text = [
    `Neues Mandat eingegangen — der Kunde hat die SA unterschrieben.`,
    ``,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ``,
    `Die weiteren Falldaten (Schadensbericht, Gegner, Versicherung, Fotos,`,
    `Gutachten) folgen automatisch im Kanzlei-Paket sobald das Gutachten vorliegt.`,
    ``,
    `Bitte Vollmacht an den Kunden versenden.`,
    ``,
    `— Claimondo`,
  ].join('\n')

  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:500;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join('')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;">
      <h2 style="color:#0D1B3E;margin-bottom:8px;">Neues Mandat — ${escapeHtml(kundeName)}</h2>
      <p style="color:#4b5563;font-size:14px;margin-top:0;">
        Der Kunde hat die SA unterschrieben. Bitte Vollmacht versenden.
      </p>
      <table style="border-collapse:collapse;margin-top:16px;">${htmlRows}</table>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;line-height:1.5;">
        Die weiteren Falldaten (Schadensbericht, Gegner, Versicherung, Fotos,
        Gutachten) folgen automatisch im Kanzlei-Paket, sobald das Gutachten
        vorliegt.
      </p>
      <p style="color:#9ca3af;font-size:11px;margin-top:16px;">
        — Claimondo · automatischer Versand aus der FlowLink-SA-Unterschrift
      </p>
    </div>
  `

  try {
    const r = await sendEmail({
      to,
      subject,
      text,
      html,
      fallId,
      empfaengerTyp: 'kanzlei',
      template: 'mandat_eingegangen',
    })
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'email',
      titel: 'Mandat per Email an Kanzlei übergeben',
      beschreibung: `Empfänger: ${to}. Betreff: ${subject}.`,
    })
    return { success: true, messageId: r.messageId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'email',
      titel: 'Mandat-Email an Kanzlei fehlgeschlagen',
      beschreibung: `Empfänger: ${to}. Fehler: ${msg.slice(0, 500)}. Bitte manuell nachziehen.`,
    })
    return { success: false, error: msg }
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
