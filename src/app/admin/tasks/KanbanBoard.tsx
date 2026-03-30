'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTask, updateTaskStatus, deleteTask } from './actions'

// ─── Types ──────────────────────────────────────────────────────────────────

type Task = {
  id: string
  fall_id: string
  typ: string
  titel: string
  beschreibung: string | null
  status: string
  faellig_am: string | null
  erledigt_am: string | null
  zugewiesen_an: string | null
  created_at: string
}

type Fall = { id: string; fall_nummer: string | null }
type Admin = { id: string; vorname: string | null; nachname: string | null }

// ─── Constants ──────────────────────────────────────────────────────────────

const COLUMNS: { key: string; label: string }[] = [
  { key: 'offen', label: 'Offen' },
  { key: 'in-bearbeitung', label: 'In Bearbeitung' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'blockiert', label: 'Blockiert' },
]

const TYP_LABEL: Record<string, string> = {
  filmcheck: 'Filmcheck',
  'kanzlei-anschlussschreiben': 'Anschlussschreiben',
  'kanzlei-nachfrage': 'Kanzlei Nachfrage',
  'versicherung-kontakt': 'Versicherung',
  'kunde-rueckfrage': 'Kunde Rückfrage',
  'sv-termin': 'SV Termin',
  'zahlung-pruefen': 'Zahlung prüfen',
}

