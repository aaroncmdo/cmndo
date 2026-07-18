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
import { subscribeWhenAuthed } from '@/lib/supabase/realtime-gate'

type Props = {
  terminId: string
  svVorname?: string | null
  kundeVorname?: string | null
}

type State = {
  besichtigungGestartetAm: string | null
  svAngekommenAm: string | null
  kundeAngekommenAm: string | null
}

export default function TerminLiveStatus({ terminId, svVorname, kundeVorname }: Props) {
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
    const cleanupChannel = subscribeWhenAuthed(supabase, () =>
      supabase
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
        ),
    )
    return () => {
      cancelled = true
      cleanupChannel()
    }
  }, [terminId])

  if (state.besichtigungGestartetAm) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft border border-success/30 px-3 py-1 text-xs font-semibold text-success-strong">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-success" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        Besichtigung läuft
      </span>
    )
  }

  if (state.svAngekommenAm) {
    const name = svVorname || 'Gutachter'
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft border border-success/30 px-3 py-1 text-xs font-semibold text-success-strong">
        <MapPinCheckIcon className="w-3.5 h-3.5" />
        {name} ist da
      </span>
    )
  }

  if (state.kundeAngekommenAm) {
    const name = kundeVorname || 'Kunde'
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft border border-warning/30 px-3 py-1 text-xs font-semibold text-warning-strong">
        <CheckCircle2Icon className="w-3.5 h-3.5" />
        {name} ist da
      </span>
    )
  }

  return null
}
