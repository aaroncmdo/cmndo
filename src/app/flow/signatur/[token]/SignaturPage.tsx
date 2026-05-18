'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckIcon, RotateCcwIcon } from 'lucide-react'
import { confirmVollmacht } from '@/app/flow/[token]/actions'
import { uploadFallSignatur, signaturClaimsWrite } from '@/lib/actions/unterschrift-upload'
import { tokens } from '@/lib/design-tokens'

// ─── Rechtstexte ──────────────────────────────────────────────────────────────

const ABTRETUNGSTEXT = `ABTRETUNGSERKLÄRUNG

Ich, der/die Unterzeichnende, trete hiermit alle mir gegen den Schädiger sowie dessen Haftpflichtversicherer zustehenden Schadensersatzansprüche aus dem gemeldeten Schadensfall vollumfänglich an die Claimondo GmbH ab.

Die Abtretung umfasst insbesondere:
• Ansprüche auf Ersatz des Sachschadens
• Kosten für Sachverständigengutachten
• Sämtliche Schadensnebenkosten und Rechtsverfolgungskosten

Claimondo GmbH ist berechtigt, die abgetretenen Forderungen im eigenen Namen geltend zu machen und einzuziehen. Die Abtretung erfolgt erfüllungshalber. Im Falle der Nichteintreibung fallen die Forderungen an den Abtretenden zurück.`

const VOLLMACHTTEXT = `VOLLMACHT & ANWALTSMANDAT

Ich, der/die Unterzeichnende, erteile hiermit der Claimondo GmbH sowie den von ihr beauftragten Rechtsanwältinnen und Rechtsanwälten Vollmacht, mich in allen Belangen des gemeldeten Schadensfalles umfassend zu vertreten.

Die Vollmacht umfasst insbesondere:
• Außergerichtliche Geltendmachung aller Ansprüche gegenüber Schädigern und Versicherern
• Gerichtliche Durchsetzung im eigenen und fremden Namen
• Abschluss von Vergleichen und Entgegennahme von Zahlungen
• Beauftragung von Sachverständigen und weiteren Fachleuten
• Einleitung und Durchführung von Zwangsvollstreckungsmaßnahmen

Diese Vollmacht gilt bis zu ihrem ausdrücklichen schriftlichen Widerruf.`

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'abtretung' | 'vollmacht' | 'submitting' | 'done'

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SignaturPage({ fallId }: { fallId: string }) {
  const [step, setStep] = useState<Step>('abtretung')
  const [abtretungPng, setAbtretungPng] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleVollmacht(vollmachtPng: string) {
    if (!abtretungPng) return
    setStep('submitting')
    setError(null)

    try {
      const now = new Date().toISOString()

      // Upload läuft über Server-Action mit service_role (Batch 4) — Anon-Write
      // auf `unterschriften` ist damit nicht mehr nötig und fällt mit Schritt D.
      const abtRes = await uploadFallSignatur(fallId, abtretungPng, 'abtretung')
      if (!abtRes.ok) throw new Error(abtRes.error)
      const volRes = await uploadFallSignatur(fallId, vollmachtPng, 'vollmacht')
      if (!volRes.ok) throw new Error(volRes.error)

      // CMM-44 SP-B PR2b: abtretung_pdf/vollmacht_pdf/abtretung_signiert_am/
      // vollmacht_signiert_am leben auf claims (SSoT) — Write komplett nach
      // claims verschoben (kein faelle-Write mehr).
      const claimsRes = await signaturClaimsWrite(fallId, abtRes.url, volRes.url, now)
      if (!claimsRes.ok) throw new Error(claimsRes.error ?? 'Signatur-Speicherung fehlgeschlagen')

      // KFZ-192: Termin bestätigen wenn service_typ='komplett'
      try {
        await confirmVollmacht(fallId)
      } catch (err) { console.error('[KFZ-192] confirmVollmacht:', err) }

      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Hochladen')
      setStep('vollmacht')
    }
  }

  if (step === 'done') return <SuccessScreen />

  if (step === 'abtretung') {
    return (
      <SignatureStep
        title="Abtretungserklärung"
        step={1}
        text={ABTRETUNGSTEXT}
        buttonLabel="Weiter zur Vollmacht →"
        onSign={(png) => { setAbtretungPng(png); setStep('vollmacht') }}
      />
    )
  }

  return (
    <SignatureStep
      title="Vollmacht & Anwaltsmandat"
      step={2}
      text={VOLLMACHTTEXT}
      buttonLabel="Unterschriften absenden"
      submitting={step === 'submitting'}
      error={error}
      onBack={() => setStep('abtretung')}
      onSign={handleVollmacht}
    />
  )
}

