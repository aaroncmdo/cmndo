'use client'

// P2d-4 Task-5b: Kamera-Toggle im schaden-Panel (nur wenn schadentyp=parkplatz).
// Erfasst parkplatz_kamera als reine Evidenz (Kanzlei/SV kann Betreiber anschreiben).
// KEINE Auto-Disqualifikation — v2 nutzt das manuelle GatesPanel-Flag.

import { useState, useTransition } from 'react'
import { CameraIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button/Button.web'
import { setParkplatzKamera } from '../_actions/schadentyp'

type Props = {
  leadId: string
  initial: boolean | null
}

export function ParkplatzKameraToggle({ leadId, initial }: Props) {
  const [kamera, setKamera] = useState<boolean | null>(initial)
  const [pending, startTransition] = useTransition()

  function handleSelect(v: boolean) {
    setKamera(v)
    startTransition(async () => {
      await setParkplatzKamera(leadId, v)
    })
  }

  return (
    <SectionCard
      title="Parkplatz — Kamera vor Ort?"
      icon={<CameraIcon className="w-4 h-4 text-claimondo-ondo" />}
    >
      <p className="mb-3 text-sm italic text-claimondo-navy">
        „War auf dem Parkplatz eine Überwachungskamera vorhanden?"
      </p>
      <div className="flex gap-2">
        <Button
          variant={kamera === true ? 'ondo' : 'ghost'}
          size="sm"
          disabled={pending}
          onClick={() => handleSelect(true)}
        >
          Ja, Kamera vorhanden
        </Button>
        <Button
          variant={kamera === false ? 'ondo' : 'ghost'}
          size="sm"
          disabled={pending}
          onClick={() => handleSelect(false)}
        >
          Nein
        </Button>
      </div>
      {kamera === true && (
        <p className="mt-2 text-[10px] text-claimondo-ondo">
          Kanzlei/SV kann den Kamera-Betreiber anschreiben.
        </p>
      )}
    </SectionCard>
  )
}
