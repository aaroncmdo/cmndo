'use client'

// AAR-384: Anfahrt-Card für den Kunden-Tracking-Flow. Drei Zustände:
//   1. Opt-In: "Ich fahre los" Button (Tracking-Consent)
//   2. Aktiv: Tracking läuft, zeigt ETA + Stop-Button
//   3. Ankunft: "Ich bin da" Button (stoppt Tracking, setzt angekommen)
//
// Nur zeigen wenn Termin NICHT beim Kunden zuhause stattfindet (Heuristik
// in termin-heuristik.ts, Entscheidung auf der Server-Seite).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CarIcon,
  CheckCircleIcon,
  Loader2Icon,
  MapPinIcon,
  XCircleIcon,
} from 'lucide-react'
import { startKundeTracking, stopKundeTracking } from './actions'
import { useKundeLivePosition } from './useKundeLivePosition'

interface Props {
  token: string
  terminId: string
  /** Server-Seite hat bereits festgestellt dass das Tracking Sinn ergibt. */
  initiallyAktiviert: boolean
  terminAdresse: string
  onAngekommen?: () => void
}

export default function KundeAnfahrtCard({
  token,
  terminId,
  initiallyAktiviert,
  terminAdresse,
  onAngekommen,
}: Props) {
  const [aktiviert, setAktiviert] = useState(initiallyAktiviert)
  const [isPending, startTransition] = useTransition()
  const [angekommen, setAngekommen] = useState(false)

  const { etaMinutes, permissionState, error } = useKundeLivePosition({
    enabled: aktiviert && !angekommen,
    token,
    terminId,
  })

  const handleStart = () => {
    startTransition(async () => {
      const res = await startKundeTracking(token, terminId)
      if (res.success) {
        setAktiviert(true)
        toast.success('Fahrt gestartet — viel Erfolg!')
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleAngekommen = () => {
    startTransition(async () => {
      const res = await stopKundeTracking(token, terminId, { angekommen: true })
      if (res.success) {
        setAngekommen(true)
        onAngekommen?.()
        toast.success('Ankunft bestätigt')
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleStop = () => {
    startTransition(async () => {
      const res = await stopKundeTracking(token, terminId)
      if (res.success) {
        setAktiviert(false)
        toast.success('Tracking beendet')
      } else {
        toast.error(res.error)
      }
    })
  }

  if (angekommen) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
        <CheckCircleIcon className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
        <p className="text-sm font-semibold text-emerald-900">Sie sind am Termin-Ort</p>
        <p className="text-xs text-emerald-800/80 mt-1">
          Ihr Sachverständiger wurde informiert.
        </p>
      </div>
    )
  }

  if (!aktiviert) {
    return (
      <div className="bg-white border border-claimondo-border rounded-2xl p-4">
        <div className="flex items-start gap-3 mb-3">
          <MapPinIcon className="w-5 h-5 text-[#4573A2] flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0D1B3E]">
              Fahren Sie zum Besichtigungsort?
            </p>
            <p className="text-xs text-claimondo-ondo mt-0.5">
              Teilen Sie Ihre Position mit dem Sachverständigen, damit er
              Ihre Ankunft sieht. Tracking endet mit dem Termin.
            </p>
            <p className="text-[11px] text-claimondo-ondo mt-1 truncate">
              Ziel: {terminAdresse}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleStart}
          disabled={isPending}
          className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[#0D1B3E] hover:bg-[#1A2A55] text-white text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <CarIcon className="w-4 h-4" />
          )}
          Ich fahre jetzt los
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#4573A2]/10 flex items-center justify-center">
          <CarIcon className="w-5 h-5 text-[#4573A2]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0D1B3E]">
            Sie sind auf dem Weg
          </p>
          <p className="text-xs text-claimondo-ondo">
            {etaMinutes != null
              ? `Ankunft in ca. ${etaMinutes} Minuten`
              : 'Position wird ermittelt…'}
          </p>
        </div>
      </div>

      {permissionState === 'denied' && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
          Standort-Zugriff verweigert — bitte in den Browser-Einstellungen
          erlauben, sonst kann Ihre Position nicht geteilt werden.
        </p>
      )}
      {error && permissionState !== 'denied' && (
        <p className="text-[11px] text-red-700 bg-red-50 rounded-lg px-2 py-1.5">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleStop}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-claimondo-border text-claimondo-navy text-xs font-medium disabled:opacity-50"
        >
          <XCircleIcon className="w-3.5 h-3.5" />
          Abbrechen
        </button>
        <button
          type="button"
          onClick={handleAngekommen}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
        >
          {isPending ? (
            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircleIcon className="w-3.5 h-3.5" />
          )}
          Ich bin da
        </button>
      </div>
    </div>
  )
}
