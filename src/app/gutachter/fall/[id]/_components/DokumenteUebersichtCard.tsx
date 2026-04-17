'use client'

// AAR-289 / AAR-399: Dokumente-Übersicht in der rechten Spalte der SV-Fallakte.
// Zeigt kompakten Pflicht-Fortschritt im Header und darunter die volle
// DokumentenListe mit DnD-Upload (shared Phase-0-Primitive DokumentSlot).
// Vorher: reine Status-Liste ohne Upload — Details nur im Drawer.

import { useMemo } from 'react'
import { FileTextIcon } from 'lucide-react'
import DokumentenListe, { type SlotRow } from '@/components/fall/DokumentenListe'

type SvSlotRow = {
  id: string | null
  slotId: string
  label: string
  beschreibung: string | null
  istPflicht: boolean
  status:
    | 'ausstehend'
    | 'hochgeladen'
    | 'geprueft'
    | 'abgelehnt'
    | 'nachgereicht_angefordert'
    | 'optional'
  currentFile: { name: string; url?: string | null; size?: number | null } | null
}

export function DokumenteUebersichtCard({
  fallId,
  svSlots,
  totalDokumente,
}: {
  fallId: string
  svSlots: SvSlotRow[]
  totalDokumente: number
}) {
  // Nur Slots anzeigen, die entweder Pflicht sind ODER bereits hochgeladen
  // wurden — reine „optionale + leere" Slots blasen die Sidebar auf.
  const sichtbareSlots = useMemo(
    () =>
      svSlots.filter((s) => s.istPflicht || (s.currentFile && s.currentFile.url)),
    [svSlots],
  )

  const pflichtSlots = sichtbareSlots.filter((s) => s.istPflicht)
  const erfuellt = pflichtSlots.filter(
    (s) => s.status === 'hochgeladen' || s.status === 'geprueft',
  ).length
  const offen = pflichtSlots.length - erfuellt

  const listeSlots: SlotRow[] = sichtbareSlots.map((s) => ({
    id: s.id,
    slotId: s.slotId,
    label: s.label,
    beschreibung: s.beschreibung,
    istPflicht: s.istPflicht,
    status: s.status,
    currentFile: s.currentFile,
  }))

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Dokumente
        </h3>
        <span className="text-[10px] text-gray-400">
          {erfuellt}/{pflichtSlots.length} Pflicht · {totalDokumente} gesamt
        </span>
      </div>

      {sichtbareSlots.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">
          Keine Pflichtdokumente.
        </p>
      ) : (
        <DokumentenListe
          slots={listeSlots}
          fallId={fallId}
          rolle="sachverstaendiger"
        />
      )}

      {offen > 0 && (
        <p className="text-[11px] text-amber-700 pt-2 border-t border-gray-100 flex items-center gap-1">
          <FileTextIcon className="w-3 h-3" />
          {offen} {offen === 1 ? 'Pflichtdokument fehlt' : 'Pflichtdokumente fehlen'}
        </p>
      )}
    </div>
  )
}
