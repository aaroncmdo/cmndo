'use client'

// AAR-864: SV-Termin-Verlegen-Modal mit Routen-Check + Top-3-Vorschlägen.
//
// Beim Open: lädt Top-3 nahesten Slots via Engine (lib/termine/
// verlegung-vorschlaege.ts), zeigt Routen-Detail (Vor + Nach Termin)
// und Ampel pro Vorschlag. SV kann einen Vorschlag wählen oder einen
// freien Slot eingeben (manueller Datetime-Picker — On-Demand-Routen-
// Check folgt in Phase 6 falls relevant; Phase 3 zeigt erstmal nur
// die Top-3 + freien Eintrag).
//
// Submit ruft terminVerlegungVorschlagen — alter Termin → 'verlegt',
// neuer Slot → 'verlegung_pending'. Notifikationen folgen in Phase 5.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarIcon,
  CarIcon,
  ClockIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
} from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import {
  getVerlegungsVorschlaegeAction,
  terminVerlegungVorschlagen,
} from '@/lib/actions/termin-verlegung-actions'
import type {
  VerlegungsVorschlag,
  Ampel,
} from '@/lib/termine/verlegung-vorschlaege'

type Props = {
  open: boolean
  onClose: () => void
  terminId: string
  fallId: string
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ampelDot(ampel: Ampel) {
  if (ampel === 'green')
    return <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
  if (ampel === 'yellow')
    return <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" />
  return <XCircleIcon className="w-4 h-4 text-red-600 shrink-0" />
}

export default function TerminVerlegenModal({ open, onClose, terminId, fallId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [vorschlaege, setVorschlaege] = useState<VerlegungsVorschlag[]>([])
  const [slotDauerMin, setSlotDauerMin] = useState(45)
  const [auswahl, setAuswahl] = useState<VerlegungsVorschlag | null>(null)
  const [eigenerSlot, setEigenerSlot] = useState('')
  const [grund, setGrund] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Vorschläge laden beim Open
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setFehler(null)
    setAuswahl(null)
    setEigenerSlot('')
    getVerlegungsVorschlaegeAction({ terminId, fallId })
      .then((r) => {
        if (cancelled) return
        if (!r.ok) {
          setFehler(r.error)
          setVorschlaege([])
          return
        }
        setVorschlaege(r.vorschlaege)
        setSlotDauerMin(r.slotDauerMin)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, terminId, fallId])

  async function submit() {
    let neuesStartIso: string | null = null
    if (auswahl) {
      neuesStartIso = auswahl.start
    } else if (eigenerSlot) {
      // datetime-local liefert lokale Zeit ohne TZ — als ISO konvertieren
      const local = new Date(eigenerSlot)
      neuesStartIso = local.toISOString()
    } else {
      setFehler('Bitte einen Slot auswählen oder einen eigenen Termin angeben.')
      return
    }
    const neuesEndeIso = new Date(
      new Date(neuesStartIso).getTime() + slotDauerMin * 60_000,
    ).toISOString()

    setSubmitting(true)
    setFehler(null)
    const r = await terminVerlegungVorschlagen({
      terminId,
      neuesStartIso,
      neuesEndeIso,
      grund: grund.trim() || undefined,
    })
    setSubmitting(false)
    if (!r.ok) {
      setFehler(r.error)
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={560} ariaLabel="Termin verlegen">
      <h3 className="text-lg font-semibold text-claimondo-navy mb-1">
        Termin verlegen
      </h3>
      <p className="text-sm text-claimondo-ondo mb-4">
        Wir schlagen die nahesten freien Slots vor — inklusive Routen-Check zu deinen
        anderen Terminen. Slot-Dauer: {slotDauerMin} Minuten.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-claimondo-ondo py-8 justify-center">
          <Loader2Icon className="w-5 h-5 animate-spin" />
          <span className="text-sm">Lade passende Slots…</span>
        </div>
      )}

      {!loading && vorschlaege.length > 0 && (
        <div className="space-y-2 mb-4">
          {vorschlaege.map((v, i) => {
            const istAusgewaehlt = auswahl?.start === v.start
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setAuswahl(v)
                  setEigenerSlot('')
                }}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  istAusgewaehlt
                    ? 'border-claimondo-navy bg-claimondo-navy/[0.06]'
                    : 'border-claimondo-border bg-white hover:bg-claimondo-navy/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {ampelDot(v.ampel)}
                  <CalendarIcon className="w-4 h-4 text-claimondo-navy" />
                  <span className="font-semibold text-claimondo-navy">
                    {fmtDate(v.start)}, {fmtTime(v.start)} Uhr
                  </span>
                </div>
                <div className="text-xs text-claimondo-ondo space-y-0.5 ml-6">
                  {v.vor && (
                    <p className="flex items-center gap-1.5">
                      <CarIcon className="w-3 h-3 shrink-0" />
                      <span>
                        {v.vor.quelle === 'buero'
                          ? `Vom Büro (${v.vor.adresse}): ${v.vor.fahrtMin} Min Fahrt`
                          : `Nach Termin ${v.vor.end ? fmtTime(v.vor.end) : ''} Uhr (${v.vor.adresse}): ${v.vor.fahrtMin} Min Fahrt${v.vor.pufferMin !== null ? ` · ${v.vor.pufferMin} Min Puffer` : ''}`}
                      </span>
                    </p>
                  )}
                  {v.nach && (
                    <p className="flex items-center gap-1.5">
                      <ClockIcon className="w-3 h-3 shrink-0" />
                      <span>
                        Vor Termin {fmtTime(v.nach.start)} Uhr ({v.nach.adresse}):{' '}
                        {v.nach.fahrtMin} Min Fahrt · {v.nach.pufferMin} Min Puffer
                      </span>
                    </p>
                  )}
                  {!v.vor && !v.nach && (
                    <p className="text-xs italic">Keine anderen Termine an diesem Tag.</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {!loading && vorschlaege.length === 0 && !fehler && (
        <p className="text-sm text-claimondo-ondo bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          Keine passenden Slots in den nächsten 14 Tagen gefunden — bitte einen eigenen
          Slot eingeben.
        </p>
      )}

      {/* Eigener Slot */}
      <div className="rounded-xl border border-claimondo-border bg-claimondo-bg p-3 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo mb-2">
          Anderer Slot
        </p>
        <input
          type="datetime-local"
          value={eigenerSlot}
          onChange={(e) => {
            setEigenerSlot(e.target.value)
            setAuswahl(null)
          }}
          min={new Date().toISOString().slice(0, 16)}
          className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo bg-white"
        />
      </div>

      {/* Grund */}
      <textarea
        value={grund}
        onChange={(e) => setGrund(e.target.value)}
        placeholder="Grund für die Verlegung (wird dem Kunden angezeigt)"
        rows={2}
        className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy mb-4 resize-none focus:outline-none focus:border-claimondo-ondo"
      />

      {fehler && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
          {fehler}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors disabled:opacity-50"
        >
          Abbrechen
        </button>
        <button
          onClick={submit}
          disabled={submitting || (!auswahl && !eigenerSlot)}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Wird gesendet…' : 'Vorschlag senden'}
        </button>
      </div>
    </Modal>
  )
}
