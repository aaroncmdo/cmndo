'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightIcon, XIcon, CheckCircleIcon, AlertTriangleIcon, UserIcon, CarIcon, FileTextIcon, PhoneIcon, MailIcon } from 'lucide-react'

// KFZ-146: Bestätigungs-Modal fuer Lead-zu-Fall-Konvertierung.
// Zeigt Zusammenfassung der zu uebernehmenden Daten.

type LeadSummary = {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
  kennzeichen: string | null
  fahrzeug: string | null
  schadenfall_typ: string | null
  source_channel: string | null
}

export default function LeadKonvertierenModal({
  lead,
  onClose,
  onConvert,
}: {
  lead: LeadSummary
  onClose: () => void
  onConvert: () => Promise<{ converted?: boolean; fallId?: string; error?: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConvert() {
    setError(null)
    startTransition(async () => {
      const result = await onConvert()
      if (result.converted && result.fallId) {
        router.push(`/admin/faelle/${result.fallId}`)
      } else {
        setError(result.error ?? 'Konvertierung fehlgeschlagen')
      }
    })
  }

  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ArrowRightIcon className="w-4 h-4 text-[#4573A2]" /> Lead zu Kundenakte konvertieren
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">Folgende Daten werden in die neue Kundenakte übernommen:</p>

          <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <UserIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-700 font-medium">{name}</span>
            </div>
            {lead.telefon && (
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-600 text-xs">{lead.telefon}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <MailIcon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-600 text-xs">{lead.email}</span>
              </div>
            )}
            {lead.kennzeichen && (
              <div className="flex items-center gap-2">
                <CarIcon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-600 text-xs font-mono">{lead.kennzeichen}</span>
                {lead.fahrzeug && <span className="text-gray-400 text-xs">{lead.fahrzeug}</span>}
              </div>
            )}
            {lead.schadenfall_typ && (
              <div className="flex items-center gap-2">
                <FileTextIcon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-600 text-xs">{lead.schadenfall_typ}</span>
              </div>
            )}
            {lead.source_channel && (
              <div className="text-[10px] text-gray-400">
                Quelle: {lead.source_channel}{lead.source_channel === 'google_ads' ? ' (Google Ads)' : ''}
              </div>
            )}
          </div>

          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
            <CheckCircleIcon className="w-3.5 h-3.5 inline mr-1" />
            Alle Calls, Chats, E-Mails, Tasks und Dokumente werden automatisch mit der neuen Akte verknüpft.
          </div>

          {error && (
            <div className="bg-red-50 rounded-xl p-3 text-xs text-red-700 flex items-center gap-1.5">
              <AlertTriangleIcon className="w-3.5 h-3.5" /> {error}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} disabled={pending}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
            Abbrechen
          </button>
          <button onClick={handleConvert} disabled={pending}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1E3A5F] hover:bg-[#4573A2] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {pending ? 'Wird konvertiert...' : <><ArrowRightIcon className="w-3.5 h-3.5" /> Konvertieren</>}
          </button>
        </div>
      </div>
    </div>
  )
}
