'use client'

// AAR-864: Kunden-Modal zum proaktiven Termin-Verschieben.
//
// Flow:
//  1. Beim Öffnen: 3 Route-aware Vorschläge laden (getKundeTerminVorschlaegeAction)
//  2. Kunde wählt einen Vorschlag → bestätigen → kundeTerminVerlegungVorschlagen
//  3. Oder: Kunde gibt Wunschtermin ein → prüfen → wenn frei → abschicken
//     → wenn belegt → 3 Alternativen (früher/später/+1d)
// SV-Kalender bleibt privat — keine Route-Details, nur Frei/Belegt + 3 Slots.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  Loader2Icon,
} from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import {
  getKundeTerminVorschlaegeAction,
  kundeTerminVerlegungVorschlagen,
} from '@/lib/actions/termin-verlegung-actions'
import type { KundenAlternative } from '@/lib/termine/verlegung-vorschlaege'

type Vorschlag = { start: string; end: string; datum: string }

type Props = {
  open: boolean
  onClose: () => void
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

  // Vorschläge-Loader
  const [ladeVorschlaege, setLadeVorschlaege] = useState(false)
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([])
  const [vorschlaegeErr, setVorschlaegeErr] = useState<string | null>(null)
  const [ausgewaehlterVorschlag, setAusgewaehlterVorschlag] = useState<Vorschlag | null>(null)

  // Wunschtermin-Bereich
  const [showCustom, setShowCustom] = useState(false)
  const [wunsch, setWunsch] = useState('')
  const [alternatives, setAlternatives] = useState<KundenAlternative[]>([])
  const [alternativeAuswahl, setAlternativeAuswahl] = useState<KundenAlternative | null>(null)

  // Allgemein
  const [grund, setGrund] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  function reset() {
    setVorschlaege([])
    setVorschlaegeErr(null)
    setAusgewaehlterVorschlag(null)
    setShowCustom(false)
    setWunsch('')
    setAlternatives([])
    setAlternativeAuswahl(null)
    setGrund('')
    setFehler(null)
    setSubmitting(false)
  }

  // Vorschläge laden sobald Modal öffnet
  useEffect(() => {
    if (!open) return
    setLadeVorschlaege(true)
    setVorschlaegeErr(null)
    setVorschlaege([])
    getKundeTerminVorschlaegeAction(terminId)
      .then((r) => {
        if (r.ok) {
          setVorschlaege(r.vorschlaege)
        } else {
          setVorschlaegeErr(r.error)
        }
        setLadeVorschlaege(false)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[AAR-864] getKundeTerminVorschlaegeAction rejected:', msg)
        setVorschlaegeErr(`Unerwarteter Fehler: ${msg}`)
        setLadeVorschlaege(false)
      })
  }, [open, terminId])

  async function submitSlot(neuesStartIso: string) {
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
      if (r.alternatives && r.alternatives.length > 0) {
        setAlternatives(r.alternatives)
        setAlternativeAuswahl(null)
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

  function handleVorschlagWaehlen(v: Vorschlag) {
    setAusgewaehlterVorschlag(v)
    setAlternatives([])
    setAlternativeAuswahl(null)
    setFehler(null)
    setShowCustom(false)
    setWunsch('')
  }

  function handleVorschlagAbsenden() {
    if (!ausgewaehlterVorschlag) return
    submitSlot(ausgewaehlterVorschlag.start)
  }

  function handleWunschPruefen() {
    if (!wunsch) {
      setFehler('Bitte einen Wunschtermin angeben.')
      return
    }
    setAlternatives([])
    setAlternativeAuswahl(null)
    setFehler(null)
    setAusgewaehlterVorschlag(null)
    submitSlot(new Date(wunsch).toISOString())
  }

  function handleAlternativeSenden() {
    if (!alternativeAuswahl) return
    setAlternatives([])
    setAusgewaehlterVorschlag(null)
    submitSlot(alternativeAuswahl.start)
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} maxWidth={520} ariaLabel="Termin verschieben">
      <h3 className="text-lg font-semibold text-claimondo-navy mb-1">Termin verschieben</h3>
      <p className="text-sm text-claimondo-ondo mb-4">
        Wählen Sie einen der verfügbaren Vorschläge oder geben Sie einen eigenen Wunschtermin an.
      </p>

      {/* ── Sektion 1: Vorschläge ── */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-2">
          Verfügbare Termine
        </p>

        {ladeVorschlaege && (
          <div className="flex items-center gap-2 py-4 text-sm text-claimondo-ondo">
            <Loader2Icon className="w-4 h-4 animate-spin" />
            Suche verfügbare Termine…
          </div>
        )}

        {!ladeVorschlaege && vorschlaegeErr && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            {vorschlaegeErr}
          </p>
        )}

        {!ladeVorschlaege && !vorschlaegeErr && vorschlaege.length === 0 && (
          <p className="text-sm text-claimondo-ondo italic py-2">
            Keine automatischen Vorschläge verfügbar — bitte Wunschtermin eingeben.
          </p>
        )}

        {!ladeVorschlaege && vorschlaege.length > 0 && (
          <div className="space-y-2">
            {vorschlaege.map((v, idx) => {
              const sel = ausgewaehlterVorschlag?.start === v.start
              return (
                <button
                  key={v.start}
                  type="button"
                  onClick={() => handleVorschlagWaehlen(v)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${
                    sel
                      ? 'border-claimondo-navy bg-claimondo-navy/[0.06]'
                      : 'border-claimondo-border bg-white hover:bg-[#f8f9fb]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CalendarIcon className={`w-4 h-4 shrink-0 ${sel ? 'text-claimondo-navy' : 'text-claimondo-ondo'}`} />
                    <span className={`text-xs uppercase tracking-wider font-semibold ${sel ? 'text-claimondo-navy' : 'text-claimondo-ondo'}`}>
                      Vorschlag {idx + 1}
                    </span>
                    {sel && <CheckIcon className="w-4 h-4 text-claimondo-navy ml-auto" />}
                  </div>
                  <p className={`text-sm font-semibold mt-1 ${sel ? 'text-claimondo-navy' : 'text-claimondo-navy/80'}`}>
                    {fmtDateTime(v.start)}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sektion 2: Wunschtermin ── */}
      <div className="border-t border-claimondo-border pt-3 mb-4">
        <button
          type="button"
          onClick={() => { setShowCustom(!showCustom); setAusgewaehlterVorschlag(null); setAlternatives([]); setFehler(null) }}
          className="flex items-center gap-1.5 text-sm font-medium text-claimondo-navy hover:text-claimondo-navy/70 transition-colors"
        >
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
          Anderen Termin wählen
        </button>

        {showCustom && (
          <div className="mt-3 space-y-3">
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
                  setAlternativeAuswahl(null)
                  setFehler(null)
                }}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo"
              />
            </div>

            {/* Alternativen wenn Wunschslot belegt */}
            {alternatives.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-300 p-3">
                <p className="text-sm font-semibold text-amber-900 mb-2">
                  Wunschtermin belegt — bitte einen Alternativ-Vorschlag wählen:
                </p>
                <div className="space-y-2">
                  {alternatives.map((alt) => {
                    const sel = alternativeAuswahl?.start === alt.start
                    return (
                      <button
                        key={alt.start}
                        type="button"
                        onClick={() => setAlternativeAuswahl(alt)}
                        className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                          sel
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

            {fehler && alternatives.length === 0 && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {fehler}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Grund ── */}
      <div className="mb-4">
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

      {fehler && !showCustom && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
          {fehler}
        </p>
      )}

      {/* ── Footer-Buttons ── */}
      <div className="flex gap-2">
        <button
          onClick={() => { reset(); onClose() }}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-[#f8f9fb] hover:bg-claimondo-border transition-colors disabled:opacity-50"
        >
          Abbrechen
        </button>

        {/* Alternativen-Auswahl im Custom-Bereich */}
        {alternatives.length > 0 && alternativeAuswahl ? (
          <button
            onClick={handleAlternativeSenden}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            Alternativ-Vorschlag senden
          </button>
        ) : showCustom && wunsch && alternatives.length === 0 ? (
          <button
            onClick={handleWunschPruefen}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            Termin prüfen & vorschlagen
          </button>
        ) : ausgewaehlterVorschlag ? (
          <button
            onClick={handleVorschlagAbsenden}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium text-white bg-claimondo-navy hover:bg-claimondo-navy/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            Vorschlag senden
          </button>
        ) : null}
      </div>
    </Modal>
  )
}
