// CMM-40: Public Re-Termin-Booking-Page.
//
// Zugang per Token-FlowLink aus CMM-39 (meldeNoShow setzt re_termin_token,
// schickt /kunde/re-termin/{token} per WA + Email). Kunde waehlt einen
// neuen Slot, Server-Action insertet einen gutachter_termine-Eintrag mit
// status='reserviert' und entwertet den Token. Der no-show-timeout-Cron
// skipt den Storno wenn re_termin_token_eingelaufen_am gesetzt ist.

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import ReTerminPickerClient from './ReTerminPickerClient'
import { waehleReTerminSlot } from './actions'

export const dynamic = 'force-dynamic'

const SLOT_HOURS = [9, 11, 13, 15] as const
const SLOT_DURATION_H = 1
const HORIZON_DAYS = 14

type SlotInfo = {
  /** ISO-String, lokale Zeit ohne TZ-Suffix */
  startIso: string
  /** Lesbarer Tag-Header z.B. "Mo, 06.05." */
  tagLabel: string
  /** Stunden-Label z.B. "09:00" */
  zeitLabel: string
  /** True wenn freier Slot, false wenn SV bereits gebucht ist */
  available: boolean
  /** ISO date YYYY-MM-DD fuer Group-by-Tag */
  dateKey: string
}

function formatTagLabel(d: Date): string {
  const wt = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${wt}, ${dd}.${mm}.`
}

function nextWeekdays(count: number): Date[] {
  const result: Date[] = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() + 1)
  while (result.length < count) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) {
      result.push(new Date(cursor))
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

export default async function ReTerminPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) notFound()

  const db = createAdminClient()

  // Token-Validierung: Fall mit aktivem Re-Termin-Token, nicht storniert
  const { data: fall } = await db
    .from('faelle')
    .select('id, fall_nummer, sv_id, lead_id, re_termin_token_eingelaufen_am, storniert_am, kennzeichen, schadens_ort')
    .eq('re_termin_token', token)
    .single()

  if (!fall || fall.storniert_am) notFound()

  // Bereits eingeloest? → Bestaetigungs-View statt Picker
  const eingeloest = fall.re_termin_token_eingelaufen_am != null

  if (eingeloest) {
    return <Bestaetigung fallNummer={fall.fall_nummer ?? null} />
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
  windowEnd.setDate(windowEnd.getDate() + HORIZON_DAYS + 2)

  const { data: konflikte } = await db
    .from('gutachter_termine')
    .select('start_zeit, end_zeit')
    .eq('sv_id', fall.sv_id)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', windowStart.toISOString())
    .lte('start_zeit', windowEnd.toISOString())

  // Slot-Grid bauen (HORIZON_DAYS Werktage × SLOT_HOURS)
  const tage = nextWeekdays(HORIZON_DAYS)
  const slots: SlotInfo[] = []
  for (const tag of tage) {
    for (const h of SLOT_HOURS) {
      const start = new Date(tag)
      start.setHours(h, 0, 0, 0)
      const end = new Date(start)
      end.setHours(h + SLOT_DURATION_H)

      // Konflikt-Check: ueberlappt der Slot mit einem existierenden Termin?
      const startMs = start.getTime()
      const endMs = end.getTime()
      const conflict = (konflikte ?? []).some((k: { start_zeit: string | null; end_zeit: string | null }) => {
        if (!k.start_zeit || !k.end_zeit) return false
        const kStart = new Date(k.start_zeit).getTime()
        const kEnd = new Date(k.end_zeit).getTime()
        return kStart < endMs && kEnd > startMs
      })

      const dateKey = `${tag.getFullYear()}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`

      slots.push({
        startIso: start.toISOString(),
        tagLabel: formatTagLabel(tag),
        zeitLabel: `${String(h).padStart(2, '0')}:00`,
        available: !conflict,
        dateKey,
      })
    }
  }

  return (
    <ReTerminPickerClient
      token={token}
      vorname={vorname}
      kennzeichen={(fall.kennzeichen as string | null) ?? null}
      schadensOrt={(fall.schadens_ort as string | null) ?? null}
      slots={slots}
      onSubmit={waehleReTerminSlot}
    />
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
