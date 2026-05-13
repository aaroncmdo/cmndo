'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NavigationIcon, MapPinIcon, CheckCircleIcon, XCircleIcon, ClockIcon, AlertTriangleIcon, PlusIcon } from 'lucide-react'
import { startNavigation } from '@/lib/termine/actions'
import { svAblehneTermin, svGegenvorschlagTermin } from './actions'
import { Modal } from '@/components/primitives/Modal'

// KFZ-200: Client component for Termin-Detail action buttons.
// AAR-134: Ablehnen + Gegenvorschlag Modals + collapsible Section.

interface Props {
  terminId: string
  navigationStartedAt: string | null
  svAngekommen: boolean
  durchgefuehrt: boolean
  adresse: string
  // AAR-134: für conditional Sichtbarkeit der Ablehnen-Section
  status?: string
}

const ABLEHNEN_GRUENDE = ['Urlaub', 'Krankheit', 'Anderer Termin', 'Zu weit weg', 'Sonstiges']

export default function TerminDetailActions({
  terminId,
  navigationStartedAt,
  svAngekommen,
  durchgefuehrt,
  adresse,
  status,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // AAR-134
  const [showAblehnen, setShowAblehnen] = useState(false)
  const [showGegenvorschlag, setShowGegenvorschlag] = useState(false)

  // AAR-134: Ablehnen-Section nur sichtbar wenn Termin noch änderbar
  const canAblehnen =
    !durchgefuehrt &&
    !svAngekommen &&
    !navigationStartedAt &&
    (!status || ['reserviert', 'bestaetigt', 'gegenvorschlag'].includes(status))

  function handleStartNavigation() {
    setError(null)
    startTransition(async () => {
      const res = await startNavigation(terminId)
      if (res.error) { setError(res.error); return }
      if (res.redirectPath) router.push(res.redirectPath)
    })
  }

  if (durchgefuehrt) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
        <CheckCircleIcon className="w-6 h-6 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Begutachtung abgeschlossen</p>
          <p className="text-xs text-emerald-600 mt-0.5">Dieser Termin wurde erfolgreich durchgeführt.</p>
        </div>
      </div>
    )
  }

  if (svAngekommen) {
    return (
      <div className="space-y-3">
        <div className="bg-claimondo-bg border border-claimondo-border rounded-2xl p-4 flex items-center gap-3">
          <MapPinIcon className="w-5 h-5 text-claimondo-ondo flex-shrink-0" />
          <p className="text-sm font-medium text-claimondo-navy">SV ist vor Ort angekommen</p>
        </div>
        <Link
          href={`/gutachter/termine/${terminId}/vor-ort`}
          className="block w-full text-center bg-[var(--brand-primary)] hover:bg-claimondo-navy text-white rounded-2xl py-3.5 text-base font-semibold transition-colors"
        >
          Vor-Ort-Modus öffnen →
        </Link>
      </div>
    )
  }

  if (navigationStartedAt) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <NavigationIcon className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">Navigation läuft</p>
        </div>
        <Link
          href={`/gutachter/termine/${terminId}/navigation`}
          className="block w-full text-center bg-[var(--brand-secondary)] hover:bg-claimondo-shield text-white rounded-2xl py-3.5 text-base font-semibold transition-colors"
        >
          Zur Navigation →
        </Link>
        <Link
          href={`/gutachter/termine/${terminId}/vor-ort`}
          className="block w-full text-center bg-claimondo-bg hover:bg-claimondo-border text-claimondo-navy rounded-2xl py-3 text-sm font-medium transition-colors"
        >
          Direkt zum Vor-Ort-Modus
        </Link>
      </div>
    )
  }

  // Default: Navigation noch nicht gestartet
  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}
      {adresse && adresse !== '—' && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(adresse)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-[var(--brand-secondary)] hover:underline"
        >
          <MapPinIcon className="w-4 h-4" />
          {adresse}
        </a>
      )}
      <button
        onClick={handleStartNavigation}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-[var(--brand-secondary)] hover:bg-claimondo-shield text-white rounded-2xl py-4 text-base font-bold transition-colors disabled:opacity-50 shadow-lg shadow-[var(--brand-secondary)]/30"
      >
        <NavigationIcon className="w-5 h-5" />
        {pending ? 'Starte...' : 'Navigation starten'}
      </button>

      {/* AAR-134: Ablehnen / Gegenvorschlag — collapsible */}
      {canAblehnen && (
        <details className="bg-claimondo-bg border border-claimondo-border rounded-2xl">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-claimondo-navy">
            Kann ich diesen Termin nicht wahrnehmen?
          </summary>
          <div className="px-4 pb-4 pt-2 space-y-2">
            <button
              type="button"
              onClick={() => setShowAblehnen(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100"
            >
              <XCircleIcon className="w-4 h-4" />
              Termin komplett ablehnen
            </button>
            <button
              type="button"
              onClick={() => setShowGegenvorschlag(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100"
            >
              <ClockIcon className="w-4 h-4" />
              Anderen Termin vorschlagen
            </button>
          </div>
        </details>
      )}

      {showAblehnen && (
        <AblehnenModal
          terminId={terminId}
          onClose={() => setShowAblehnen(false)}
          onDone={() => router.push('/gutachter/termine')}
        />
      )}
      {showGegenvorschlag && (
        <GegenvorschlagModal
          terminId={terminId}
          onClose={() => setShowGegenvorschlag(false)}
          onDone={() => router.push('/gutachter/termine')}
        />
      )}
    </div>
  )
}

// ─── AAR-134: Ablehnen-Modal ──────────────────────────────────────────────
function AblehnenModal({
  terminId,
  onClose,
  onDone,
}: {
  terminId: string
  onClose: () => void
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [grund, setGrund] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (grund.trim().length < 10) {
      setError('Bitte mindestens 10 Zeichen Begründung angeben.')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await svAblehneTermin(terminId, grund)
      if (r.success) onDone()
      else setError(r.error ?? 'Fehler')
    })
  }

  return (
    <Modal open onClose={onClose} maxWidth={448} ariaLabel="Termin ablehnen">
      <h3 className="text-base font-semibold text-claimondo-navy mb-1 flex items-center gap-2">
        <XCircleIcon className="w-5 h-5 text-red-500" />
        Termin ablehnen
      </h3>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 my-3 flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Der Dispatcher wird benachrichtigt und muss einen anderen SV finden. Das kostet uns einen Auftrag.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ABLEHNEN_GRUENDE.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrund(g === 'Sonstiges' ? '' : g + ' — ')}
              className="text-[10px] px-2 py-1 rounded bg-claimondo-bg hover:bg-claimondo-border text-claimondo-navy"
            >
              {g}
            </button>
          ))}
        </div>
        <textarea
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
          placeholder="Begründung (min. 10 Zeichen)..."
          rows={3}
          className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--brand-secondary)]"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm bg-claimondo-bg text-claimondo-ondo"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            {pending ? 'Lehne ab...' : 'Termin ablehnen'}
          </button>
        </div>
    </Modal>
  )
}

