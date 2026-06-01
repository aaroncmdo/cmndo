'use client'

// AAR-939 — Kunde-Selbstauskunft "Kam dein Gutachter?" fuer nur_gutachter/embed-B.
//
// Erscheint im Kunde-Fall-Detail, wenn ein nur_gutachter-Termin ueberfaellig ist
// und weder als durchgefuehrt noch als No-Show/Ablehnung geklaert wurde (Gating
// server-seitig in page.tsx). Zwei Aktionen:
//   • Ja  → bestaetigeTerminAlsKunde       → Claim wird terminal geschlossen
//   • Nein → meldeSvNichtErschienenAlsKunde → Dispatcher-Klaerungs-Task (Verlegung)
//
// Nach dem Klick router.refresh() → das server-seitige Gating greift neu und der
// Banner verschwindet (durchgefuehrt_am gesetzt bzw. offener Klaerungs-Task).
// Buttons aus primitives.Button: variant 'success'/'ghost' sind semantisch bzw.
// brand-getoent — kein Whitelabel-Regress (keine inline Brand-Primaerfarbe).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClockIcon, CheckCircle2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import {
  bestaetigeTerminAlsKunde,
  meldeSvNichtErschienenAlsKunde,
} from '@/lib/termine/kunde-termin-resolution'

type Props = {
  terminId: string
  /** Vorname des Gutachters (Anonymitaet — nur Vorname). */
  svVorname?: string | null
  /** Optionales Termin-Label, z.B. "Mittwoch, 28.05. um 14:00". */
  terminLabel?: string | null
}

export default function KundeTerminCheckBanner({ terminId, svVorname, terminLabel }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState<null | 'ja' | 'nein'>(null)
  const [erledigt, setErledigt] = useState<null | 'ja' | 'nein'>(null)

  const gutachter = svVorname?.trim() ? svVorname.trim() : 'Ihr Gutachter'

  async function handle(antwort: 'ja' | 'nein') {
    setPending(antwort)
    const res =
      antwort === 'ja'
        ? await bestaetigeTerminAlsKunde(terminId)
        : await meldeSvNichtErschienenAlsKunde(terminId)
    setPending(null)
    if (!res.ok) {
      toast.error(res.error ?? 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.')
      return
    }
    setErledigt(antwort)
    router.refresh()
  }

  if (erledigt === 'ja') {
    return (
      <div className="rounded-ios-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
        <CheckCircle2Icon className="w-5 h-5 shrink-0 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-900">
          Danke! Wir haben den Termin als durchgeführt vermerkt.
        </p>
      </div>
    )
  }

  if (erledigt === 'nein') {
    return (
      <div className="rounded-ios-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
        <CalendarClockIcon className="w-5 h-5 shrink-0 text-amber-600" />
        <p className="text-sm font-medium text-amber-900">
          Danke für die Rückmeldung. Wir kümmern uns um einen neuen Termin und melden uns bei Ihnen.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-ios-xl bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 px-4 py-4">
      <div className="flex items-start gap-3">
        <CalendarClockIcon className="w-5 h-5 shrink-0 text-claimondo-navy mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-claimondo-navy">
            Kam {gutachter} zum Termin?
          </p>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            {terminLabel ? `Ihr Termin (${terminLabel}) ist vorbei. ` : ''}
            Bitte bestätigen Sie kurz — so können wir Ihren Fall richtig weiterbearbeiten.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button
          variant="success"
          size="sm"
          onClick={() => handle('ja')}
          loading={pending === 'ja'}
          disabled={pending !== null}
        >
          Ja, war da
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handle('nein')}
          loading={pending === 'nein'}
          disabled={pending !== null}
        >
          Nein, kam nicht
        </Button>
      </div>
    </div>
  )
}
