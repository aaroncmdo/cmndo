// AAR-326 (Child 6 von AAR-320): Wiederverwendbares Modal zum Zuordnen
// eines unzugeordneten Kunden-Uploads zu einem Katalog-Slot.
//
// Gedacht für die KB-Workbench: wenn ein Kunde ein Dokument als
// „kunde-nachreichung" oder „sonstiges" hochgeladen hat, weist der KB es
// hier nachträglich einem konkreten Slot (z.B. „Fahrzeugschein") zu.
//
// Die Slot-Liste (slots) kommt bereits gefiltert vom Parent — KB darf nur
// Slots sehen, deren uploadbar_von 'kundenbetreuer' oder 'kunde' enthält.
// Die Server-Action zuordneDokument() prüft die Rolle (admin/kb) nochmal.

'use client'

import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Loader2Icon, AlertCircleIcon, FileTextIcon, ExternalLinkIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { zuordneDokument } from '@/lib/dokumente/zuordnung'

export type ZuordnungsSlot = {
  slot_id: string
  label: string
  beschreibung: string | null
  kategorie: string
}

export type UnzugeordnetDoc = {
  id: string
  original_filename: string | null
  previewUrl: string | null
  dokument_typ: string
  beschreibung: string | null
  hochgeladen_am: string
}

export default function DokumenteZuordnungsModal({
  doc,
  slots,
  open,
  onOpenChange,
}: {
  doc: UnzugeordnetDoc | null
  slots: ZuordnungsSlot[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [slotId, setSlotId] = useState<string>(slots[0]?.slot_id ?? '')
  const [notiz, setNotiz] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Wenn ein neues Dokument reinkommt, Form zurücksetzen.
  useEffect(() => {
    if (open) {
      setSlotId(slots[0]?.slot_id ?? '')
      setNotiz('')
      setError(null)
    }
  }, [open, doc?.id, slots])

  function handleSubmit() {
    if (!doc) return
    setError(null)
    if (!slotId) {
      setError('Bitte wählen Sie einen Slot aus')
      return
    }
    startTransition(async () => {
      const res = await zuordneDokument(doc.id, slotId, notiz.trim() || undefined)
      if (res.success) {
        toast.success('Dokument zugeordnet')
        onOpenChange(false)
        router.refresh()
      } else {
        setError(res.error ?? 'Zuordnung fehlgeschlagen')
        toast.error(res.error ?? 'Zuordnung fehlgeschlagen')
      }
    })
  }

  const slotInfo = slots.find((s) => s.slot_id === slotId) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dokument einem Slot zuordnen</DialogTitle>
        </DialogHeader>

        {doc && (
          <div className="space-y-4 pt-1">
            {/* Datei-Info */}
            <div className="rounded-lg border border-gray-200 bg-[#f8f9fb] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-800 truncate">
                    {doc.original_filename ?? 'Unbenannt'}
                  </span>
                </div>
                {doc.previewUrl && (
                  <a
                    href={doc.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#4573A2] hover:underline shrink-0"
                  >
                    <ExternalLinkIcon className="w-3 h-3" /> Ansehen
                  </a>
                )}
              </div>
              <p className="mt-1 text-[10px] text-gray-500">
                Aktuell: <span className="font-medium">{doc.dokument_typ}</span>
                {' · '}
                Hochgeladen: {new Date(doc.hochgeladen_am).toLocaleDateString('de-DE')}
              </p>
              {doc.beschreibung && (
                <p className="mt-1 text-[11px] text-gray-600 italic">„{doc.beschreibung}"</p>
              )}
            </div>

            {/* Slot-Dropdown */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Zuordnen zu
              </label>
              {slots.length === 0 ? (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircleIcon className="w-3.5 h-3.5" />
                  Keine zuordenbaren Slots verfügbar.
                </p>
              ) : (
                <select
                  value={slotId}
                  onChange={(e) => setSlotId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4573A2] bg-white"
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
                <p className="mt-1 text-[11px] text-gray-500">{slotInfo.beschreibung}</p>
              )}
            </div>

            {/* Notiz optional */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notiz <span className="text-gray-400 font-normal">(optional, interne Dokumentation)</span>
              </label>
              <textarea
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                rows={2}
                disabled={pending}
                placeholder='z.B. „Aus E-Mail vom Kunden nachgereicht"'
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                <AlertCircleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !doc || slots.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#4573A2] rounded-md hover:bg-[#1E3A5F] disabled:opacity-50"
          >
            {pending && <Loader2Icon className="w-3 h-3 animate-spin" />}
            Zuordnen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
