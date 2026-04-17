'use client'

// AAR-Phase0 (0.2): Rendert eine Liste von DokumentSlots mit Fortschritts-
// Zähler und Pflicht/Optional-Gruppierung. Wird von DokumenteUebersichtCard
// (AAR-399) und anderen Fall-Views genutzt.

import { useMemo } from 'react'
import DokumentSlot, { type DokumentSlotStatus } from './DokumentSlot'

export type SlotRow = {
  /** pflichtdokumente.id (wenn existent) — sonst nur katalog slot_id */
  id?: string | null
  slotId: string // dokument_katalog.slot_id
  label: string
  beschreibung?: string | null
  istPflicht: boolean
  status: DokumentSlotStatus
  currentFile?: { name: string; url?: string | null; size?: number | null } | null
}

type Props = {
  slots: SlotRow[]
  fallId: string
  rolle?: 'kunde' | 'sachverstaendiger' | 'kundenbetreuer' | 'admin'
}

export default function DokumentenListe({ slots, fallId }: Props) {
  const { pflicht, optional, done, total } = useMemo(() => {
    const pflicht = slots.filter(s => s.istPflicht)
    const optional = slots.filter(s => !s.istPflicht)
    const done = pflicht.filter(s => s.status === 'hochgeladen' || s.status === 'geprueft').length
    return { pflicht, optional, done, total: pflicht.length }
  }, [slots])

  return (
    <div className="space-y-4">
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Pflichtdokumente</span>
          <span className="font-medium text-[#0D1B3E]">
            {done}/{total} erledigt
          </span>
        </div>
      )}

      {pflicht.length > 0 && (
        <div className="space-y-2">
          {pflicht.map(slot => (
            <DokumentSlot
              key={`${slot.slotId}-${slot.id ?? 'new'}`}
              fallId={fallId}
              slotId={slot.id ?? null}
              slotLabel={slot.label}
              beschreibung={slot.beschreibung}
              dokumentTyp={slot.slotId}
              status={slot.status}
              currentFile={slot.currentFile}
              istPflicht
            />
          ))}
        </div>
      )}

      {optional.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
            <span>Optional</span>
          </div>
          <div className="space-y-2">
            {optional.map(slot => (
              <DokumentSlot
                key={`${slot.slotId}-${slot.id ?? 'new'}`}
                fallId={fallId}
                slotId={slot.id ?? null}
                slotLabel={slot.label}
                beschreibung={slot.beschreibung}
                dokumentTyp={slot.slotId}
                status={slot.status}
                currentFile={slot.currentFile}
                istPflicht={false}
              />
            ))}
          </div>
        </>
      )}

      {slots.length === 0 && (
        <p className="text-sm text-gray-500 italic">Keine Dokumente angefordert.</p>
      )}
    </div>
  )
}
