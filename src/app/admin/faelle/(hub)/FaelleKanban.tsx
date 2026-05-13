'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import { updateFallStatus } from '@/lib/actions/dispatch-fall-actions'
import { deleteFall, deactivateFall } from '@/app/faelle/[id]/_actions'
import FallCardBadges, { NotificationDot } from '@/components/faelle/FallCardBadges'
// AAR-572 (V6): Shared PhasePipeline als Hover-Overlay auf den Kanban-Karten
import { PhasePipeline } from '@/components/shared/fall-phases'
import { buildPhasePipelineData } from '@/lib/fall/subphase-visibility'
import { Modal } from '@/components/primitives/Modal'

type Fall = {
  id: string
  fall_nummer: string | null
  status: string
  schadens_ursache: string | null
  schadens_ort: string | null
  sv_id: string | null
  kundenbetreuer_id: string | null
  mandatsnummer: string | null
  schadens_fall_typ: string | null
  kennzeichen: string | null
  created_at: string
  ist_aktiv: boolean | null
  deaktiviert_grund: string | null
  kunde_name: string | null
  betreuer_name: string | null
  sv_name: string | null
  ungelesene_nachrichten?: number
  ungelesene_updates?: number
  /** A4 P0: rote Badge wenn Kunde Dokumente hochgeladen hat die der KB nicht gesehen hat */
  ungesehene_kunde_uploads?: number
  aktuelle_phase?: string | null
  abgeschlossen_am?: string | null
  // AAR-770: Jüngste offene Mitteilung für Hover-Preview
  mitteilung?: { titel: string; inhalt: string | null; prioritaet: string | null } | null
}

