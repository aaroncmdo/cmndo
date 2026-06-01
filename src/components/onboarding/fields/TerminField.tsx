'use client'

// P4 (Gutachter-Finder->Self-Service): Matching/Booking als Wizard-Feld (typ='termin')
// fuer den beauftragung-Flow. REINER CONSUMER: ladeMatching/bucheTermin
// (-> gutachter_termine.lead_id, status reserviert; Slots aus #2165-Busy-Cache).
// Kein Schema-Touch; die unisone-termin-engine ownt Infra + Reservierungs-TTL spaeter
// (Phase-3-Consumer). SA + Finalize macht die sa-Phase (handleWeiterBeauftragung),
// NICHT dieses Feld. Markup modelliert nach TerminBuchungClient (wird bei MIG
// abgeloest -> transiente Duplikation, bewusst).

import { useEffect, useState } from 'react'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { Card } from '@/components/primitives/Card'
import { ladeMatching, bucheTermin } from '@/app/anfrage/[token]/actions'
import type { OeffentlichesSvProfil, SlotVorschlag } from '@/lib/sv-matching-modul/types'

type Step = 'laden' | 'auswahl' | 'kein_match' | 'fehler' | 'gebucht'

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

interface Props {
  value: string
  onChange: (val: string) => void
  disabled?: boolean
  token?: string | null
}

export function TerminField({ value, onChange, disabled, token }: Props) {
  const [step, setStep] = useState<Step>(value ? 'gebucht' : 'laden')
  const [svs, setSvs] = useState<OeffentlichesSvProfil[]>([])
  const [gewaehlt, setGewaehlt] = useState<{ svName: string; slotStart: string } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [buchend, setBuchend] = useState(false)

  useEffect(() => {
    if (value) return // schon gebucht (Resume) -> nicht neu matchen
    if (!token) {
      setStep('fehler')
      setFehler('Dieser Link ist nicht mehr gültig.')
      return
    }
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
  }, [token, value])

  async function slotWaehlen(sv: OeffentlichesSvProfil, slot: SlotVorschlag) {
    if (!token || buchend || disabled) return
    setBuchend(true)
    setFehler(null)
    try {
      const r = await bucheTermin(token, sv.svId, slot.start, slot.end)
      if (!r.ok) {
        setFehler(r.error ?? 'Buchung fehlgeschlagen.')
        setBuchend(false)
        return
      }
      setGewaehlt({ svName: sv.vorname, slotStart: slot.start })
      onChange(r.terminId ?? slot.start) // markiert das Pflicht-Feld als gefuellt
      setStep('gebucht')
    } catch {
      setFehler('Buchung fehlgeschlagen.')
      setBuchend(false)
    }
  }

  if (step === 'laden') {
    return <p className="text-sm text-claimondo-navy/60 px-[22px]">Wir suchen den passenden Gutachter für Sie …</p>
  }

  if (step === 'kein_match') {
    return (
      <div data-testid="termin-kein-match" className="px-[22px]">
        <p className="text-sm text-claimondo-navy/70">
          {fehler ?? 'Für Ihren Standort konnten wir gerade keinen freien Termin finden — unser Team meldet sich kurzfristig telefonisch bei Ihnen.'}
        </p>
      </div>
    )
  }

  if (step === 'fehler') {
    return <p className="text-sm text-claimondo-navy/70 px-[22px]">{fehler ?? 'Es ist ein Fehler aufgetreten.'}</p>
  }

  if (step === 'gebucht') {
    return (
      <div data-testid="termin-gebucht" className="px-[22px]">
        <p className="text-sm font-semibold text-claimondo-navy">Termin reserviert ✓</p>
        {gewaehlt && (
          <p className="text-sm text-claimondo-navy/70 mt-1">
            {gewaehlt.svName} · {fmtSlot(gewaehlt.slotStart)}
          </p>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setGewaehlt(null)
              setStep('laden')
            }}
            className="text-sm font-medium text-claimondo-ondo mt-2"
          >
            Termin ändern
          </button>
        )}
      </div>
    )
  }

  // step === 'auswahl'
  return (
    <div className="w-full">
      {fehler && <p className="text-sm text-claimondo-navy/70 mb-2 px-[22px]">{fehler}</p>}
      <div className="flex flex-col gap-3">
        {svs.map((sv, i) => (
          <Card key={sv.svId} p={4} radius="lg">
            <div data-testid={`termin-sv-${i}`} className="flex items-center gap-3 mb-2">
              {sv.profilbild ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sv.profilbild} alt={sv.vorname} className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="h-11 w-11 rounded-full bg-claimondo-bg flex items-center justify-center text-claimondo-navy font-semibold">
                  {sv.vorname.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-claimondo-navy">{sv.vorname}</span>
                  {i === 0 && <span className="text-[11px] font-semibold text-claimondo-ondo">Empfohlen</span>}
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
            {sv.slots.length === 0 ? (
              <p className="text-sm text-claimondo-navy/50">Aktuell keine freien Termine.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sv.slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    disabled={buchend || disabled}
                    data-testid={`termin-slot-${sv.svId}-${slot.start}`}
                    onClick={() => slotWaehlen(sv, slot)}
                    className="rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy transition hover:border-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
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
