import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FINANCE } from '@/lib/finance/constants'

export const dynamic = 'force-dynamic'

/**
 * AAR-939 Stream 8: Monats-Billing fuer Monika-Embed Variante-B Anfragen.
 *
 * Modell: Pro durchgefuehrtem Embed-Termin (Variante B) zahlt der SV ein
 * Vermittlungsentgelt (Einzelpreis, default 70 EUR netto) an Claimondo. Der
 * DB-Trigger embed_termin_billing markiert die Anfrage bei durchgefuehrt_am
 * (NULL->NOT NULL) als abrechnungs_relevant + setzt abrechnungs_betrag_eur.
 * Dieser Cron sammelt alle noch nicht abgerechneten relevanten Anfragen,
 * gruppiert pro SV (ueber embed_sites.sv_id) und erzeugt eine Monatsrechnung
 * (empfaenger_typ='sv', kfz141-abrechnungen-Schema) + Positionen + Email.
 *
 * VPS-Crontab (KEIN vercel.json): 0 18 28-31 * * mit Self-Check ob letzter Tag.
 *
 * Idempotenz (3 Schichten):
 *  - Self-Check (nur letzter Tag des Monats laeuft durch)
 *  - abrechnung_id IS NULL Guard auf der Anfrage (Selektion + Markierung)
 *  - UNIQUE(anfrage_id) partiell auf embed_abrechnung_positionen
 *
 * Kein PDF (bewusst): die bestehende SV-Monatsabrechnung (cron/abrechnung-erstellen)
 * generiert ebenfalls keins — abrechnungen-Kopf + embed_abrechnung_positionen sind
 * der Rechnungs-Record. Ein PDF kann analog zur Kanzlei-Strecke nachgeruestet werden.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Self-Check: nur am letzten Tag des Monats abrechnen.
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (tomorrow.getMonth() === now.getMonth()) {
    return NextResponse.json({ ok: true, skipped: 'Nicht der letzte Tag des Monats' })
  }

  // as any: embed_sites + embed_abrechnung_positionen + die gfa-Billing-Spalten
  // (source/variante/abrechnungs_relevant/abrechnungs_betrag_eur/abrechnung_id/
  // abgerechnet_am/embed_site_id) sind noch nicht in den regenerierten Supabase-
  // Types — gleiches Muster wie Stream 5 (config-Endpoint). Alle Spalten sind
  // live gegen die DB verifiziert.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  const monatPad = String(monat).padStart(2, '0')
  const monthStartDate = new Date(jahr, monat - 1, 1).toISOString().slice(0, 10)
  const monthEndDate = new Date(jahr, monat, 0).toISOString().slice(0, 10)

  // 1) Offene, abrechnungsrelevante Monika-Embed-Anfragen (Variante B),
  //    noch nicht abgerechnet. Akkumuliert ueber Monate hinweg bis abgerechnet.
  const { data: anfragen, error: anfragenErr } = await db
    .from('gutachter_finder_anfragen')
    .select('id, vorname, nachname, schadentyp, erstellt_am, termin_id, abrechnungs_betrag_eur, embed_site_id')
    .eq('source', 'sv_embed')
    .eq('variante', 'B')
    .eq('abrechnungs_relevant', true)
    .is('abrechnung_id', null)

  if (anfragenErr) {
    console.error('[AAR-939 embed-billing] Anfrage-Query:', anfragenErr.message)
    return NextResponse.json({ error: anfragenErr.message }, { status: 500 })
  }
  if (!anfragen?.length) {
    return NextResponse.json({ ok: true, created: 0, info: 'Keine offenen abrechenbaren Anfragen' })
  }

  // 2) Embed-Sites separat laden (kein PostgREST-Embed -> keine FK-Abhaengigkeit).
  const siteIds = Array.from(new Set(anfragen.map((a) => a.embed_site_id).filter(Boolean) as string[]))
  const siteMap = new Map<string, { sv_id: string | null; name: string | null; einzelpreis_eur: number | null }>()
  if (siteIds.length) {
    const { data: sites } = await db
      .from('embed_sites')
      .select('id, sv_id, name, einzelpreis_eur')
      .in('id', siteIds)
    for (const s of sites ?? []) {
      siteMap.set(s.id, { sv_id: s.sv_id, name: s.name, einzelpreis_eur: s.einzelpreis_eur })
    }
  }

  // 3) Anfragen pro SV gruppieren (ueber embed_sites.sv_id).
  type Anfrage = (typeof anfragen)[number]
  const bySv = new Map<string, Anfrage[]>()
  for (const a of anfragen) {
    const site = a.embed_site_id ? siteMap.get(a.embed_site_id) : null
    const svId = site?.sv_id
    if (!svId) continue // ownerlose / Claimondo-Site -> kein SV-Billing
    const arr = bySv.get(svId) ?? []
    arr.push(a)
    bySv.set(svId, arr)
  }

  const faellig = new Date(jahr, monat, 14) // 14. des Folgemonats
  const faelligIso = faellig.toISOString().slice(0, 10)
  let created = 0

  for (const [svId, rows] of bySv.entries()) {
    // Empfaenger: sachverstaendige -> profiles (sachverstaendige hat keine email/name-Spalte).
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id, profile_id')
      .eq('id', svId)
      .maybeSingle()
    if (!sv?.profile_id) {
      console.error(`[AAR-939 embed-billing] SV ${svId} ohne profile_id — uebersprungen`)
      continue
    }
    const { data: profile } = await db
      .from('profiles')
      .select('email, vorname, nachname')
      .eq('id', sv.profile_id)
      .maybeSingle()
    if (!profile?.email) {
      console.error(`[AAR-939 embed-billing] SV ${svId} ohne Email — uebersprungen`)
      continue
    }
    const empfaengerName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'Sachverstaendiger'

    // Positionen + Summen
    const positionen = rows.map((a, i) => {
      const site = a.embed_site_id ? siteMap.get(a.embed_site_id) : null
      const einzelNetto = Number(a.abrechnungs_betrag_eur ?? site?.einzelpreis_eur ?? 70)
      const kundeName = [a.vorname, a.nachname].filter(Boolean).join(' ') || 'Anfrage'
      return {
        position_nr: i + 1,
        anfrage_id: a.id,
        termin_id: a.termin_id ?? null,
        embed_site_id: a.embed_site_id,
        site_name: site?.name ?? null,
        datum: a.erstellt_am ? new Date(a.erstellt_am).toISOString().slice(0, 10) : null,
        kunde_name: kundeName,
        schadentyp: a.schadentyp ?? null,
        einzelpreis_netto: einzelNetto,
      }
    })
    const summeNetto = positionen.reduce((s, p) => s + p.einzelpreis_netto, 0)
    const ustBetrag = Math.round((summeNetto * FINANCE.MWST_PROZENT) / 100 * 100) / 100
    const summeBrutto = Math.round((summeNetto + ustBetrag) * 100) / 100
    if (summeNetto <= 0) continue

    // Rechnungsnummer CMNDO-EMB-YYYY-MM-NNN (eigener Prefix -> keine Lead-Kollision).
    const { count: existing } = await db
      .from('abrechnungen')
      .select('id', { count: 'exact', head: true })
      .like('abrechnungs_nr', 'CMNDO-EMB-%')
      .gte('abrechnungs_zeitraum_start', monthStartDate)
      .lte('abrechnungs_zeitraum_ende', monthEndDate)
    const nr = String((existing ?? 0) + 1).padStart(3, '0')
    const abrechnungsNr = `CMNDO-EMB-${jahr}-${monatPad}-${nr}`

    // Abrechnungs-Kopf (kfz141-Schema, empfaenger_typ='sv').
    const { data: abr, error: abrErr } = await db
      .from('abrechnungen')
      .insert({
        empfaenger_typ: 'sv',
        empfaenger_id: sv.id,
        empfaenger_email: profile.email,
        empfaenger_name: empfaengerName,
        abrechnungs_nr: abrechnungsNr,
        abrechnungs_zeitraum_start: monthStartDate,
        abrechnungs_zeitraum_ende: monthEndDate,
        positionen,
        summe_netto: summeNetto,
        ust_satz: 19.0,
        ust_betrag: ustBetrag,
        summe_brutto: summeBrutto,
        faellig_am: faelligIso,
        status: 'versendet',
        versand_datum: new Date().toISOString(),
        notiz: `Monika-Embed Vermittlungsentgelt: ${positionen.length} durchgefuehrte Termine (Variante B).`,
      })
      .select('id')
      .single()

    if (abrErr || !abr) {
      console.error(`[AAR-939 embed-billing] Abrechnung ${svId}:`, abrErr?.message)
      continue
    }

    // Positionen-Audit-Trail. UNIQUE(anfrage_id) verhindert Doppel-Abrechnung.
    for (const p of positionen) {
      const { error: posErr } = await db.from('embed_abrechnung_positionen').insert({
        abrechnung_id: abr.id,
        embed_site_id: p.embed_site_id,
        anfrage_id: p.anfrage_id,
        termin_id: p.termin_id,
        einzelpreis_eur: p.einzelpreis_netto,
        leistung_text: `Monika-Vermittlung: ${p.kunde_name}${p.schadentyp ? ` (${p.schadentyp})` : ''}`,
      })
      if (posErr) console.error(`[AAR-939 embed-billing] Position ${p.anfrage_id}:`, posErr.message)
    }

    // Anfragen als abgerechnet markieren.
    const ids = rows.map((r) => r.id)
    await db
      .from('gutachter_finder_anfragen')
      .update({ abrechnung_id: abr.id, abgerechnet_am: new Date().toISOString() })
      .in('id', ids)

    // Email an SV (non-fatal — bricht den Status-Write nicht).
    try {
      const { render } = await import('@react-email/render')
      const { SvMonatsabrechnungVersandEmail, subject } = await import(
        '@/lib/email/google/templates/SvMonatsabrechnungVersand'
      )
      const { sendCommunication } = await import('@/lib/communications/send')
      const props = {
        vorname: profile.vorname ?? null,
        abrechnungsNr,
        monat: `${monatPad}/${jahr}`,
        betragBrutto: summeBrutto,
        faelligAm: faellig.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
      }
      const html = await render(SvMonatsabrechnungVersandEmail(props))
      await sendCommunication('sv_monatsabrechnung', {
        email: profile.email,
        vorname: profile.vorname ?? '',
        subject: subject(props),
        html,
      })
    } catch (err) {
      console.error('[AAR-939 embed-billing] Abrechnungs-Email:', err)
    }

    created++
  }

  return NextResponse.json({ ok: true, created })
}
