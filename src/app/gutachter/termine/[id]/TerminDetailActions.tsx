'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NavigationIcon, MapPinIcon, CheckCircleIcon } from 'lucide-react'
import { startNavigation } from '@/lib/termine/actions'

// KFZ-200: Client component for Termin-Detail action buttons.

interface Props {
  terminId: string
  navigationStartedAt: string | null
  svAngekommen: boolean
  durchgefuehrt: boolean
  adresse: string
}

export default function TerminDetailActions({
  terminId,
  navigationStartedAt,
  svAngekommen,
  durchgefuehrt,
  adresse,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleStartNavigation() {
    setError(null)
    startTransition(async () => {
      const res = await startNavigation(terminId)
      if (res.error) { setError(res.error); return }
      if (res.redirectPath) router.push(res.redirectPath)
    })
  }

  if (durchgefuehrt) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
        <CheckCircleIcon className="w-6 h-6 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Begutachtung abgeschlossen</p>
          <p className="text-xs text-emerald-600 mt-0.5">Dieser Termin wurde erfolgreich durchgeführt.</p>
        </div>
      </div>
    )
  }

  if (svAngekommen) {
    return (
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <MapPinIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <p className="text-sm font-medium text-blue-800">SV ist vor Ort angekommen</p>
        </div>
        <Link
          href={`/gutachter/termine/${terminId}/vor-ort`}
          className="block w-full text-center bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-2xl py-3.5 text-base font-semibold transition-colors"
        >
          Vor-Ort-Modus öffnen →
        </Link>
      </div>
    )
  }

  if (navigationStartedAt) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <NavigationIcon className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">Navigation läuft</p>
        </div>
        <Link
          href={`/gutachter/termine/${terminId}/navigation`}
          className="block w-full text-center bg-[#4573A2] hover:bg-[#3a5f87] text-white rounded-2xl py-3.5 text-base font-semibold transition-colors"
        >
          Zur Navigation →
        </Link>
        <Link
          href={`/gutachter/termine/${terminId}/vor-ort`}
          className="block w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl py-3 text-sm font-medium transition-colors"
        >
          Direkt zum Vor-Ort-Modus
        </Link>
      </div>
    )
  }

  // Default: Navigation noch nicht gestartet
  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}
      {adresse && adresse !== '—' && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(adresse)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-[#4573A2] hover:underline"
        >
          <MapPinIcon className="w-4 h-4" />
          {adresse}
        </a>
      )}
      <button
        onClick={handleStartNavigation}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-[#4573A2] hover:bg-[#3a5f87] text-white rounded-2xl py-4 text-base font-bold transition-colors disabled:opacity-50 shadow-lg shadow-[#4573A2]/30"
      >
        <NavigationIcon className="w-5 h-5" />
        {pending ? 'Starte...' : 'Navigation starten'}
      </button>
    </div>
  )
}
