import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * KFZ-149 Block E: Monatsend-Abrechnung (per-case, kein Pool).
 * Cron: 0 18 28-31 * * (mit Self-Check ob letzter Tag des Monats)
 */
export async function GET() {
  // Ist heute der letzte Tag des Monats?
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  if (tomorrow.getMonth() === now.getMonth()) {
    return NextResponse.json({ ok: true, skipped: 'Nicht der letzte Tag des Monats' })
  }

  const db = createAdminClient()
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  const monthStart = new Date(jahr, monat - 1, 1).toISOString()
  const monthEnd = new Date(jahr, monat, 1).toISOString()

  // Alle aktiven SVs
  const { data: svs } = await db.from('sachverstaendige')
    .select('id, profile_id, werbebudget_guthaben_netto')
    .eq('ist_aktiv', true)

  let created = 0

  for (const sv of svs ?? []) {
    // Fälle dieses Monats mit Lead-Preis, noch nicht abgerechnet
    const { data: faelle } = await db.from('faelle')
      .select('id, created_at, kennzeichen, gutachten_betrag, schadenhoehe_netto, lead_preis_netto, lead_preis_typ, guthaben_verrechnet_netto, sv_nachzahlung_netto')
      .eq('sv_id', sv.id)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)
      .not('lead_preis_netto', 'is', null)
      .is('abrechnung_id', null)

    if (!faelle?.length) continue

    // Per-case Summen (schon pro Fall berechnet!)
    const bruttoNetto = faelle.reduce((s, f) => s + (Number(f.lead_preis_netto) || 0), 0)
    const guthabenVerrechnet = faelle.reduce((s, f) => s + (Number(f.guthaben_verrechnet_netto) || 0), 0)
    const endbetragNetto = faelle.reduce((s, f) => s + (Number(f.sv_nachzahlung_netto) || 0), 0)
    const mwst = Math.round(endbetragNetto * 0.19 * 100) / 100
    const endbetragBrutto = Math.round((endbetragNetto + mwst) * 100) / 100

    // Rechnungsnummer: CMNDO-YYYY-MM-NNNN
    const { count: existing } = await db.from('abrechnungen').select('id', { count: 'exact', head: true })
      .eq('abrechnungsmonat', monat).eq('abrechnungsjahr', jahr)
    const nr = String((existing ?? 0) + 1).padStart(4, '0')
    const rechnungsnummer = `CMNDO-${jahr}-${String(monat).padStart(2, '0')}-${nr}`

    // Fälligkeitsdatum: 14. des Folgemonats
    const faellig = new Date(jahr, monat, 14)

    // Insert Abrechnung
    const { data: abr, error: abrErr } = await db.from('abrechnungen').insert({
      gutachter_id: sv.id,
      abrechnungsmonat: monat,
      abrechnungsjahr: jahr,
      bruttoabrechnung_netto: bruttoNetto,
      guthaben_verrechnung_netto: guthabenVerrechnet,
      endbetrag_netto: endbetragNetto,
      mwst_betrag: mwst,
      endbetrag_brutto: endbetragBrutto,
      guthaben_neu: Number(sv.werbebudget_guthaben_netto),
      rechnungsnummer,
      status: 'erstellt',
      faelligkeitsdatum: faellig.toISOString().slice(0, 10),
    }).select('id').single()

    if (abrErr || !abr) { console.error(`[KFZ-149] Abrechnung ${sv.id}:`, abrErr?.message); continue }

    // Positionen
    for (let i = 0; i < faelle.length; i++) {
      const f = faelle[i]
      await db.from('abrechnung_positionen').insert({
        abrechnung_id: abr.id,
        fall_id: f.id,
        fall_datum: new Date(f.created_at).toISOString().slice(0, 10),
        kennzeichen: f.kennzeichen ?? null,
        schadenhoehe_netto: Number(f.schadenhoehe_netto ?? f.gutachten_betrag ?? 0),
        lead_preis_netto: Number(f.lead_preis_netto),
        lead_preis_typ: f.lead_preis_typ ?? 'paket',
        guthaben_verrechnet_netto: Number(f.guthaben_verrechnet_netto ?? 0),
        sv_nachzahlung_netto: Number(f.sv_nachzahlung_netto ?? 0),
        position_nr: i + 1,
      })
    }

    // Fälle markieren
    const fallIds = faelle.map(f => f.id)
    await db.from('faelle').update({ abrechnung_id: abr.id }).in('id', fallIds)

    // Status → versendet + Email (TODO: PDF-Generierung)
    await db.from('abrechnungen').update({ status: 'versendet', versendet_am: new Date().toISOString() }).eq('id', abr.id)

    // Email an SV
    try {
      const { data: p } = await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
      if (p?.email) {
        const { sendEmail } = await import('@/lib/email/google/client')
        await sendEmail({
          to: p.email,
          subject: `Claimondo Monatsabrechnung ${String(monat).padStart(2, '0')}/${jahr} — ${rechnungsnummer}`,
          html: `<p>Hallo ${p.vorname ?? 'Partner'},</p>
<p>deine Monatsabrechnung für ${String(monat).padStart(2, '0')}/${jahr} ist erstellt:</p>
<ul>
<li><strong>Rechnungsnummer:</strong> ${rechnungsnummer}</li>
<li><strong>Lead-Preise gesamt:</strong> ${bruttoNetto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR netto</li>
<li><strong>Verrechnet (Werbebudget):</strong> -${guthabenVerrechnet.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR</li>
<li><strong>Endbetrag:</strong> ${endbetragBrutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR brutto</li>
<li><strong>Fällig am:</strong> ${faellig.toLocaleDateString('de-DE')}</li>
</ul>
<p>Der Betrag wird am ${faellig.toLocaleDateString('de-DE')} automatisch eingezogen.</p>`,
          empfaengerTyp: 'sv',
          template: 'sv_monatsabrechnung',
        })
      }
    } catch (err) { console.error('[KFZ-149] Abrechnungs-Email:', err) }

    created++
  }

  return NextResponse.json({ ok: true, created })
}
