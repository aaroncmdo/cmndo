'use client'
import { useEffect, useState } from 'react'
import { starteAnspruchSession } from '../actions'
import { AnspruchFotoStep } from './AnspruchFotoStep'
import { AnspruchEinschaetzungStep } from './AnspruchEinschaetzungStep'
import { AnspruchSummaryStep } from './AnspruchSummaryStep'
import type { AnspruchSpanne, Schuldform, VisionResult } from '@/lib/anspruch/types'
import { AufnahmeFlowHinweis } from '@/components/shared/AufnahmeFlowHinweis'
import { MaklerEmpfehlungBadge } from '@/components/shared/MaklerEmpfehlungBadge'
import { buildFinderHandoffUrl } from '@/lib/embed/finder-handoff-url'
import { cn } from '@/lib/utils'

type Phase = 'foto' | 'einschaetzung' | 'summary'

const SCHRITTE: { key: Phase; label: string }[] = [
  { key: 'foto', label: 'Fotos' },
  { key: 'einschaetzung', label: 'Angaben' },
  { key: 'summary', label: 'Ergebnis' },
]

export function AnspruchWizard() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('foto')
  const [vision, setVision] = useState<VisionResult | null>(null)
  const [spanne, setSpanne] = useState<AnspruchSpanne | null>(null)
  const [initialSchuld, setInitialSchuld] = useState<Schuldform | undefined>(undefined)

  useEffect(() => {
    let aktiv = true
    // `?lead=<uuid>` setzt der /check-Funnel NACH dem Lead-Submit (AnspruchFotoCheckCta).
    // Ohne ihn bleibt anspruch_schaetzungen.lead_id NULL und die fertige SV-Anzeige
    // (getAnspruchVorschauFuerFall: claims.lead_id -> schaetzung.lead_id) bleibt leer —
    // genau der Grund, warum auf prod 62 Schaetzungen existierten und 0 verknuepft waren.
    // Serverseitig geprueft (UUID + Lead existiert), gleiches Muster wie `?schuld=`.
    const lead = new URLSearchParams(window.location.search).get('lead')
    starteAnspruchSession(lead).then((r) => { if (aktiv && r.ok) setSessionToken(r.sessionToken) })
    return () => { aktiv = false }
  }, [])

  useEffect(() => {
    // Schuldfrage aus dem /check-Funnel (via ?schuld=) vorbefuellen -> kein Doppelt-Fragen
    // (zusammenhaengender Aufnahme-Flow). Nur valide Werte uebernehmen.
    const s = new URLSearchParams(window.location.search).get('schuld')
    if (s === 'unverschuldet' || s === 'teilschuld' || s === 'selbst') setInitialSchuld(s)
  }, [])

  if (!sessionToken) return (
    <div className="flex flex-col items-center p-8 text-center">
      <span className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-claimondo-border border-t-claimondo-navy" aria-hidden />
      <p className="text-body-sm text-claimondo-shield">Wird geladen …</p>
    </div>
  )

  function zumFinder() {
    if (!sessionToken) return
    // Attribution (Makler-`m`, utm, Ads-Click-IDs) verlustfrei Tool -> Finder durchreichen,
    // damit der Finder-Lead makler-attribuiert wird + die Finder-GTM die Klick-ID sieht.
    window.location.href = buildFinderHandoffUrl(window.location.search, sessionToken)
  }

  const aktuellerIndex = SCHRITTE.findIndex((s) => s.key === phase)

  return (
    <div className="mx-auto max-w-md p-4">
      {/* Makler-Empfehlung: wer ueber /m/<code> kam (URL `m`), sieht durchgehend
          „Empfohlen von <Firma>" — Brand-Kontinuitaet vom Makler-Hub bis zur Buchung. */}
      <MaklerEmpfehlungBadge />
      {/* Kontinuitaets-Klammer: wer aus dem /check-Funnel kommt (Schuldfrage vorbefuellt),
          sieht dass es EIN Vorgang ist, kein Frisch-Start. */}
      {initialSchuld && phase === 'foto' ? (
        <AufnahmeFlowHinweis text="Weiter aus Ihrer Anspruchs-Prüfung: jetzt die Fotos hochladen." />
      ) : null}

      {/* Fortschritt: rahmt die drei Schritte als einen zusammenhaengenden Flow */}
      <div
        className="mb-6 flex gap-2"
        role="group"
        aria-label={`Schritt ${aktuellerIndex + 1} von ${SCHRITTE.length}: ${SCHRITTE[aktuellerIndex].label}`}
      >
        {SCHRITTE.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div
              className={cn(
                'h-1 rounded-full transition-colors duration-200',
                i <= aktuellerIndex ? 'bg-claimondo-navy' : 'bg-claimondo-border',
              )}
            />
            <span
              className={cn(
                'mt-2 block text-center text-caption',
                i === aktuellerIndex
                  ? 'font-semibold text-claimondo-navy'
                  : i < aktuellerIndex
                    ? 'text-claimondo-navy'
                    : 'text-claimondo-shield',
              )}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {phase === 'foto' && (
        <AnspruchFotoStep
          sessionToken={sessionToken}
          onWeiter={(v) => { setVision(v); setPhase('einschaetzung') }}
          onOhneAnalyse={zumFinder}
        />
      )}
      {phase === 'einschaetzung' && vision && (
        <AnspruchEinschaetzungStep sessionToken={sessionToken} vision={vision} initialSchuld={initialSchuld} onFertig={(s) => { setSpanne(s); setPhase('summary') }} />
      )}
      {phase === 'summary' && spanne && (
        <AnspruchSummaryStep spanne={spanne} onBeauftragen={zumFinder} />
      )}
    </div>
  )
}