// ─── Success ──────────────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center px-5">
      <div className="text-center max-w-xs">
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckIcon className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Vielen Dank!</h1>
        <p className="text-claimondo-ondo text-sm leading-relaxed">
          Wir melden uns innerhalb von 24 Stunden bei dir. Deine Dokumente wurden sicher übermittelt.
        </p>
      </div>
    </div>
  )
}

// ─── Signature Step ───────────────────────────────────────────────────────────

function SignatureStep({
  title,
  step,
  text,
  buttonLabel,
  submitting = false,
  error,
  onBack,
  onSign,
}: {
  title: string
  step: 1 | 2
  text: string
  buttonLabel: string
  submitting?: boolean
  error?: string | null
  onBack?: () => void
  onSign: (png: string) => void
}) {
  const padRef = useRef<import('signature_pad').default | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  function handleSubmit() {
    if (!padRef.current || padRef.current.isEmpty()) return
    onSign(padRef.current.toDataURL('image/png'))
  }

  function handleClear() {
    padRef.current?.clear()
    setIsEmpty(true)
  }

  return (
    <div className="min-h-screen bg-claimondo-bg flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 inset-x-0 z-10 h-1 bg-claimondo-bg">
        <div
          className="h-full bg-claimondo-ondo transition-all duration-500"
          style={{ width: step === 1 ? '50%' : '100%' }}
        />
      </div>

      <div className="flex-1 flex flex-col px-5 pt-10 pb-8 max-w-lg mx-auto w-full">
        {/* Header */}
        <div className="pt-2 mb-5">
          <p className="text-xs text-claimondo-ondo mb-1 tabular-nums">{step}&thinsp;/&thinsp;2</p>
          <h1 className="text-xl font-semibold text-claimondo-navy">{title}</h1>
        </div>

        {/* Rechtstext */}
        <div className="mb-5 px-4 py-4 rounded-ios-md bg-white border border-claimondo-border max-h-52 overflow-y-auto">
          <pre className="text-xs text-claimondo-ondo whitespace-pre-wrap font-sans leading-relaxed">
            {text}
          </pre>
        </div>

        {/* Unterschrift Canvas */}
        <p className="text-sm text-claimondo-ondo mb-2">Ihre Unterschrift</p>
        <div className="relative rounded-ios-md overflow-hidden border-2 border-claimondo-border bg-white mb-2">
          <SignatureCanvas
            padRef={padRef}
            onStroke={() => setIsEmpty(false)}
          />
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <p className="text-xs text-claimondo-ondo/70">Hier unterschreiben</p>
            </div>
          )}
        </div>

        <div className="flex justify-end mb-5">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 text-xs text-claimondo-ondo hover:text-claimondo-navy transition-colors py-1"
          >
            <RotateCcwIcon className="w-3 h-3" />
            Löschen
          </button>
        </div>

        {/* Buttons */}
        <div className="space-y-3 mt-auto">
          {error && (
            <p className="text-sm text-red-400 text-center rounded-ios-md bg-red-500/10 px-4 py-3">
              {error}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={isEmpty || submitting}
            className="w-full py-4 rounded-ios-md bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
          >
            {submitting ? 'Wird übermittelt …' : buttonLabel}
          </button>
          {onBack && !submitting && (
            <button
              onClick={onBack}
              className="w-full py-3 text-sm text-claimondo-ondo hover:text-claimondo-navy transition-colors"
            >
              Zurück
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function SignatureCanvas({
  padRef,
  onStroke,
}: {
  padRef: React.MutableRefObject<import('signature_pad').default | null>
  onStroke: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pad: import('signature_pad').default

    import('signature_pad').then(({ default: SignaturePad }) => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)

      // 2026-05-14: Canvas auf Brand-Look — heller Hintergrund, Navy-Stift.
      // Vorher dunkler Block mit weißem Stift (Apple-Pencil-Anmutung), fiel aus
      // dem Claimondo-Design (Marketing-Audit Iter 4).
      pad = new SignaturePad(canvas, {
        backgroundColor: 'rgba(255, 255, 255, 0)', // transparent → Wrapper-bg-white scheint durch
        penColor: tokens.colors.navy,
        minWidth: 1.5,
        maxWidth: 3.5,
      })

      pad.addEventListener('endStroke', onStroke)
      padRef.current = pad
    })

    const handleResize = () => {
      if (!padRef.current) return
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)
      padRef.current.clear()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      padRef.current?.off()
      padRef.current = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-56 touch-none block"
    />
  )
}

