'use client'

// AAR-291 / AAR-395: „Jetzt zu tun"-Widget.
//
// Priorität der Anzeige:
//   1. Aktive Tasks aus `tasks`-Tabelle (Realtime-Sync) → TaskItem-Liste
//   2. Kein Task → `getJetztZuTun(ctx)` aus der 10-State-Matrix (Phase 0.5).
//      Die Matrix rendert genau EINE Aktion mit CTA (Modal/Link) oder einen
//      passiven Zustand (ohne CTA).
//   3. Keine Matrix-Aktion → stille Rückfallbox mit Subphase-Hinweis.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  AlertCircleIcon,
  CalendarIcon,
  FileTextIcon,
  PauseIcon,
} from 'lucide-react'
import { useGutachterTasks, type GutachterTask } from '@/hooks/useGutachterTasks'
import { SV_TASK_TYPEN, type SvTaskTyp } from '@/lib/gutachter/task-typen'
import { erledigeSvTask } from '../task-actions'
import { formatDatum } from '@/lib/format'
import type { SvSubphase } from '@/lib/gutachter/subphase'
import {
  getJetztZuTun,
  type JetztZuTunAction,
} from '@/lib/gutachter/jetzt-zu-tun'
import TerminVorschlagModal, {
  type TerminVorschlagMode,
} from '@/components/fall/TerminVorschlagModal'
// AAR-727 Kandidat 2: Shared Hülle für Jetzt-zu-tun-Cards.
import { TodoCard } from '@/components/shared/TodoCard'

// Next.js Link nur im Matrix-Renderer genutzt (Task-Typen scrollen alle intern).

/** Erweitertes Termin-Objekt für Card (id + evtl. vorgeschlagenes_datum
 *  zusätzlich zum TerminCtx für Matrix). */
type AktiverTerminInput = {
  id: string
  status: string
  start_zeit?: string | null
  vorgeschlagenes_datum?: string | null
  gegenvorschlag_von?: 'sv' | 'kunde' | null
} | null

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

type JetztZuTunProps = {
  fallId: string
  initialTasks: GutachterTask[]
  subphase: SvSubphase
  /** AAR-395: Aktiver Termin (für Action-Matrix + Modal-Prefill). */
  aktiverTermin?: AktiverTerminInput
  /** AAR-395: Fall-Snippet für Action-Matrix. */
  fall?: {
    status?: string | null
    technische_stellungnahme_status?: string | null
    gutachten_final_freigegeben?: boolean | null
    gutachten_eingegangen_am?: string | null
    zahlung_eingegangen_am?: string | null
  }
}

export function JetztZuTunCard({
  fallId,
  initialTasks,
  subphase,
  aktiverTermin,
  fall,
}: JetztZuTunProps) {
  const { tasks } = useGutachterTasks(fallId, initialTasks)
  const [terminModal, setTerminModal] = useState<{
    open: boolean
    mode: TerminVorschlagMode
  }>({ open: false, mode: 'erstvorschlag' })

  if (tasks.length > 0) {
    return (
      <TodoCard count={tasks.length}>
        <ul className="space-y-2">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} fallId={fallId} />
          ))}
        </ul>
      </TodoCard>
    )
  }

  // AAR-395: Keine Tasks → Action-Matrix
  const matrixAction =
    fall
      ? getJetztZuTun({
          subphase: { phase: subphase.phase, subphase: subphase.code },
          aktiverTermin: aktiverTermin
            ? {
                status: aktiverTermin.status,
                start_zeit: aktiverTermin.start_zeit ?? null,
                gegenvorschlag_von: aktiverTermin.gegenvorschlag_von ?? null,
              }
            : null,
          fall,
        })
      : null

  if (matrixAction) {
    return (
      <>
        <MatrixActionCard
          action={matrixAction}
          fallId={fallId}
          onOpenTerminModal={(mode) => setTerminModal({ open: true, mode })}
        />
        {/* Termin-Modal (nur gerendert wenn einmal geöffnet) */}
        <TerminVorschlagModal
          fallId={fallId}
          mode={terminModal.mode}
          open={terminModal.open}
          onClose={() => setTerminModal((s) => ({ ...s, open: false }))}
          existingTermin={aktiverTermin ?? null}
        />
      </>
    )
  }

  // Fallback: keine Matrix-Aktion → stiller Hinweis
  const hint = FALLBACK_HINTS[subphase.code]
  return (
    <TodoCard severity="info" passive>
      <p className="text-sm text-gray-700">{hint}</p>
    </TodoCard>
  )
}

