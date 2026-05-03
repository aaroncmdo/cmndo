'use client'

// CMM-36: Kunden-seitiger Live-Banner für SV-Anfahrt + Vor-Ort-Status.
// Stilistisch identisch zum SvUnterwegsInfo des SV-Portals (navy/Navigation),
// abonniert via Supabase-Realtime den zugehörigen gutachter_termine-Datensatz
// und zeigt sich nur wenn sv_unterwegs_seit gesetzt ist und der Termin noch
// nicht durchgeführt wurde.

import { useEffect, useState } from 'react'
import { NavigationIcon, MapPinCheckIcon, FileTextIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  terminId: string
  svName: string | null
  /** Gutachten ist hochgeladen, QC läuft. */
  gutachtenHochgeladen?: boolean
  /** QC freigegeben — Banner verschwindet, ClaimStepper wechselt auf Regulierung. */
  qcFreigegeben?: boolean
  /** KB hat Nachbesserung gefordert — Banner-Text wechselt auf „wird überarbeitet". */
  inUeberarbeitung?: boolean
  initial: {
    sv_unterwegs_seit: string | null
    sv_angekommen_am: string | null
    sv_eta_minuten: number | null
    durchgefuehrt_am: string | null
  }
}

export default function KundeSvLiveBanner({ terminId, svName, gutachtenHochgeladen, qcFreigegeben, inUeberarbeitung, initial }: Props) {
  const [state, setState] = useState(initial)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`kunde-live-${terminId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gutachter_termine', filter: `id=eq.${terminId}` },
        (payload) => {
          const row = payload.new as {
            sv_unterwegs_seit: string | null
            sv_angekommen_am: string | null
            sv_eta_minuten: number | null
            durchgefuehrt_am: string | null
          }
          setState({
            sv_unterwegs_seit: row.sv_unterwegs_seit,
            sv_angekommen_am: row.sv_angekommen_am,
            sv_eta_minuten: row.sv_eta_minuten,
            durchgefuehrt_am: row.durchgefuehrt_am,
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [terminId])

  // QC freigegeben — Banner verschwindet, ClaimStepper übernimmt (Regulierung).
  if (qcFreigegeben) return null

  // Gar nichts gestartet → kein Banner.
  if (!state.sv_unterwegs_seit && !state.sv_angekommen_am && !state.durchgefuehrt_am) return null

  const vorname = svName ? svName.split(' ')[0] : 'Ihr Gutachter'

  // Gutachten hochgeladen, QC läuft.
  if (gutachtenHochgeladen) {
    const titel = inUeberarbeitung ? 'Gutachten wird überarbeitet' : 'Qualitätsprüfung & Kanzlei-Übergabe'
    const sub = inUeberarbeitung ? '· Wir warten auf die korrigierte Version' : '· Ihr Gutachten wird geprüft'
    return (
      <div className="rounded-2xl bg-amber-500 text-white px-4 py-3 flex items-center gap-3">
        <FileTextIcon className="w-4 h-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{titel}</span>
          <span className="text-sm text-amber-50 ml-2">{sub}</span>
        </div>
      </div>
    )
  }

  // Termin durchgeführt, Gutachten noch nicht da → gelber „Gutachten wird erstellt"-Status.
  if (state.durchgefuehrt_am) {
    return (
      <div className="rounded-2xl bg-amber-500 text-white px-4 py-3 flex items-center gap-3">
        <FileTextIcon className="w-4 h-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">Gutachten wird erstellt</span>
          <span className="text-sm text-amber-50 ml-2">· {vorname} arbeitet daran</span>
        </div>
      </div>
    )
  }

  if (state.sv_angekommen_am) {
    return (
      <div className="rounded-2xl bg-emerald-600 text-white px-4 py-3 flex items-center gap-3">
        <MapPinCheckIcon className="w-4 h-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{vorname} ist vor Ort</span>
          <span className="text-sm text-emerald-100 ml-2">· Begutachtung läuft</span>
        </div>
      </div>
    )
  }

  const eta = state.sv_eta_minuten
  const ankunftIso =
    eta != null ? new Date(Date.now() + eta * 60_000) : null
  const ankunftLabel = ankunftIso
    ? ankunftIso.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="rounded-2xl bg-claimondo-navy text-white px-4 py-3 flex items-center gap-3">
      <NavigationIcon className="w-4 h-4 shrink-0 text-[#7BA3CC]" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold">{vorname} ist unterwegs</span>
        {ankunftLabel && (
          <span className="text-sm text-[#7BA3CC] ml-2">
            · Ankunft ca. {ankunftLabel}
            {eta != null && ` (${eta} Min.)`}
          </span>
        )}
      </div>
    </div>
  )
}
