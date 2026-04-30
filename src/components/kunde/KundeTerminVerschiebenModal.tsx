'use client'

// AAR-864: Kunden-Modal zum proaktiven Termin-Verschieben.
// - Kunde gibt Wunschtermin ein
// - Action prüft Free-Busy beim SV
// - Wenn frei: Vorschlag wird abgesendet, SV bestätigt
// - Wenn belegt: 3 Alternativen werden vorgeschlagen (früher / später / +1d)
// - Kunde sieht NIE den vollständigen Kalender des SV (Privatsphäre)

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  Loader2Icon,
} from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import { kundeTerminVerlegungVorschlagen } from '@/lib/actions/termin-verlegung-actions'
import type { KundenAlternative } from '@/lib/termine/verlegung-vorschlaege'

type Props = {
  open: boolean
  onClose: () => void
  /** ID des aktuell bestätigten Termins, der verschoben werden soll. */
  terminId: string
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
}

export default function KundeTerminVerschiebenModal({ open, onClose, terminId }: Props) {
  const router = useRouter()
  const [wunsch, setWunsch] = useState('')
  const [grund, setGrund] = useState('')
  const [alternatives, setAlternatives] = useState<KundenAlternative[]>([])
  const [auswahl, setAuswahl] = useState<KundenAlternative | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  function reset() {
    setWunsch('')
    setGrund('')
    setAlternatives([])
    setAuswahl(null)
    setFehler(null)
    setSubmitting(false)
  }

  async function submit(neuesStartIso: string) {
    setSubmitting(true)
    setFehler(null)
    try {
      const r = await kundeTerminVerlegungVorschlagen({
        terminId,
        neuesStartIso,
        grund: grund.trim() || undefined,
      })
      if (r.ok) {
        reset()
        onClose()
        router.refresh()
        return
      }
      // Belegt → Alternativen anzeigen
      if (r.alternatives && r.alternatives.length > 0) {
        setAlternatives(r.alternatives)
        setFehler(r.error)
      } else {
        setFehler(r.error)
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  function handlePruefen() {
    if (!wunsch) {
      setFehler('Bitte einen Wunschtermin angeben.')
      return
    }
    const iso = new Date(wunsch).toISOString()
    setAlternatives([])
    setAuswahl(null)
    submit(iso)
  }

  function handleAlternativeWaehlen(alt: KundenAlternative) {
    setAuswahl(alt)
  }

  function handleAlternativeSenden() {
    if (!auswahl) return
    submit(auswahl.start)
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} maxWidth={520} ariaLabel="Termin verschieben">
      <h3 className="text-lg font-semibold text-claimondo-navy mb-1">Termin verschieben</h3>
      <p className="text-sm text-claimondo-ondo mb-4">
        Wählen Sie einen Wunschtermin. Falls dieser beim Gutachter belegt ist,
        bekommen Sie drei Vorschläge in der Nähe.
      </p>

      {/* Wunsch-DateTime + Grund */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-1">
            Wunschtermin
          </label>
          <input
            type="datetime-local"
            value={wunsch}
            onChange={(e) => {
              setWunsch(e.target.value)
              setAlternatives([])
              setAuswahl(null)
              setFehler(null)
            }}
            min={new Date().toISOString().slice(0, 16)}
            className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-1">
            Grund (optional)
          </label>
          <textarea
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            placeholder="Wird dem Gutachter angezeigt"
            rows={2}
            className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy resize-none focus:outline-none focus:border-claimondo-ondo"
          />
        </div>
      </div>

      {fehler && alternatives.length === 0 && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
          {fehler}
        </p>
      )}

      {/* Alternativen wenn Wunschslot belegt */}
      {alternatives.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 mb-4">
          <p className="text-sm font-semibold text-amber-900 mb-2">
            Wunschtermin belegt — bitte einen Alternativ-Vorschlag wählen:
          </p>
          <div className="space-y-2">
            {alternatives.map((alt) => {
              const ist = auswahl?.start === alt.start
              return (
                <button
                  key={alt.start}
                  type="button"
                  onClick={() => handleAlternativeWaehlen(alt)}
                  className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                    ist
                      ? 'border-claimondo-navy bg-claimondo-navy/[0.06]'
                      : 'border-amber-200 bg-white hover:bg-amber-100/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {alt.diffTage > 0 ? (
                      <CalendarIcon className="w-4 h-4 text-amber-700" />
                    ) : (
                      <ClockIcon className="w-4 h-4 text-amber-700" />
                    )}
                    <span className="text-xs uppercase tracking-wider text-amber-700 font-semibold">
                      {alt.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-claimondo-navy mt-1">
                    {fmtDateTime(alt.start)}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { reset(); onClose() }}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-[#f8f9fb] hover:bg-claimondo-border transition-colors disabled:opacity-50"
        >
          Abbrechen
        </button>
        {alternatives.length > 0 ? (
          <button
            onClick={handleAlternativeSenden}
            disabled={submitting || !auswahl}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            Vorschlag senden
          </button>
        ) : (
          <button
            onClick={handlePruefen}
            disabled={submitting || !wunsch}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            Termin prüfen & vorschlagen
          </button>
        )}
      </div>
    </Modal>
  )
}
