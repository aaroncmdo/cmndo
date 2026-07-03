'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CloseButton } from '@/components/primitives'
import { ShareTools } from '@/components/makler/ShareTools'
import { markiereVermittlungPromptGesehen } from '@/app/makler/(shell)/actions'

// Erste-Vermittlung-Prompt: einmalige Erfolgs-Card oben im Makler-Dashboard, nachdem der
// Makler seine erste erfolgreiche Vermittlung hatte. Bietet die passiven Kanaele (E-Mail-
// Signatur / Website-Embed) AKTIV an — genau die, die aus dem Onboarding-Wizard entfernt
// wurden, weil sie VOR jedem Erfolg zu aufdringlich waren. Jetzt sind sie verdient & relevant.
// Wegklickbar; danach nie wieder (makler.vermittlung_prompt_gesehen).
export function ErsteVermittlungCard({ code, firma }: { code: string; firma: string }) {
  const [sichtbar, setSichtbar] = useState(true)
  const [, startTransition] = useTransition()

  function ausblenden() {
    setSichtbar(false) // optimistisch ausblenden
    startTransition(async () => {
      const res = await markiereVermittlungPromptGesehen()
      if (!res.ok) {
        setSichtbar(true) // Fehler -> Card zurueckholen, erneut versuchbar
        toast.error(res.error ?? 'Konnte nicht ausgeblendet werden.')
      }
    })
  }

  if (!sichtbar) return null

  return (
    <section
      aria-label="Ihre erste Vermittlung"
      className="relative rounded-ios-md border border-claimondo-border bg-white p-6"
    >
      <CloseButton onPress={ausblenden} label="Ausblenden" offset={12} />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success-strong">
        Glückwunsch
      </p>
      <h2 className="mt-2 pr-12 text-xl font-bold text-claimondo-navy">
        🎉 Ihre erste Vermittlung ist da!
      </h2>
      <p className="mt-2 text-sm text-claimondo-ondo">
        Ihr Empfehlungs-Link funktioniert. So bleiben Sie ab jetzt dauerhaft präsent — ganz ohne
        Aufwand: binden Sie ihn einmal in Ihre E-Mail-Signatur oder auf Ihrer Website ein.
      </p>
      <div className="mt-5">
        <ShareTools code={code} firma={firma} variant="passive" />
      </div>
    </section>
  )
}
