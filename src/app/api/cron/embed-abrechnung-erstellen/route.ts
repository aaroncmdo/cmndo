import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'
import { EMBED_DESCRIPTOR } from '@/lib/abrechnung/descriptors/embed'
import { eurToCent } from '@/lib/billing/calculate-ust'

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
 * Refactored AAR-kanonische-abrechnung: Compute+Nummer+Header-Insert+Positionen-Insert+Mark
 * delegiert an createAbrechnung() + EMBED_DESCRIPTOR. Eligibility-Read + Send unveraendert.
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
  if (!assertCronAuth(request)) {
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

    // Positionen fuer createAbrechnung: betrag_netto_cent + alle Felder fuer buildPositionRow.
    const anfrageIds = rows.map((r) => r.anfrage_id)
    const positionen = rows.map((r, i) => {
      const einzelNetto = Number(r.betrag_netto ?? 70)
      const kundeName = [r.vorname, r.nachname].filter(Boolean).join(' ') || 'Anfrage'
      const leistungsdatum = r.termin_end_zeit ?? r.erstellt_am
      return {
        betrag_netto_cent: eurToCent(einzelNetto),
        position_nr: i + 1,
        anfrage_id: r.anfrage_id,
        termin_id: r.termin_id ?? null,
        embed_site_id: r.embed_site_id,
        site_name: r.site_name ?? null,
        datum: leistungsdatum ? new Date(leistungsdatum).toISOString().slice(0, 10) : null,
        kunde_name: kundeName,
        schadentyp: r.schadentyp ?? null,
      }
    })

    const summeNettoCent = positionen.reduce((s, p) => s + p.betrag_netto_cent, 0)
    if (summeNettoCent <= 0) continue

    const kontext: Record<string, unknown> = {
      sv_id: svId,
      sv_db_id: sv.id,
      empfaenger_email: profile.email,
      empfaenger_name: empfaengerName,
      jahr,
      monatPad,
      abrechnungs_zeitraum_start: monthStartDate,
      abrechnungs_zeitraum_ende: monthEndDate,
      faellig_am: faelligAmIso,
      versand_datum: now.toISOString(),
      anfrage_ids: anfrageIds,
    }

    // Compute + Nummer-Allokation + Header-Insert + Positionen-Insert + Markierung
    // delegiert an createAbrechnung() + EMBED_DESCRIPTOR.
    const result = await createAbrechnung(db, EMBED_DESCRIPTOR, { positionen, kontext })

    if (!result.ok) {
      console.error(`[AAR-939 embed-billing] SV ${svId}: createAbrechnung fehlgeschlagen:`, result.error)
      continue
    }
    if (!result.erstellt) {
      // Doppel-Rechnungs-Dedup: pruefeBestehend hat Nachverknuepfung erledigt.
      console.warn(`[AAR-939 embed-billing] SV ${svId}: bestehende Embed-Rechnung gefunden — ${anfrageIds.length} Anfrage(n) nachverknuepft (keine 2. Rechnung).`)
      continue
    }

    const { id: abrId, nummer: abrechnungsNr, betraege } = result

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
        betragBrutto: betraege.bruttoCent / 100,
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

    console.log(`[AAR-939 embed-billing] SV ${svId}: Rechnung ${abrechnungsNr} (${abrId}) erstellt, markiertOk=${result.markiertOk}`)
    created++
  }

  return NextResponse.json({ ok: true, created })
}
