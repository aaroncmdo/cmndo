'use client'

import { ScaleIcon, CheckCircleIcon, PhoneIcon, MailIcon } from 'lucide-react'

type Props = {
  mandatstyp: string | null
  serviceTyp: string | null
  vollmacht_status: boolean
  kanzlei_name: string | null
}

export default function SaeuleMeinAnwalt({ mandatstyp, serviceTyp, vollmacht_status, kanzlei_name }: Props) {
  // Nicht anzeigen bei nur-Gutachter oder wenn kein Kanzlei-Mandatstyp
  if (serviceTyp === 'nur_gutachter') return null
  if (mandatstyp !== 'kanzlei-claimondo') return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ScaleIcon className="w-5 h-5 text-[#4573A2]" />
        <h2 className="text-sm font-semibold text-[#0D1B3E]">Mein Anwalt</h2>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500">Ihre Partnerkanzlei</p>
          <p className="font-semibold text-gray-900">{kanzlei_name ?? 'RA Kevin Genter'}</p>
          <p className="text-xs text-gray-500 mt-0.5">Fachanwalt für Verkehrsrecht</p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {vollmacht_status ? (
            <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircleIcon className="w-3.5 h-3.5" /> Vollmacht erteilt
            </span>
          ) : (
            <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              Vollmacht ausstehend
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <a href="tel:+4932221096850" className="flex items-center gap-1.5 text-xs text-[#4573A2] hover:underline">
            <PhoneIcon className="w-3.5 h-3.5" /> Anrufen
          </a>
          <a href="mailto:kanzlei@claimondo.de" className="flex items-center gap-1.5 text-xs text-[#4573A2] hover:underline">
            <MailIcon className="w-3.5 h-3.5" /> E-Mail
          </a>
        </div>
      </div>
    </div>
  )
}
