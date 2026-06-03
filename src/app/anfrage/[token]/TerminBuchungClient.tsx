'use client'

// AAR-940 Phase 4: Termin-Selbstbuchung + SA. Zeigt das Matching-Modul-Ergebnis
// (NUR OeffentlichesSvProfil — Leak-sicher) als SV-Karten mit Slots, bucht den
// gewaehlten Slot (lead_id), lässt die SA unterschreiben und erzeugt den Fall.
// Self-contained Signatur-Canvas (keine Wizard-/next-intl-Kopplung).

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/primitives/Button'
import { bucheTermin, ladeMatching, unterschreibeUndErstelleFall } from './actions'
import type { OeffentlichesSvProfil, SlotVorschlag } from '@/lib/sv-matching-modul/types'
import { SvSlotAuswahl } from '@/components/self-service/SvSlotAuswahl'

type Step = 'laden' | 'auswahl' | 'sa' | 'absenden' | 'fertig' | 'fehler' | 'kein_match'

export function TerminBuchungClient({ token }: { token: string }) {
  const [step, setStep] = useState<Step>('laden')
  const [svs, setSvs] = useState<OeffentlichesSvProfil[]>([])
  const [gewaehlt, setGewaehlt] = useState<{ sv: OeffentlichesSvProfil; slot: SlotVorschlag } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [magicLink, setMagicLink] = useState<string | null>(null)

  useEffect(() => {
    let ab = false
    ladeMatching(token)
      .then((r) => {
        if (ab) return
        if (!r.ok) {
          // Standort fehlt = sanfter Sonderfall (Rückruf), sonst echter Fehler.
          setFehler(r.error ?? null)
          setStep(r.error?.toLowerCase().includes('besichtigungsort') ? 'kein_match' : 'fehler')
          return
        }
        const list = r.svs ?? []
        // Kein SV ODER kein SV mit freien Slots → Rückruf statt Sackgasse.
        // Der Finder reicht genau einen fixen SV durch; ein voll belegter SV
        // hätte sonst eine SV-Karte ohne Slots + ohne Weiterweg gezeigt.
        if (list.length === 0 || list.every((sv) => sv.slots.length === 0)) {
          setStep('kein_match')
          return
        }
        setSvs(list)
        setStep('auswahl')
      })
      .catch(() => {
        if (!ab) {
          setStep('fehler')
          setFehler('Beim Laden der Gutachter ist ein Fehler aufgetreten.')
        }
      })
    return () => {
      ab = true
    }
  }, [token])

  async function slotWaehlen(sv: OeffentlichesSvProfil, slot: SlotVorschlag) {
    setGewaehlt({ sv, slot })
    setStep('absenden')
    setFehler(null)
    try {
      const r = await bucheTermin(token, sv.svId, slot.start, slot.end)
      if (!r.ok) {
        setFehler(r.error ?? 'Buchung fehlgeschlagen.')
        setStep('auswahl')
        return
      }
      setStep('sa')
    } catch {
      setFehler('Buchung fehlgeschlagen.')
      setStep('auswahl')
    }
  }

  async function unterschreiben(dataUrl: string) {
    setStep('absenden')
    setFehler(null)
    try {
      const r = await unterschreibeUndErstelleFall(token, dataUrl)
      if (!r.ok) {
        setFehler(r.error ?? 'Abschluss fehlgeschlagen.')
        setStep('sa')
        return
      }
      setMagicLink(r.magicLink ?? null)
      setStep('fertig')
    } catch {
      setFehler('Abschluss fehlgeschlagen.')
      setStep('sa')
    }
  }

  if (step === 'laden' || step === 'absenden') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">
          {step === 'laden' ? 'Wir suchen den passenden Gutachter für Sie …' : 'Einen Moment …'}
        </p>
      </div>
    )
  }

  if (step === 'kein_match') {
    return (
      <div className="max-w-md text-center" data-testid="buchung-kein-match">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Wir melden uns bei Ihnen</h1>
        <p className="text-claimondo-navy/70">
          {fehler ?? 'Für Ihren Standort konnten wir gerade keinen freien Gutachter-Termin finden. Unser Team meldet sich kurzfristig telefonisch bei Ihnen.'}
        </p>
      </div>
    )
  }

  if (step === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler ?? 'Es ist ein Fehler aufgetreten.'}</p>
      </div>
    )
  }

  if (step === 'fertig') {
    return (
      <div className="max-w-md text-center" data-testid="buchung-fertig">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Geschafft — Ihr Termin steht</h1>
        <p className="text-claimondo-navy/80 mb-2">
          Ihr Gutachter-Termin ist reserviert und Ihre Vollmacht ist hinterlegt. Wir haben Ihnen
          einen Zugang zu Ihrem persönlichen Portal per E-Mail geschickt.
        </p>
        {magicLink && (
          <a
            href={magicLink}
            className="inline-block mt-2 rounded-ios-xl bg-claimondo-navy px-6 py-3 font-semibold text-white"
          >
            Zu meinem Portal
          </a>
        )}
      </div>
    )
  }

  if (step === 'sa') {
    return <SaSchritt onConfirm={unterschreiben} fehler={fehler} />
  }

  // step === 'auswahl'
  return <SvSlotAuswahl svs={svs} fehler={fehler} onSlot={slotWaehlen} />
}

// ── Self-contained Signatur-Canvas (keine Wizard-/next-intl-Kopplung) ──────────
function SaSchritt({
  onConfirm,
  fehler,
}: {
  onConfirm: (dataUrl: string) => void
  fehler: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hatSignatur, setHatSignatur] = useState(false)

  function pos(e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect()
    const p = 'touches' in e ? e.touches[0] : e
    return { x: p.clientX - r.left, y: p.clientY - r.top }
  }
  function start(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    drawing.current = true
    ctx.beginPath()
    const { x, y } = pos(e, c)
    ctx.moveTo(x, y)
    e.preventDefault()
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.strokeStyle = '#0D1B3E'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const { x, y } = pos(e, c)
    ctx.lineTo(x, y)
    ctx.stroke()
    e.preventDefault()
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    setHatSignatur(true)
  }
  function leeren() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    setHatSignatur(false)
  }
  function bestaetigen() {
    const c = canvasRef.current
    if (!c || !hatSignatur) return
    onConfirm(c.toDataURL('image/png'))
  }

  return (
    <div className="max-w-md w-full">
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-1 text-center">Vollmacht erteilen</h1>
      <p className="text-claimondo-navy/60 text-sm mb-4 text-center">
        Mit Ihrer Unterschrift beauftragen Sie uns mit der Schadensregulierung. Ihnen entstehen keine
        Kosten — diese trägt die gegnerische Haftpflichtversicherung.
      </p>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-claimondo-navy">Unterschrift</span>
        {hatSignatur && (
          <button type="button" onClick={leeren} className="text-sm font-medium text-claimondo-ondo">
            Löschen
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        data-testid="sa-canvas"
        width={600}
        height={160}
        className="w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg"
        style={{ height: 160, touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      {fehler && <p className="text-claimondo-navy/70 text-sm mt-3 text-center">{fehler}</p>}
      <Button
        variant="navy"
        fullWidth
        disabled={!hatSignatur}
        onClick={bestaetigen}
        className="mt-4"
      >
        Vollmacht erteilen &amp; Termin verbindlich buchen
      </Button>
    </div>
  )
}
