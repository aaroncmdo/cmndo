'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarIcon, PhoneIcon, VideoIcon, XIcon, ChevronDownIcon, ChevronUpIcon, AlertCircleIcon, CheckCircleIcon } from 'lucide-react'
import { bookKbTermin, cancelKbTermin } from '@/lib/termine/kb-booking'

type Slot = { datum: string; uhrzeit: string }

type ExistingTermin = {
  id: string
  start_zeit: string
  kanal: string
  video_link: string | null
  notiz_kunde: string | null
  status: string
}

type Props = {
  fallId: string
  kbVorname: string
  slots: Slot[]
  existingTermin: ExistingTermin | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDatum(datum: string) {
  return new Date(datum + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

export default function BeratungsterminClient({ fallId, kbVorname, slots, existingTermin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Slot picker state
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [kanal, setKanal] = useState<'telefon' | 'video'>('telefon')
  const [notiz, setNotiz] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)

  // Cancel state
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccess, setCancelSuccess] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Toast state
  const [toast, setToast] = useState<string | null>(null)

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const slot of slots) {
      const existing = map.get(slot.datum) ?? []
      existing.push(slot)
      map.set(slot.datum, existing)
    }
    return map
  }, [slots])

  const dayKeys = useMemo(() => Array.from(slotsByDay.keys()).sort(), [slotsByDay])

  function handleSlotClick(slot: Slot) {
    setSelectedSlot(slot)
    setKanal('telefon')
    setNotiz('')
    setModalError(null)
    setShowModal(true)
  }

  function handleConfirmBook() {
    if (!selectedSlot) return
    setModalError(null)
    startTransition(async () => {
      const result = await bookKbTermin(
        fallId,
        selectedSlot.datum,
        selectedSlot.uhrzeit,
        kanal,
        notiz.trim() || undefined,
      )
      if (!result.ok) {
        setModalError(result.error)
        return
      }
      setShowModal(false)
      setToast('Termin erfolgreich gebucht!')
      setTimeout(() => router.refresh(), 1500)
    })
  }

  function handleCancel() {
    if (!existingTermin) return
    setCancelError(null)
    startTransition(async () => {
      const result = await cancelKbTermin(existingTermin.id)
      if (!result.ok) {
        setCancelError(result.error)
        return
      }
      setCancelSuccess(true)
      setConfirmCancel(false)
      setTimeout(() => router.refresh(), 1500)
    })
  }

  // ─── Existing termin view ──────────────────────────────────────────────────
  if (existingTermin) {
    const startDate = new Date(existingTermin.start_zeit)
    const datum = startDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    const uhrzeit = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

    return (
      <div className="w-full px-4 md:px-8 py-6 max-w-xl mx-auto">
        <h1 className="text-xl font-bold text-[#0D1B3E] mb-1">Ihr Beratungstermin</h1>
        <p className="text-sm text-gray-500 mb-6">
          Sie haben einen bestätigten Termin mit {kbVorname}.
        </p>

        {/* Existing termin banner */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-green-800 font-semibold text-sm">Termin bestätigt</p>
              <p className="text-green-700 text-sm mt-1">{datum} um {uhrzeit} Uhr</p>
              <p className="text-green-600 text-xs mt-0.5">
                {existingTermin.kanal === 'video' ? 'Video-Call' : 'Telefon-Gespräch'}
              </p>
              {existingTermin.video_link && (
                <a
                  href={existingTermin.video_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-[#4573A2] underline hover:no-underline"
                >
                  <VideoIcon className="w-3.5 h-3.5" />
                  Video-Link öffnen
                </a>
              )}
              {existingTermin.notiz_kunde && (
                <p className="mt-2 text-xs text-green-600 italic">&ldquo;{existingTermin.notiz_kunde}&rdquo;</p>
              )}
            </div>
          </div>
        </div>

        {/* Cancel */}
        {cancelSuccess ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-gray-600 text-sm">Termin wurde storniert.</p>
          </div>
        ) : confirmCancel ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 text-sm font-medium mb-3">
              Termin wirklich stornieren?
            </p>
            {cancelError && <p className="text-red-600 text-xs mb-2">{cancelError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Zurück
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isPending ? '...' : 'Stornieren'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmCancel(true)}
            className="w-full py-2.5 text-sm font-medium text-red-500 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
          >
            Termin stornieren
          </button>
        )}
      </div>
    )
  }

  // ─── Slot picker view ─────────────────────────────────────────────────────

  return (
    <div className="w-full px-4 md:px-8 py-6 max-w-xl mx-auto">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-xl font-bold text-[#0D1B3E] mb-1">Termin buchen</h1>
      <p className="text-sm text-gray-500 mb-6">
        Wählen Sie einen Termin mit {kbVorname} für ein Beratungsgespräch.
      </p>

      {dayKeys.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <CalendarIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-[#0D1B3E] font-semibold">Keine Termine verfügbar</p>
          <p className="text-sm text-gray-500 mt-1">Aktuell sind keine freien Termine verfügbar. Bitte versuchen Sie es später erneut.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayKeys.map(datum => {
            const daySlots = slotsByDay.get(datum) ?? []
            const isExpanded = expandedDay === datum
            return (
              <div key={datum} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedDay(isExpanded ? null : datum)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="w-4 h-4 text-[#4573A2]" />
                    <span className="text-[#0D1B3E] font-medium text-sm">{formatDatum(datum)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{daySlots.length} Termin{daySlots.length !== 1 ? 'e' : ''}</span>
                    {isExpanded ? (
                      <ChevronUpIcon className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="flex flex-wrap gap-2 pt-3">
                      {daySlots.map(slot => (
                        <button
                          key={slot.uhrzeit}
                          onClick={() => handleSlotClick(slot)}
                          className="px-3 py-1.5 text-sm font-medium text-[#4573A2] bg-[#4573A2]/10 border border-[#4573A2]/20 rounded-lg hover:bg-[#4573A2] hover:text-white transition-colors"
                        >
                          {slot.uhrzeit} Uhr
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Booking modal */}
      {showModal && selectedSlot && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => !isPending && setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Termin bestätigen</h3>
              <button
                onClick={() => !isPending && setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#4573A2]/5 rounded-xl p-3 mb-4">
              <p className="text-[#0D1B3E] font-semibold text-sm">
                {formatDate(selectedSlot.datum + 'T00:00:00')}
              </p>
              <p className="text-[#4573A2] font-bold text-lg">{selectedSlot.uhrzeit} Uhr</p>
            </div>

            {/* Kanal selection */}
            <p className="text-sm font-medium text-gray-700 mb-2">Gesprächsart</p>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setKanal('telefon')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  kanal === 'telefon'
                    ? 'bg-[#4573A2] text-white border-[#4573A2]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#4573A2]'
                }`}
              >
                <PhoneIcon className="w-4 h-4" />
                Telefon
              </button>
              <button
                onClick={() => setKanal('video')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  kanal === 'video'
                    ? 'bg-[#4573A2] text-white border-[#4573A2]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#4573A2]'
                }`}
              >
                <VideoIcon className="w-4 h-4" />
                Video-Call
              </button>
            </div>

            {/* Notiz */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Thema / Notiz <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={notiz}
                onChange={e => setNotiz(e.target.value.slice(0, 200))}
                placeholder="Womit können wir Ihnen helfen?"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2] resize-none"
              />
              <p className="text-xs text-gray-400 text-right mt-0.5">{notiz.length}/200</p>
            </div>

            {modalError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <AlertCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-red-700 text-sm">{modalError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => !isPending && setShowModal(false)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirmBook}
                disabled={isPending}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-[#4573A2] rounded-xl hover:bg-[#1E3A5F] transition-colors disabled:opacity-50"
              >
                {isPending ? 'Buche...' : 'Termin buchen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
