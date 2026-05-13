'use client'

// AAR-154: Task-Kanban Rewrite.
// - Status-Dropdown entfernt, Statuswechsel ausschliesslich per Drag & Drop
// - Task-Card hat Objekt-Link (Fall / Lead / SV) prominent dargestellt
// - Tasks ohne Objekt-Bezug (weder fall_id/lead_id noch entity_id) werden
//   ausgeblendet — das waren die „Abkommen" / Alt-System-Einträge

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { createTask, updateTaskStatus, deleteTask } from './actions'
import TaskReassignDropdown, { type ReassignCandidate } from '@/components/shared/TaskReassignDropdown'
import PageHeader from '@/components/shared/PageHeader'
import { Modal } from '@/components/primitives/Modal'

type Task = {
  id: string
  fall_id: string | null
  lead_id: string | null
  typ: string
  task_typ: string | null
  titel: string
  beschreibung: string | null
  status: string
  faellig_am: string | null
  erledigt_am: string | null
  zugewiesen_an: string | null
  created_at: string
  entity_type: string | null
  entity_id: string | null
  auto_resolved_am: string | null
  auto_resolved_grund: string | null
}

type Fall = { id: string; fall_nummer: string | null }
type Admin = { id: string; vorname: string | null; nachname: string | null }

const COLUMNS: { key: string; label: string }[] = [
  { key: 'offen', label: 'Offen' },
  { key: 'in-bearbeitung', label: 'In Bearbeitung' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'blockiert', label: 'Blockiert' },
]

const TYP_LABEL: Record<string, string> = {
  dispatch: 'Dispatch',
  filmcheck: 'Filmcheck',
  'kanzlei-anschlussschreiben': 'Anschlussschreiben',
  'kanzlei-nachfrage': 'Kanzlei Nachfrage',
  'versicherung-kontakt': 'Versicherung',
  'kunde-rueckfrage': 'Kunde Rückfrage',
  'sv-termin': 'SV Termin',
  'zahlung-pruefen': 'Zahlung prüfen',
}

const TYP_COLOR: Record<string, string> = {
  dispatch: 'bg-claimondo-bg text-claimondo-ondo',
  filmcheck: 'bg-yellow-50 text-yellow-600',
  'kanzlei-anschlussschreiben': 'bg-green-50 text-green-600',
  'kanzlei-nachfrage': 'bg-emerald-50 text-emerald-600',
  'versicherung-kontakt': 'bg-claimondo-ondo/10 text-claimondo-ondo',
  'kunde-rueckfrage': 'bg-violet-50 text-violet-600',
  'sv-termin': 'bg-cyan-50 text-cyan-600',
  'zahlung-pruefen': 'bg-amber-50 text-amber-600',
}

const TASK_TYPES = [
  'filmcheck',
  'kanzlei-anschlussschreiben',
  'kanzlei-nachfrage',
  'versicherung-kontakt',
  'kunde-rueckfrage',
  'sv-termin',
  'zahlung-pruefen',
] as const

const COLUMN_HEADER_COLOR: Record<string, string> = {
  offen: 'text-claimondo-light-blue',
  'in-bearbeitung': 'text-amber-500',
  erledigt: 'text-green-500',
  blockiert: 'text-red-500',
}

function isOverdue(faelligAm: string | null): boolean {
  if (!faelligAm) return false
  return new Date(faelligAm) < new Date(new Date().toDateString())
}

function fmtDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
}

/**
 * Ermittelt aus Task das zu verlinkende Objekt + dessen Route.
 * Reihenfolge: entity_type/entity_id → fall_id → lead_id.
 * Return null wenn keine Referenz → Task wird nicht im Kanban gezeigt.
 */
