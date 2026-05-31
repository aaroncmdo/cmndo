'use client'

// AAR-940 Phase 4: Termin-Selbstbuchung + SA. Zeigt das Matching-Modul-Ergebnis
// (NUR OeffentlichesSvProfil — Leak-sicher) als SV-Karten mit Slots, bucht den
// gewaehlten Slot (lead_id), lässt die SA unterschreiben und erzeugt den Fall.
// Self-contained Signatur-Canvas (keine Wizard-/next-intl-Kopplung).

import { useEffect, useRef, useState } from 'react'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { Button } from '@/components/primitives/Button'
import { Card } from '@/components/primitives/Card'
import { bucheTermin, ladeMatching, unterschreibeUndErstelleFall } from './actions'
import type { OeffentlichesSvProfil, SlotVorschlag } from '@/lib/sv-matching-modul/types'

type Step = 'laden' | 'auswahl' | 'sa' | 'absenden' | 'fertig' | 'fehler' | 'kein_match'

function fmtSlot(wall: string): string {
  const d = new Date(wall)
  if (Number.isNaN(d.getTime())) return wall
  return (
    d.toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' Uhr'
  )
}

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
        if (list.length === 0) {
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
  return (
    <div className="max-w-lg w-full">
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-1 text-center">
        Ihr Gutachter-Termin
      </h1>
      <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
        Wählen Sie einen passenden Termin — der erste Vorschlag ist Ihr bestpassender Gutachter.
      </p>
      {fehler && <p className="text-claimondo-navy/70 text-sm mb-4 text-center">{fehler}</p>}
      <div className="flex flex-col gap-4">
        {svs.map((sv, i) => (
          <Card key={sv.svId} p={5} radius="lg">
            <div data-testid={`buchung-sv-${i}`} className="flex items-center gap-3 mb-3">
              {sv.profilbild ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sv.profilbild} alt={sv.vorname} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-claimondo-bg flex items-center justify-center text-claimondo-navy font-semibold">
                  {sv.vorname.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-claimondo-navy">{sv.vorname}</span>
                  {i === 0 && (
                    <span className="text-[11px] font-semibold text-claimondo-ondo">Empfohlen</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-claimondo-navy/60">
                  <span>{sv.distanzGerundet}</span>
                  <GoogleBewertungBadge
                    durchschnitt={sv.bewertungDurchschnitt}
                    anzahl={sv.bewertungAnzahl}
                    zuletztAktualisiert={sv.bewertungAktualisiert}
                    size="sm"
                  />
                </div>
              </div>
            </div>
            {sv.profilbeschreibung && (
              <p className="text-sm text-claimondo-navy/60 mb-3 line-clamp-2">{sv.profilbeschreibung}</p>
            )}
            {sv.slots.length === 0 ? (
              <p className="text-sm text-claimondo-navy/50">Aktuell keine freien Termine.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sv.slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    data-testid={`buchung-slot-${sv.svId}-${slot.start}`}
                    onClick={() => slotWaehlen(sv, slot)}
                    className="rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy transition hover:border-claimondo-ondo hover:bg-claimondo-bg"
                  >
                    {fmtSlot(slot.start)}
                    {slot.matchType === 'wunschtermin' && (
                      <span className="ml-1 text-[10px] font-semibold text-claimondo-ondo">Wunschzeit</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
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
