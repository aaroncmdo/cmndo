import type { SupabaseClient } from '@supabase/supabase-js'
import { nextRechnungsNrRaw } from '@/lib/billing/generate-rechnungs-nr'
import { getAktuelleRechnungsKonfig } from '@/lib/billing/get-rechnungs-konfig'

const PARTNER_TABLE: Record<string, string> = {
  makler: 'makler',
  werkstatt: 'werkstaetten',
  marketing: 'marketing_partner',
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

    const aussteller_snapshot = {
      firmenname: konfig.firmenname,
      strasse: konfig.strasse,
      plz: konfig.plz,
      ort: konfig.ort,
      steuernummer: konfig.steuernummer,
      ust_id: konfig.ust_id,
      zahlungsempfaenger_name: konfig.zahlungsempfaenger_name,
      zahlungsempfaenger_iban: konfig.zahlungsempfaenger_iban,
      zahlungsempfaenger_bic: konfig.zahlungsempfaenger_bic,
      zahlungsempfaenger_bank: konfig.zahlungsempfaenger_bank,
    }

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
