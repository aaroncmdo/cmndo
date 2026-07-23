'use client'

// S3 (Vor-Ort-Konsolidierung): Der Vor-Ort-Button routet jetzt auf den KANONISCHEN
// Flow B (/gutachter/termine/[id]/vor-ort → VorOrtClient: Fahrzeugschein-OCR +
// completeBegutachtung → Fall-Phasen-Transition + Kunde-Notify). Der frühere schwache
// VorOrtPanel-Overlay (kein OCR, kein Abschluss) ist stillgelegt/gelöscht.
// Phase-gated im Aufrufer (nur bei sv_termin + !gutachten + relevanter Status).

import Link from 'next/link'
import { CameraIcon } from 'lucide-react'

type Props = {
  aktiverTerminId: string | null
  adresse: string | null
}

export function VorOrtTriggerCard({ aktiverTerminId, adresse }: Props) {
  const mapsLink = adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`
    : null

  return (
    <div className="flex gap-2">
      {aktiverTerminId && (
        <Link
          href={`/gutachter/termine/${aktiverTerminId}/vor-ort`}
          className="flex-1 bg-claimondo-navy hover:bg-claimondo-ondo text-white font-medium rounded-ios-lg transition-colors flex items-center justify-center gap-2 text-sm py-2.5"
        >
          <CameraIcon className="w-4 h-4" />
          Vor-Ort-Erfassung öffnen
        </Link>
      )}
      {mapsLink && (
        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-success hover:bg-success/90 text-white font-medium rounded-ios-lg transition-colors flex items-center justify-center gap-2 text-sm px-4 py-2.5"
        >
          Navigieren
        </a>
      )}
    </div>
  )
}
