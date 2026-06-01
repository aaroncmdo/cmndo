import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FINANCE } from '@/lib/finance/constants'

export const dynamic = 'force-dynamic'

/**
 * AAR-939 Stream 8: Monats-Billing fuer Monika-Embed Variante-B (70 EUR Vermittlungsentgelt).
 *
 * AUTO-FÄLLIG-Modell (Aaron 31.05., Contract docs/30.05.2026/AAR-939-billing-lifecycle-contract.md):
 * Leitsatz „Wir nehmen an der SV war da, ausser er meldet aktiv etwas anderes."
 * Die 70 EUR werden ZEITBASIERT faellig, sobald die Terminzeit + 24h Karenz vorbei
 * ist und der Termin verbindlich war (status bestaetigt/durchgefuehrt) — KEIN
 * Event-Trigger mehr (der alte gfa.status-Trigger ist gedroppt, Migration B1).
 * Die DB-View v_embed_billing_faellig kapselt ALLE Faellig-Regeln: Reverse-Lookup
 * gfa.konvertiert_zu_lead_id -> claims.lead_id -> gutachter_termine (claim_id ODER
 * lead_id), SA-unterschrieben-Guard, Ausschluss von abgerechnet/storniert/in-Review,
 * + aufgeloester/eingefrorener sv_id und betrag_netto. Dieser Cron gruppiert die
 * faelligen Positionen pro SV, erzeugt eine Monatsrechnung (abrechnungen
 * empfaenger_typ='sv', kfz141-Schema) + embed_abrechnung_positionen + Email, friert
 * abrechnung_sv_id ein und markiert die Anfrage als abgerechnet.
 *
 * Kein Reuse von abrechnungen-generator.ts: dort sind Marketing/Kanzlei-Strecken
 * mit eigenem Nummernkreis (CL-YYYY-MM-TYP), status='entwurf' und ohne
 * Positionen-Audit-Table — hier eigener Nummernkreis (CMNDO-EMB), status='versendet'
 * + embed_abrechnung_positionen. Andere Domaene, keine geteilte Kopf-Logik.
 *
 * VPS-Crontab (KEIN vercel.json): 0 18 28-31 * * mit Self-Check ob letzter Tag.
 *
 * Idempotenz (3 Schichten):
 *  - Self-Check (nur letzter Tag des Monats laeuft durch)
 *  - View filtert abrechnung_id IS NULL; Markierung direkt nach Insert
 *  - UNIQUE(anfrage_id) partiell auf embed_abrechnung_positionen
 *
 * Kein PDF (bewusst, wie SV-Monatsabrechnung): abrechnungen-Kopf +
 * embed_abrechnung_positionen sind der Rechnungs-Record.
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

  // as any: v_embed_billing_faellig + die gfa-Billing-Spalten (abrechnung_id/
  // abgerechnet_am/abrechnung_sv_id) + embed_abrechnung_positionen sind noch nicht
  // in den regenerierten Supabase-Types (Regen = B6). Alle Felder sind live gegen
  // die DB verifiziert.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  const monatPad = String(monat).padStart(2, '0')
  const monthStartDate = new Date(jahr, monat - 1, 1).toISOString().slice(0, 10)
  const monthEndDate = new Date(jahr, monat, 0).toISOString().slice(0, 10)

  // 1) Faellige Positionen aus der View (alle Faellig-Regeln dort gekapselt).
  //    Eine Zeile pro abrechenbarer Anfrage, mit aufgeloestem/eingefrorenem sv_id.
  //    Explizite Row-Typen: db ist `any` (View noch nicht in den Supabase-Types) →
  //    ohne Annotation inferieren .map/.reduce-Callbacks `any` und brechen
  //    `next build` (noImplicitAny / TS7006). Selektierte Spalten 1:1 typisiert.
  interface FaelligRow {
    anfrage_id: string
    vorname: string | null
    nachname: string | null
    schadentyp: string | null
    erstellt_am: string | null
    embed_site_id: string | null
    sv_id: string | null
    betrag_netto: number | null
    site_name: string | null
    termin_id: string | null
    termin_end_zeit: string | null
  }
  const { data: faelligRaw, error: faelligErr } = await db
    .from('v_embed_billing_faellig')
    .select(
      'anfrage_id, vorname, nachname, schadentyp, erstellt_am, embed_site_id, sv_id, betrag_netto, site_name, termin_id, termin_end_zeit',
    )

  if (faelligErr) {
    console.error('[AAR-939 embed-billing] View-Query:', faelligErr.message)
    return NextResponse.json({ error: faelligErr.message }, { status: 500 })
  }
  const faellig = (faelligRaw ?? []) as FaelligRow[]
  if (!faellig.length) {
    return NextResponse.json({ ok: true, created: 0, info: 'Keine faelligen Anfragen' })
  }

  // 2) Pro SV gruppieren (sv_id kommt aufgeloest aus der View).
  const bySv = new Map<string, FaelligRow[]>()
  for (const r of faellig) {
    if (!r.sv_id) continue
    const arr = bySv.get(r.sv_id) ?? []
    arr.push(r)
    bySv.set(r.sv_id, arr)
  }

  const faelligAm = new Date(jahr, monat, 14) // 14. des Folgemonats
  const faelligAmIso = faelligAm.toISOString().slice(0, 10)
  let created = 0

  for (const [svId, rows] of bySv.entries()) {
    // Empfaenger: sachverstaendige -> profiles (sachverstaendige hat keine email/name).
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
    const empfaengerName =
      [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'Sachverstaendiger'

    // Positionen + Summen. Leistungsdatum = Terminzeit (Vermittlung erbracht).
    const positionen = rows.map((r, i) => {
      const einzelNetto = Number(r.betrag_netto ?? 70)
      const kundeName = [r.vorname, r.nachname].filter(Boolean).join(' ') || 'Anfrage'
      const leistungsdatum = r.termin_end_zeit ?? r.erstellt_am
      return {
        position_nr: i + 1,
        anfrage_id: r.anfrage_id,
        termin_id: r.termin_id ?? null,
        embed_site_id: r.embed_site_id,
        site_name: r.site_name ?? null,
        datum: leistungsdatum ? new Date(leistungsdatum).toISOString().slice(0, 10) : null,
        kunde_name: kundeName,
        schadentyp: r.schadentyp ?? null,
        einzelpreis_netto: einzelNetto,
      }
    })
    const summeNetto = positionen.reduce((s, p) => s + p.einzelpreis_netto, 0)
    const ustBetrag = Math.round(((summeNetto * FINANCE.MWST_PROZENT) / 100) * 100) / 100
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
        faellig_am: faelligAmIso,
        status: 'versendet',
        versand_datum: new Date().toISOString(),
        notiz: `Monika-Embed Vermittlungsentgelt: ${positionen.length} faellige Termine (Variante B, auto-faellig nach Terminzeit).`,
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

    // Anfragen als abgerechnet markieren + abrechnung_sv_id einfrieren (Freeze zum
    // Pay-Zeitpunkt, Contract #2 — entkoppelt Billing von spaeterem embed_site-Wechsel).
    const ids = rows.map((r) => r.anfrage_id)
    await db
      .from('gutachter_finder_anfragen')
      .update({
        abrechnung_id: abr.id,
        abgerechnet_am: new Date().toISOString(),
        abrechnung_sv_id: svId,
      })
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
        faelligAm: faelligAm.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
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
