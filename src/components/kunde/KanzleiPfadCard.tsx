'use client'

// CMM-32 Polish: Kanzlei-Pfad-Wahl im Kunde-Portal.
//
// Switch je nach claim.kanzlei_wunsch:
//   - 'partnerkanzlei'                → null (Standardweg ueber LexDrive,
//                                       der Kanzlei-Sub-Stepper im
//                                       ClaimStepper zeigt das ohnehin)
//   - 'eigene_kanzlei'                → EigeneKanzleiPaketCard
//                                       (Kunde traegt Email + sendet)
//   - 'keine_kanzlei'                 → SelbstEinreichenCard
//                                       (Kunde laedt Gutachten +
//                                        reicht bei VS selbst ein)
//   - 'noch_unentschieden' / null     → FrageCard mit 3 Optionen
//                                       (Komplettservice / eigene Kanzlei
//                                        / selbst einreichen)
//
// Kunde kann seinen Wunsch eigenstaendig setzen (nicht nur KB-getriggert)
// solange das Paket noch nicht versendet/uebergeben ist.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircleIcon,
  DownloadIcon,
  CheckIcon,
  FileTextIcon,
} from 'lucide-react'
import EigeneKanzleiPaketCard from './EigeneKanzleiPaketCard'
import { bestaetigeSelbstEinreichungOhneKanzlei } from '@/lib/kanzlei-wunsch/actions'

type KanzleiWunsch =
  | 'partnerkanzlei'
  | 'eigene_kanzlei'
  | 'keine_kanzlei'
  | 'noch_unentschieden'
  | 'nicht_gefragt'

type Props = {
  claimId: string
  kanzleiWunsch: KanzleiWunsch | null
  kanzleiName: string | null
  kanzleiEmail: string | null
  kanzleiTelefon: string | null
  kanzleiUebergebenAm: string | null
  gutachtenFreigegeben: boolean
  /** URL zum Gutachten-PDF — fuer den Download-Button im Selbst-Einreichen-Pfad. */
  gutachtenUrl: string | null
}

export default function KanzleiPfadCard({
  claimId,
  kanzleiWunsch,
  kanzleiName,
  kanzleiEmail,
  kanzleiTelefon,
  kanzleiUebergebenAm,
  gutachtenFreigegeben,
  gutachtenUrl,
}: Props) {
  // partnerkanzlei: keine eigene Card — Standardflow im Stepper sichtbar
  if (kanzleiWunsch === 'partnerkanzlei') return null

  if (kanzleiWunsch === 'eigene_kanzlei') {
    return (
      <EigeneKanzleiPaketCard
        claimId={claimId}
        kanzleiName={kanzleiName}
        kanzleiEmail={kanzleiEmail}
        kanzleiTelefon={kanzleiTelefon}
        bereitsVersendet={!!kanzleiUebergebenAm}
        uebergebenAm={kanzleiUebergebenAm}
        gutachtenFreigegeben={gutachtenFreigegeben}
      />
    )
  }

  if (kanzleiWunsch === 'keine_kanzlei') {
    return (
      <SelbstEinreichenCard
        claimId={claimId}
        bereitsBestaetigt={!!kanzleiUebergebenAm}
        bestaetigtAm={kanzleiUebergebenAm}
        gutachtenFreigegeben={gutachtenFreigegeben}
        gutachtenUrl={gutachtenUrl}
      />
    )
  }

  // unentschieden / nicht_gefragt / null — die Frage selbst lebt jetzt
  // im lila Top-Banner des ClaimSteppers (CMM-32 Polish, sobald QC durch
  // ist). Diese Card rendert in dem Fall nichts mehr.
  return null
}

// ─── Selbst-Einreichen-Card ──────────────────────────────────────────────────

function SelbstEinreichenCard({
  claimId,
  bereitsBestaetigt,
  bestaetigtAm,
  gutachtenFreigegeben,
  gutachtenUrl,
}: {
  claimId: string
  bereitsBestaetigt: boolean
  bestaetigtAm: string | null
  gutachtenFreigegeben: boolean
  gutachtenUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (bereitsBestaetigt) {
    const datum = bestaetigtAm
      ? new Date(bestaetigtAm).toLocaleDateString('de-DE', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : null
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 flex items-start gap-2">
        <CheckCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Du reichst selbst ein</p>
          <p>
            {datum ? `Am ${datum} bestätigt. ` : ''}
            Schicke das Gutachten + die Schadensanzeige direkt an die gegnerische Versicherung.
            Wir sind raus.
          </p>
        </div>
      </div>
    )
  }

  function handleBestaetigen() {
    setError(null)
    if (!gutachtenFreigegeben) {
      setError('Gutachten ist noch nicht freigegeben.')
      return
    }
    startTransition(async () => {
      const r = await bestaetigeSelbstEinreichungOhneKanzlei(claimId)
      if (!r.ok) setError(r.error ?? 'Fehler')
      else router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-emerald-300 bg-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <DownloadIcon className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-900">Du reichst selbst ein</p>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            Lade dein Gutachten herunter und sende es zusammen mit der Schadensanzeige an die
            gegnerische Versicherung. Sobald du das gemacht hast, bestätige unten.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {gutachtenUrl ? (
          <a
            href={gutachtenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5"
          >
            <FileTextIcon className="w-3.5 h-3.5" />
            Gutachten herunterladen
          </a>
        ) : (
          <p className="text-[11px] text-claimondo-ondo bg-[#f8f9fb] border border-claimondo-border rounded px-2 py-1.5">
            Gutachten-Download wird verfügbar sobald die Vollständigkeitsprüfung
            durch ist.
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleBestaetigen}
          disabled={pending || !gutachtenFreigegeben}
          className="inline-flex items-center gap-1.5 rounded-md bg-claimondo-navy hover:bg-claimondo-navy/90 disabled:bg-claimondo-navy/50 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
          title={
            !gutachtenFreigegeben
              ? 'Gutachten muss zuerst freigegeben sein'
              : 'Bestätigen — du hast alles und reichst selbst ein'
          }
        >
          <CheckIcon className="w-3.5 h-3.5" />
          {pending ? 'Wird gespeichert…' : 'Ich habe alles, reiche selbst ein'}
        </button>
      </div>
    </div>
  )
}
