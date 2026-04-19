'use client'

// AAR-573 (V7): Manueller Phase-Override-Modal (Admin-only).
// Zeigt eine nach Haupt-Phase gruppierte Liste aller 52 `aktuelle_phase`-
// Subphasen, verlangt Pflicht-Begründung (min 10 Zeichen) und eine explizite
// Bestätigungs-Checkbox. Unterscheidet sich vom Status-Override:
//   - `aktuelle_phase` (52 feine Subphasen) wird gesetzt, nicht `status`
//   - kein processLexDriveEvent — direktes Update + Audit-Eintrag
//   - Visibility-Matrix steuert danach die Kunden-/SV-Sicht
// Side-Effects: nur webhook_events-Audit + Mitteilungen. Keine WA, keine SLAs,
// keine automatischen Tasks.

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangleIcon } from 'lucide-react'
import {
  manualPhaseOverride,
  ALLOWED_PHASE_VALUES,
} from '@/app/admin/faelle/[id]/actions/manual-phase-override'
import { SUBPHASE_VISIBILITY, PHASE_META } from '@/lib/fall/subphase-visibility'
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
  currentSubphase: string | null
}

interface PhaseGroup {
  phase: number
  name: string
  options: Array<{ key: string; label: string }>
}

export function ManualPhaseOverrideModal({ open, onOpenChange, fallId, currentSubphase }: Props) {
  const [neueSubphase, setNeueSubphase] = useState<string>('')
  const [begruendung, setBegruendung] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [pending, startTransition] = useTransition()

  const begruendungOk = begruendung.trim().length >= 10
  const subphaseOk = neueSubphase !== '' && neueSubphase !== currentSubphase
  const canSubmit = begruendungOk && subphaseOk && confirmed && !pending

  const groups: PhaseGroup[] = useMemo(() => {
    const byPhase = new Map<number, PhaseGroup>()
    for (const key of ALLOWED_PHASE_VALUES) {
      const rule = SUBPHASE_VISIBILITY[key]
      if (!rule) continue
      const meta = PHASE_META[rule.phase]
      let g = byPhase.get(rule.phase)
      if (!g) {
        g = { phase: rule.phase, name: meta?.name ?? `Phase ${rule.phase}`, options: [] }
        byPhase.set(rule.phase, g)
      }
      g.options.push({ key, label: rule.label })
    }
    return [...byPhase.values()].sort((a, b) => a.phase - b.phase)
  }, [])

  function reset() {
    setNeueSubphase('')
    setBegruendung('')
    setConfirmed(false)
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset()
    onOpenChange(o)
  }

  function handleSubmit() {
    if (!canSubmit) return
    const zielSubphase = neueSubphase
    const zielLabel = SUBPHASE_VISIBILITY[zielSubphase]?.label ?? zielSubphase

    startTransition(async () => {
      const result = await manualPhaseOverride({
        fallId,
        neueSubphase: zielSubphase,
        begruendung: begruendung.trim(),
      })

      if (result.success) {
        toast.success(`Subphase gesetzt: ${zielLabel}`)
        handleOpenChange(false)
      } else {
        toast.error(result.error ?? 'Override fehlgeschlagen')
      }
    })
  }

  const currentLabel = currentSubphase ? SUBPHASE_VISIBILITY[currentSubphase]?.label ?? currentSubphase : '–'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0D1B3E] flex items-center gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-amber-600" />
            Subphase manuell überschreiben
          </DialogTitle>
          <DialogDescription>
            Nur für Admin-Rolle. Setzt <code className="font-mono">faelle.aktuelle_phase</code> direkt —
            umgeht den Subphase-Resolver. Einsatz nur bei Legacy-Migration, Fine-Tuning der
            Visibility-Matrix oder Test/Staging.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          <p className="font-medium">Hinweis: Keine Auto-Side-Effects</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li>Subphase-Resolver läuft nicht — Wert bleibt bis zum nächsten Trigger-Update</li>
            <li>Keine WhatsApp-Benachrichtigung an Kunde/SV</li>
            <li>Keine SLA-Cron-Jobs, keine automatischen Tasks</li>
            <li><code className="font-mono">faelle.status</code> wird nicht verändert</li>
            <li>Eintrag in <code className="font-mono">webhook_events</code> (Audit) + Mitteilung an andere Admins + KB</li>
          </ul>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#0D1B3E]">Aktuelle Subphase</label>
          <div className="w-full rounded-md border border-gray-200 bg-[#f8f9fb] px-3 py-2 text-sm text-gray-700">
            <span className="font-medium">{currentLabel}</span>
            {currentSubphase && (
              <span className="ml-2 font-mono text-xs text-gray-500">({currentSubphase})</span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#0D1B3E]">
            Neue Subphase <span className="text-red-600">*</span>
          </label>
          <select
            value={neueSubphase}
            onChange={(e) => setNeueSubphase(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
          >
            <option value="">– bitte wählen –</option>
            {groups.map((g) => (
              <optgroup key={g.phase} label={`Phase ${g.phase}: ${g.name}`}>
                {g.options.map((o) => (
                  <option key={o.key} value={o.key} disabled={o.key === currentSubphase}>
                    {o.label} ({o.key}){o.key === currentSubphase ? ' — aktuell' : ''}
                  </option>
                ))}
              </optgroup>
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
            placeholder="Warum wird die Subphase manuell überschrieben? (z.B. Legacy-Migration, Visibility-Fine-Tuning, …)"
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
            Ich bestätige, dass ich die Konsequenzen dieser manuellen Subphase-Änderung verstehe und
            dass der Subphase-Resolver bewusst umgangen wird.
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
            {pending ? 'Wird überschrieben …' : 'Subphase überschreiben'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
