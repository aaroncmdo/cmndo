'use client'

// AAR-368: 3-Schritt-Modal für Kunden-seitige Buchung eines 30-Min-Beratungs-
// termins beim zugeordneten Kundenbetreuer. Dauer = 30min (laut
// KB_BERATUNG_DURATION_MIN), Ticket schrieb 15min — Abweichung liegt am
// bestehenden constants.ts, bewusst nicht geändert.
//
// Flow:
//   Step 1: Thema (Dropdown) + Freitext (optional, max 200)
//   Step 2: Datum wählen → Uhrzeiten als Chips
//   Step 3: Zusammenfassung + Bestätigen

import { useState, useMemo, useTransition, useEffect } from 'react'
import { CalendarIcon, ClockIcon, XIcon, CheckIcon, VideoIcon, PhoneIcon, ArrowRightIcon, ArrowLeftIcon, LoaderIcon } from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import {
  ladeVerfuegbareBeratungSlots,
  bucheBeratungstermin,
  type FreeSlot,
} from '@/app/kunde/faelle/[id]/beratung-actions'

type Step = 1 | 2 | 3 | 'success'

const THEMEN = [
  'Frage zum Gutachten',
  'Frage zur Regulierung',
  'Dokumenten-Frage',
  'Sonstiges',
] as const

