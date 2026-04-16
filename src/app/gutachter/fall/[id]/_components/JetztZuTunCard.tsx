'use client'

// AAR-291: „Jetzt zu tun"-Widget mit Tasks aus tasks-Tabelle + Realtime-Sync
// + Fallback-Hints pro Subphase wenn keine Tasks.

import { useTransition } from 'react'
import Link from 'next/link'
import { CheckIcon, ChevronRightIcon, ClockIcon, AlertCircleIcon } from 'lucide-react'
import { useGutachterTasks, type GutachterTask } from '@/hooks/useGutachterTasks'
import { SV_TASK_TYPEN, type SvTaskTyp } from '@/lib/gutachter/task-typen'
import { erledigeSvTask } from '../task-actions'
import type { SvSubphase } from '@/lib/gutachter/subphase'

const FALLBACK_HINTS: Record<SvSubphase['code'], string> = {
  'auftrag-eingegangen':
    'Neuer Auftrag! Bestätige den Termin oder schlage einen anderen vor.',
  'termin-bestaetigt':
    'Termin ist bestätigt. Nichts weiter zu tun bis dahin.',
  'vor-ort':
    'Heute ist Termin! Viel Erfolg bei der Besichtigung.',
  'gutachten-erstellen':
    'Besichtigung gemacht — jetzt das Gutachten erstellen und hochladen.',
  'kanzlei-uebergeben':
    'Kanzlei prüft das Gutachten. Du wirst informiert wenn Rückfragen kommen.',
  anspruchsschreiben:
    'Anspruchsschreiben wurde an die Versicherung versandt. Jetzt warten.',
  regulierung:
    'Versicherung reguliert den Fall. Du wirst benachrichtigt sobald Zahlung eingegangen ist.',
  'zahlung-eingegangen':
    'Zahlung vom Kunden ist da! Dein Honorar wird in Kürze überwiesen.',
  'honorar-ueberwiesen':
    'Honorar wurde überwiesen. Fall abgeschlossen.',
  abgeschlossen: 'Fall ist abgeschlossen.',
  storniert: 'Fall wurde storniert.',
}

const PRIO_BADGE: Record<string, string> = {
  hoch: 'bg-red-50 text-red-700 border-red-200',
  mittel: 'bg-amber-50 text-amber-700 border-amber-200',
  niedrig: 'bg-gray-50 text-gray-600 border-gray-200',
}

export function JetztZuTunCard({
  fallId,
  initialTasks,
  subphase,
}: {
  fallId: string
  initialTasks: GutachterTask[]
  subphase: SvSubphase
}) {
  const { tasks } = useGutachterTasks(fallId, initialTasks)

  if (tasks.length === 0) {
    const hint = FALLBACK_HINTS[subphase.code]
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-2">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Jetzt zu tun
        </p>
        <p className="text-sm text-gray-700">{hint}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Jetzt zu tun
        </p>
        <span className="text-[10px] text-gray-400">
          {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}
        </span>
      </div>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} fallId={fallId} />
        ))}
      </ul>
    </div>
  )
}

function TaskItem({ task, fallId }: { task: GutachterTask; fallId: string }) {
  const [isPending, startTransition] = useTransition()
  const def = task.task_typ
    ? SV_TASK_TYPEN[task.task_typ as SvTaskTyp]
    : undefined
  const label = def?.label ?? task.titel ?? 'Task'
  const prioCls = PRIO_BADGE[task.prioritaet ?? 'niedrig'] ?? PRIO_BADGE.niedrig

  function handleDone() {
    startTransition(async () => {
      await erledigeSvTask(task.id, fallId)
    })
  }

  function handleCtaScroll(target: string) {
    const el = document.getElementById(target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Kurze Highlight-Animation am Ziel
      el.classList.add('ring-2', 'ring-[#4573A2]', 'ring-offset-2', 'transition-all')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[#4573A2]', 'ring-offset-2')
      }, 1500)
    }
  }

  return (
    <li className="flex items-start gap-3 p-3 rounded-xl bg-[#f8f9fb] hover:bg-gray-100 transition-colors">
      <button
        type="button"
        onClick={handleDone}
        disabled={isPending}
        aria-label="Task erledigen"
        className="mt-0.5 w-5 h-5 rounded-md border border-gray-300 hover:border-[#4573A2] flex items-center justify-center bg-white disabled:opacity-50 shrink-0"
      >
        {isPending && <CheckIcon className="w-3 h-3 text-[#4573A2]" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {task.prioritaet && task.prioritaet !== 'niedrig' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${prioCls}`}>
              {task.prioritaet}
            </span>
          )}
        </div>
        {task.beschreibung && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-line">
            {task.beschreibung}
          </p>
        )}
        {task.faellig_am && (
          <p className="text-[10px] text-amber-700 mt-0.5 flex items-center gap-1">
            <ClockIcon className="w-3 h-3" />
            Fällig: {new Date(task.faellig_am).toLocaleDateString('de-DE')}
          </p>
        )}
      </div>
      {def && 'navigateTo' in def && def.navigateTo ? (
        <Link
          href={def.navigateTo.replace('{fallId}', fallId)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#4573A2] text-white text-[11px] font-medium hover:bg-[#1E3A5F]"
        >
          {def.cta}
          <ChevronRightIcon className="w-3 h-3" />
        </Link>
      ) : def && 'scrollTo' in def && def.scrollTo ? (
        <button
          type="button"
          onClick={() => handleCtaScroll(def.scrollTo)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#4573A2] text-white text-[11px] font-medium hover:bg-[#1E3A5F]"
        >
          {def.cta}
          <ChevronRightIcon className="w-3 h-3" />
        </button>
      ) : (
        // Unbekannter Task-Typ — generischer Hinweis
        <span className="shrink-0 text-[11px] text-gray-400 italic flex items-center gap-1">
          <AlertCircleIcon className="w-3 h-3" />
          Manuell
        </span>
      )}
    </li>
  )
}
