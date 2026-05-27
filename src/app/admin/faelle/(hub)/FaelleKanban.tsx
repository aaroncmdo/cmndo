'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FallCardBadges, { NotificationDot } from '@/components/faelle/FallCardBadges'
// AAR-572 (V6) / CMM-44 MP-4c: Shared PhasePipeline als Hover-Overlay (jetzt 4-Phasen).
import { PhasePipeline } from '@/components/shared/fall-phases'
import { buildClaimPhasePipeline } from '@/lib/fall/subphase-visibility'
import {
  toClaimMainPhase,
  toClaimSubPhase,
  MAIN_PHASE_LABEL,
  SUBPHASE_LABEL,
  type ClaimMainPhase,
} from '@/lib/claims/lifecycle'
import { deleteFall, deactivateFall } from '@/app/faelle/[id]/_actions'
import { Modal } from '@/components/primitives/Modal'

type Fall = {
  id: string
  claim_nummer: string | null
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
  // CMM-44 MP-4c: abgeleitete 4-Phase + Substate aus v_claim_phase (claim_id == fall_id).
  main_phase?: string | null
  sub_phase?: string | null
  // AAR-770: Jüngste offene Mitteilung für Hover-Preview
  mitteilung?: { titel: string; inhalt: string | null; prioritaet: string | null } | null
}

// CMM-44 MP-4c: 4 abgeleitete Hauptphasen-Spalten (read-only) statt der 11 Status-
// Spalten. Die Phase kommt aus v_claim_phase (abgeleitet, NICHT setzbar) → kein Drag
// mehr; Status-Wechsel laufen über die Fallakte (EndzustandDropdown etc.), der Board-
// Writer-Redesign ist MP-7/8.
const COLUMNS: { key: ClaimMainPhase; label: string; color: string; bg: string }[] = [
  { key: 'erfassung', label: MAIN_PHASE_LABEL.erfassung, color: 'text-claimondo-ondo', bg: 'bg-claimondo-ondo/60' },
  { key: 'begutachtung', label: MAIN_PHASE_LABEL.begutachtung, color: 'text-claimondo-ondo', bg: 'bg-claimondo-ondo' },
  { key: 'regulierung', label: MAIN_PHASE_LABEL.regulierung, color: 'text-claimondo-navy', bg: 'bg-claimondo-navy' },
  { key: 'abschluss', label: MAIN_PHASE_LABEL.abschluss, color: 'text-emerald-600', bg: 'bg-emerald-500' },
]

const SF_SHORT: Record<string, string> = { 'sf-01': 'SF-01', 'sf-02': 'SF-02', 'sf-03': 'SF-03', 'sf-05': 'SF-05' }

