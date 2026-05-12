'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/primitives'
import { useFlowStore } from '@/lib/flow/flow-store'
import type { VisionResult } from '@/lib/flow/schemas/vision-result'

// AAR-472 C6: Loading-/Ergebnis-State fÃ¼r die Vision-Analyse.
//
// Ablauf:
//  1. onMount â†’ POST /api/vision/lead-analyse mit leadId
//  2. WÃ¤hrend des Calls zeigen wir ein freundliches Loading (mind. 5 s, damit
//     der Nutzer versteht, dass hier etwas passiert und nicht alles sofort
//     â€žzu schnell" wirkt).
//  3. Erfolg â†’ Zusammenfassung + beschÃ¤digte Teile + Weiter-Button zu 2c.
//  4. Fehler â†’ Retry-Button; optional kann der Nutzer direkt zu 2c springen
//     (Vision ist fÃ¼r den Flow nicht blockierend, das DAT-Follow-Up in C7
//     nutzt die Analyse nur als Input).

const MIN_SHOW_MS = 5000

type State =
  | { kind: 'running' }
  | { kind: 'done'; result: VisionResult }
  | { kind: 'error'; message: string }

export function AnalyseClient({ leadId }: { leadId: string }) {
  const router = useRouter()
  const setVisionResult = useFlowStore((s) => s.setVisionResult)
  const setCurrentStep = useFlowStore((s) => s.setCurrentStep)
  const [state, setState] = useState<State>({ kind: 'running' })
  const startedAt = useRef<number>(Date.now())
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void runAnalyse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runAnalyse() {
    startedAt.current = Date.now()
    setState({ kind: 'running' })
    try {
      const res = await fetch('/api/vision/lead-analyse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        result?: VisionResult
        error?: string
      }

      const elapsed = Date.now() - startedAt.current
      const wait = Math.max(0, MIN_SHOW_MS - elapsed)
      await new Promise((r) => setTimeout(r, wait))

      if (!res.ok || !json.success || !json.result) {
        setState({
          kind: 'error',
          message: json.error ?? 'Analyse fehlgeschlagen',
        })
        return
      }
      setVisionResult(json.result)
      setState({ kind: 'done', result: json.result })
    } catch (err) {
      const elapsed = Date.now() - startedAt.current
      const wait = Math.max(0, MIN_SHOW_MS - elapsed)
      await new Promise((r) => setTimeout(r, wait))
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unbekannter Fehler',
      })
    }
  }

  const onContinue = () => {
    setCurrentStep(2)
    router.push('/schaden-melden/schritt-2/gegner')
  }

  if (state.kind === 'running') {
    return <Running />
  }

  if (state.kind === 'error') {
    return (
      <ErrorView
        message={state.message}
        onRetry={() => void runAnalyse()}
        onSkip={onContinue}
      />
    )
  }

  return <Done result={state.result} onContinue={onContinue} />
}

function Running() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-claimondo-ondo/10">
        <Loader2 className="h-10 w-10 animate-spin text-claimondo-ondo" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold text-claimondo-navy">
        KI analysiert Ihre Fotos â€¦
      </h1>
      <p className="mt-3 max-w-md text-sm text-claimondo-ondo">
        Claude prÃ¼ft die Aufnahmen auf sichtbare SchÃ¤den, schÃ¤tzt den
        Schweregrad ein und liest Fahrzeug-Hinweise. Das dauert nur wenige
        Sekunden.
      </p>
      <ul className="mt-8 grid max-w-sm gap-2 text-left text-sm text-claimondo-ondo">
        <li className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-claimondo-ondo" aria-hidden />
          BeschÃ¤digte Teile erkennen
        </li>
        <li className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-claimondo-ondo" aria-hidden />
          Schweregrad einschÃ¤tzen
        </li>
        <li className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-claimondo-ondo" aria-hidden />
          Fahrzeug-Merkmale abgleichen
        </li>
      </ul>
    </div>
  )
}

