import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ClockIcon, CalendarIcon, UserIcon } from 'lucide-react'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

export default async function TageskalenderWidget() {
  const supabase = await createClient()
  // FIX (Dashboard-Metrik-Audit 06.07.): echte Berlin-Tagesgrenze statt new Date(y,m,d)
  // (= Server-lokal = UTC auf Vercel -> "heute" war am Tagesrand 1-2h schief; analog
  // dispatch/dashboard-Fix). berlinWallClockToUtc = etabliertes Helfer-Pattern.
  const berlinDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const todayStart = new Date(berlinWallClockToUtc(`${berlinDateStr}T00:00:00`)).toISOString()
  const todayEnd = new Date(berlinWallClockToUtc(`${berlinDateStr}T23:59:59`)).toISOString()

  // Alle Termine für heute
  const { data: termine } = await supabase
    .from('termine')
    .select('id, fall_id, typ, datum, dauer_minuten, betreff, status')
    .gte('datum', todayStart)
    .lte('datum', todayEnd)
    .order('datum')

  // KANONISCH (2026-07-07): SV-Termine aus gutachter_termine (assignee_id) statt stale
  // v_faelle_mit_aktuellem_termin.sv_termin. claim_nummer/kennzeichen via v_claim_full.
  const { data: svTermineRows } = await supabase
    .from('gutachter_termine')
    .select('fall_id, start_zeit, status')
    .eq('assignee_typ', 'sachverstaendiger')
    .in('status', ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt', 'gegenvorschlag'])
    .gte('start_zeit', todayStart)
    .lte('start_zeit', todayEnd)
    .order('start_zeit')
  const svFallIds = [...new Set((svTermineRows ?? []).map((r) => r.fall_id).filter(Boolean) as string[])]
  const svEnrich: Record<string, { claim_nummer: string | null; kennzeichen: string | null }> = {}
  if (svFallIds.length) {
    const { data: cf } = await supabase.from('v_claim_full').select('fall_id, claim_nummer, kennzeichen').in('fall_id', svFallIds)
    for (const c of (cf ?? []) as Array<{ fall_id: string; claim_nummer: string | null; kennzeichen: string | null }>) {
      svEnrich[c.fall_id] = { claim_nummer: c.claim_nummer ?? null, kennzeichen: c.kennzeichen ?? null }
    }
  }

  const events = [
    ...(svTermineRows ?? []).map(r => {
      const e = r.fall_id ? svEnrich[r.fall_id] : null
      return {
        id: `sv-${r.fall_id ?? r.start_zeit}`,
        zeit: new Date(r.start_zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
        titel: `SV-Termin: ${e?.claim_nummer ?? e?.kennzeichen ?? 'Fall'}`,
        typ: 'gutachter' as const,
        link: r.fall_id ? `/faelle/${r.fall_id}` : '/admin/kalender',
      }
    }),
    ...(termine ?? []).map(t => ({
      id: `t-${t.id}`,
      zeit: new Date(t.datum).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      titel: t.betreff ?? t.typ,
      typ: t.typ as 'telefonat' | 'video-call' | 'intern',
      link: t.fall_id ? `/faelle/${t.fall_id}` : '/admin/kalender',
    })),
  ].sort((a, b) => a.zeit.localeCompare(b.zeit))

  // Aktuelle Berlin-Uhrzeit in Minuten (fuer den "Jetzt"-Marker) — konsistent zur Berlin-Tagesgrenze.
  const berlinTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Berlin', hour12: false })
  const [berlinH, berlinM] = berlinTime.split(':').map(Number)
  const nowMinutes = berlinH * 60 + berlinM

  return (
    <div className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
      <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Dein Tag</h2>
        </div>
        <Link href="/admin/kalender" className="text-[10px] text-claimondo-ondo hover:underline">Kalender</Link>
      </div>

      {events.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-xs text-claimondo-ondo/70">Keine Termine heute</p>
        </div>
      ) : (
        <div className="divide-y divide-claimondo-border max-h-[300px] overflow-y-auto">
          {events.map(e => {
            const [h, m] = e.zeit.split(':').map(Number)
            const eventMin = h * 60 + m
            const isPast = eventMin < nowMinutes
            const isNow = Math.abs(eventMin - nowMinutes) < 30

            return (
              <Link key={e.id} href={e.link} className={`flex items-center gap-3 px-5 py-3 hover:bg-claimondo-bg transition-colors ${isPast && !isNow ? 'opacity-50' : ''}`}>
                <div className={`w-10 text-center font-mono text-sm font-semibold ${isNow ? 'text-claimondo-ondo' : 'text-claimondo-ondo'}`}>
                  {e.zeit}
                </div>
                {isNow && <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isNow ? 'font-semibold text-claimondo-navy' : 'text-claimondo-navy'}`}>{e.titel}</p>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                  e.typ === 'gutachter' ? 'bg-claimondo-bg text-claimondo-ondo' :
                  e.typ === 'telefonat' ? 'bg-amber-50 text-amber-600' :
                  e.typ === 'video-call' ? 'bg-green-50 text-green-600' :
                  'bg-claimondo-bg text-claimondo-ondo'
                }`}>
                  {e.typ === 'gutachter' ? 'SV' : e.typ === 'video-call' ? 'Video' : e.typ === 'telefonat' ? 'Tel.' : e.typ}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