// BUG-05: Kanban-Columns nach faelle.status Enum
const COLUMNS = [
  { key: 'ersterfassung', label: 'Offen', color: 'text-claimondo-ondo', bg: 'bg-claimondo-ondo/70' },
  { key: 'sv-zugewiesen', label: 'SV zugew.', color: 'text-claimondo-ondo', bg: 'bg-claimondo-ondo' },
  { key: 'sv-termin', label: 'Termin', color: 'text-claimondo-ondo', bg: 'bg-claimondo-ondo' },
  { key: 'besichtigung', label: 'Besichtigung', color: 'text-claimondo-navy', bg: 'bg-claimondo-ondo' },
  { key: 'gutachten-eingegangen', label: 'Gutachten', color: 'text-claimondo-navy', bg: 'bg-claimondo-navy' },
  { key: 'filmcheck', label: 'QC', color: 'text-amber-600', bg: 'bg-amber-500' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei', color: 'text-green-600', bg: 'bg-green-500' },
  { key: 'anschlussschreiben', label: 'AS gesendet', color: 'text-green-600', bg: 'bg-green-400' },
  { key: 'regulierung-laeuft', label: 'Regulierung', color: 'text-emerald-600', bg: 'bg-emerald-500' },
  { key: 'zahlung-eingegangen', label: 'Zahlung', color: 'text-emerald-600', bg: 'bg-emerald-400' },
  { key: 'abgeschlossen', label: 'Fertig', color: 'text-emerald-700', bg: 'bg-emerald-600' },
]

function mapStatus(status: string, aktuellePhase?: string | null): string {
  if (COLUMNS.some(c => c.key === status)) return status
  // Welle-6 Aliase
  if (status === 'qc-pruefung') return 'filmcheck'
  if (status === 'regulierung') return 'regulierung-laeuft'
  if (status === 'begutachtung-laeuft') return 'besichtigung'
  if (status === 'zahlung-eingegangen') return 'abgeschlossen'
  // Welle-7 claims.status-Werte (via AAR-854 Trigger)
  if (status === 'onboarding') {
    // Feinmapping via aktuelle_phase wenn vorhanden
    if (aktuellePhase?.includes('sv_unterwegs') || aktuellePhase === 'sv_vor_ort' || aktuellePhase === 'begutachtung_abgeschlossen') return 'besichtigung'
    if (aktuellePhase?.includes('gutachten') || aktuellePhase === 'qc_bestanden') return 'gutachten-eingegangen'
    if (aktuellePhase === 'termin_bestaetigt') return 'sv-termin'
    return 'ersterfassung'
  }
  if (status === 'in_bearbeitung') {
    if (aktuellePhase?.includes('sv_unterwegs') || aktuellePhase === 'sv_vor_ort' || aktuellePhase === 'begutachtung_abgeschlossen') return 'besichtigung'
    if (aktuellePhase?.includes('gutachten') || aktuellePhase === 'qc_bestanden') return 'gutachten-eingegangen'
    if (aktuellePhase === 'termin_bestaetigt') return 'sv-termin'
    return 'sv-zugewiesen'
  }
  if (status === 'vs_kontakt') return 'regulierung-laeuft'
  if (status === 'reguliert') return 'abgeschlossen'
  if (status === 'abgelehnt') return 'abgeschlossen'
  if (status === 'kanzlei') return 'kanzlei-uebergeben'
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
      map[col.key] = filtered.filter(f => mapStatus(f.status, f.aktuelle_phase) === col.key)
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

    updateFallStatus(draggableId, newStatus).then((r) => {
      if (!r.ok) {
        setLocalFaelle(snapshot)
        setToast(r.error ?? 'Fehler')
        setTimeout(() => setToast(null), 3000)
      }
    }).catch((e: unknown) => {
      setLocalFaelle(snapshot)
      setToast(e instanceof Error ? e.message : 'Fehler')
      setTimeout(() => setToast(null), 3000)
    })
  }, [localFaelle])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header: exactly 40px.
          Breakout auf 100 % der Main-Breite — 104.17 % von 96 % = 100 %,
          -2.08 % von 96 % = -2 %. Kompensiert den 2 %-Inset des PageContainers.
          Overflow:hidden wandert in den Body-Wrapper, damit das Kanban-Scrolling
          funktioniert. */}
      <div className="flex items-center justify-between px-4 py-2 h-10 flex-shrink-0 md:w-[104.17%] md:-ml-[2.08%]">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-claimondo-navy">Fälle</h1>
          <span className="text-claimondo-ondo/70 text-xs">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-claimondo-bg rounded-lg p-0.5">
            {(['aktive', 'deaktivierte', 'alle'] as const).map(f => (
              <button key={f} onClick={() => setAktivFilter(f)}
                className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${aktivFilter === f ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo hover:text-claimondo-navy'}`}>
                {f === 'aktive' ? 'Aktive' : f === 'deaktivierte' ? 'Deaktiv.' : 'Alle'}
              </button>
            ))}
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
            className="px-2 py-1 bg-white border border-claimondo-border rounded-lg text-xs text-claimondo-navy placeholder-claimondo-ondo/60 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo w-40 h-7" />
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
                    <span className="text-claimondo-ondo text-[10px] font-medium bg-claimondo-bg px-1 py-0.5 rounded-full ml-auto">{items.length}</span>
                  </div>
                  <div className={`h-px ${col.bg} opacity-40 flex-shrink-0`} />

                  {/* Column body: scrollable */}
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{ flex: 1, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}
                        className={`transition-colors ${snapshot.isDraggingOver ? 'bg-claimondo-ondo/5 border-2 border-dashed border-claimondo-ondo/30 rounded-lg' : ''}`}
                      >
                        {items.map((fall, i) => (
                          <Draggable key={fall.id} draggableId={fall.id} index={i}>
                            {(dp, ds) => (
                              <div ref={dp.innerRef} {...dp.draggableProps}
                                className={`transition-shadow ${ds.isDragging ? 'opacity-80 shadow-xl' : ''}`}>
                                <FallCard fall={fall} onRefresh={() => router.refresh()} dragHandleProps={dp.dragHandleProps} />
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

function FallCard({ fall, onRefresh, dragHandleProps }: { fall: Fall; onRefresh: () => void; dragHandleProps: DraggableProvidedDragHandleProps | null | undefined }) {
  const router = useRouter()
  const label = fall.mandatsnummer ?? fall.fall_nummer ?? fall.id.slice(0, 8)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<'delete' | 'deactivate' | null>(null)
  const [grund, setGrund] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  // AAR-572 Fix: Overlay per Portal aus dem Column-Scroll-Container rausheben —
  // `overflow-y:auto` auf der Column erzwingt auch horizontales Clipping, der
  // alte `left-full`-Trick wurde deshalb abgeschnitten. Position wird beim
  // Hover aus der Card-BoundingRect berechnet.
  const cardRef = useRef<HTMLDivElement>(null)
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // AAR-572 (V6): Pipeline-Daten für das Hover-Overlay lazily berechnen.
  // Nur für den Admin-Hover-Blick — Kanban bleibt ansonsten schlank.
  const pipelinePhases = useMemo(
    () =>
      buildPhasePipelineData(
        {
          id: fall.id,
          aktuelle_phase: fall.aktuelle_phase ?? null,
          abgeschlossen_am: fall.abgeschlossen_am ?? null,
        },
        'admin',
      ),
    [fall.id, fall.aktuelle_phase, fall.abgeschlossen_am],
  )

  function handleMouseEnter() {
    const r = cardRef.current?.getBoundingClientRect()
    if (!r) return
    const overlayW = 260
    const gap = 8
    // Wenn rechts kein Platz mehr (überlaufende Rand-Spalten), links anzeigen.
    const overflowRight = r.right + gap + overlayW > window.innerWidth
    const left = overflowRight ? r.left - overlayW - gap : r.right + gap
    setOverlayPos({ top: r.top, left: Math.max(8, left) })
  }
  function handleMouseLeave() {
    setOverlayPos(null)
  }

  useEffect(() => {
    function h(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`group relative rounded-lg border hover:shadow-sm transition-all ${
          fall.ist_aktiv === false ? 'bg-red-50/60 border-red-200 opacity-60' : 'bg-white border-claimondo-border hover:border-claimondo-border'
        }`}
        style={{ padding: '6px 8px' }}
      >
        {/* KFZ-182: Roter Dot wenn Chat UND Updates > 0 */}
        {(fall.ungelesene_nachrichten ?? 0) > 0 && (fall.ungelesene_updates ?? 0) > 0 && <NotificationDot />}
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {/* AAR-610: Drag-Handle nur auf Grip-Icon — sonst schluckt dnd
                den Link-Klick via mousedown preventDefault */}
            <span
              {...(dragHandleProps ?? {})}
              className="shrink-0 text-claimondo-ondo/50 hover:text-claimondo-ondo cursor-grab active:cursor-grabbing select-none"
              aria-label="Karte verschieben"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="6" cy="5" r="1.2"/><circle cx="14" cy="5" r="1.2"/>
                <circle cx="6" cy="10" r="1.2"/><circle cx="14" cy="10" r="1.2"/>
                <circle cx="6" cy="15" r="1.2"/><circle cx="14" cy="15" r="1.2"/>
              </svg>
            </span>
            <Link href={`/faelle/${fall.id}`} className="text-xs font-mono text-claimondo-ondo truncate hover:underline min-w-0">
              {label}
            </Link>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-1" ref={menuRef}>
            {fall.ist_aktiv === false && <span className="text-[8px] bg-red-100 text-red-500 px-1 py-0.5 rounded font-medium">Deaktiviert</span>}
            <button onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }} className="p-0.5 text-claimondo-ondo/50 hover:text-claimondo-ondo transition-colors">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="4" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="10" cy="16" r="2"/></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-1 top-6 bg-white border border-claimondo-border rounded-lg shadow-lg py-1 w-36 z-30">
                <Link href={`/faelle/${fall.id}`} className="block px-3 py-1.5 text-xs text-claimondo-navy hover:bg-claimondo-bg">Öffnen</Link>
                <button onClick={() => { setMenuOpen(false); setModal('deactivate'); setGrund(''); setError('') }} className="w-full text-left px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50">Deaktivieren</button>
                <button onClick={() => { setMenuOpen(false); setModal('delete'); setError('') }} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">Löschen</button>
              </div>
            )}
          </div>
        </div>
        <Link href={`/faelle/${fall.id}`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            {fall.kunde_name && <p className={`text-xs font-medium truncate ${fall.ist_aktiv === false ? 'text-claimondo-ondo/70 line-through' : 'text-claimondo-navy'}`}>{fall.kunde_name}</p>}
            <FallCardBadges chatCount={fall.ungelesene_nachrichten ?? 0} updateCount={fall.ungelesene_updates ?? 0} />
            {/* AAR-770: Mitteilungs-Pulse — kleiner Punkt wenn offene Mitteilung anliegt */}
            {fall.mitteilung && (
              <span
                className="relative inline-flex w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    fall.mitteilung.prioritaet === 'dringend' ? '#dc2626'
                    : fall.mitteilung.prioritaet === 'hoch' ? '#d97706'
                    : '#4573A2',
                }}
                title={`Mitteilung: ${fall.mitteilung.titel}`}
                aria-label="Offene Mitteilung"
              >
                <span
                  className="absolute inset-0 rounded-full animate-ping opacity-60"
                  style={{
                    backgroundColor:
                      fall.mitteilung.prioritaet === 'dringend' ? '#dc2626'
                      : fall.mitteilung.prioritaet === 'hoch' ? '#d97706'
                      : '#4573A2',
                  }}
                />
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {fall.kennzeichen && <span className="bg-claimondo-bg text-claimondo-ondo text-[9px] px-1 py-0.5 rounded">{fall.kennzeichen}</span>}
            {fall.schadens_fall_typ && <span className="bg-claimondo-ondo/5 text-claimondo-ondo text-[9px] px-1 py-0.5 rounded">{SF_SHORT[fall.schadens_fall_typ] ?? fall.schadens_fall_typ}</span>}
          </div>
          {(fall.betreuer_name || fall.sv_name) && (
            <div className="flex gap-2 mt-1 text-[9px] text-claimondo-ondo/70 truncate">
              {fall.betreuer_name && <span>KB: {fall.betreuer_name}</span>}
              {fall.sv_name && <span>SV: {fall.sv_name}</span>}
            </div>
          )}
        </Link>
      </div>

      {/* AAR-572 (V6 Fix): Pipeline-Overlay via Portal in document.body —
          entkommt dem `overflow:auto`-Clipping des Column-Scroll-Containers.
          `pointer-events-none` damit Drag&Drop auf der Karte nicht gestört
          wird. Position wird bei Hover aus der Card-BoundingRect berechnet. */}
      {mounted && overlayPos && createPortal(
        <div
          className="fixed z-[60] w-[280px] bg-white border border-claimondo-border rounded-lg shadow-lg p-3 pointer-events-none space-y-3"
          style={{ top: overlayPos.top, left: overlayPos.left }}
          aria-hidden="true"
        >
          {/* AAR-770: Aktuelle Mitteilung für diesen Fall (falls vorhanden) */}
          {fall.mitteilung && (
            <div
              className="rounded-md p-2"
              style={{
                backgroundColor:
                  fall.mitteilung.prioritaet === 'dringend' ? '#fef2f2'
                  : fall.mitteilung.prioritaet === 'hoch' ? '#fffbeb'
                  : '#f8f9fb',
                borderLeft: `3px solid ${
                  fall.mitteilung.prioritaet === 'dringend' ? '#dc2626'
                  : fall.mitteilung.prioritaet === 'hoch' ? '#d97706'
                  : '#4573A2'
                }`,
              }}
            >
              <p className="text-[9px] font-semibold uppercase tracking-wider text-claimondo-ondo/70 mb-0.5">
                {fall.mitteilung.prioritaet === 'dringend' ? 'Dringend' : 'Mitteilung'}
              </p>
              <p className="text-xs font-semibold text-claimondo-navy leading-snug">
                {fall.mitteilung.titel}
              </p>
              {fall.mitteilung.inhalt && (
                <p className="text-[11px] text-claimondo-navy/80 mt-0.5 line-clamp-2">
                  {fall.mitteilung.inhalt}
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo/70 mb-2">
              Phasen-Verlauf
            </p>
            <PhasePipeline
              fall={{ id: fall.id, aktuelle_phase: fall.aktuelle_phase ?? null }}
              rolle="admin"
              phases={pipelinePhases}
              variant="compact"
            />
          </div>
        </div>,
        document.body,
      )}

      {/* Delete Confirmation */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} maxWidth={384} ariaLabel="Fall löschen">
        <h3 className="text-lg font-semibold text-red-600 mb-2">Fall löschen?</h3>
        <p className="text-sm text-claimondo-ondo mb-1"><strong>{label}</strong> — {fall.kunde_name ?? 'Unbekannt'}</p>
        <p className="text-xs text-claimondo-ondo/70 mb-4">Alle Daten werden unwiderruflich entfernt.</p>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border">Abbrechen</button>
          <button disabled={processing} onClick={async () => {
            setProcessing(true)
            const result = await deleteFall(fall.id)
            if (result.success) { onRefresh(); setModal(null) }
            else { setError(result.error ?? 'Fehler'); setProcessing(false) }
          }} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40">
            {processing ? 'Löscht...' : 'Endgültig löschen'}
          </button>
        </div>
      </Modal>

      {/* Deactivate Confirmation */}
      <Modal open={modal === 'deactivate'} onClose={() => setModal(null)} maxWidth={384} ariaLabel="Fall deaktivieren">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-3">Fall deaktivieren</h3>
        <select value={grund} onChange={e => setGrund(e.target.value)} className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm mb-3">
          <option value="">— Grund —</option>
          {['Kunde hat abgesagt', 'Kein Interesse', 'Duplikat', 'Spam', 'Sonstiges'].map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border">Abbrechen</button>
          <button disabled={processing || !grund} onClick={async () => {
            setProcessing(true)
            try {
              const res = await deactivateFall(fall.id, grund, '')
              if (!res.success) setError(res.error ?? 'Fehler')
              else onRefresh()
            } catch (e) { setError(e instanceof Error ? e.message : 'Fehler') }
            setProcessing(false); setModal(null)
          }} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40">
            {processing ? 'Deaktiviert...' : 'Deaktivieren'}
          </button>
        </div>
      </Modal>
    </>
  )
}
