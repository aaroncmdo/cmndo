'use server'

// CMM-40: Server-Action fuer den Re-Termin-Slot-Pick.
//
// Ablauf:
//   1. Token validieren (Fall existiert, Token noch aktiv, nicht storniert)
//   2. Slot-Konflikt-Check (race-safe: SV koennte zwischen Page-Render und
//      Submit einen Termin gebucht haben)
//   3. Insert gutachter_termine status='reserviert' (kunde-vorgeschlag)
//   4. Update faelle.re_termin_token_eingelaufen_am = now() — entwertet den
//      Token + signalisiert dem no-show-timeout-Cron, NICHT zu stornieren
//   5. Result-Pattern { ok, error? }

import { createAdminClient } from '@/lib/supabase/admin'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { pruefeBelegungStrict } from '@/lib/termine/engine'
import { revalidatePath } from 'next/cache'
// P3.3: bezug-aware Termin-Filter (matcht Legacy claim_id UND bezug_typ+bezug_id).
import { bezugOrExpr } from '@/lib/termine/bezug-filter'

const SLOT_DURATION_H = 1

export async function waehleReTerminSlot(
  token: string,
  slotStartIso: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!token || !slotStartIso) {
    return { ok: false, error: 'Ungueltige Anfrage' }
  }

  const start = new Date(slotStartIso)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: 'Ungueltiger Termin' }
  }
  // Slot darf nicht in der Vergangenheit liegen
  if (start.getTime() < Date.now()) {
    return { ok: false, error: 'Termin liegt in der Vergangenheit' }
  }

  const end = new Date(start)
  end.setHours(end.getHours() + SLOT_DURATION_H)

  const db = createAdminClient()

  // CMM-49 Option A: Token-Lookup via gutachter_termine.re_termin_token (CMM-44 SP-D SSoT;
  // live-grün faelle_only_tok=0/unique) -> faelle.re_termin_token wird droppbar.
  // CMM-44 SP-H PR2: storniert_am lebt auf auftraege (aktueller Auftrag) — via
  // Nested-Embed unter claims. Pre-launch <=1 Auftrag pro Claim.
  const { data: tok } = await db
    .from('gutachter_termine')
    .select('fall_id')
    .eq('re_termin_token', token)
    .limit(1)
    .maybeSingle()
  if (!tok?.fall_id) return { ok: false, error: 'Token nicht gefunden' }
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat, faelle-frei). vcf.id=claim_id (Flip),
  // vcf.fall_id=faelle.id; sv_id/lead_id div=0.
  const { data: fallRow } = await db
    .from('v_claim_full')
    .select('id, fall_id, sv_id, lead_id')
    .eq('fall_id', tok.fall_id)
    .single()

  if (!fallRow) return { ok: false, error: 'Token nicht gefunden' }
  const fall = { id: fallRow.fall_id as string, claim_id: fallRow.id, sv_id: fallRow.sv_id, lead_id: fallRow.lead_id }
  // CMM-44 SP-H PR2: storniert_am lebt auf auftraege (aktueller Auftrag) — by claim_id (vcf.id).
  // Pre-launch <=1 Auftrag pro Claim (live: 0 Claims mit >1 Auftrag).
  const { data: aktAuftrag } = await db
    .from('auftraege')
    .select('storniert_am')
    .eq('claim_id', fallRow.id)
    .limit(1)
    .maybeSingle()
  if (aktAuftrag?.storniert_am) return { ok: false, error: 'Fall wurde storniert' }

  let aktTerminReTermin: { re_termin_token_eingelaufen_am: string | null } | null = null
  if (fall.claim_id) {
    // P3.3-Boy-Scout: bezug-aware. Mit `.eq('claim_id')` griff der Guard unten bei
    // bezug-nativen Terminen NICHT -> ein bereits eingeloester Re-Termin-Token liess
    // sich erneut verwenden (Doppel-Verschiebung).
    const { data: at } = await db
      .from('gutachter_termine')
      .select('re_termin_token_eingelaufen_am')
      .or(bezugOrExpr('claim', fall.claim_id))
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminReTermin = at
  }

  if (aktTerminReTermin?.re_termin_token_eingelaufen_am) return { ok: false, error: 'Termin wurde bereits ausgewaehlt' }
  if (!fall.sv_id) return { ok: false, error: 'Kein Sachverstaendiger zugewiesen' }

  // Race-safe, fail-CLOSED Verfuegbarkeits-Check gegen v_belegung (Buchung ∪ externer CalDAV-Kalender
  // ∪ Urlaub/Sperre) statt des frueheren gutachter_termine-only-Reads (fail-open + CalDAV/Urlaub-blind).
  // Der Kunde waehlt zwar aus freieSlots-geprueften Slots — dieser Recheck schliesst das TOCTOU-Fenster
  // (SV traegt zwischen Page-Render und Submit ein CalDAV-Event/Urlaub ein). db = Admin-Client
  // (v_belegung ist service-role-only).
  const belegung = await pruefeBelegungStrict(
    { typ: 'sachverstaendiger', id: fall.sv_id as string },
    start.toISOString(),
    end.toISOString(),
    db,
  )
  if (!belegung.ok) {
    return { ok: false, error: 'Verfügbarkeit konnte nicht geprüft werden — bitte erneut versuchen.' }
  }
  if (!belegung.frei) {
    return { ok: false, error: 'Dieser Slot ist nicht mehr verfügbar — bitte einen anderen wählen.' }
  }

  // Insert: kunde-vorgeschlagener Termin als 'reserviert'. SV bestaetigt
  // ueber sein Portal — dann wird daraus 'bestaetigt'.
  // CMM-49 (sv_id-Drop) Phase B: assignee_id/assignee_typ direkt geschrieben statt sv_id.
  const { data: inserted, error: insertErr } = await db.from('gutachter_termine').insert({
    fall_id: fall.id,
    claim_id: fall.claim_id,
    assignee_id: fall.sv_id,
    assignee_typ: 'sachverstaendiger',
    start_zeit: start.toISOString(),
    end_zeit: end.toISOString(),
    status: 'reserviert',
    // AAR-939 6b: typ muss gutachter_termine_typ_check erfuellen
    // (sv_begutachtung|kb_beratung|konfrontation). 'besichtigung' war ungueltig →
    // jeder Re-Termin-Pick scheiterte am Insert (Latent-Bug, vom 6b-Smoke gefunden).
    typ: 'sv_begutachtung',
  }).select('id').single()

  if (insertErr) {
    // 23P01 = Exclusion-Constraint: SV in der TOCTOU-Luecke anderweitig verplant.
    if (insertErr.code === '23P01') {
      return { ok: false, error: 'Dieser Slot wurde gerade vergeben — bitte einen anderen wählen.' }
    }
    return { ok: false, error: insertErr.message }
  }

  // 2026-05-06: SV-Termin direkt in Google- + CalDAV-Kalender. Status
  // reserviert wird auch gesynct, damit der SV den Vorschlag im Kalender
  // sieht. Non-critical, parallel.
  if (inserted?.id) {
    const tid = inserted.id as string
    const fid = fall.id as string
    await Promise.all([
      (async () => {
        try {
          const { syncSvTerminToGoogle } = await import('@/lib/google-calendar/sv-termin-sync')
          await syncSvTerminToGoogle(tid, fid)
        } catch (err) {
          console.error('[sv-termin-sync] Google Re-Termin-Slot:', err)
        }
      })(),
      (async () => {
        try {
          const { syncSvTerminToCalDav } = await import('@/lib/kalender/caldav/sv-termin-sync')
          await syncSvTerminToCalDav(tid, fid)
        } catch (err) {
          console.error('[sv-termin-sync] CalDAV Re-Termin-Slot:', err)
        }
      })(),
      (async () => {
        try {
          const { syncSvTerminToOutlook } = await import('@/lib/microsoft/sv-termin-sync')
          await syncSvTerminToOutlook(tid, fid)
        } catch (err) {
          console.error('[sv-termin-sync] Outlook Re-Termin-Slot:', err)
        }
      })(),
    ])
  }

  // CMM-44 SP-D PR2b: re_termin_token_eingelaufen_am → gutachter_termine (aktueller Termin, SSoT).
  // Der neue Slot wurde gerade als `inserted` eingefuegt — er ist jetzt der aktuelle Termin.
  // Schreibe re_termin_token_eingelaufen_am direkt auf ihn.
  if (inserted?.id) {
    const { error: updateErr } = await db
      .from('gutachter_termine')
      .update({ re_termin_token_eingelaufen_am: new Date().toISOString() })
      .eq('id', inserted.id as string)
    if (updateErr) {
      console.error('[CMM-40] Token-Entwertung fehlgeschlagen:', updateErr.message)
    }
  } else {
    // Fallback: aktueller Termin per claim_id auflosen
    if (fall.claim_id) {
      // P3.3-Boy-Scout: bezug-aware. Sonst fand der Fallback bei bezug-nativen Terminen
      // keine Zeile -> der Token wurde NICHT entwertet und blieb wiederverwendbar.
      const { data: t } = await db.from('gutachter_termine').select('id')
        .or(bezugOrExpr('claim', fall.claim_id))
        .order('start_zeit', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (t?.id) {
        await db.from('gutachter_termine')
          .update({ re_termin_token_eingelaufen_am: new Date().toISOString() })
          .eq('id', t.id)
      }
    }
  }

  // Timeline-Eintrag fuer KB-Sicht
  try {
    await db.from('timeline').insert({
      fall_id: fall.id,
      typ: 'termin',
      titel: 'Re-Termin durch Kunde vorgeschlagen',
      beschreibung: `Neuer Slot: ${start.toLocaleString('de-DE')}. Wartet auf SV-Bestaetigung.`,
      erstellt_von: null,
    })
  } catch (err) {
    console.error('[CMM-40] Timeline-Insert fehlgeschlagen (non-critical):', err)
  }

  // CMM-41: SV-Mitteilung — der SV soll im Portal sehen, dass ein neuer
  // Slot-Vorschlag eingetroffen ist. Non-critical: Mitteilungs-Fehler darf
  // den Slot-Pick nicht abbrechen.
  try {
    const { data: lead } = fall.lead_id != null
      ? await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id as string).single()
      : { data: null }
    const { createGutachterMitteilung } = await import('@/lib/mitteilungen')
    const datum = formatBerlin(start.toISOString(), { day: '2-digit', month: '2-digit', year: 'numeric' })
    const uhrzeit = formatBerlin(start.toISOString(), { hour: '2-digit', minute: '2-digit' })
    const kundeName = lead
      ? `${(lead.vorname as string | null) ?? ''} ${(lead.nachname as string | null) ?? ''}`.trim() || 'Kunde'
      : 'Kunde'
    await createGutachterMitteilung(fall.sv_id as string, 're_termin_kundenwahl', fall.id as string, {
      kunde_name: kundeName,
      datum,
      uhrzeit,
    })
  } catch (err) {
    console.error('[CMM-41] SV-Mitteilung fehlgeschlagen (non-critical):', err)
  }

  revalidatePath(`/faelle/${fall.id}`)
  revalidatePath(`/gutachter/fall/${fall.id}`)

  return { ok: true }
}