function resolveObjectLink(
  task: Task,
  fallMap: Record<string, string>,
  leadMap: Record<string, string>,
  svMap: Record<string, string>,
): { href: string; label: string; kind: 'Fall' | 'Lead' | 'SV' } | null {
  const et = task.entity_type
  const eid = task.entity_id

  if (et === 'fall' && eid) {
    return { href: `/faelle/${eid}`, label: fallMap[eid] ?? eid.slice(0, 8), kind: 'Fall' }
  }
  if (et === 'lead' && eid) {
    return { href: `/dispatch/leads/${eid}`, label: leadMap[eid] ?? eid.slice(0, 8), kind: 'Lead' }
  }
  if ((et === 'sv' || et === 'gutachter') && eid) {
    // AAR-614: Nur linken wenn svMap den entity_id kennt — Legacy-Tasks (vor
    // Cron-Fix in haftpflicht-ablauf/route.ts) haben entity_id = pflichtdokumente.id
    // gesetzt, Klick würde auf /admin/sachverstaendige/{doc.id} = 404 führen.
    // Bei unbekanntem entity_id fallen wir auf Task-Liste zurück.
    if (svMap[eid]) {
      return {
        href: `/admin/sachverstaendige/${eid}`,
        label: svMap[eid],
        kind: 'SV',
      }
    }
    return {
      href: '/admin/aufgaben/alle',
      label: eid.slice(0, 8),
      kind: 'SV',
    }
  }
  // Fallbacks für Alt-Daten: fall_id / lead_id direkt gesetzt
  if (task.fall_id) {
    return {
      href: `/faelle/${task.fall_id}`,
      label: fallMap[task.fall_id] ?? task.fall_id.slice(0, 8),
      kind: 'Fall',
    }
  }
  if (task.lead_id) {
    return {
      href: `/dispatch/leads/${task.lead_id}`,
      label: leadMap[task.lead_id] ?? task.lead_id.slice(0, 8),
      kind: 'Lead',
    }
  }
  return null
}

