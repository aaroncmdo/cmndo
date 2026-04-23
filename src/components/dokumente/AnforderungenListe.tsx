// AAR-327 (Child 7 von AAR-320): Liste der Dokumente, die die aktuelle Rolle
// (oder der aktuelle User) beim Kunden angefordert hat. Zeigt Status +
// Frist-Overdue. Der Parent lädt die Rows und filtert die Rolle/User-Match
// server-seitig, damit jede Rolle nur ihre eigenen Anforderungen sieht.

'use client'

import { useState } from 'react'
import { ClockIcon, CheckCircle2Icon, AlertTriangleIcon, XCircleIcon, PlusIcon, FileTextIcon } from 'lucide-react'
import AnforderungsModal, { type AnforderbarerSlot } from './AnforderungsModal'
import { StatusBadge } from '@/components/shared/StatusBadge'

export type AnforderungsItem = {
  id: string
  slot_id: string
  label: string
  status: string
  frist: string | null
  begruendung: string | null
  angefordert_am: string | null
}

function statusBadge(status: string, frist: string | null): {
  icon: typeof ClockIcon
  bg: string
  text: string
  labelTxt: string
  overdue?: boolean
} {
  const now = new Date()
  const fristDate = frist ? new Date(frist) : null
  const overdue =
    !!fristDate &&
    fristDate.getTime() < now.getTime() &&
    (status === 'ausstehend' || status === 'nachgereicht_angefordert')

  if (overdue) {
    return {
      icon: AlertTriangleIcon,
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-600',
      labelTxt: 'Überfällig',
      overdue: true,
    }
  }
  switch (status) {
    case 'hochgeladen':
    case 'geprueft':
      return {
        icon: CheckCircle2Icon,
        bg: 'bg-emerald-50 border-emerald-200',
        text: 'text-emerald-600',
        labelTxt: status === 'geprueft' ? 'Geprüft' : 'Erhalten',
      }
    case 'abgelehnt':
      return {
        icon: XCircleIcon,
        bg: 'bg-gray-100 border-gray-200',
        text: 'text-gray-500',
        labelTxt: 'Abgelehnt',
      }
    case 'nachgereicht_angefordert':
      return {
        icon: ClockIcon,
        bg: 'bg-orange-50 border-orange-200',
        text: 'text-orange-600',
        labelTxt: 'Erinnert',
      }
    default:
      return {
        icon: ClockIcon,
        bg: 'bg-amber-50 border-amber-200',
        text: 'text-amber-600',
        labelTxt: 'Ausstehend',
      }
  }
}

export default function AnforderungenListe({
  fallId,
  rolleLabel,
  slotsVerfuegbar,
  anforderungen,
}: {
  fallId: string
  rolleLabel: string
  slotsVerfuegbar: AnforderbarerSlot[]
  anforderungen: AnforderungsItem[]
}) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <FileTextIcon className="w-3.5 h-3.5" /> Meine Anforderungen an den Kunden
        </h3>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-[#4573A2] hover:text-[#1E3A5F]"
        >
          <PlusIcon className="w-3 h-3" /> Neue Anforderung
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {anforderungen.length === 0 ? (
          <p className="px-4 py-6 text-center text-gray-400 text-xs">
            Sie haben noch keine Dokumente beim Kunden angefordert.
          </p>
        ) : (
          anforderungen.map((a) => {
            const cfg = statusBadge(a.status, a.frist)
            const Icon = cfg.icon
            return (
              <div key={a.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 ${cfg.text} shrink-0`} />
                    <span className="text-sm text-gray-800 truncate">{a.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge colorCls={`${cfg.bg} ${cfg.text} border`}>
                      {cfg.labelTxt}
                    </StatusBadge>
                    {a.frist && (
                      <span
                        className={`text-[10px] tabular-nums ${
                          cfg.overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                        }`}
                      >
                        Frist: {new Date(a.frist).toLocaleDateString('de-DE')}
                      </span>
                    )}
                  </div>
                </div>
                {a.begruendung && (
                  <p className="mt-1 ml-6 text-[11px] text-gray-500 line-clamp-2">
                    {a.begruendung}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      <AnforderungsModal
        fallId={fallId}
        rolleLabel={rolleLabel}
        slots={slotsVerfuegbar}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  )
}
