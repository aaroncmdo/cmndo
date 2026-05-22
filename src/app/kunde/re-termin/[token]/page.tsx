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

export const dynamic = 'force-dynamic'

export default async function ReTerminPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) notFound()

  const db = createAdminClient()

  // Token-Validierung: Fall mit aktivem Re-Termin-Token, nicht storniert
  // CMM-44 SP-A2 (Cluster 1): schadenort_ort aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-D PR2a: re_termin_token_eingelaufen_am aus gutachter_termine (aktueller Termin, SSoT).
  // re_termin_token verbleibt auf faelle fuer die Token-Suche.
  // CMM-44 SP-H PR2: storniert_am lebt auf auftraege (aktueller Auftrag) — via
  // Nested-Embed unter claims. Pre-launch <=1 Auftrag pro Claim.
  const { data: fall } = await db
    .from('faelle')
    .select('id, sv_id, lead_id, kennzeichen, claim_id, claims:claim_id(schadenort_ort, claim_nummer, auftraege(storniert_am))')
    .eq('re_termin_token', token)
    .single()

  if (!fall) notFound()
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const fallAuftraege = Array.isArray(
    (fallClaim as { auftraege?: unknown } | null)?.auftraege,
  )
    ? ((fallClaim as { auftraege: unknown[] }).auftraege)
    : ((fallClaim as { auftraege?: unknown } | null)?.auftraege
        ? [(fallClaim as { auftraege: unknown }).auftraege]
        : [])
  const aktAuftrag =
    (fallAuftraege[0] as { storniert_am?: string | null } | undefined) ?? null
  if (aktAuftrag?.storniert_am) notFound()

  let aktTerminRePage: { re_termin_token_eingelaufen_am: string | null } | null = null
  if (fall.claim_id) {
    const { data: at } = await db
      .from('gutachter_termine')
      .select('re_termin_token_eingelaufen_am')
      .eq('claim_id', fall.claim_id)
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
    .select('start_zeit, end_zeit')
    .eq('sv_id', fall.sv_id)
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
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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