// ─── AAR-134: Gegenvorschlag-Modal ────────────────────────────────────────
type SlotInput = { datum: string; zeit: string; dauerMin: number }

function emptySlot(): SlotInput {
  const morgen = new Date()
  morgen.setDate(morgen.getDate() + 1)
  return { datum: morgen.toISOString().slice(0, 10), zeit: '09:00', dauerMin: 120 }
}

function GegenvorschlagModal({
  terminId,
  onClose,
  onDone,
}: {
  terminId: string
  onClose: () => void
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [slots, setSlots] = useState<SlotInput[]>([emptySlot()])
  const [begruendung, setBegruendung] = useState('')
  const [error, setError] = useState<string | null>(null)

  function updateSlot(idx: number, patch: Partial<SlotInput>) {
    setSlots((s) => s.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot)))
  }
  function addSlot() {
    if (slots.length < 5) setSlots((s) => [...s, emptySlot()])
  }
  function removeSlot(idx: number) {
    if (slots.length > 1) setSlots((s) => s.filter((_, i) => i !== idx))
  }

  function handleSubmit() {
    setError(null)
    const isoSlots: { start: string; end: string }[] = []
    for (const [i, s] of slots.entries()) {
      if (!s.datum || !s.zeit) {
        setError(`Slot ${i + 1}: Datum + Zeit erforderlich`)
        return
      }
      const start = new Date(`${s.datum}T${s.zeit}:00`)
      if (Number.isNaN(start.getTime())) {
        setError(`Slot ${i + 1}: ungültiges Datum`)
        return
      }
      if (start.getTime() < Date.now()) {
        setError(`Slot ${i + 1}: liegt in der Vergangenheit`)
        return
      }
      const end = new Date(start.getTime() + s.dauerMin * 60_000)
      isoSlots.push({ start: start.toISOString(), end: end.toISOString() })
    }
    startTransition(async () => {
      const r = await svGegenvorschlagTermin(terminId, isoSlots, begruendung || undefined)
      if (r.success) onDone()
      else setError(r.error ?? 'Fehler')
    })
  }

  return (
    <Modal open onClose={onClose} maxWidth={448} ariaLabel="Anderen Termin vorschlagen">
      <div className="max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-claimondo-navy mb-1 flex items-center gap-2">
          <ClockIcon className="w-5 h-5 text-amber-500" />
          Anderen Termin vorschlagen
        </h3>
        <p className="text-xs text-claimondo-ondo mb-3">
          Schlage bis zu 5 alternative Termine vor. Der Dispatcher wählt einen davon aus und bestätigt mit dem Kunden.
        </p>

        <div className="space-y-2 mb-3">
          {slots.map((slot, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_80px_90px_28px] gap-1.5 items-center">
              <input
                type="date"
                value={slot.datum}
                onChange={(e) => updateSlot(idx, { datum: e.target.value })}
                className="px-2 py-1.5 border border-claimondo-border rounded text-xs"
              />
              <input
                type="time"
                value={slot.zeit}
                onChange={(e) => updateSlot(idx, { zeit: e.target.value })}
                step={900}
                className="px-2 py-1.5 border border-claimondo-border rounded text-xs"
              />
              <select
                value={slot.dauerMin}
                onChange={(e) => updateSlot(idx, { dauerMin: Number(e.target.value) })}
                className="px-2 py-1.5 border border-claimondo-border rounded text-xs bg-white"
              >
                {[60, 90, 120, 150, 180].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeSlot(idx)}
                disabled={slots.length === 1}
                className="text-claimondo-ondo/70 hover:text-red-500 disabled:opacity-30"
                title="Slot entfernen"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSlot}
          disabled={slots.length >= 5}
          className="w-full text-xs flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-claimondo-border text-claimondo-ondo hover:border-claimondo-ondo disabled:opacity-50 mb-3"
        >
          <PlusIcon className="w-3 h-3" /> Weiteren Slot hinzufügen ({slots.length}/5)
        </button>

        <textarea
          value={begruendung}
          onChange={(e) => setBegruendung(e.target.value)}
          placeholder="Begründung (optional)..."
          rows={2}
          className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-amber-500"
        />

        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm bg-claimondo-bg text-claimondo-ondo"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
          >
            {pending ? 'Sende...' : 'Gegenvorschlag senden'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