function ErrorView({
  message,
  onRetry,
  onSkip,
}: {
  message: string
  onRetry: () => void
  onSkip: () => void
}) {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
        <AlertTriangle className="h-7 w-7 text-amber-600" aria-hidden />
      </div>
      <h1 className="text-xl font-bold text-claimondo-navy">
        Analyse konnte nicht abgeschlossen werden
      </h1>
      <p className="mt-2 text-sm text-claimondo-ondo">{message}</p>
      <p className="mt-4 text-xs text-claimondo-ondo">
        Sie kÃ¶nnen die Analyse erneut starten oder direkt mit dem nÃ¤chsten
        Schritt fortfahren â€” die ErsteinschÃ¤tzung ist fÃ¼r die Meldung nicht
        zwingend erforderlich.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button tone="ondo" onPress={onRetry}>
          Erneut versuchen
        </Button>
        <Button tone="ghost" onPress={onSkip}>
          Ohne Analyse fortfahren
        </Button>
      </div>
    </div>
  )
}

function Done({
  result,
  onContinue,
}: {
  result: VisionResult
  onContinue: () => void
}) {
  const schweregradLabel: Record<VisionResult['schweregrad'], string> = {
    leicht: 'Leicht',
    mittel: 'Mittel',
    schwer: 'Schwer',
  }
  const schweregradClass: Record<VisionResult['schweregrad'], string> = {
    leicht: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    mittel: 'bg-amber-50 text-amber-700 border-amber-200',
    schwer: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-claimondo-navy">
            Analyse abgeschlossen
          </h1>
          <p className="text-sm text-claimondo-ondo">
            Das ist die ErsteinschÃ¤tzung auf Basis Ihrer Fotos.
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-claimondo-border bg-white shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-claimondo-ondo">
            Schweregrad
          </h2>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${schweregradClass[result.schweregrad]}`}
          >
            {schweregradLabel[result.schweregrad]}
          </span>
        </div>
        <p className="text-sm text-claimondo-navy">{result.zusammenfassung}</p>
      </section>

      {result.beschaedigte_teile.length > 0 ? (
        <section className="mt-4 rounded-3xl border border-claimondo-border bg-white shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-claimondo-ondo">
            Erkannte beschÃ¤digte Teile
          </h2>
          <ul className="flex flex-wrap gap-2">
            {result.beschaedigte_teile.map((teil) => (
              <li
                key={teil}
                className="rounded-full border border-claimondo-border bg-claimondo-bg px-3 py-1 text-xs text-claimondo-navy"
              >
                {teil}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.fahrzeug_hinweise &&
      Object.values(result.fahrzeug_hinweise).some(Boolean) ? (
        <section className="mt-4 rounded-3xl border border-claimondo-border bg-white shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-claimondo-ondo">
            Fahrzeug-Hinweise
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {result.fahrzeug_hinweise.hersteller ? (
              <div>
                <dt className="text-xs text-claimondo-ondo">Hersteller</dt>
                <dd className="text-claimondo-navy">
                  {result.fahrzeug_hinweise.hersteller}
                </dd>
              </div>
            ) : null}
            {result.fahrzeug_hinweise.modell ? (
              <div>
                <dt className="text-xs text-claimondo-ondo">Modell</dt>
                <dd className="text-claimondo-navy">
                  {result.fahrzeug_hinweise.modell}
                </dd>
              </div>
            ) : null}
            {result.fahrzeug_hinweise.farbe ? (
              <div>
                <dt className="text-xs text-claimondo-ondo">Farbe</dt>
                <dd className="text-claimondo-navy">
                  {result.fahrzeug_hinweise.farbe}
                </dd>
              </div>
            ) : null}
            {result.fahrzeug_hinweise.kennzeichen ? (
              <div>
                <dt className="text-xs text-claimondo-ondo">Kennzeichen</dt>
                <dd className="text-claimondo-navy">
                  {result.fahrzeug_hinweise.kennzeichen}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <p className="mt-4 text-xs text-claimondo-ondo">
        Konfidenz der KI: {(result.confidence * 100).toFixed(0)} %. Die
        endgÃ¼ltige Bewertung trifft der SachverstÃ¤ndige vor Ort.
      </p>

      <div className="mt-8 flex justify-end">
        <Button tone="ondo" onPress={onContinue}>
          Weiter zu den Gegner-Daten
        </Button>
      </div>
    </div>
  )
}
