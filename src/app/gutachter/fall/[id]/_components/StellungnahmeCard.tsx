'use client'

// AAR-294: Conditional StellungnahmeCard. DB-Felder verifiziert:
// technische_stellungnahme_status, _beauftragt_am, _hochgeladen_am, _freigabe_am.

import Link from 'next/link'
import { FileSignatureIcon, ClockIcon, CheckCircle2Icon } from 'lucide-react'
import { tageSeit } from '@/lib/gutachter/abrechnung'

type Fall = {
  id: string
  technische_stellungnahme_status?: string | null
  technische_stellungnahme_beauftragt_am?: string | null
  technische_stellungnahme_hochgeladen_am?: string | null
  technische_stellungnahme_freigabe_am?: string | null
}

export function StellungnahmeCard({ fall, id }: { fall: Fall; id?: string }) {
  const status = fall.technische_stellungnahme_status
  if (!status || status === 'nicht-angefordert') return null

  const hochgeladen =
    status === 'hochgeladen' ||
    status === 'freigegeben' ||
    Boolean(fall.technische_stellungnahme_hochgeladen_am)
  const tage = tageSeit(fall.technische_stellungnahme_beauftragt_am)

  return (
    <div
      id={id}
      className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
        hochgeladen
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignatureIcon
            className={`w-4 h-4 ${
              hochgeladen ? 'text-emerald-600' : 'text-amber-700'
            }`}
          />
          <p className="text-xs uppercase tracking-wider font-semibold">
            Technische Stellungnahme
          </p>
        </div>
        {tage != null && !hochgeladen && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
            <ClockIcon className="w-3 h-3" />
            seit {tage} {tage === 1 ? 'Tag' : 'Tagen'}
          </span>
        )}
      </div>

      {hochgeladen ? (
        <div className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2Icon className="w-4 h-4" />
          {fall.technische_stellungnahme_freigabe_am
            ? `Freigegeben am ${new Date(fall.technische_stellungnahme_freigabe_am).toLocaleDateString('de-DE')}`
            : `Hochgeladen am ${
                fall.technische_stellungnahme_hochgeladen_am
                  ? new Date(fall.technische_stellungnahme_hochgeladen_am).toLocaleDateString('de-DE')
                  : '—'
              }`}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-800">
            Die Kanzlei hat eine technische Stellungnahme zu deinem Gutachten angefordert.
          </p>
          <Link
            href={`/gutachter/stellungnahme/${fall.id}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#1E3A5F]"
          >
            Stellungnahme erstellen →
          </Link>
        </>
      )}
    </div>
  )
}