export default function FaelleKanban({ faelle }: { faelle: Fall[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [aktivFilter, setAktivFilter] = useState<'aktive' | 'deaktivierte' | 'alle'>('aktive')

  const filtered = useMemo(() => {
    let result = faelle.filter(f => f.status !== 'storniert')
    // KFZ-120: Aktiv/Deaktiviert Filter
    if (aktivFilter === 'aktive') result = result.filter(f => f.ist_aktiv !== false)
    else if (aktivFilter === 'deaktivierte') result = result.filter(f => f.ist_aktiv === false)

    if (!search) return result
    const q = search.toLowerCase()
    return result.filter(f =>
      (f.kunde_name ?? '').toLowerCase().includes(q) ||
      (f.mandatsnummer ?? '').toLowerCase().includes(q) ||
      (f.kennzeichen ?? '').toLowerCase().includes(q) ||
      (f.claim_nummer ?? '').includes(q)
    )
  }, [faelle, search, aktivFilter])

  // CMM-44 MP-4c: Gruppierung nach abgeleiteter Hauptphase (v_claim_phase.main_phase)
  // statt mapStatus(faelle.status). null/unbekannt → erfassung (Guard).
  const byColumn = useMemo(() => {
    const map: Record<string, Fall[]> = {}
    for (const col of COLUMNS) {
      map[col.key] = filtered.filter(f => toClaimMainPhase(f.main_phase) === col.key)
        .sort((a, b) => (b.ungelesene_nachrichten ?? 0) - (a.ungelesene_nachrichten ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return map
  }, [filtered])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header: exactly 40px. Breakout auf 100 % der Main-Breite (siehe PageContainer-Inset). */}
      <div className="flex items-center justify-between px-4 py-2 h-10 flex-shrink-0 md:w-[104.17%] md:-ml-[2.08%]">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-claimondo-navy">Fälle</h1>
          <span className="text-claimondo-ondo/70 text-xs">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-claimondo-bg rounded-ios-lg p-0.5">
            {(['aktive', 'deaktivierte', 'alle'] as const).map(f => (
              <button key={f} onClick={() => setAktivFilter(f)}
                className={`text-[10px] font-medium px-2 py-1 rounded-ios-md transition-colors ${aktivFilter === f ? 'bg-white text-claimondo-navy shadow-sm' : 'text-claimondo-ondo hover:text-claimondo-navy'}`}>
                {f === 'aktive' ? 'Aktive' : f === 'deaktivierte' ? 'Deaktiv.' : 'Alle'}
              </button>
            ))}
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
            className="px-2 py-1 bg-white border border-claimondo-border rounded-ios-lg text-xs text-claimondo-navy placeholder-claimondo-ondo/60 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo w-40 h-7" />
        </div>
      </div>

      {/* Board: 4 abgeleitete Hauptphasen-Spalten (read-only, kein Drag). */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 4, padding: '0 8px 8px 8px', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 8, height: '100%', overflowX: 'auto', flex: 1 }}>
          {COLUMNS.map(col => {
            const items = byColumn[col.key] ?? []
            return (
              <div key={col.key} style={{ flex: 1, minWidth: 220, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Column header: 28px */}
                <div className="flex items-center gap-1 px-1 flex-shrink-0" style={{ height: 28 }}>
                  <span className={`text-[11px] font-medium tracking-wider uppercase ${col.color}`}>{col.label}</span>
                  <span className="text-claimondo-ondo text-[10px] font-medium bg-claimondo-bg px-1 py-0.5 rounded-full ml-auto">{items.length}</span>
                </div>
                <div className={`h-px ${col.bg} opacity-40 flex-shrink-0`} />

                {/* Column body: scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map((fall) => (
                    <FallCard key={fall.id} fall={fall} onRefresh={() => router.refresh()} />
                  ))}
                  {items.length === 0 && (
                    <p className="text-[10px] text-claimondo-ondo/40 italic px-1 py-2">Keine Fälle</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FallCard({ fall, onRefresh }: { fall: Fall; onRefresh: () => void }) {
  // CMM-44 SP-I2 PR2 Label=beides: claim_nummer als primaeres Label, mandatsnummer als Sekundaer-Detail.
  const label = fall.claim_nummer ?? fall.id.slice(0, 8)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<'delete' | 'deactivate' | null>(null)
  const [grund, setGrund] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  // AAR-572 Fix: Overlay per Portal aus dem Column-Scroll-Container rausheben.
  const cardRef = useRef<HTMLDivElement>(null)
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // CMM-44 MP-4c: Hover-Pipeline aus dem 4-Phasen-Modell (v_claim_phase main/sub-phase,
  // via Guards getypt). Side-Quests sind im Listen-Hover nicht nötig (= []).
  const mainPhase = toClaimMainPhase(fall.main_phase)
  const subPhase = toClaimSubPhase(fall.sub_phase)
  const pipelinePhases = useMemo(
    () =>
      buildClaimPhasePipeline(
        { mainPhase, subPhase, aktiveSideQuests: [], aktiverAuftrag: null },
        'admin',
      ),
    [mainPhase, subPhase],
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
        className={`group relative rounded-ios-lg border hover:shadow-sm transition-all ${
          fall.ist_aktiv === false ? 'bg-red-50/60 border-red-200 opacity-60' : 'bg-white border-claimondo-border hover:border-claimondo-border'
        }`}
        style={{ padding: '6px 8px' }}
      >
        {/* KFZ-182: Roter Dot wenn Chat UND Updates > 0 */}
        {(fall.ungelesene_nachrichten ?? 0) > 0 && (fall.ungelesene_updates ?? 0) > 0 && <NotificationDot />}
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
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
              <div className="absolute right-1 top-6 bg-white border border-claimondo-border rounded-ios-lg shadow-lg py-1 w-36 z-30">
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
                    fall.mitteilung.prioritaet === 'dringend' ? 'var(--brand-danger, #dc2626)'
                    : fall.mitteilung.prioritaet === 'hoch' ? 'var(--brand-warning, #d97706)'
                    : 'var(--brand-secondary, #4573A2)',
                }}
                title={`Mitteilung: ${fall.mitteilung.titel}`}
                aria-label="Offene Mitteilung"
              >
                <span
                  className="absolute inset-0 rounded-full animate-ping opacity-60"
                  style={{
                    backgroundColor:
                      fall.mitteilung.prioritaet === 'dringend' ? 'var(--brand-danger, #dc2626)'
                      : fall.mitteilung.prioritaet === 'hoch' ? 'var(--brand-warning, #d97706)'
                      : 'var(--brand-secondary, #4573A2)',
                  }}
                />
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {fall.kennzeichen && <span className="bg-claimondo-bg text-claimondo-ondo text-[9px] px-1 py-0.5 rounded">{fall.kennzeichen}</span>}
            {/* CMM-44 SP-I2 PR2 Label=beides: mandatsnummer als Sekundaer-Detail */}
            {fall.mandatsnummer && <span className="font-mono text-claimondo-ondo/70 text-[9px] px-1 py-0.5" title="Kanzlei-Mandat">{fall.mandatsnummer}</span>}
            {fall.schadens_fall_typ && <span className="bg-claimondo-ondo/5 text-claimondo-ondo text-[9px] px-1 py-0.5 rounded">{SF_SHORT[fall.schadens_fall_typ] ?? fall.schadens_fall_typ}</span>}
            {/* CMM-44 MP-4c: abschluss-Substate-Chip (storniert / erfolgreich reguliert / Klage / verjährt) */}
            {mainPhase === 'abschluss' && (
              <span className="bg-claimondo-navy/10 text-claimondo-navy text-[9px] px-1 py-0.5 rounded font-medium">{SUBPHASE_LABEL[subPhase]}</span>
            )}
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
          entkommt dem `overflow:auto`-Clipping des Column-Scroll-Containers. */}
      {mounted && overlayPos && createPortal(
        <div
          className="fixed z-[60] w-[280px] bg-white border border-claimondo-border rounded-ios-lg shadow-lg p-3 pointer-events-none space-y-3"
          style={{ top: overlayPos.top, left: overlayPos.left }}
          aria-hidden="true"
        >
          {/* AAR-770: Aktuelle Mitteilung für diesen Fall (falls vorhanden) */}
          {fall.mitteilung && (
            <div
              className="rounded-ios-md p-2"
              style={{
                backgroundColor:
                  fall.mitteilung.prioritaet === 'dringend' ? 'var(--brand-danger-soft, #fef2f2)'
                  : fall.mitteilung.prioritaet === 'hoch' ? 'var(--brand-warning-soft, #fffbeb)'
                  : 'var(--brand-background, #f8f9fb)',
                borderLeft: `3px solid ${
                  fall.mitteilung.prioritaet === 'dringend' ? 'var(--brand-danger, #dc2626)'
                  : fall.mitteilung.prioritaet === 'hoch' ? 'var(--brand-warning, #d97706)'
                  : 'var(--brand-secondary, #4573A2)'
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
              fall={{ id: fall.id, aktuelle_phase: null }}
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
          <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-ios-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border">Abbrechen</button>
          <button disabled={processing} onClick={async () => {
            setProcessing(true)
            const result = await deleteFall(fall.id)
            if (result.success) { onRefresh(); setModal(null) }
            else { setError(result.error ?? 'Fehler'); setProcessing(false) }
          }} className="flex-1 py-2.5 rounded-ios-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40">
            {processing ? 'Löscht...' : 'Endgültig löschen'}
          </button>
        </div>
      </Modal>

      {/* Deactivate Confirmation */}
      <Modal open={modal === 'deactivate'} onClose={() => setModal(null)} maxWidth={384} ariaLabel="Fall deaktivieren">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-3">Fall deaktivieren</h3>
        <select value={grund} onChange={e => setGrund(e.target.value)} className="w-full border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm mb-3">
          <option value="">— Grund —</option>
          {['Kunde hat abgesagt', 'Kein Interesse', 'Duplikat', 'Spam', 'Sonstiges'].map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-ios-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border">Abbrechen</button>
          <button disabled={processing || !grund} onClick={async () => {
            setProcessing(true)
            try {
              const res = await deactivateFall(fall.id, grund, '')
              if (!res.success) setError(res.error ?? 'Fehler')
              else onRefresh()
            } catch (e) { setError(e instanceof Error ? e.message : 'Fehler') }
            setProcessing(false); setModal(null)
          }} className="flex-1 py-2.5 rounded-ios-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40">
            {processing ? 'Deaktiviert...' : 'Deaktivieren'}
          </button>
        </div>
      </Modal>
    </>
  )
}
