'use client'
import { useEffect, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { getMaklerEmpfehlung } from '@/lib/makler/makler-empfehlung'
import { cn } from '@/lib/utils'

// Trust-Marker im Aufnahme-Funnel: wer ueber /m/<code> (Makler-Empfehlung) kommt, traegt den
// Makler-Code als `m` in der URL. Dieser Badge zeigt durchgehend „Empfohlen von <Firma>" —
// Brand-Kontinuitaet vom Makler-Hub bis zur Buchung. Claimondo-Stil (KEIN Makler-Vollbrand;
// das ist SV-only, siehe AGENTS.md §branding-rules). Rendert null ohne `m` bzw. bei
// ungueltigem/inaktivem Makler. Self-contained (liest `m` selbst, loest server-seitig auf)
// -> Drop-in fuer Tool + Finder + potenziell Werkstatt-Funnel.
// className optional: der Default mb-3 passt in Nicht-Flex-Container (Tool); in einem
// flex/gap-Container (Finder-GlassSurface) mit `mb-0` neutralisieren (kein Doppel-Spacing).
export function MaklerEmpfehlungBadge({ className }: { className?: string }) {
  const [firma, setFirma] = useState<string | null>(null)

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m')
    if (!m) return
    let aktiv = true
    getMaklerEmpfehlung(m).then((r) => { if (aktiv && r) setFirma(r.firma) })
    return () => { aktiv = false }
  }, [])

  if (!firma) return null

  return (
    <div className={cn('mb-3 flex items-center gap-2 rounded-ios-md bg-claimondo-bg px-3 py-2', className)}>
      <BadgeCheck className="h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
      <p className="text-caption text-claimondo-shield">
        Empfohlen von <span className="font-semibold text-claimondo-navy">{firma}</span>
      </p>
    </div>
  )
}