const TYP_COLOR: Record<string, string> = {
  filmcheck: 'bg-yellow-50 text-yellow-300',
  'kanzlei-anschlussschreiben': 'bg-green-50 text-green-300',
  'kanzlei-nachfrage': 'bg-emerald-50 text-emerald-300',
  'versicherung-kontakt': 'bg-blue-50 text-blue-300',
  'kunde-rueckfrage': 'bg-violet-50 text-violet-300',
  'sv-termin': 'bg-cyan-50 text-cyan-300',
  'zahlung-pruefen': 'bg-amber-50 text-amber-300',
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
  offen: 'text-blue-400',
  'in-bearbeitung': 'text-amber-400',
  erledigt: 'text-green-400',
  blockiert: 'text-red-400',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isOverdue(faelligAm: string | null): boolean {
  if (!faelligAm) return false
  return new Date(faelligAm) < new Date(new Date().toDateString())
}

function fmtDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function KanbanBoard({
  tasks,
  faelle,
  fallMap,
  adminMap,
  admins,
}: {
  tasks: Task[]
  faelle: Fall[]
  fallMap: Record<string, string>
  adminMap: Record<string, string>
  admins: Admin[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleStatusChange(taskId: string, newStatus: string) {
    setError(null)
    startTransition(async () => {
      try {
        await updateTaskStatus(taskId, newStatus)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }

  function handleDelete(taskId: string) {
    if (!confirm('Task wirklich löschen?')) return
    startTransition(async () => {
      try {
        await deleteTask(taskId)
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
      await createTask(formData)
      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    }
  }

  return (
    <div className="px-4 py-8">
      <div className="max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
            <p className="text-gray-500 text-sm mt-0.5">{tasks.length} Aufgaben</p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            + Neuer Task
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-800 rounded-xl p-3 mb-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Kanban columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key)
            return (
              <div key={col.key} className="min-w-0">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className={`text-sm font-semibold ${COLUMN_HEADER_COLOR[col.key] ?? 'text-gray-500'}`}>
                    {col.label}
                  </span>
                  <span className="text-gray-400 text-xs font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-24">
                  {colTasks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
                      <p className="text-gray-300 text-xs">Keine Tasks</p>
                    </div>
                  )}
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      fallMap={fallMap}
                      adminMap={adminMap}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                      isPending={isPending}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* New task dialog */}
        {dialogOpen && (
          <NewTaskDialog
            faelle={faelle}
            fallMap={fallMap}
            admins={admins}
            adminMap={adminMap}
            error={error}
            onSubmit={handleCreate}
            onClose={() => { setDialogOpen(false); setError(null) }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Task Card ──────────────────────────────────────────────────────────────

function TaskCard({
  task,
  fallMap,
  adminMap,
  onStatusChange,
  onDelete,
  isPending,
}: {
  task: Task
  fallMap: Record<string, string>
  adminMap: Record<string, string>
  onStatusChange: (taskId: string, status: string) => void
  onDelete: (taskId: string) => void
  isPending: boolean
}) {
  const overdue = isOverdue(task.faellig_am) && task.status !== 'erledigt'

  return (
    <div className={`bg-white rounded-xl p-4 border transition-colors ${
      overdue ? 'border-red-800/60' : 'border-gray-200'
    }`}>
      {/* Typ badge + delete */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
          TYP_COLOR[task.typ] ?? 'bg-gray-100 text-gray-700'
        }`}>
          {TYP_LABEL[task.typ] ?? task.typ}
        </span>
        <button
          onClick={() => onDelete(task.id)}
          className="text-gray-300 hover:text-red-400 transition-colors p-0.5 -mr-1 -mt-0.5"
          title="Löschen"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Title */}
      <p className="text-gray-800 text-sm font-medium leading-snug mb-2">{task.titel}</p>

      {/* Fall number */}
      <div className="flex items-center gap-1.5 mb-2">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-gray-500 text-xs font-mono">{fallMap[task.fall_id] ?? '—'}</span>
      </div>

      {/* Meta row: due date + assignee */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          {task.faellig_am && (
            <span className={`flex items-center gap-1 ${overdue ? 'text-red-400' : 'text-gray-500'}`}>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {fmtDate(task.faellig_am)}
            </span>
          )}
          {task.zugewiesen_an && (
            <span className="text-gray-400 truncate max-w-24">
              {adminMap[task.zugewiesen_an] ?? '—'}
            </span>
          )}
        </div>
      </div>

      {/* Status dropdown */}
      <div className="mt-3 pt-3 border-t border-gray-200/50">
        <select
          value={task.status}
          disabled={isPending}
          onChange={e => onStatusChange(task.id, e.target.value)}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
        >
          {COLUMNS.map(col => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ─── New Task Dialog ────────────────────────────────────────────────────────

function NewTaskDialog({
  faelle,
  fallMap,
  admins,
  adminMap,
  error,
  onSubmit,
  onClose,
}: {
  faelle: { id: string; fall_nummer: string | null }[]
  fallMap: Record<string, string>
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
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white border border-gray-200 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-gray-900 font-semibold">Neuer Task</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Typ */}
            <div>
              <label className="block text-gray-500 text-sm mb-1.5">Typ</label>
              <select
                name="typ"
                required
                className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Bitte wählen...</option>
                {TASK_TYPES.map(t => (
                  <option key={t} value={t}>{TYP_LABEL[t]}</option>
                ))}
              </select>
            </div>

            {/* Fall */}
            <div>
              <label className="block text-gray-500 text-sm mb-1.5">Fall</label>
              <select
                name="fall_id"
                required
                className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Fall auswählen...</option>
                {faelle.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.fall_nummer ?? f.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>

            {/* Titel */}
            <div>
              <label className="block text-gray-500 text-sm mb-1.5">Titel</label>
              <input
                type="text"
                name="titel"
                required
                placeholder="Aufgabe beschreiben..."
                className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Beschreibung */}
            <div>
              <label className="block text-gray-500 text-sm mb-1.5">Beschreibung (optional)</label>
              <textarea
                name="beschreibung"
                rows={3}
                placeholder="Details..."
                className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
              />
            </div>

            {/* Fällig am */}
            <div>
              <label className="block text-gray-500 text-sm mb-1.5">Fällig am (optional)</label>
              <input
                type="date"
                name="faellig_am"
                className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Zugewiesen an */}
            <div>
              <label className="block text-gray-500 text-sm mb-1.5">Zugewiesen an (optional)</label>
              <select
                name="zugewiesen_an"
                className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Nicht zugewiesen</option>
                {admins.map(a => (
                  <option key={a.id} value={a.id}>
                    {adminMap[a.id]}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Wird erstellt...' : 'Task erstellen'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
