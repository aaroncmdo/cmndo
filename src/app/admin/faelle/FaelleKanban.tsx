'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { updateFallStatus } from '../dispatch/actions'
import { deleteFall, deactivateFall } from './[id]/actions'
import FallCardBadges, { NotificationDot } from '@/components/faelle/FallCardBadges'

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
  ist_aktiv: boolean | null
  deaktiviert_grund: string | null
  kunde_name: string | null
  betreuer_name: string | null
  sv_name: string | null
  ungelesene_nachrichten?: number
  ungelesene_updates?: number
}

// BUG-05: Kanban-Columns nach faelle.status Enum
const COLUMNS = [
  { key: 'ersterfassung', label: 'Offen', color: 'text-gray-600', bg: 'bg-gray-400' },
  { key: 'sv-zugewiesen', label: 'SV zugew.', color: 'text-[#4573A2]', bg: 'bg-[#4573A2]' },
  { key: 'sv-termin', label: 'Termin', color: 'text-[#4573A2]', bg: 'bg-[#4573A2]' },
  { key: 'besichtigung', label: 'Besichtigung', color: 'text-[#1E3A5F]', bg: 'bg-[#4573A2]' },
  { key: 'gutachten-eingegangen', label: 'Gutachten', color: 'text-violet-600', bg: 'bg-violet-500' },
  { key: 'filmcheck', label: 'QC', color: 'text-amber-600', bg: 'bg-amber-500' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei', color: 'text-green-600', bg: 'bg-green-500' },
  { key: 'anschlussschreiben', label: 'AS gesendet', color: 'text-green-600', bg: 'bg-green-400' },
  { key: 'regulierung-laeuft', label: 'Regulierung', color: 'text-emerald-600', bg: 'bg-emerald-500' },
  { key: 'zahlung-eingegangen', label: 'Zahlung', color: 'text-emerald-600', bg: 'bg-emerald-400' },
  { key: 'abgeschlossen', label: 'Fertig', color: 'text-emerald-700', bg: 'bg-emerald-600' },
]

function mapStatus(status: string): string {
  if (COLUMNS.some(c => c.key === status)) return status
  if (status === 'qc-pruefung') return 'filmcheck'
  if (status === 'regulierung') return 'regulierung-laeuft'
  if (status === 'begutachtung-laeuft') return 'besichtigung'
  if (status === 'nachbesichtigung-laeuft') return 'regulierung-laeuft'
  if (status === 'vs-abgelehnt') return 'regulierung-laeuft'
  if (status === 'regulierung-laeuft') return 'regulierung'
  if (status === 'vs-abgelehnt') return 'regulierung'
  if (status === 'zahlung-eingegangen') return 'abgeschlossen'
  return 'ersterfassung'
}

const SF_SHORT: Record<string, string> = { 'sf-01': 'SF-01', 'sf-02': 'SF-02', 'sf-03': 'SF-03', 'sf-05': 'SF-05' }

function timeSince(d: string): string {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function FaelleKanban({ faelle }: { faelle: Fall[] }) {
  const router = useRouter()
  const [localFaelle, setLocalFaelle] = useState(faelle)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [aktivFilter, setAktivFilter] = useState<'aktive' | 'deaktivierte' | 'alle'>('aktive')

  useEffect(() => { setLocalFaelle(faelle) }, [faelle])

  const filtered = useMemo(() => {
    let result = localFaelle.filter(f => f.status !== 'storniert')
    // KFZ-120: Aktiv/Deaktiviert Filter
    if (aktivFilter === 'aktive') result = result.filter(f => f.ist_aktiv !== false)
    else if (aktivFilter === 'deaktivierte') result = result.filter(f => f.ist_aktiv === false)

    if (!search) return result
    const q = search.toLowerCase()
    return result.filter(f =>
      (f.kunde_name ?? '').toLowerCase().includes(q) ||
      (f.mandatsnummer ?? '').toLowerCase().includes(q) ||
      (f.kennzeichen ?? '').toLowerCase().includes(q) ||
      (f.fall_nummer ?? '').includes(q)
    )
  }, [localFaelle, search, aktivFilter])

  const byColumn = useMemo(() => {
    const map: Record<string, Fall[]> = {}
    for (const col of COLUMNS) {
      map[col.key] = filtered.filter(f => mapStatus(f.status) === col.key)
        .sort((a, b) => (b.ungelesene_nachrichten ?? 0) - (a.ungelesene_nachrichten ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['aktive', 'deaktivierte', 'alle'] as const).map(f => (
              <button key={f} onClick={() => setAktivFilter(f)}
                className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${aktivFilter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {f === 'aktive' ? 'Aktive' : f === 'deaktivierte' ? 'Deaktiv.' : 'Alle'}
              </button>
            ))}
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
            className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#4573A2] w-40 h-7" />
        </div>
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
                        className={`transition-colors ${snapshot.isDraggingOver ? 'bg-[#4573A2]/5 border-2 border-dashed border-[#4573A2]/30 rounded-lg' : ''}`}
                      >
                        {items.map((fall, i) => (
                          <Draggable key={fall.id} draggableId={fall.id} index={i}>
                            {(dp, ds) => (
                              <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}
                                className={`transition-shadow ${ds.isDragging ? 'opacity-80 shadow-xl' : ''}`}>
                                <FallCard fall={fall} onRefresh={() => router.refresh()} />
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

function FallCard({ fall, onRefresh }: { fall: Fall; onRefresh: () => void }) {
  const router = useRouter()
  const label = fall.mandatsnummer ?? fall.fall_nummer ?? fall.id.slice(0, 8)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<'delete' | 'deactivate' | null>(null)
  const [grund, setGrund] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <>
      <div className={`relative rounded-lg border hover:shadow-sm transition-all ${
        fall.ist_aktiv === false ? 'bg-red-50/60 border-red-200 opacity-60' : 'bg-white border-gray-200 hover:border-gray-300'
      }`} style={{ padding: '6px 8px' }}>
        {/* KFZ-182: Roter Dot wenn Chat UND Updates > 0 */}
        {(fall.ungelesene_nachrichten ?? 0) > 0 && (fall.ungelesene_updates ?? 0) > 0 && <NotificationDot />}
        <div className="flex items-center justify-between mb-0.5">
          <Link href={`/admin/faelle/${fall.id}`} className="text-xs font-mono text-[#4573A2] truncate hover:underline" onClick={e => e.stopPropagation()}>
            {label}
          </Link>
          <div className="flex items-center gap-1 shrink-0 ml-1" ref={menuRef}>
            {fall.ist_aktiv === false && <span className="text-[8px] bg-red-100 text-red-500 px-1 py-0.5 rounded font-medium">Deaktiviert</span>}
            <button onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }} className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="4" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="10" cy="16" r="2"/></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-1 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36 z-30">
                <Link href={`/admin/faelle/${fall.id}`} className="block px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Öffnen</Link>
                <button onClick={() => { setMenuOpen(false); setModal('deactivate'); setGrund(''); setError('') }} className="w-full text-left px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50">Deaktivieren</button>
                <button onClick={() => { setMenuOpen(false); setModal('delete'); setError('') }} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">Löschen</button>
              </div>
            )}
          </div>
        </div>
        <Link href={`/admin/faelle/${fall.id}`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            {fall.kunde_name && <p className={`text-xs font-medium truncate ${fall.ist_aktiv === false ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{fall.kunde_name}</p>}
            <FallCardBadges chatCount={fall.ungelesene_nachrichten ?? 0} updateCount={fall.ungelesene_updates ?? 0} />
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {fall.kennzeichen && <span className="bg-gray-100 text-gray-600 text-[9px] px-1 py-0.5 rounded">{fall.kennzeichen}</span>}
            {fall.schadenfall_typ && <span className="bg-[#4573A2]/5 text-[#4573A2] text-[9px] px-1 py-0.5 rounded">{SF_SHORT[fall.schadenfall_typ] ?? fall.schadenfall_typ}</span>}
          </div>
          {(fall.betreuer_name || fall.sv_name) && (
            <div className="flex gap-2 mt-1 text-[9px] text-gray-400 truncate">
              {fall.betreuer_name && <span>KB: {fall.betreuer_name}</span>}
              {fall.sv_name && <span>SV: {fall.sv_name}</span>}
            </div>
          )}
        </Link>
      </div>

      {/* Delete Confirmation */}
      {modal === 'delete' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-red-600 mb-2">Fall löschen?</h3>
            <p className="text-sm text-gray-600 mb-1"><strong>{label}</strong> — {fall.kunde_name ?? 'Unbekannt'}</p>
            <p className="text-xs text-gray-400 mb-4">Alle Daten werden unwiderruflich entfernt.</p>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">Abbrechen</button>
              <button disabled={processing} onClick={async () => {
                setProcessing(true)
                const result = await deleteFall(fall.id)
                if (result.success) { onRefresh(); setModal(null) }
                else { setError(result.error ?? 'Fehler'); setProcessing(false) }
              }} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40">
                {processing ? 'Löscht...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation */}
      {modal === 'deactivate' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Fall deaktivieren</h3>
            <select value={grund} onChange={e => setGrund(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3">
              <option value="">— Grund —</option>
              {['Kunde hat abgesagt', 'Kein Interesse', 'Duplikat', 'Spam', 'Sonstiges'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">Abbrechen</button>
              <button disabled={processing || !grund} onClick={async () => {
                setProcessing(true)
                try { await deactivateFall(fall.id, grund, ''); onRefresh() } catch (e) { setError(e instanceof Error ? e.message : 'Fehler') }
                setProcessing(false); setModal(null)
              }} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40">
                {processing ? 'Deaktiviert...' : 'Deaktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
