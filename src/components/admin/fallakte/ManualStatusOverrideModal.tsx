'use client'

// AAR-560 (C11): Manueller Status-Override-Modal (Admin-only).
// Zeigt eine Liste aller 21 faelle.status-Werte, verlangt Pflicht-Begründung
// (min 10 Zeichen) und eine explizite Bestätigungs-Checkbox. Side-Effects
// werden ausdrücklich als „nur Audit + Mitteilungen" ausgewiesen — keine WA,
// keine SLAs, keine automatischen Tasks.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangleIcon } from 'lucide-react'
import { manualStatusOverride } from '@/app/faelle/[id]/actions/manual-status-override'
// AAR-664: Konstanten kommen aus einer non-`'use server'`-Datei, sonst
// liefert der Client-Bundle-Import undefined statt Array → `.map`-Crash.
import {
  ALLOWED_STATUS_VALUES,
  type FallStatusValue,
} from '@/app/faelle/[id]/actions/manual-status-override.constants'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fallId: string
  currentStatus: string
}

const STATUS_LABEL: Record<FallStatusValue, string> = {
  onboarding: 'Onboarding',
  ersterfassung: 'Ersterfassung',
  'sv-gesucht': 'SV gesucht',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV-Termin',
  besichtigung: 'Besichtigung',
  'begutachtung-laeuft': 'Begutachtung läuft',
  'gutachten-eingegangen': 'Gutachten eingegangen',
  filmcheck: 'Filmcheck',
  'qc-pruefung': 'QC-Prüfung',
  'kanzlei-uebergeben': 'Kanzlei übergeben',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  'regulierung-laeuft': 'Regulierung läuft',
  'vs-kuerzt': 'VS kürzt',
  'vs-abgelehnt': 'VS abgelehnt',
  'nachbesichtigung-laeuft': 'Nachbesichtigung läuft',
  klage: 'Klage',
  'zahlung-eingegangen': 'Zahlung eingegangen',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

export function ManualStatusOverrideModal({ open, onOpenChange, fallId, currentStatus }: Props) {
  const [neuerStatus, setNeuerStatus] = useState<FallStatusValue | ''>('')
  const [begruendung, setBegruendung] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [pending, startTransition] = useTransition()

  const begruendungOk = begruendung.trim().length >= 10
  const statusOk = neuerStatus !== '' && neuerStatus !== currentStatus
  const canSubmit = begruendungOk && statusOk && confirmed && !pending

  function reset() {
    setNeuerStatus('')
    setBegruendung('')
    setConfirmed(false)
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset()
    onOpenChange(o)
  }

  function handleSubmit() {
    if (!canSubmit) return
    const zielStatus = neuerStatus as FallStatusValue

    startTransition(async () => {
      const result = await manualStatusOverride({
        fallId,
        neuerStatus: zielStatus,
        begruendung: begruendung.trim(),
      })

      if (result.success) {
        toast.success(`Status gesetzt: ${STATUS_LABEL[zielStatus]}`)
        handleOpenChange(false)
      } else {
        toast.error(result.error ?? 'Override fehlgeschlagen')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0D1B3E] flex items-center gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-amber-600" />
            Status manuell überschreiben
          </DialogTitle>
          <DialogDescription>
            Nur für Admin-Rolle. Umgeht State-Machine-Validierung — jede Ziel-Phase ist möglich
            (auch Rückwärts-Transitionen). Einsatz nur bei Legacy-Migration, Race-Condition-Recovery,
            außergerichtlicher Einigung oder Test/Staging.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          <p className="font-medium">Hinweis: Keine Auto-Side-Effects</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>Keine WhatsApp-Benachrichtigung an Kunde/SV</li>
            <li>Keine SLA-Cron-Jobs werden gestartet</li>
            <li>Keine automatischen Tasks oder Mitteilungen im Standardablauf</li>
            <li>Eintrag in <code className="font-mono">webhook_events</code> (Audit) + Mitteilung an andere Admins + KB</li>
          </ul>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#0D1B3E]">Aktueller Status</label>
          <div className="w-full rounded-md border border-gray-200 bg-[#f8f9fb] px-3 py-2 text-sm font-mono text-gray-700">
            {currentStatus}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#0D1B3E]">
            Neuer Status <span className="text-red-600">*</span>
          </label>
          <select
            value={neuerStatus}
            onChange={(e) => setNeuerStatus(e.target.value as FallStatusValue | '')}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
          >
            <option value="">– bitte wählen –</option>
            {ALLOWED_STATUS_VALUES.map((s) => (
              <option key={s} value={s} disabled={s === currentStatus}>
                {STATUS_LABEL[s]} ({s}){s === currentStatus ? ' — aktuell' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#0D1B3E]">
            Begründung <span className="text-red-600">*</span>
            <span className="text-gray-500 font-normal ml-1">(min. 10 Zeichen)</span>
          </label>
          <textarea
            value={begruendung}
            onChange={(e) => setBegruendung(e.target.value)}
            rows={4}
            placeholder="Warum wird der Status manuell überschrieben? (z.B. Legacy-Migration, außergerichtliche Einigung, …)"
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            {begruendung.trim().length} / min. 10 Zeichen —{' '}
            {begruendungOk ? (
              <span className="text-emerald-700">ok</span>
            ) : (
              <span className="text-amber-700">noch zu kurz</span>
            )}
          </p>
        </div>

        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-gray-700">
            Ich bestätige, dass ich die Konsequenzen dieser manuellen Status-Änderung verstehe und
            dass die State-Machine-Validierung bewusst umgangen wird.
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
            className="text-sm rounded-md border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-sm rounded-md bg-amber-700 text-white px-3 py-1.5 hover:bg-amber-800 disabled:opacity-50"
          >
            {pending ? 'Wird überschrieben …' : 'Status überschreiben'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