export default function BeratungBuchenSheet({
  fallId,
  open,
  onClose,
}: {
  fallId: string
  open: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>(1)
  const [thema, setThema] = useState<string>(THEMEN[0])
  const [beschreibung, setBeschreibung] = useState('')
  const [kanal, setKanal] = useState<'video' | 'telefon'>('video')

  const [slots, setSlots] = useState<FreeSlot[] | null>(null)
  const [kbName, setKbName] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [selectedDatum, setSelectedDatum] = useState<string | null>(null)
  const [selectedUhrzeit, setSelectedUhrzeit] = useState<string | null>(null)

  const [bookErr, setBookErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Beim Öffnen die Slots laden
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setLoadErr(null)
    ladeVerfuegbareBeratungSlots(fallId).then(res => {
      if (cancelled) return
      if (res.ok) {
        setSlots(res.slots)
        setKbName(res.kbName)
      } else {
        setLoadErr(res.error)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, fallId])

  // Slots gruppiert nach Datum
  const slotsByDatum = useMemo(() => {
    if (!slots) return new Map<string, string[]>()
    const map = new Map<string, string[]>()
    for (const s of slots) {
      const arr = map.get(s.datum) ?? []
      arr.push(s.uhrzeit)
      map.set(s.datum, arr)
    }
    return map
  }, [slots])

  const availableDatums = useMemo(() => Array.from(slotsByDatum.keys()), [slotsByDatum])
  const uhrzeitenForSelected = selectedDatum ? slotsByDatum.get(selectedDatum) ?? [] : []

  function reset() {
    setStep(1)
    setThema(THEMEN[0])
    setBeschreibung('')
    setKanal('video')
    setSelectedDatum(null)
    setSelectedUhrzeit(null)
    setBookErr(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleBook() {
    if (!selectedDatum || !selectedUhrzeit) return
    setBookErr(null)
    startTransition(async () => {
      const res = await bucheBeratungstermin(
        fallId,
        selectedDatum,
        selectedUhrzeit,
        kanal,
        thema,
        beschreibung.trim() || undefined,
      )
      if (res.ok) {
        setStep('success')
      } else {
        setBookErr(res.error)
      }
    })
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      placement="bottom-sheet"
      noPadding
      hideCloseButton
      maxWidth={512}
      ariaLabel="Beratungstermin buchen"
    >
      <div className="overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border">
          <div>
            <p className="text-xs uppercase tracking-wider text-claimondo-ondo">Beratungstermin</p>
            <p className="text-sm font-semibold text-[#0D1B3E]">
              {step === 'success' ? 'Termin bestätigt' : `Schritt ${step} von 3`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 rounded-full hover:bg-[#f8f9fb] flex items-center justify-center"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5 text-claimondo-ondo" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#0D1B3E] mb-2">Worum geht es?</label>
                <select
                  value={thema}
                  onChange={(e) => setThema(e.target.value)}
                  className="w-full min-h-11 px-3 rounded-xl border-2 border-claimondo-border focus:border-[#4573A2] focus:outline-none bg-white text-sm"
                >
                  {THEMEN.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0D1B3E] mb-2">
                  Kurze Beschreibung <span className="text-xs font-normal text-claimondo-ondo">(optional)</span>
                </label>
                <textarea
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value.slice(0, 200))}
                  rows={3}
                  placeholder="z. B. ‚Ich habe eine Rückfrage zur Höhe der Regulierung'"
                  // AAR-452: text-base verhindert iOS-Autozoom beim Fokus
                  className="w-full px-3 py-2 rounded-xl border-2 border-claimondo-border focus:border-[#4573A2] focus:outline-none text-base resize-none"
                />
                <p className="mt-1 text-xs text-claimondo-ondo">{beschreibung.length}/200 Zeichen</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0D1B3E] mb-2">Kanal</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setKanal('video')}
                    className={`flex items-center justify-center gap-2 min-h-11 rounded-xl border-2 text-sm font-medium transition-all ${
                      kanal === 'video' ? 'border-[#4573A2] bg-[#4573A2]/5 text-[#0D1B3E]' : 'border-claimondo-border text-claimondo-ondo hover:border-claimondo-ondo/60'
                    }`}
                  >
                    <VideoIcon className="w-4 h-4" /> Video-Call
                  </button>
                  <button
                    type="button"
                    onClick={() => setKanal('telefon')}
                    className={`flex items-center justify-center gap-2 min-h-11 rounded-xl border-2 text-sm font-medium transition-all ${
                      kanal === 'telefon' ? 'border-[#4573A2] bg-[#4573A2]/5 text-[#0D1B3E]' : 'border-claimondo-border text-claimondo-ondo hover:border-claimondo-ondo/60'
                    }`}
                  >
                    <PhoneIcon className="w-4 h-4" /> Telefon
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {loading && (
                <div className="flex items-center justify-center py-10 text-claimondo-ondo">
                  <LoaderIcon className="w-5 h-5 animate-spin mr-2" /> Verfügbare Termine werden geladen…
                </div>
              )}
              {loadErr && (
                <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                  {loadErr}
                </div>
              )}
              {!loading && !loadErr && availableDatums.length === 0 && (
                <p className="text-sm text-claimondo-ondo">
                  Aktuell sind keine Termine verfügbar. Bitte kontaktieren Sie uns direkt im Chat.
                </p>
              )}
              {!loading && availableDatums.length > 0 && (
                <>
                  <div>
                    <p className="text-sm font-medium text-[#0D1B3E] mb-2 flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4" /> Tag wählen
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {availableDatums.slice(0, 9).map(d => {
                        const date = new Date(d)
                        const isSelected = selectedDatum === d
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setSelectedDatum(d)
                              setSelectedUhrzeit(null)
                            }}
                            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-all ${
                              isSelected ? 'border-[#4573A2] bg-[#4573A2]/5' : 'border-claimondo-border hover:border-claimondo-ondo/60'
                            }`}
                          >
                            <span className="text-xs text-claimondo-ondo uppercase">
                              {date.toLocaleDateString('de-DE', { weekday: 'short' })}
                            </span>
                            <span className="text-sm font-semibold text-[#0D1B3E]">
                              {date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {selectedDatum && (
                    <div>
                      <p className="text-sm font-medium text-[#0D1B3E] mb-2 flex items-center gap-1.5">
                        <ClockIcon className="w-4 h-4" /> Uhrzeit wählen
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {uhrzeitenForSelected.map(u => {
                          const isSelected = selectedUhrzeit === u
                          return (
                            <button
                              key={u}
                              type="button"
                              onClick={() => setSelectedUhrzeit(u)}
                              className={`min-h-11 rounded-xl border-2 text-sm font-medium transition-all ${
                                isSelected
                                  ? 'border-[#4573A2] bg-[#4573A2] text-white'
                                  : 'border-claimondo-border text-claimondo-navy hover:border-claimondo-ondo/60'
                              }`}
                            >
                              {u}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 3 && selectedDatum && selectedUhrzeit && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-[#4573A2]/30 bg-[#4573A2]/5 p-4 space-y-2.5">
                <Row label="Thema" value={thema} />
                {beschreibung.trim() && <Row label="Beschreibung" value={beschreibung} />}
                <Row
                  label="Datum"
                  value={new Date(selectedDatum).toLocaleDateString('de-DE', {
                    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                  })}
                />
                <Row label="Uhrzeit" value={`${selectedUhrzeit} Uhr · 30 Minuten`} />
                <Row label="Kanal" value={kanal === 'video' ? 'Video-Call' : 'Telefon'} />
                {kbName && <Row label="Berater" value={kbName} />}
              </div>
              {bookErr && (
                <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  {bookErr}
                </div>
              )}
              <p className="text-xs text-claimondo-ondo">
                Sie erhalten eine WhatsApp-Bestätigung{kanal === 'video' ? ' mit dem Video-Link' : ''}.
              </p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <CheckIcon className="w-7 h-7 text-emerald-600" strokeWidth={3} />
              </div>
              <p className="text-lg font-semibold text-[#0D1B3E]">Termin gebucht!</p>
              <p className="mt-1.5 text-sm text-claimondo-ondo">
                Sie erhalten in Kürze eine WhatsApp-Bestätigung.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'success' && (
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-claimondo-border bg-[#f8f9fb]">
            <button
              type="button"
              onClick={() => {
                if (step === 1) handleClose()
                else setStep((step - 1) as Step)
              }}
              className="flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-medium text-claimondo-navy hover:bg-[#f8f9fb] transition-colors"
            >
              {step === 1 ? 'Abbrechen' : (<><ArrowLeftIcon className="w-4 h-4" /> Zurück</>)}
            </button>
            {step === 1 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#3a6290] transition-colors"
              >
                Weiter <ArrowRightIcon className="w-4 h-4" />
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!selectedDatum || !selectedUhrzeit}
                className="flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#3a6290] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Weiter <ArrowRightIcon className="w-4 h-4" />
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                onClick={handleBook}
                disabled={isPending}
                className="flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#3a6290] disabled:opacity-60 transition-colors"
              >
                {isPending ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                Termin bestätigen
              </button>
            )}
          </div>
        )}
        {step === 'success' && (
          <div className="px-5 py-4 border-t border-claimondo-border bg-[#f8f9fb]">
            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-11 rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#3a6290] transition-colors"
            >
              Schließen
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-claimondo-ondo shrink-0">{label}</span>
      <span className="font-medium text-[#0D1B3E] text-right">{value}</span>
    </div>
  )
}
