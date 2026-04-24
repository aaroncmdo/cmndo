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
}

export function VorOrtTriggerCard({ fallId, kundeName, kennzeichen, adresse }: Props) {
  const [showPanel, setShowPanel] = useState(false)
  const router = useRouter()
  const mapsLink = adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`
    : null

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => setShowPanel(true)}
          className="flex-1 bg-claimondo-navy hover:bg-claimondo-ondo text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <CameraIcon className="w-4 h-4" /> Bin angekommen — Vor-Ort Erfassung
        </button>
        {mapsLink && (
          <a
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
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
