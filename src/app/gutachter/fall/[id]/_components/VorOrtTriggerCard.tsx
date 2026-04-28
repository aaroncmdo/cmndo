'use client'

// AAR-757: aus FallakteVollClient extrahiert. Button + VorOrtPanel-Overlay
// für die Vor-Ort-Erfassung. Phase-gated im Aufrufer (nur bei sv_termin +
// !gutachten + relevanter Status).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CameraIcon } from 'lucide-react'
import VorOrtPanel from '@/components/VorOrtPanel'

type Props = {
  fallId: string
  kundeName: string
  kennzeichen: string | null
  adresse: string | null
  compact?: boolean
}

export function VorOrtTriggerCard({ fallId, kundeName, kennzeichen, adresse, compact }: Props) {
  const [showPanel, setShowPanel] = useState(false)
  const router = useRouter()
  const mapsLink = adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`
    : null

  return (
    <>
      <div className={`flex gap-2 ${compact ? 'h-full' : ''}`}>
        <button
          onClick={() => setShowPanel(true)}
          className={`flex-1 bg-claimondo-navy hover:bg-claimondo-ondo text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
            compact ? 'text-xs px-3 h-full' : 'text-sm py-2.5'
          }`}
        >
          <CameraIcon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          {compact ? 'Bin angekommen' : 'Bin angekommen — Vor-Ort Erfassung'}
        </button>
        {mapsLink && (
          <a
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
              compact ? 'text-xs px-3 h-full' : 'text-sm px-4 py-2.5'
            }`}
          >
            Navigieren
          </a>
        )}
      </div>
      {showPanel && (
        <VorOrtPanel
          fallId={fallId}
          kundeName={kundeName}
          kennzeichen={kennzeichen}
          adresse={adresse}
          onClose={() => setShowPanel(false)}
          onComplete={() => {
            setShowPanel(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
