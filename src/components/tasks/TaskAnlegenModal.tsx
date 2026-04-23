'use client'

// AAR-307: Modal für Ad-hoc Task-Anlegen. Felder (alle deutsch):
// Titel, Beschreibung, Empfänger-Rolle, Deadline, Priorität, Entität.
// Mobile-first (funktional auf 375px). Submit → createAdHocTask.

import { useState, useTransition, useEffect } from 'react'
import { XIcon, LoaderIcon } from 'lucide-react'
import {
  createAdHocTask,
  type EmpfaengerRolle,
  type EntityType,
} from '@/lib/tasks/create-adhoc'
import { ladeEntityOptions, type EntityOption } from '@/lib/tasks/entity-loader'

// AAR-402: „Leadbearbeiter" (Phase-1-intern) + „Sachverständiger" (der
// Ersteller selbst) wurden aus der Empfänger-Auswahl entfernt — sie tauchten
// im Fall-Kontext nie als sinnvolle Adressaten auf. Der Typ selbst bleibt
// bestehen, damit Altdaten mit diesen Werten weiter lesbar sind.
const ROLLEN: { value: EmpfaengerRolle; label: string }[] = [
  { value: 'kundenbetreuer', label: 'Kundenbetreuer' },
  { value: 'kanzlei', label: 'Kanzlei' },
  { value: 'admin', label: 'Admin' },
]

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'kunde', label: 'Kunde' },
  { value: 'sachverstaendiger', label: 'Sachverständiger' },
  { value: 'kanzlei', label: 'Kanzlei' },
  { value: 'versicherung', label: 'Versicherung' },
]

export function TaskAnlegenModal({
  open,
  onClose,
  fallId,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  fallId: string
  onCreated?: (taskId: string) => void
}) {
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [empfaengerRolle, setEmpfaengerRolle] = useState<EmpfaengerRolle>('kundenbetreuer')
  const [deadline, setDeadline] = useState('')
  const [prioritaet, setPrioritaet] = useState<'niedrig' | 'normal' | 'hoch'>('normal')
  const [entityType, setEntityType] = useState<EntityType | ''>('')
  const [entityId, setEntityId] = useState('')
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([])
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Entity-Optionen laden wenn Typ wechselt
  useEffect(() => {
    if (!entityType) {
      setEntityOptions([])
      setEntityId('')
      return
    }
    setLoadingEntities(true)
    ladeEntityOptions(entityType, fallId)
      .then((opts) => setEntityOptions(opts))
      .finally(() => setLoadingEntities(false))
  }, [entityType, fallId])

  // Escape schließt Modal
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function reset() {
    setTitel('')
    setBeschreibung('')
    setEmpfaengerRolle('kundenbetreuer')
    setDeadline('')
    setPrioritaet('normal')
    setEntityType('')
    setEntityId('')
    setError(null)
  }

  function submit() {
    if (!titel.trim()) {
      setError('Titel ist erforderlich')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createAdHocTask({
        fallId,
        titel,
        beschreibung: beschreibung || undefined,
        empfaengerRolle,
        deadline: deadline
          ? new Date(deadline + 'T23:59:59').toISOString()
          : undefined,
        prioritaet,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onCreated?.(result.taskId)
      reset()
      onClose()
    })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative glass-light border border-claimondo-border rounded-ios-lg shadow-ios-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-base font-semibold text-gray-900">Task anlegen</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
              Titel *
            </label>
            <input
              type="text"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              maxLength={200}
              placeholder="Was muss gemacht werden?"
              className="w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2]"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
              Beschreibung
            </label>
            <textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={3}
              placeholder="Kontext, Details, Links …"
              className="w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                An wen? *
              </label>
              <select
                value={empfaengerRolle}
                onChange={(e) => setEmpfaengerRolle(e.target.value as EmpfaengerRolle)}
                className="w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2] bg-white"
              >
                {ROLLEN.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                Wer erledigt die Aufgabe?
              </p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Priorität
              </label>
              <select
                value={prioritaet}
                onChange={(e) =>
                  setPrioritaet(e.target.value as 'niedrig' | 'normal' | 'hoch')
                }
                className="w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2] bg-white"
              >
                <option value="niedrig">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="hoch">Hoch</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Deadline (optional)
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2]"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Bezug (optional)
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType | '')}
                className="w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2] bg-white"
              >
                <option value="">— Keiner —</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                Worum geht's fachlich?
              </p>
            </div>
          </div>

          {entityType && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                Entität
              </label>
              {loadingEntities ? (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <LoaderIcon className="w-3 h-3 animate-spin" />
                  Lade …
                </p>
              ) : entityOptions.length === 0 ? (
                <p className="text-xs text-gray-500">Keine Optionen verfügbar.</p>
              ) : (
                <select
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-[#4573A2] bg-white"
                >
                  <option value="">— Wählen —</option>
                  {entityOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 rounded-md bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
            Task anlegen
          </button>
        </div>
      </div>
    </div>
  )
}
