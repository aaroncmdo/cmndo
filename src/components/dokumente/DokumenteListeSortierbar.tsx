// AAR-326 (Child 6 von AAR-320): Drag&drop-sortierbare Pflichtdokumenten-
// Liste für den KB.
//
// Zeigt pflichtdokumente gruppiert nach Kategorie. Jede Zeile ist per
// @hello-pangea/dnd verschiebbar (innerhalb der gleichen Kategorie).
// Nach dem Drop persistiert updateDokumentSortOrder() die neue Reihenfolge
// in pflichtdokumente.sort_order.
//
// Gedacht als separates „Reihenfolge anpassen"-Widget/Modal neben der
// bestehenden Pflichtdokumente-Checkliste, damit der bestehende Upload-
// Flow unangetastet bleibt.

'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import { GripVerticalIcon, Loader2Icon, CheckIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { updateDokumentSortOrder } from '@/lib/dokumente/zuordnung'

export type SortierbarPflicht = {
  id: string
  label: string
  kategorie: string
  status: string
  sort_order: number
}

export default function DokumenteListeSortierbar({
  fallId,
  items,
}: {
  fallId: string
  items: SortierbarPflicht[]
}) {
  const [local, setLocal] = useState<SortierbarPflicht[]>(() =>
    [...items].sort((a, b) => a.sort_order - b.sort_order),
  )
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const grouped = useMemo(() => {
    const map = new Map<string, SortierbarPflicht[]>()
    for (const it of local) {
      const key = it.kategorie || 'sonstiges'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries())
  }, [local])

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const srcKat = result.source.droppableId
    const dstKat = result.destination.droppableId
    // Nur Reorder innerhalb derselben Kategorie (Cross-Kategorie-Moves
    // verschieben die fachliche Zuordnung — nicht Teil dieses Tickets).
    if (srcKat !== dstKat) {
      toast.error('Verschieben über Kategorien hinweg ist nicht möglich')
      return
    }
    const katItems = local.filter((it) => (it.kategorie || 'sonstiges') === srcKat)
    const [moved] = katItems.splice(result.source.index, 1)
    katItems.splice(result.destination.index, 0, moved)

    // Neue global-Liste: behalte andere Kategorien in ursprünglicher
    // Reihenfolge, ersetze nur die betroffene Kategorie.
    const others = local.filter((it) => (it.kategorie || 'sonstiges') !== srcKat)
    const next = [...others, ...katItems]
    setLocal(next)

    // Payload bauen: alle betroffenen Items mit neuem sort_order
    const payload = next.map((it, idx) => ({
      pflichtId: it.id,
      sortOrder: idx + 1,
    }))
    startTransition(async () => {
      const res = await updateDokumentSortOrder(fallId, payload)
      if (res.success) {
        toast.success('Reihenfolge gespeichert')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  if (local.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-claimondo-ondo/70 text-xs">
        Keine Pflichtdokumente definiert.
      </p>
    )
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-claimondo-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider">
          Reihenfolge anpassen
        </h3>
        <span className="text-[10px] text-claimondo-ondo/70 flex items-center gap-1">
          {pending ? (
            <>
              <Loader2Icon className="w-3 h-3 animate-spin" /> Speichert…
            </>
          ) : (
            <>
              <CheckIcon className="w-3 h-3 text-emerald-500" /> Auto-Save
            </>
          )}
        </span>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="p-3 space-y-4">
          {grouped.map(([kat, entries]) => (
            <div key={kat}>
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-1 px-1">
                {kat}
              </p>
              <Droppable droppableId={kat}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-1"
                  >
                    {entries.map((it, idx) => (
                      <Draggable draggableId={it.id} index={idx} key={it.id}>
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            className={`flex items-center gap-2 px-3 py-2 rounded-ios-md border text-xs ${
                              snap.isDragging
                                ? 'bg-claimondo-ondo/5 border-claimondo-ondo shadow-sm'
                                : 'bg-claimondo-bg border-claimondo-border'
                            }`}
                          >
                            <span
                              {...prov.dragHandleProps}
                              className="text-claimondo-ondo/70 hover:text-claimondo-ondo cursor-grab active:cursor-grabbing"
                            >
                              <GripVerticalIcon className="w-3.5 h-3.5" />
                            </span>
                            <span className="flex-1 truncate text-claimondo-navy">{it.label}</span>
                            <StatusBadge tone={it.status === 'hochgeladen' || it.status === 'geprueft' ? 'success' : 'warning'}>
                              {it.status === 'geprueft'
                                ? 'Geprüft'
                                : it.status === 'hochgeladen'
                                ? 'Hochgeladen'
                                : 'Ausstehend'}
                            </StatusBadge>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  )
}
