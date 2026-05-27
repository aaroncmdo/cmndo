'use client'

// AAR-kanzlei-portal PR 3 / CMM-44 MP-4d: Kanban-Board-Client mit 4 abgeleiteten
// Hauptphasen-Spalten (v_claim_phase.main_phase) + Karten + 3-Punkte-Menü
// (Kanzlei-Paket + Dokumenten-Drawer). Read-only — kein DnD, keine Status-Mutationen.

import { useState } from 'react'
import Link from 'next/link'
import {
  MoreVerticalIcon,
  FolderOpenIcon,
  ArrowRightIcon,
} from 'lucide-react'
import DokumenteDrawer from './DokumenteDrawer'
import {
  MAIN_PHASE_LABEL,
  SUBPHASE_LABEL,
  type ClaimMainPhase,
  type ClaimSubPhase,
} from '@/lib/claims/lifecycle'

export type KanbanKarte = {
  id: string
  claim_nummer: string
  kunde: string
  kennzeichen: string | null
  mandatsnummer: string | null
  status: string | null
  // CMM-44 MP-4d: abgeleitete 4-Phase + aktueller Substate (v_claim_phase).
  mainPhase: ClaimMainPhase
  subPhase: ClaimSubPhase
  created_at: string | null
}

// CMM-44 MP-4d: 4 abgeleitete Hauptphasen (erfassung→begutachtung→regulierung→abschluss).
const PHASEN: Array<{ key: ClaimMainPhase; name: string }> = [
  { key: 'erfassung', name: MAIN_PHASE_LABEL.erfassung },
  { key: 'begutachtung', name: MAIN_PHASE_LABEL.begutachtung },
  { key: 'regulierung', name: MAIN_PHASE_LABEL.regulierung },
  { key: 'abschluss', name: MAIN_PHASE_LABEL.abschluss },
]

const PHASE_ACCENT: Record<ClaimMainPhase, string> = {
  erfassung: '#eef4fb',
  begutachtung: '#fffbeb',
  regulierung: '#f5f3ff',
  abschluss: '#ecfdf5',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
  })
}

export default function KanbanBoardClient({ karten }: { karten: KanbanKarte[] }) {
  const [drawerFall, setDrawerFall] = useState<KanbanKarte | null>(null)

  const spalten = PHASEN.map((p) => ({
    ...p,
    karten: karten.filter((k) => k.mainPhase === p.key),
  }))

  return (
    <>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {spalten.map((s) => (
            <div
              key={s.key}
              className="w-72 shrink-0 rounded-ios-xl border border-claimondo-border bg-white overflow-hidden flex flex-col"
            >
              <div
                className="px-3 py-2 border-b border-claimondo-border flex items-center justify-between"
                style={{ backgroundColor: PHASE_ACCENT[s.key] }}
              >
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-medium">
                    Hauptphase
                  </p>
                  <p className="text-sm font-semibold text-claimondo-navy truncate">
                    {s.name}
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-claimondo-navy bg-white rounded-full px-2 py-0.5 border border-claimondo-border shrink-0">
                  {s.karten.length}
                </span>
              </div>
              <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                {s.karten.length === 0 && (
                  <p className="text-[11px] text-claimondo-ondo/70 text-center py-4 italic">
                    Keine Mandate in dieser Phase
                  </p>
                )}
                {s.karten.map((k) => (
                  <KanbanCard
                    key={k.id}
                    karte={k}
                    onOpenDokumente={() => setDrawerFall(k)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {drawerFall && (
        <DokumenteDrawer
          fallId={drawerFall.id}
          fallNummer={drawerFall.claim_nummer}
          kunde={drawerFall.kunde}
          onClose={() => setDrawerFall(null)}
        />
      )}
    </>
  )
}

function KanbanCard({
  karte,
  onOpenDokumente,
}: {
  karte: KanbanKarte
  onOpenDokumente: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-3 hover:border-claimondo-ondo hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/faelle/${karte.id}`}
          className="min-w-0 flex-1 group"
        >
          <p className="text-[11px] font-mono text-claimondo-ondo group-hover:underline">
            {karte.claim_nummer}
          </p>
          <p className="text-sm font-semibold text-claimondo-navy truncate">
            {karte.kunde}
          </p>
        </Link>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((o) => !o)
            }}
            className="p-1 -m-1 rounded hover:bg-claimondo-bg text-claimondo-ondo/70 hover:text-claimondo-navy"
            aria-label="Aktionen"
          >
            <MoreVerticalIcon className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-ios-lg border border-claimondo-border bg-white shadow-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenDokumente()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-claimondo-navy hover:bg-claimondo-bg text-left"
                >
                  <FolderOpenIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                  Alle Dokumente öffnen
                </button>
                <Link
                  href={`/faelle/${karte.id}`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-claimondo-navy hover:bg-claimondo-bg text-left border-t border-claimondo-border"
                  onClick={() => setMenuOpen(false)}
                >
                  <ArrowRightIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                  Fallakte öffnen
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
        {/* CMM-44 MP-4d: aktueller Substate (z.B. Versicherungskontakt / Storniert) */}
        <span className="text-claimondo-navy bg-claimondo-bg px-1.5 py-0.5 rounded font-medium">
          {SUBPHASE_LABEL[karte.subPhase]}
        </span>
        {karte.kennzeichen && (
          <span className="font-mono text-claimondo-navy bg-claimondo-bg px-1.5 py-0.5 rounded">
            {karte.kennzeichen}
          </span>
        )}
        {karte.mandatsnummer && (
          <span className="font-mono text-claimondo-ondo" title="Mandat-Nr">
            {karte.mandatsnummer}
          </span>
        )}
        <span className="text-claimondo-ondo/70 ml-auto">
          {formatDate(karte.created_at)}
        </span>
      </div>
    </div>
  )
}

