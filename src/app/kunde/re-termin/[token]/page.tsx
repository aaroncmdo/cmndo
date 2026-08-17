// CMM-40 + AAR-900: Public Re-Termin-Booking-Page.
//
// Zugang per Token-FlowLink aus CMM-39 (meldeNoShow setzt re_termin_token,
// schickt /kunde/re-termin/{token} per WA + Email). Kunde waehlt einen
// neuen Slot, Server-Action insertet einen gutachter_termine-Eintrag mit
// status='reserviert' und entwertet den Token.
//
// AAR-900 (14.05.2026): Slot-Picker-UI durch Shared-Component TerminPicker
// ersetzt. Slot-Grid kommt aus src/lib/termine/slot-grid.ts.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSlotGrid, DEFAULT_HORIZON_DAYS } from '@/lib/termine/slot-grid'
import ReTerminPickerWrapper from './ReTerminPickerWrapper'
import { waehleReTerminSlot } from './actions'
// P3.3: bezug-aware Termin-Filter (matcht Legacy claim_id UND bezug_typ+bezug_id).
import { bezugOrExpr } from '@/lib/termine/bezug-filter'

export const dynamic = 'force-dynamic'

export default async function ReTerminPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) notFound()

  const db = createAdminClient()

  // Token-Validierung: Fall mit aktivem Re-Termin-Token, nicht storniert
  // CMM-44 SP-A2 (Cluster 1): schadenort_ort aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-D PR2a: re_termin_token_eingelaufen_am aus gutachter_termine (aktueller Termin, SSoT).
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
  if (!tok?.fall_id) notFound()
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat, faelle-frei). vcf.id=claim_id (Flip),
  // vcf.fall_id=faelle.id; sv_id/lead_id/kennzeichen/schadenort_ort/claim_nummer div=0.
  const { data: fallRow } = await db
    .from('v_claim_full')
    .select('id, sv_id, lead_id, kennzeichen, schadenort_ort, claim_nummer')
    .eq('fall_id', tok.fall_id)
    .single()

  if (!fallRow) notFound()
  const fall = {
    claim_id: fallRow.id,
    sv_id: fallRow.sv_id,
    lead_id: fallRow.lead_id,
    kennzeichen: fallRow.kennzeichen,
  }
  const fallClaim = { claim_nummer: fallRow.claim_nummer, schadenort_ort: fallRow.schadenort_ort }
  // CMM-44 SP-H PR2: storniert_am lebt auf auftraege (aktueller Auftrag) — by claim_id (vcf.id).
  // Pre-launch <=1 Auftrag pro Claim (live: 0 Claims mit >1 Auftrag).
  const { data: aktAuftrag } = await db
    .from('auftraege')
    .select('storniert_am')
    .eq('claim_id', fallRow.id)
    .limit(1)
    .maybeSingle()
  if (aktAuftrag?.storniert_am) notFound()

  let aktTerminRePage: { re_termin_token_eingelaufen_am: string | null } | null = null
  if (fall.claim_id) {
    // P3.3-Boy-Scout: bezug-aware. Mit `.eq('claim_id')` blieb `aktTerminRePage` bei
    // bezug-nativen Terminen null -> `eingeloest` false -> der Kunde bekam den Picker
    // statt der Bestaetigung, obwohl der Token schon eingeloest war.
    const { data: at } = await db
      .from('gutachter_termine')
      .select('re_termin_token_eingelaufen_am')
      .or(bezugOrExpr('claim', fall.claim_id))
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminRePage = at
  }

  // Bereits eingeloest? → Bestaetigungs-View statt Picker
  const eingeloest = aktTerminRePage?.re_termin_token_eingelaufen_am != null

  if (eingeloest) {
    return <Bestaetigung fallNummer={(fallClaim?.claim_nummer as string | null) ?? null} />
  }

  if (!fall.sv_id) notFound()

  // Lead-Vorname fuer Begruessung
  let vorname: string | null = null
  if (fall.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname').eq('id', fall.lead_id).single()
    vorname = (lead?.vorname as string | null) ?? null
  }

  // SV-Termine im 14-Tage-Fenster fuer Konflikt-Check
  const windowStart = new Date()
  const windowEnd = new Date()
  windowEnd.setDate(windowEnd.getDate() + DEFAULT_HORIZON_DAYS + 2)

  const { data: konflikte } = await db
    .from('gutachter_termine')
    // CMM-49 (sv_id-Drop): assignee_id+typ statt sv_id (value-identisch für SV-Termine).
    .select('start_zeit, end_zeit')
    .eq('assignee_id', fall.sv_id)
    .eq('assignee_typ', 'sachverstaendiger')
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', windowStart.toISOString())
    .lte('start_zeit', windowEnd.toISOString())

  const slots = buildSlotGrid(konflikte ?? [])

  return (
    <main className="min-h-screen bg-claimondo-bg px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <ReTerminPickerWrapper
          token={token}
          vorname={vorname}
          kennzeichen={(fall.kennzeichen as string | null) ?? null}
          schadensOrt={(fallClaim?.schadenort_ort as string | null) ?? null}
          slots={slots}
          onSubmit={waehleReTerminSlot}
        />
      </div>
    </main>
  )
}

function Bestaetigung({ fallNummer }: { fallNummer: string | null }) {
  return (
    <main className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl border border-claimondo-border p-6 max-w-md w-full text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-success-soft flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-claimondo-navy mb-1">Termin angefragt</h1>
        <p className="text-sm text-claimondo-ondo">
          {fallNummer ? `Fall ${fallNummer}: ` : ''}
          Dein Vorschlag ist beim Sachverständigen eingegangen. Du bekommst eine Bestätigung sobald er den Termin annimmt.
        </p>
      </div>
    </main>
  )
}
