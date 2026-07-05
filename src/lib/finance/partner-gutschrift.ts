import type { SupabaseClient } from '@supabase/supabase-js'
import { nextRechnungsNrRaw } from '@/lib/billing/generate-rechnungs-nr'
import { getAktuelleRechnungsKonfig } from '@/lib/billing/get-rechnungs-konfig'

const PARTNER_TABLE: Record<string, string> = {
  makler: 'makler',
  werkstatt: 'werkstaetten',
  marketing: 'marketing_partner',
}

/**
 * Laedt die Gutschrift-Zeile, downloadet das PDF aus Storage, versendet es als
 * Email-Anhang an den Partner und markiert die Zeile als versendet.
 *
 * Non-fatal: gibt immer ein Result-Object zurueck, wirft nie.
 * sendEmail kann werfen — der try/catch haelt das fest.
 */
export async function versendePartnerGutschrift(
  db: SupabaseClient<any>,
  gutschriftId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Step 1 — Zeile laden
    const { data: row, error: rowErr } = await db
      .from('partner_gutschriften')
      .select('*')
      .eq('id', gutschriftId)
      .single()

    if (rowErr || !row) {
      return { ok: false, error: 'Gutschrift nicht gefunden' }
    }

    // Step 2 — Idempotenz: bereits versendet → OK ohne erneuten Versand
    if (row.status === 'versendet') {
      return { ok: true }
    }

    // Step 3 — PDF muss vorhanden sein
    if (!row.pdf_storage_path) {
      return { ok: false, error: 'Gutschrift-PDF fehlt' }
    }

    // Step 4 — Empfaenger-Email aus Partner-Tabelle laden
    const partnerTable = PARTNER_TABLE[row.partner_typ as string]
    const { data: partnerData, error: partnerErr } = await db
      .from(partnerTable)
      .select('email')
      .eq('id', row.partner_id)
      .single()

    if (partnerErr || !partnerData || !partnerData.email) {
      return { ok: false, error: 'Keine Empfaenger-Email' }
    }
    const email: string = partnerData.email

    // Step 5 — PDF aus Storage herunterladen
    const { data: file } = await db.storage
      .from('onboarding-rechnungen')
      .download(row.pdf_storage_path)

    if (!file) {
      return { ok: false, error: 'PDF-Download fehlgeschlagen' }
    }
    const buf = Buffer.from(await file.arrayBuffer())

    // Step 6 — Template rendern und Email versenden (dynamic imports)
    const { render } = await import('@react-email/render')
    const { PartnerGutschriftEmail, subject } = await import(
      '@/lib/email/google/templates/PartnerGutschrift'
    )
    const props = {
      empfaengerName: (row.empfaenger_snapshot as any)?.name ?? 'Partner',
      gutschriftNr: row.gutschrift_nr as string,
      betrag:
        new Intl.NumberFormat('de-DE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(row.betrag_brutto as number) + ' €',
      datum: new Date(row.erstellt_am as string).toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin',
      }),
    }
    const html = await render(PartnerGutschriftEmail(props))
    const { sendEmail } = await import('@/lib/email/google/client')
    const empfTyp = ({ makler: 'makler', werkstatt: 'werkstatt', marketing: 'admin' } as const)[
      row.partner_typ as 'makler' | 'werkstatt' | 'marketing'
    ]
    try {
      await sendEmail({
        to: email,
        subject: subject(props),
        html,
        empfaengerTyp: empfTyp,
        template: 'partner_gutschrift',
        attachments: [
          {
            filename: `Gutschrift-${row.gutschrift_nr}.pdf`,
            content: buf,
            contentType: 'application/pdf',
          },
        ],
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Email-Versand fehlgeschlagen' }
    }

    // Step 7 — Als versendet markieren
    await db
      .from('partner_gutschriften')
      .update({ status: 'versendet', versendet_am: new Date().toISOString() })
      .eq('id', gutschriftId)

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

export async function erstellePartnerGutschrift(
  db: SupabaseClient<any>,
  p: {
    tabelle: string
    ledgerId: string
    partnerTyp: 'makler' | 'werkstatt' | 'marketing'
    partnerId: string
    betraege: {
      nettoCent: number
      ustSatz: number | null
      ustBetrag: number | null
      bruttoCent: number
    }
    leistungText: string
  },
): Promise<{ ok: true; gutschriftId: string; nummer: string } | { ok: false; error: string }> {
  try {
    // 1. Load partner tax data
    const table = PARTNER_TABLE[p.partnerTyp]
    const { data: partner, error: partnerError } = await db
      .from(table)
      .select('*')
      .eq('id', p.partnerId)
      .single()

    if (partnerError || !partner) {
      return { ok: false, error: 'Partner nicht gefunden' }
    }

    // Name field differs by partner type: makler → firma; werkstatt & marketing → name
    const name: string | null =
      p.partnerTyp === 'makler'
        ? (partner as any).firma ?? null
        : (partner as any).name ?? null

    const strasse: string | null = (partner as any).adresse_strasse ?? null
    const plz: string | null = (partner as any).adresse_plz ?? null
    const ort: string | null = (partner as any).adresse_ort ?? null
    const ust_id: string | null = (partner as any).ust_id ?? null
    const ist_kleinunternehmer: boolean | null = (partner as any).ist_kleinunternehmer ?? null

    const empfaenger_snapshot = {
      name,
      adresse_strasse: strasse,
      adresse_plz: plz,
      adresse_ort: ort,
      ust_id,
      ist_kleinunternehmer,
    }

    // 2. Completeness block (§14c protection)
    const adresseVollstaendig = !!(strasse?.trim() && plz?.trim() && ort?.trim())
    const ustDatenOk = ist_kleinunternehmer === true || !!ust_id?.trim()

    if (!adresseVollstaendig || !ustDatenOk) {
      return {
        ok: false,
        error: 'Empfänger-Steuerdaten unvollständig — Gutschrift nicht erstellbar',
      }
    }

    // 3. Allocate number
    const jahr = new Date().getFullYear()
    let n: number
    try {
      n = await nextRechnungsNrRaw('CMNDO-GS', jahr)
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
    const nummer = `CMNDO-GS-${jahr}-${String(n).padStart(5, '0')}`

    // 4. Aussteller snapshot from current config
    let konfig: Awaited<ReturnType<typeof getAktuelleRechnungsKonfig>>
    try {
      konfig = await getAktuelleRechnungsKonfig()
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }

    // Store the full konfig as the aussteller snapshot so AbsenderHeaderBlock
    // gets all fields (geschaeftsfuehrer/hrb) — a frozen legal snapshot must be complete.
    const aussteller_snapshot = konfig

    // 5. Insert
    const row = {
      partner_typ: p.partnerTyp,
      partner_id: p.partnerId,
      gutschrift_nr: nummer,
      ledger_tabelle: p.tabelle,
      ledger_id: p.ledgerId,
      betrag_netto: p.betraege.nettoCent / 100,
      ust_satz: p.betraege.ustSatz,
      ust_betrag: p.betraege.ustBetrag === null ? null : p.betraege.ustBetrag / 100,
      betrag_brutto: p.betraege.bruttoCent / 100,
      empfaenger_snapshot,
      aussteller_snapshot,
      leistung_text: p.leistungText,
      status: 'erstellt',
    }

    const { data: inserted, error: insertError } = await db
      .from('partner_gutschriften')
      .insert(row)
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return { ok: false, error: 'Gutschrift existiert bereits' }
      }
      return { ok: false, error: insertError.message }
    }

    return { ok: true, gutschriftId: (inserted as any).id, nummer }
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Unbekannter Fehler' }
  }
}
