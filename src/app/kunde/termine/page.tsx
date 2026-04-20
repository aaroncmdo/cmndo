// AAR-639: Kunden-Termin-Übersicht. Zeigt alle gutachter_termine zu den
// Fällen dieses Kunden, gruppiert nach Status (kommend, bestätigt, historie).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarIcon, VideoIcon, HardHatIcon, PhoneIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  reserviert: 'Reserviert — wartet auf SV-Bestätigung',
  bestaetigt: 'Bestätigt',
  gegenvorschlag: 'Gegenvorschlag vom SV — Antwort nötig',
  abgelehnt: 'Abgelehnt',
  abgeschlossen: 'Durchgeführt',
}

const STATUS_BADGE: Record<string, string> = {
  reserviert: 'bg-amber-50 text-amber-700 border-amber-200',
  bestaetigt: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  gegenvorschlag: 'bg-amber-50 text-amber-700 border-amber-200',
  abgelehnt: 'bg-red-50 text-red-700 border-red-200',
  abgeschlossen: 'bg-gray-50 text-gray-600 border-gray-200',
}

export default async function KundeTermine() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Fälle des Kunden
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell')
    .eq('kunde_id', user.id)

  const fallIds = (faelle ?? []).map(f => f.id)
  const fallMap: Record<string, { id: string; fall_nummer: string | null; fahrzeug: string }> = {}
  for (const f of faelle ?? []) {
    fallMap[f.id] = {
      id: f.id,
      fall_nummer: f.fall_nummer,
      fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || f.kennzeichen || '—',
    }
  }

  type Row = {
    id: string
    start_zeit: string
    status: string
    typ: string | null
    kanal: string | null
    fall_id: string
    ablehnen_token: string | null
  }
  let termine: Row[] = []
  if (fallIds.length > 0) {
    const { data } = await supabase
      .from('gutachter_termine')
      .select('id, start_zeit, status, typ, kanal, fall_id, ablehnen_token')
      .in('fall_id', fallIds)
      .is('cancelled_at', null)
      .order('start_zeit', { ascending: false })
    termine = (data ?? []) as Row[]
  }

  const now = new Date()
  const kommend = termine.filter(t => new Date(t.start_zeit) >= now && t.status !== 'abgelehnt')
  const vergangen = termine.filter(t => new Date(t.start_zeit) < now || t.status === 'abgelehnt' || t.status === 'abgeschlossen')

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0D1B3E]">Meine Termine</h1>
        <p className="text-sm text-gray-500 mt-1">
          Alle Gutachter-Termine zu deinen Fällen.
        </p>
      </div>

      {termine.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <CalendarIcon className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Aktuell keine Termine geplant</p>
        </div>
      )}

      {kommend.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Kommend</h2>
          <div className="space-y-2">
            {kommend.map(t => <TerminCard key={t.id} t={t} fall={fallMap[t.fall_id]} />)}
          </div>
        </section>
      )}

      {vergangen.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Verlauf</h2>
          <div className="space-y-2 opacity-80">
            {vergangen.map(t => <TerminCard key={t.id} t={t} fall={fallMap[t.fall_id]} muted />)}
          </div>
        </section>
      )}
    </div>
  )
}

function TerminCard({
  t,
  fall,
  muted,
}: {
  t: {
    id: string
    start_zeit: string
    status: string
    typ: string | null
    kanal: string | null
    ablehnen_token: string | null
  }
  fall?: { id: string; fall_nummer: string | null; fahrzeug: string }
  muted?: boolean
}) {
  const isKb = t.typ === 'kb_beratung'
  const isVideo = t.kanal === 'video'
  const Icon = isKb ? VideoIcon : isVideo ? VideoIcon : HardHatIcon
  const start = new Date(t.start_zeit)
  const badgeCls = STATUS_BADGE[t.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  const statusLabel = STATUS_LABEL[t.status] ?? t.status

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-4 ${muted ? 'opacity-90' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#f0f4f8] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[#4573A2]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              {isKb ? 'Kunden-Beratung' : 'Gutachter-Termin'}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badgeCls}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
            {' · '}
            {start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </p>
          {fall && (
            <p className="text-xs text-gray-500 mt-0.5">
              Fall {fall.fall_nummer ?? fall.id.slice(0, 8)} · {fall.fahrzeug}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {fall && (
              <Link href={`/kunde/faelle/${fall.id}`} className="text-[#4573A2] hover:underline">
                Zum Fall →
              </Link>
            )}
            {t.status === 'bestaetigt' && !isKb && (
              <span className="text-gray-400">
                {isVideo ? <><VideoIcon className="w-3 h-3 inline" /> Video-Termin</> : <><PhoneIcon className="w-3 h-3 inline" /> Vor-Ort-Termin</>}
              </span>
            )}
            {t.ablehnen_token && t.status === 'reserviert' && (
              <Link href={`/kunde/termin/${t.ablehnen_token}`} className="text-amber-700 hover:underline">
                Termin verwalten →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
