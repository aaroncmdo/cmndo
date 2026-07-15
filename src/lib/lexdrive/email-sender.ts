// AAR-77: LexDrive Outbound Email mit PDF-Anhaengen
// Wird beim Status-Wechsel auf 'kanzlei-uebergeben' getriggert.

import { createAdminClient } from '@/lib/supabase/admin'
import { resend, isResendAvailable } from '@/lib/email/resend-client'
import { getStorageUrl } from '@/lib/storage/url'

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

  // Fall + Lead laden (inkl. claim_id für Unfallskizze).
  // CMM-44 SP-A: zeugen_kontakte liegt auf claims (SSoT) — via Nested-Embed lesen.
  // CMM-44 SP-A2 (Cluster 3): gegner_schadennummer → claims.gegner_aktenzeichen (SSoT).
  // CMM-49: faelle->v_claim_full (claim-anchored SSoT). kennzeichen/gegner_* + claims-
  // native claim_nummer/zeugen_kontakte/gegner_aktenzeichen flach aus der View
  // (zeugen_kontakte seit Plan-4-Ergaenzung in v_claim_full). gegner_versicherung ->
  // Alias auf gegner_versicherung_name (LOSS=0/CONFLICT=0 verifiziert).
  const { data: fall } = await db
    .from('v_claim_full')
    .select('claim_id:id, kennzeichen, lead_id, gegner_kennzeichen, gegner_name, gegner_versicherung:gegner_versicherung_name, claim_nummer, zeugen_kontakte, gegner_aktenzeichen, kunde_email')
    .eq('fall_id', fallId)
    .single()

  if (!fall) return { success: false, error: `Fall ${fallId} nicht gefunden` }
  const fallClaim = fall

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

  // Email entity-sourced aus v_claim_full (geschaedigter-Party->personen) bevorzugen — die
  // SSoT-Email ist immer aktuell (Lead-Email kann veraltet sein wenn Kunde sie nach der
  // Konvertierung geaendert hat). CMM-49: nicht mehr claims.kunde_email direkt — die View
  // sourct kunde_email aus der Party (Vorbereitung des claims.kunde_email-Drops).
  const partyEmail = (fall.kunde_email as string | null) ?? null
  if (partyEmail) {
    kunde = {
      ...kunde,
      vorname: kunde?.vorname ?? null,
      nachname: kunde?.nachname ?? null,
      telefon: kunde?.telefon ?? null,
      kunde_strasse: kunde?.kunde_strasse ?? null,
      kunde_plz: kunde?.kunde_plz ?? null,
      kunde_stadt: kunde?.kunde_stadt ?? null,
      email: partyEmail,
    }
  }

  // Pflichtdokumente laden — Gutachten, Vollmacht, Sicherungsabtretung, Polizeibericht.
  // CMM-49 Schema-Drift-Fix (15.07.): fall_dokumente hat dokument_typ/storage_path/
  // original_filename (nicht typ/datei_url/datei_name). storage_path ist ein INTERNER
  // Storage-Pfad -> vor dem Fetch eine Signed-URL erzeugen (getStorageUrl). Bisher warf
  // der Select PostgREST-400 -> 0 Dokumente -> Kanzlei-Email ging OHNE Anhaenge raus.
  const { data: dokumente } = await db
    .from('fall_dokumente')
    .select('dokument_typ, kategorie, storage_path, original_filename')
    .eq('fall_id', fallId)
    .in('dokument_typ', ['gutachten', 'vollmacht', 'sicherungsabtretung', 'polizeibericht'])

  const attachmentsToFetch = (dokumente ?? []).filter((d) => d.storage_path)
  const attachments: Anhang[] = []
  for (const d of attachmentsToFetch) {
    const url = await getStorageUrl(db, 'fall-dokumente', d.storage_path as string, { context: 'email' })
    if (!url) continue
    const att = await fetchPdfFromUrl(url, (d.original_filename as string) ?? `${d.dokument_typ}.pdf`)
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
  // CMM-44 SP-A: zeugen_kontakte kommt jetzt vom Claim.
  const zeugenArr = Array.isArray(fallClaim?.zeugen_kontakte)
    ? (fallClaim.zeugen_kontakte as Array<{ name?: string | null; anschrift?: string | null; telefon?: string | null; email?: string | null; notiz?: string | null }>)
    : []
  const zeugeBlock = zeugenArr.length > 0
    ? '\nZeugen:\n' + zeugenArr.map((z, i) =>
        `  [${i + 1}] Name: ${z.name ?? '—'}\n      Anschrift: ${z.anschrift ?? '—'}\n      Telefon: ${z.telefon ?? '—'}\n      Email: ${z.email ?? '—'}`
      ).join('\n') + '\n'
    : ''

  const text = `Neuer Fall zur Bearbeitung — Claimondo

Fall-ID: ${fallId}
Fall-Nummer: ${fallClaim?.claim_nummer ?? '—'}

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
  Schaden-Nr: ${fallClaim?.gegner_aktenzeichen ?? '—'}
${zeugeBlock}
Anhaenge: ${attachments.length} (${attachments.map(a => a.filename).join(', ')})

— Claimondo
`

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM ?? 'Claimondo <noreply@claimondo.de>',
      to: LEXDRIVE_EMAIL,
      subject: `Neuer Fall ${fallClaim?.claim_nummer ?? fallId.slice(0, 8)} — ${kundeName}`,
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
