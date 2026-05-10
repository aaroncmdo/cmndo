'use client'

// AAR-kanzlei-portal PR 3: Kanban-Board-Client mit 10 Spalten + Karten +
// 3-Punkte-Menü mit Quick-Actions (Kanzlei-Paket + Dokumenten-Drawer).
// Read-only — kein DnD, keine Status-Mutationen auf Kanzlei-Seite.

import { useState } from 'react'
import Link from 'next/link'
import {
  MoreVerticalIcon,
  FolderOpenIcon,
  ArrowRightIcon,
} from 'lucide-react'
import DokumenteDrawer from './DokumenteDrawer'

export type KanbanKarte = {
  id: string
  fall_nummer: string
  kunde: string
  kennzeichen: string | null
  mandatsnummer: string | null
  status: string | null
  phase: number
  updated_at: string | null
}

// Phasen 0–6 laut Welle-7 (AAR-839: Phase 7+8+10 entfernt, Endzustände manuell)
const PHASEN: Array<{ nr: number; name: string }> = [
  { nr: 1, name: 'Ersterfassung & Termin' },
  { nr: 2, name: 'Begutachtung' },
  { nr: 3, name: 'Gutachten & QC' },
  { nr: 4, name: 'Kanzlei-Übergabe' },
  { nr: 5, name: 'Anschlussschreiben' },
  { nr: 6, name: 'VS-Kommunikation' },
  { nr: 9, name: 'Reguliert / Abgeschlossen' },
]

const PHASE_ACCENT: Record<number, string> = {
  1: '#eef4fb',
  2: '#fffbeb',
  3: '#fff7ed',
  4: '#f5f3ff',
  5: '#f5f3ff',
  6: '#fef2f2',
  9: '#ecfdf5',
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
    karten: karten.filter((k) => k.phase === p.nr),
  }))

  return (
    <>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {spalten.map((s) => (
            <div
              key={s.nr}
              className="w-72 shrink-0 rounded-xl border border-claimondo-border bg-white overflow-hidden flex flex-col"
            >
              <div
                className="px-3 py-2 border-b border-claimondo-border flex items-center justify-between"
                style={{ backgroundColor: PHASE_ACCENT[s.nr] }}
              >
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-medium">
                    Phase {s.nr}
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
          fallNummer={drawerFall.fall_nummer}
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
    <div className="rounded-lg border border-claimondo-border bg-white p-3 hover:border-claimondo-ondo hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/faelle/${karte.id}`}
          className="min-w-0 flex-1 group"
        >
          <p className="text-[11px] font-mono text-claimondo-ondo group-hover:underline">
            {karte.fall_nummer}
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
            className="p-1 -m-1 rounded hover:bg-[#f8f9fb] text-claimondo-ondo/70 hover:text-claimondo-navy"
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
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-claimondo-border bg-white shadow-md overflow-hidden">
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
          {formatDate(karte.updated_at)}
        </span>
      </div>
    </div>
  )
}

