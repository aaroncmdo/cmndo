'use client'

// Realtime-Status-Pill für den ClaimStepper-Termin-Bereich.
// Spiegelt drei Zustände live aus gutachter_termine wider:
//   - besichtigung_gestartet_am gesetzt → "Besichtigung läuft" (emerald)
//   - sv_angekommen_am gesetzt, aber besichtigung nicht → "{SV-Vorname} ist da"
//   - kunde_angekommen_am gesetzt, aber besichtigung nicht → "{Kunde-Vorname} ist da"
//   - sonst nichts (Date/Time-Zeile spricht für sich)

import { useEffect, useState } from 'react'
import { CheckCircle2Icon, MapPinCheckIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  terminId: string
  svVorname?: string | null
  kundeVorname?: string | null
  /** Wird aufgerufen wenn sv_angekommen_am oder besichtigung_gestartet_am sich ändert. */
  onBesichtigungAktiv?: (aktiv: boolean) => void
}

type State = {
  besichtigungGestartetAm: string | null
  svAngekommenAm: string | null
  kundeAngekommenAm: string | null
}

export default function TerminLiveStatus({ terminId, svVorname, kundeVorname, onBesichtigungAktiv }: Props) {
  const [state, setState] = useState<State>({
    besichtigungGestartetAm: null,
    svAngekommenAm: null,
    kundeAngekommenAm: null,
  })

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    void supabase
      .from('gutachter_termine')
      .select('besichtigung_gestartet_am, sv_angekommen_am, kunde_angekommen_am')
      .eq('id', terminId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setState({
          besichtigungGestartetAm: (data.besichtigung_gestartet_am as string | null) ?? null,
          svAngekommenAm: (data.sv_angekommen_am as string | null) ?? null,
          kundeAngekommenAm: (data.kunde_angekommen_am as string | null) ?? null,
        })
      })
    const channel = supabase
      .channel(`termin-live-status-${terminId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gutachter_termine',
          filter: `id=eq.${terminId}`,
        },
        (payload) => {
          const row = payload.new as {
            besichtigung_gestartet_am: string | null
            sv_angekommen_am: string | null
            kunde_angekommen_am: string | null
          }
          setState({
            besichtigungGestartetAm: row.besichtigung_gestartet_am,
            svAngekommenAm: row.sv_angekommen_am,
            kundeAngekommenAm: row.kunde_angekommen_am,
          })
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [terminId])

  useEffect(() => {
    onBesichtigungAktiv?.(!!(state.besichtigungGestartetAm ?? state.svAngekommenAm))
  }, [state.besichtigungGestartetAm, state.svAngekommenAm, onBesichtigungAktiv])

  if (state.besichtigungGestartetAm) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-emerald-500" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Besichtigung läuft
      </span>
    )
  }

  if (state.svAngekommenAm) {
    const name = svVorname || 'Gutachter'
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
        <MapPinCheckIcon className="w-3.5 h-3.5" />
        {name} ist da
      </span>
    )
  }

  if (state.kundeAngekommenAm) {
    const name = kundeVorname || 'Kunde'
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
        <CheckCircle2Icon className="w-3.5 h-3.5" />
        {name} ist da
      </span>
    )
  }

  return null
}
