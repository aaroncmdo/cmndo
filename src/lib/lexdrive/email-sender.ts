// AAR-77: LexDrive Outbound Email mit PDF-Anhaengen
// Wird beim Status-Wechsel auf 'kanzlei-uebergeben' getriggert.

import { createAdminClient } from '@/lib/supabase/admin'
import { resend, isResendAvailable } from '@/lib/email/resend-client'

const LEXDRIVE_EMAIL = process.env.LEXDRIVE_KANZLEI_EMAIL ?? 'aaron.sprafke@claimondo.de'

type Anhang = { filename: string; content: Buffer | string }

async function fetchPdfFromUrl(url: string, filename: string): Promise<Anhang | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return { filename, content: buf }
  } catch {
    return null
  }
}

export async function buildAndSendKanzleiEmail(fallId: string): Promise<{
  success: boolean
  messageId?: string
  attachments?: number
  error?: string
}> {
  if (!isResendAvailable() || !resend) {
    return { success: false, error: 'Resend nicht konfiguriert (RESEND_API_KEY fehlt)' }
  }

  const db = createAdminClient()

  // Fall + Lead laden (inkl. claim_id für Unfallskizze)
  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, lead_id, claim_id, gegner_kennzeichen, gegner_name, gegner_versicherung, gegner_schadennummer, zeugen_kontakte')
    .eq('id', fallId)
    .single()

  if (!fall) return { success: false, error: `Fall ${fallId} nicht gefunden` }

  let kunde: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null; kunde_strasse: string | null; kunde_plz: string | null; kunde_stadt: string | null } | null = null

  // Kontaktdaten aus leads (Stammdaten liegen dort vollständig)
  if (fall.lead_id) {
    const { data: lead } = await db
      .from('leads')
      .select('vorname, nachname, email, telefon, kunde_strasse, kunde_plz, kunde_stadt')
      .eq('id', fall.lead_id)
      .single()
    kunde = lead
  }

  // Email aus claims.kunde_email bevorzugen — direktes Feld, immer aktuell
  // (Lead-Email kann veraltet sein wenn Kunde seine Email nach Konvertierung geändert hat)
  if (fall.claim_id) {
    const { data: claimEmail } = await db
      .from('claims')
      .select('kunde_email')
      .eq('id', fall.claim_id as string)
      .single()
    if (claimEmail?.kunde_email) {
      kunde = {
        ...kunde,
        vorname: kunde?.vorname ?? null,
        nachname: kunde?.nachname ?? null,
        telefon: kunde?.telefon ?? null,
        kunde_strasse: kunde?.kunde_strasse ?? null,
        kunde_plz: kunde?.kunde_plz ?? null,
        kunde_stadt: kunde?.kunde_stadt ?? null,
        email: claimEmail.kunde_email as string,
      }
    }
  }

  // Pflichtdokumente laden — Gutachten, Vollmacht, Sicherungsabtretung, Polizeibericht
  const { data: dokumente } = await db
    .from('fall_dokumente')
    .select('typ, kategorie, datei_url, datei_name')
    .eq('fall_id', fallId)
    .in('typ', ['gutachten', 'vollmacht', 'sicherungsabtretung', 'polizeibericht'])

  const attachmentsToFetch = (dokumente ?? []).filter(d => d.datei_url)
  const attachments: Anhang[] = []
  for (const d of attachmentsToFetch) {
    const att = await fetchPdfFromUrl(d.datei_url as string, (d.datei_name as string) ?? `${d.typ}.pdf`)
    if (att) attachments.push(att)
  }

  // Unfallskizze laden — aus claims (bestaetigt + URL oder inline SVG)
  if (fall.claim_id) {
    const { data: claimData } = await db
      .from('claims')
      .select('unfallskizze_svg, unfallskizze_url, unfallskizze_bestaetigt')
      .eq('id', fall.claim_id as string)
      .single()
    if (claimData?.unfallskizze_bestaetigt) {
      if (claimData.unfallskizze_url) {
        const att = await fetchPdfFromUrl(claimData.unfallskizze_url as string, 'Unfallskizze.svg')
        if (att) attachments.push(att)
      } else if (claimData.unfallskizze_svg) {
        attachments.push({
          filename: 'Unfallskizze.svg',
          content: Buffer.from(claimData.unfallskizze_svg as string, 'utf-8'),
        })
      }
    }
  }

  // Email-Body
  const kundeName = [kunde?.vorname, kunde?.nachname].filter(Boolean).join(' ') || '—'
  const kundeAdr = [kunde?.kunde_strasse, kunde?.kunde_plz, kunde?.kunde_stadt].filter(Boolean).join(', ') || '—'
  // AAR-548 D8: zeuge_* gedropt — Source ist jetzt zeugen_kontakte JSONB-Array.
  const zeugenArr = Array.isArray(fall.zeugen_kontakte)
    ? (fall.zeugen_kontakte as Array<{ name?: string | null; anschrift?: string | null; telefon?: string | null; email?: string | null; notiz?: string | null }>)
    : []
  const zeugeBlock = zeugenArr.length > 0
    ? '\nZeugen:\n' + zeugenArr.map((z, i) =>
        `  [${i + 1}] Name: ${z.name ?? '—'}\n      Anschrift: ${z.anschrift ?? '—'}\n      Telefon: ${z.telefon ?? '—'}\n      Email: ${z.email ?? '—'}`
      ).join('\n') + '\n'
    : ''

  const text = `Neuer Fall zur Bearbeitung — Claimondo

Fall-ID: ${fall.id}
Fall-Nummer: ${fall.fall_nummer ?? '—'}

Mandant:
  Name: ${kundeName}
  Anschrift: ${kundeAdr}
  Telefon: ${kunde?.telefon ?? '—'}
  Email: ${kunde?.email ?? '—'}

Fahrzeug: ${fall.kennzeichen ?? '—'}

Gegner:
  Name: ${fall.gegner_name ?? '—'}
  Kennzeichen: ${fall.gegner_kennzeichen ?? '—'}
  VS: ${fall.gegner_versicherung ?? '—'}
  Schaden-Nr: ${fall.gegner_schadennummer ?? '—'}
${zeugeBlock}
Anhaenge: ${attachments.length} (${attachments.map(a => a.filename).join(', ')})

— Claimondo
`

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM ?? 'Claimondo <noreply@claimondo.de>',
      to: LEXDRIVE_EMAIL,
      subject: `Neuer Fall ${fall.fall_nummer ?? fall.id.slice(0, 8)} — ${kundeName}`,
      text,
      attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
    })

    // Timeline
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: 'LexDrive-Email gesendet',
      beschreibung: `An ${LEXDRIVE_EMAIL} mit ${attachments.length} Anhang/Anhängen`,
    })

    return { success: true, messageId: result.data?.id, attachments: attachments.length }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