export default function KanbanBoard({
  tasks,
  faelle,
  fallMap,
  adminMap,
  leadMap,
  svMap,
  admins,
  reassignCandidates = [],
}: {
  tasks: Task[]
  faelle: Fall[]
  fallMap: Record<string, string>
  adminMap: Record<string, string>
  leadMap: Record<string, string>
  svMap: Record<string, string>
  admins: Admin[]
  reassignCandidates?: ReassignCandidate[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAutoResolved, setShowAutoResolved] = useState(false)

  // AAR-154: Nur Tasks mit verlinkbarem Objekt zeigen.
  // AAR-620/612: useMemo damit visibleTasks nicht bei jedem Render als neue
  // Array-Referenz erzeugt wird — das hat die Sync-Schleife unten in eine
  // Endlos-Rerender-Loop gezwungen (React Error #301).
  const linked = useMemo(
    () => tasks.filter((t) => resolveObjectLink(t, fallMap, leadMap, svMap) !== null),
    [tasks, fallMap, leadMap, svMap],
  )
  const visibleTasks = useMemo(
    () =>
      showAutoResolved
        ? linked
        : linked.filter((t) => !(t.status === 'erledigt' && t.auto_resolved_am)),
    [linked, showAutoResolved],
  )

  // Optimistic-Update für Drag & Drop — ohne das springt die Card nach Release
  // zurück in die Ursprungsspalte bis der Server antwortet.
  const [localTasks, setLocalTasks] = useState(visibleTasks)
  // AAR-620/612: Sync jetzt in useEffect statt im Render-Body. Der vorherige
  // `if (localTasks !== visibleTasks) setLocalTasks(...)` im Render führte
  // zu Render→setState→Render-Loops weil visibleTasks bei jedem Render als
  // neue Array-Referenz erzeugt wurde und `!==` damit IMMER true war. React
  // erkennt das irgendwann als infinite loop → Error #301.
  //
  // Signatur des Sync-Fingerprint: join aus (id, status). Ändert sich nur
  // wenn tasks tatsächlich neu sind oder Status-Updates vom Server kommen.
  // Die Drag&Drop-interne Status-Änderung läuft weiter direkt über setLocalTasks.
  const visibleFingerprint = useMemo(
    () => visibleTasks.map((t) => `${t.id}:${t.status}`).join('|'),
    [visibleTasks],
  )
  const lastSyncedFingerprintRef = useRef<string>(visibleFingerprint)
  useEffect(() => {
    if (isPending) return
    if (lastSyncedFingerprintRef.current === visibleFingerprint) return
    lastSyncedFingerprintRef.current = visibleFingerprint
    setLocalTasks(visibleTasks)
  }, [visibleTasks, visibleFingerprint, isPending])

  function onDragEnd(result: DropResult) {
    const { draggableId, destination, source } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return
    const newStatus = destination.droppableId
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t)),
    )
    startTransition(async () => {
      try {
        const r = await updateTaskStatus(draggableId, newStatus)
        if (!r.success) {
          setError(r.error ?? 'Statuswechsel fehlgeschlagen')
          setLocalTasks(visibleTasks)
          return
        }
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Statuswechsel fehlgeschlagen')
        // Bei Fehler lokalen State zurücksetzen
        setLocalTasks(visibleTasks)
      }
    })
  }

  function handleDelete(taskId: string) {
    if (!confirm('Task wirklich löschen?')) return
    startTransition(async () => {
      try {
        const r = await deleteTask(taskId)
        if (!r.success) {
          setError(r.error ?? 'Fehler')
          return
        }
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    try {
      const r = await createTask(formData)
      if (!r.success) {
        setError(r.error ?? 'Fehler')
        return
      }
      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <PageHeader
            title="Tasks"
            description={`${localTasks.length} von ${tasks.length} Aufgaben${
              tasks.length !== linked.length
                ? ` (${tasks.length - linked.length} ohne Objekt-Bezug ausgeblendet)`
                : ''
            }`}
            actions={
              <>
                <label className="flex items-center gap-2 text-xs text-claimondo-ondo cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showAutoResolved}
                    onChange={(e) => setShowAutoResolved(e.target.checked)}
                    className="rounded border-claimondo-border"
                  />
                  Auto-erledigte anzeigen
                </label>
                <button
                  onClick={() => setDialogOpen(true)}
                  className="px-4 py-2 bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-medium rounded-xl transition-colors"
                >
                  + Neuer Task
                </button>
              </>
            }
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const colTasks = localTasks.filter((t) => t.status === col.key)
              return (
                <div key={col.key} className="min-w-0">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span
                      className={`text-sm font-semibold ${COLUMN_HEADER_COLOR[col.key] ?? 'text-claimondo-ondo'}`}
                    >
                      {col.label}
                    </span>
                    <span className="text-claimondo-ondo/70 text-xs font-medium bg-claimondo-bg px-2 py-0.5 rounded-full">
                      {colTasks.length}
                    </span>
                  </div>

                  <Droppable droppableId={col.key}>
                    {(dp, snap) => (
                      <div
                        ref={dp.innerRef}
                        {...dp.droppableProps}
                        className={`space-y-2 min-h-32 rounded-xl p-1 transition-colors ${
                          snap.isDraggingOver ? 'bg-claimondo-ondo/5' : ''
                        }`}
                      >
                        {colTasks.length === 0 && (
                          <div className="rounded-xl border border-dashed border-claimondo-border p-6 text-center">
                            <p className="text-claimondo-ondo/70 text-xs">Keine Tasks</p>
                          </div>
                        )}
                        {colTasks.map((task, i) => (
                          <Draggable key={task.id} draggableId={task.id} index={i}>
                            {(draggable, dragSnap) => (
                              <div
                                ref={draggable.innerRef}
                                {...draggable.draggableProps}
                                {...draggable.dragHandleProps}
                                className={dragSnap.isDragging ? 'shadow-xl' : ''}
                              >
                                <TaskCard
                                  task={task}
                                  link={resolveObjectLink(task, fallMap, leadMap, svMap)!}
                                  adminMap={adminMap}
                                  onDelete={handleDelete}
                                  reassignCandidates={reassignCandidates}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {dp.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>

        {dialogOpen && (
          <NewTaskDialog
            faelle={faelle}
            admins={admins}
            adminMap={adminMap}
            error={error}
            onSubmit={handleCreate}
            onClose={() => {
              setDialogOpen(false)
              setError(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  link,
  adminMap,
  onDelete,
  reassignCandidates,
}: {
  task: Task
  link: { href: string; label: string; kind: 'Fall' | 'Lead' | 'SV' }
  adminMap: Record<string, string>
  onDelete: (taskId: string) => void
  reassignCandidates: ReassignCandidate[]
}) {
  const overdue = isOverdue(task.faellig_am) && task.status !== 'erledigt'
  const obsoleteHint = task.status === 'offen' && task.auto_resolved_am
  const isAutoResolved = task.status === 'erledigt' && task.auto_resolved_am

  return (
    <div
      className={`bg-white rounded-xl p-4 border transition-colors cursor-grab active:cursor-grabbing ${
        overdue ? 'border-red-300' : isAutoResolved ? 'border-claimondo-border' : 'border-claimondo-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
            TYP_COLOR[task.typ] ?? 'bg-claimondo-bg text-claimondo-navy'
          }`}
        >
          {TYP_LABEL[task.typ] ?? task.typ}
        </span>
        <button
          onClick={() => onDelete(task.id)}
          className="text-claimondo-ondo/50 hover:text-red-500 transition-colors p-0.5 -mr-1 -mt-0.5"
          title="Löschen"
        >
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-claimondo-navy text-sm font-medium leading-snug mb-2">{task.titel}</p>

      {obsoleteHint && (
        <div className="mb-2 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] leading-tight">
          <strong>Eventuell schon erledigt:</strong> {task.auto_resolved_grund}
          <br />
          Schließen oder offen lassen falls du noch dran bist.
        </div>
      )}

      {isAutoResolved && (
        <div
          className="mb-2 inline-flex items-center gap-1 text-[10px] text-claimondo-ondo/70"
          title={`Automatisch erledigt am ${task.auto_resolved_am ? new Date(task.auto_resolved_am).toLocaleString('de-DE') : ''} weil ${task.auto_resolved_grund ?? ''}`}
        >
          <svg
            width="10"
            height="10"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Auto-erledigt
        </div>
      )}

      {/* AAR-154: Prominenter Objekt-Link statt früher nur dem Fall-Label-Span.
          onClick stoppt propagation damit das Drag-Handle nicht auslöst. */}
      <Link
        href={link.href}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 mb-2 text-claimondo-ondo hover:text-claimondo-navy hover:underline"
      >
        <svg
          width="12"
          height="12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">{link.kind}:</span>
        <span className="text-xs font-medium truncate">{link.label}</span>
      </Link>

      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          {task.faellig_am && (
            <span
              className={`flex items-center gap-1 ${overdue ? 'text-red-600' : 'text-claimondo-ondo'}`}
            >
              <svg
                width="12"
                height="12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {fmtDate(task.faellig_am)}
            </span>
          )}
          {task.zugewiesen_an && (
            <span className="text-claimondo-ondo/70 truncate max-w-24">
              {adminMap[task.zugewiesen_an] ?? '—'}
            </span>
          )}
        </div>
      </div>

      {/* AAR-723: Reassign-Dropdown — Admin kann den Task hier direkt an
          einen Kollegen weiterleiten. onClick/onMouseDown stoppen
          propagation, damit das Drag-Handle nicht auslöst. */}
      {reassignCandidates.length > 0 && task.status !== 'erledigt' && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          className="mt-2 pt-2 border-t border-claimondo-border"
        >
          <TaskReassignDropdown
            taskId={task.id}
            currentAssigneeId={task.zugewiesen_an}
            candidates={reassignCandidates}
            compact
          />
        </div>
      )}
    </div>
  )
}

function NewTaskDialog({
  faelle,
  admins,
  adminMap,
  error,
  onSubmit,
  onClose,
}: {
  faelle: { id: string; fall_nummer: string | null }[]
  admins: { id: string; vorname: string | null; nachname: string | null }[]
  adminMap: Record<string, string>
  error: string | null
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} noPadding hideCloseButton maxWidth={448} ariaLabel="Neuer Task">
      <div className="max-h-[90vh] overflow-y-auto">
          <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
            <h2 className="text-claimondo-navy font-semibold">Neuer Task</h2>
            <button
              onClick={onClose}
              className="text-claimondo-ondo hover:text-claimondo-navy transition-colors"
            >
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-claimondo-ondo text-sm mb-1.5">Typ</label>
              <select
                name="typ"
                required
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              >
                <option value="">Bitte wählen...</option>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYP_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-claimondo-ondo text-sm mb-1.5">Fall</label>
              <select
                name="fall_id"
                required
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              >
                <option value="">Fall auswählen...</option>
                {faelle.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fall_nummer ?? f.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-claimondo-ondo text-sm mb-1.5">Titel</label>
              <input
                type="text"
                name="titel"
                required
                placeholder="Aufgabe beschreiben..."
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>

            <div>
              <label className="block text-claimondo-ondo text-sm mb-1.5">
                Beschreibung (optional)
              </label>
              <textarea
                name="beschreibung"
                rows={3}
                placeholder="Details..."
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
              />
            </div>

            <div>
              <label className="block text-claimondo-ondo text-sm mb-1.5">Fällig am (optional)</label>
              <input
                type="date"
                name="faellig_am"
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>

            <div>
              <label className="block text-claimondo-ondo text-sm mb-1.5">
                Zugewiesen an (optional)
              </label>
              <select
                name="zugewiesen_an"
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              >
                <option value="">Nicht zugewiesen</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {adminMap[a.id]}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-claimondo-shield hover:bg-claimondo-ondo text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Wird erstellt...' : 'Task erstellen'}
            </button>
          </form>
      </div>
    </Modal>
  )
}