function MatrixActionCard({
  action,
  fallId,
  onOpenTerminModal,
}: {
  action: JetztZuTunAction
  fallId: string
  onOpenTerminModal: (mode: TerminVorschlagMode) => void
}) {
  const Icon = action.passive
    ? PauseIcon
    : action.cta?.openModal === 'termin'
      ? CalendarIcon
      : action.cta?.openModal === 'gutachten' ||
          action.cta?.openModal === 'stellungnahme'
        ? FileTextIcon
        : ChevronRightIcon

  function handleCta() {
    if (!action.cta) return
    if (action.cta.openModal === 'termin') {
      const mode: TerminVorschlagMode =
        action.type === 'termin_vorschlagen'
          ? 'erstvorschlag'
          : action.type === 'gegenvorschlag_entscheiden'
            ? 'gegenvorschlag'
            : 'bearbeiten'
      onOpenTerminModal(mode)
    }
    // 'gutachten' / 'stellungnahme' werden hier bewusst nicht behandelt —
    // deren Upload-Flows leben in den jeweiligen Cards (AAR-400/404).
  }

  return (
    <TodoCard
      label={action.passive ? 'Status' : 'Jetzt zu tun'}
      severity={action.passive ? 'info' : 'default'}
      passive={action.passive}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={`w-4 h-4 mt-0.5 shrink-0 ${
            action.passive ? 'text-gray-500' : 'text-claimondo-ondo'
          }`}
        />
        <div className="flex-1 space-y-1">
          <p
            className={`text-sm font-medium ${
              action.passive ? 'text-gray-700' : 'text-claimondo-navy'
            }`}
          >
            {action.label}
          </p>
          {action.beschreibung && (
            <p className="text-xs text-gray-600">{action.beschreibung}</p>
          )}
        </div>
      </div>
      {!action.passive && action.cta && (
        <div>
          {action.cta.href ? (
            <Link
              href={action.cta.href.replace('{fallId}', fallId)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-claimondo-navy hover:bg-claimondo-ondo text-white text-xs font-medium transition-colors"
            >
              Öffnen
              <ChevronRightIcon className="w-3 h-3" />
            </Link>
          ) : action.cta.openModal === 'termin' ? (
            <button
              type="button"
              onClick={handleCta}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-claimondo-navy hover:bg-claimondo-ondo text-white text-xs font-medium transition-colors"
            >
              {action.type === 'termin_vorschlagen'
                ? 'Termin vorschlagen'
                : action.type === 'gegenvorschlag_entscheiden'
                  ? 'Entscheiden'
                  : 'Termin öffnen'}
              <ChevronRightIcon className="w-3 h-3" />
            </button>
          ) : null}
        </div>
      )}
    </TodoCard>
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
      el.classList.add('ring-2', 'ring-[var(--brand-secondary)]', 'ring-offset-2', 'transition-all')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[var(--brand-secondary)]', 'ring-offset-2')
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
        className="mt-0.5 w-5 h-5 rounded-md border border-gray-300 hover:border-[var(--brand-secondary)] flex items-center justify-center bg-white disabled:opacity-50 shrink-0"
      >
        {isPending && <CheckIcon className="w-3 h-3 text-[var(--brand-secondary)]" />}
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
            Fällig: {formatDatum(task.faellig_am)}
          </p>
        )}
      </div>
      {def && 'scrollTo' in def && def.scrollTo ? (
        <button
          type="button"
          onClick={() => handleCtaScroll(def.scrollTo)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--brand-secondary)] text-white text-[11px] font-medium hover:bg-[var(--brand-primary)]"
        >
          {def.cta}
          <ChevronRightIcon className="w-3 h-3" />
        </button>
      ) : (
        <span className="shrink-0 text-[11px] text-gray-400 italic flex items-center gap-1">
          <AlertCircleIcon className="w-3 h-3" />
          Manuell
        </span>
      )}
    </li>
  )
}
