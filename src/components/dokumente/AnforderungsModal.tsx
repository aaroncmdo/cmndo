// AAR-327 (Child 7 von AAR-320): Wiederverwendbares Modal zum Anfordern
// eines Dokuments beim Kunden. Wird in Admin-, KB-, SV- (und später Kanzlei-)
// Fallakten genutzt.
//
// Die Slot-Liste wird vom Parent (Server-Component) gefiltert auf
// `anforderbar_von.includes(rolle)` übergeben — das Modal weiß nicht welche
// Rolle der User hat, sondern zeigt nur was es bekommt. Die Server-Action
// dokumentAnfordern() prüft die Rolle nochmal als Defense-in-Depth.

'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Loader2Icon, AlertCircleIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { dokumentAnfordern } from '@/lib/dokumente/anforderung'

export type AnforderbarerSlot = {
  slot_id: string
  label: string
  beschreibung: string | null
  kategorie: string
}

/**
 * Default-Frist: heute + 14 Tage als YYYY-MM-DD.
 */
function defaultFristIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

export default function AnforderungsModal({
  fallId,
  rolleLabel,
  slots,
  open,
  onOpenChange,
}: {
  fallId: string
  /** Anzeige-Label der Rolle ("Kanzlei", "Gutachter", "Claimondo") */
  rolleLabel: string
  /** Vom Parent serverseitig gefilterte Slot-Liste (anforderbar_von.includes(rolle)) */
  slots: AnforderbarerSlot[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [slotId, setSlotId] = useState<string>(slots[0]?.slot_id ?? '')
  const [begruendung, setBegruendung] = useState('')
  const [frist, setFrist] = useState(defaultFristIso())
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const begruendungChars = begruendung.trim().length
  const begruendungValid = begruendungChars >= 20

  function handleSubmit() {
    setError(null)
    if (!slotId) {
      setError('Bitte wählen Sie ein Dokument aus')
      return
    }
    if (!begruendungValid) {
      setError(`Begründung muss mindestens 20 Zeichen haben (aktuell ${begruendungChars})`)
      return
    }
    startTransition(async () => {
      const res = await dokumentAnfordern(fallId, slotId, begruendung.trim(), frist)
      if (res.success) {
        toast.success('Anforderung an Kunden gesendet')
        setBegruendung('')
        setFrist(defaultFristIso())
        onOpenChange(false)
        router.refresh()
      } else {
        setError(res.error ?? 'Anforderung fehlgeschlagen')
        toast.error(res.error ?? 'Anforderung fehlgeschlagen')
      }
    })
  }

  const slotInfo = slots.find((s) => s.slot_id === slotId) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dokument anfordern</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="text-xs text-claimondo-ondo">
            Angefordert durch: <span className="font-medium text-claimondo-navy">{rolleLabel}</span>
          </div>

          {/* Slot-Dropdown */}
          <div>
            <label className="block text-xs font-medium text-claimondo-navy mb-1">
              Welches Dokument brauchen Sie?
            </label>
            {slots.length === 0 ? (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircleIcon className="w-3.5 h-3.5" />
                Keine Dokumente verfügbar, die Ihre Rolle anfordern darf.
              </p>
            ) : (
              <select
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-claimondo-border rounded-ios-lg focus:outline-none focus:ring-1 focus:ring-claimondo-ondo bg-white"
                disabled={pending}
              >
                {slots.map((s) => (
                  <option key={s.slot_id} value={s.slot_id}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            {slotInfo?.beschreibung && (
              <p className="mt-1 text-[11px] text-claimondo-ondo">{slotInfo.beschreibung}</p>
            )}
          </div>

          {/* Begründung */}
          <div>
            <label className="block text-xs font-medium text-claimondo-navy mb-1">
              Begründung <span className="text-claimondo-ondo/70 font-normal">(wird dem Kunden gezeigt)</span>
            </label>
            <textarea
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
              rows={4}
              disabled={pending}
              placeholder="Bitte erläutern Sie warum Sie das Dokument brauchen (min. 20 Zeichen)"
              className="w-full px-3 py-2 text-sm border border-claimondo-border rounded-ios-lg focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
            />
            <p
              className={`mt-1 text-[10px] tabular-nums ${
                begruendungValid ? 'text-claimondo-ondo/70' : 'text-amber-600'
              }`}
            >
              {begruendungChars}/20 Zeichen min.
            </p>
          </div>

          {/* Frist */}
          <div>
            <label className="block text-xs font-medium text-claimondo-navy mb-1">Frist</label>
            <input
              type="date"
              value={frist}
              onChange={(e) => setFrist(e.target.value)}
              disabled={pending}
              min={new Date().toISOString().slice(0, 10)}
              className="px-3 py-2 text-sm border border-claimondo-border rounded-ios-lg focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
            />
            <p className="mt-1 text-[10px] text-claimondo-ondo/70">Default: heute + 14 Tage</p>
          </div>

          {error && (
            <div className="rounded-ios-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <AlertCircleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="px-3 py-1.5 text-xs font-medium text-claimondo-navy bg-white border border-claimondo-border rounded-ios-md hover:bg-claimondo-bg disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || slots.length === 0 || !begruendungValid}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-claimondo-ondo rounded-ios-md hover:bg-claimondo-shield disabled:opacity-50"
          >
            {pending && <Loader2Icon className="w-3 h-3 animate-spin" />}
            Beim Kunden anfordern
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
