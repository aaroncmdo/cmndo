'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { getMaklerFirmaByCode } from './makler-firma-action'

// Trust-Marker im /check-Funnel: wer ueber /m/<code> (Makler-Empfehlung) kommt, traegt den
// Makler-Code als ?m in der URL. Zeigt „Empfohlen von <Firma>" — Brand-Kontinuitaet vom
// Makler-Hub durch den ganzen Funnel (LP -> /check -> Tool -> Finder; Tool/Finder = #3857).
// Rendert null ohne ?m bzw. bei inaktivem Makler. Bewusst CLIENT-seitig, damit /check statisch
// (SEO) bleibt — nur Makler-Besucher loesen den Fetch aus, die indexierte /check ohne ?m nicht.
export function MaklerEmpfehlungHinweis() {
  const [firma, setFirma] = useState<string | null>(null)

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m')
    if (!m) return
    let aktiv = true
    getMaklerFirmaByCode(m).then((r) => { if (aktiv && r) setFirma(r.firma) })
    return () => { aktiv = false }
  }, [])

  if (!firma) return null

  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-claimondo-ondo/30 bg-white/80 px-4 py-1.5 text-xs font-semibold text-claimondo-navy shadow-glass-pill backdrop-blur-md sm:text-sm">
      <BadgeCheck className="h-4 w-4 text-claimondo-ondo" aria-hidden />
      Empfohlen von {firma}
    </div>
  )
}
