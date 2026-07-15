'use client'

// AAR-386: Abschluss-Button im Feldmodus-Fallakte-Footer.
// Warnt wenn Pflichtdokumente offen sind (Confirm-Dialog), delegiert an
// completeAndAdvance-Server-Action. Bei success ruft die Callback mit der
// nächsten Termin-ID — FeldmodusClient steuert damit den Stop-Wechsel und
// setzt den sessionStatus zurück auf 'idle' (oder 'finished').

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2Icon, Loader2Icon } from 'lucide-react'
import { completeAndAdvance } from './actions'
import { enqueueOp } from '@/lib/offline/enqueue'

interface Props {
  sessionId: string
  terminId: string
  pflichtOffen: number
  onAdvanced: (nextTerminId: string | null) => void
}

export default function BesichtigungAbschliessenButton({
  sessionId,
  terminId,
  pflichtOffen,
  onAdvanced,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  const handleClick = () => {
    if (isPending) return
    // Erster Klick bei offenen Pflichtdokumenten → Confirm-State
    if (pflichtOffen > 0 && !confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      // Slice 1b: offline -> Abschluss in die Outbox; UI schaltet optimistisch
      // weiter. Der Handler replayed completeAndAdvance mit terminId als CAS-Guard.
      if (!navigator.onLine) {
        void enqueueOp({
          kind: 'sv_complete_advance',
          replay_class: 'C',
          payload: { sessionId, terminId },
          entity_ref: { scope: 'feldmodus-session', id: sessionId },
        }).catch(() => {})
        toast.success('Abschluss offline gespeichert — wird synchronisiert')
        onAdvanced(null)
        return
      }
      const res = await completeAndAdvance(sessionId, terminId)
      if (res.success) {
        toast.success(
          res.nextTerminId
            ? 'Stop abgeschlossen — weiter zum nächsten'
            : 'Letzter Stop abgeschlossen — Tag fertig',
        )
        onAdvanced(res.nextTerminId ?? null)
      } else {
        toast.error(res.error ?? 'Abschluss fehlgeschlagen')
        setConfirming(false)
      }
    })
  }

  const label = confirming
    ? `Trotzdem abschließen (${pflichtOffen} Pflicht offen)`
    : 'Besichtigung abschließen'

  return (
    <div className="space-y-2">
      {confirming && (
        <p className="text-[11px] text-warning">
          Es sind noch {pflichtOffen}{' '}
          {pflichtOffen === 1 ? 'Pflichtdokument' : 'Pflichtdokumente'} offen.
          Erneut tippen zum Bestätigen oder neben dem Button tippen zum
          Abbrechen.
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        onBlur={() => setConfirming(false)}
        disabled={isPending}
        className={`w-full inline-flex items-center justify-center gap-2 py-3 rounded-ios-xl text-sm font-semibold transition-colors ${
          confirming
            ? 'bg-warning hover:bg-warning/90 text-white'
            : 'bg-success hover:bg-success/90 text-white'
        } disabled:bg-claimondo-bg0 disabled:text-white/70`}
      >
        {isPending ? (
          <Loader2Icon className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2Icon className="w-4 h-4" />
        )}
        {label}
      </button>
    </div>
  )
}
