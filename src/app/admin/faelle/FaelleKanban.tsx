'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { updateFallStatus } from '../dispatch/actions'

type Fall = {
  id: string
  fall_nummer: string | null
  status: string
  schadens_ursache: string | null
  schadens_ort: string | null
  sv_id: string | null
  kundenbetreuer_id: string | null
  mandatsnummer: string | null
  schadenfall_typ: string | null
  kennzeichen: string | null
  created_at: string
  kunde_name: string | null
  betreuer_name: string | null
  sv_name: string | null
}

const COLUMNS = [
  { key: 'ersterfassung', label: 'Ersterfassung', color: 'text-gray-600', bg: 'bg-gray-400' },
  { key: 'sv-zugewiesen', label: 'SV zugew.', color: 'text-blue-600', bg: 'bg-blue-500' },
  { key: 'sv-termin', label: 'Termin', color: 'text-blue-600', bg: 'bg-blue-400' },
  { key: 'besichtigung', label: 'Besicht.', color: 'text-indigo-600', bg: 'bg-indigo-500' },
  { key: 'gutachten-eingegangen', label: 'Gutachten', color: 'text-violet-600', bg: 'bg-violet-500' },
  { key: 'filmcheck', label: 'QC', color: 'text-amber-600', bg: 'bg-amber-500' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei', color: 'text-green-600', bg: 'bg-green-500' },
  { key: 'anschlussschreiben', label: 'AS gesendet', color: 'text-green-600', bg: 'bg-green-400' },
  { key: 'regulierung', label: 'Regulierung', color: 'text-emerald-600', bg: 'bg-emerald-500' },
  { key: 'abgeschlossen', label: 'Abgeschl.', color: 'text-emerald-700', bg: 'bg-emerald-600' },
]

function mapStatus(status: string): string {
  if (COLUMNS.some(c => c.key === status)) return status
  if (status === 'qc-pruefung') return 'filmcheck'
  if (status === 'vs-regulierung') return 'regulierung'
  return 'ersterfassung'
}

const SF_SHORT: Record<string, string> = { 'sf-01': 'SF-01', 'sf-02': 'SF-02', 'sf-03': 'SF-03', 'sf-05': 'SF-05' }

function timeSince(d: string): string {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function FaelleKanban({ faelle }: { faelle: Fall[] }) {
  const [localFaelle, setLocalFaelle] = useState(faelle)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => { setLocalFaelle(faelle) }, [faelle])

  const filtered = useMemo(() => {
    if (!search) return localFaelle.filter(f => f.status !== 'storniert')
    const q = search.toLowerCase()
    return localFaelle.filter(f => {
      if (f.status === 'storniert') return false
      return (f.kunde_name ?? '').toLowerCase().includes(q) ||
        (f.mandatsnummer ?? '').toLowerCase().includes(q) ||
        (f.kennzeichen ?? '').toLowerCase().includes(q) ||
        (f.fall_nummer ?? '').includes(q)
    })
  }, [localFaelle, search])

  const byColumn = useMemo(() => {
    const map: Record<string, Fall[]> = {}
    for (const col of COLUMNS) {
      map[col.key] = filtered.filter(f => mapStatus(f.status) === col.key)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return map
  }, [filtered])

  const onDragEnd = useCallback((result: DropResult) => {
    const { draggableId, destination, source } = result
    if (!destination || destination.droppableId === source.droppableId) return
    const newStatus = destination.droppableId

    // Optimistic update
    const snapshot = [...localFaelle]
    setLocalFaelle(prev => prev.map(f => f.id === draggableId ? { ...f, status: newStatus } : f))

    updateFallStatus(draggableId, newStatus).catch(e => {
      setLocalFaelle(snapshot)
      setToast(e instanceof Error ? e.message : 'Fehler')
      setTimeout(() => setToast(null), 3000)
    })
  }, [localFaelle])

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header: exactly 40px */}
      <div className="flex items-center justify-between px-4 py-2 h-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-gray-900">Fälle</h1>
          <span className="text-gray-400 text-xs">{filtered.length}</span>
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
          className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40 h-7" />
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-lg">
          <p className="text-red-700 text-sm font-medium">{toast}</p>
        </div>
      )}

      {/* Kanban Board: fills remaining space */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 4, padding: '0 8px 8px 8px', minHeight: 0 }}>
          {/* overflow-x-auto wrapper for 12 columns */}
          <div style={{ display: 'flex', gap: 4, height: '100%', overflowX: 'auto', flex: 1 }}>
            {COLUMNS.map(col => {
              const items = byColumn[col.key] ?? []
              return (
                <div key={col.key} style={{ minWidth: 150, maxWidth: 200, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* Column header: 28px */}
                  <div className="flex items-center gap-1 px-1 flex-shrink-0" style={{ height: 28 }}>
                    <span className={`text-[11px] font-medium tracking-wider uppercase ${col.color}`}>{col.label}</span>
                    <span className="text-gray-500 text-[10px] font-medium bg-gray-100 px-1 py-0.5 rounded-full ml-auto">{items.length}</span>
                  </div>
                  <div className={`h-px ${col.bg} opacity-40 flex-shrink-0`} />

                  {/* Column body: scrollable */}
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{ flex: 1, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}
                        className={`transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg' : ''}`}
                      >
                        {items.map((fall, i) => (
                          <Draggable key={fall.id} draggableId={fall.id} index={i}>
                            {(dp, ds) => (
                              <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}
                                className={`transition-shadow ${ds.isDragging ? 'opacity-80 shadow-xl' : ''}`}>
                                <FallCard fall={fall} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </div>
      </DragDropContext>
    </div>
  )
}

function FallCard({ fall }: { fall: Fall }) {
  const label = fall.mandatsnummer ?? fall.fall_nummer ?? fall.id.slice(0, 8)
  return (
    <Link href={`/admin/faelle/${fall.id}`}
      className="block bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
      style={{ padding: '6px 8px' }}
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-mono text-blue-600 truncate">{label}</span>
        <span className="text-[9px] text-gray-400 shrink-0 ml-1">{timeSince(fall.created_at)}</span>
      </div>
      {fall.kunde_name && <p className="text-xs font-medium text-gray-800 truncate">{fall.kunde_name}</p>}
      <div className="flex flex-wrap gap-1 mt-1">
        {fall.kennzeichen && <span className="bg-gray-100 text-gray-600 text-[9px] px-1 py-0.5 rounded">{fall.kennzeichen}</span>}
        {fall.schadenfall_typ && <span className="bg-blue-50 text-blue-600 text-[9px] px-1 py-0.5 rounded">{SF_SHORT[fall.schadenfall_typ] ?? fall.schadenfall_typ}</span>}
      </div>
      {(fall.betreuer_name || fall.sv_name) && (
        <div className="flex gap-2 mt-1 text-[9px] text-gray-400 truncate">
          {fall.betreuer_name && <span>KB: {fall.betreuer_name}</span>}
          {fall.sv_name && <span>SV: {fall.sv_name}</span>}
        </div>
      )}
    </Link>
  )
}
