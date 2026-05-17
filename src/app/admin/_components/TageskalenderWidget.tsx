import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ClockIcon, CalendarIcon, UserIcon } from 'lucide-react'

export default async function TageskalenderWidget() {
  const supabase = await createClient()
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()

  // Alle Termine für heute
  const [{ data: termine }, { data: svTermine }] = await Promise.all([
    supabase
      .from('termine')
      .select('id, fall_id, typ, datum, dauer_minuten, betreff, status')
      .gte('datum', todayStart)
      .lte('datum', todayEnd)
      .order('datum'),
    supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id, claim_nummer, sv_termin, kennzeichen')
      .gte('sv_termin', todayStart)
      .lte('sv_termin', todayEnd)
      .order('sv_termin'),
  ])

  const events = [
    ...(svTermine ?? []).map(f => ({
      id: `sv-${f.id}`,
      zeit: new Date(f.sv_termin!).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      titel: `SV-Termin: ${f.claim_nummer ?? f.kennzeichen ?? 'Fall'}`,
      typ: 'gutachter' as const,
      link: `/faelle/${f.id}`,
    })),
    ...(termine ?? []).map(t => ({
      id: `t-${t.id}`,
      zeit: new Date(t.datum).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
      titel: t.betreff ?? t.typ,
      typ: t.typ as 'telefonat' | 'video-call' | 'intern',
      link: t.fall_id ? `/faelle/${t.fall_id}` : '/admin/kalender',
    })),
  ].sort((a, b) => a.zeit.localeCompare(b.zeit))

  const nowMinutes = today.getHours() * 60 + today.getMinutes()

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
