'use client'

import { useState } from 'react'
import { ChevronUpIcon, XIcon, CheckCircleIcon, ClockIcon, CircleDotIcon } from 'lucide-react'

type Breakdown = {
  schadenhoehe: number
  nutzungsausfall: number
  gutachterHonorar: number
  anwaltskosten: number
  total: number
  regulierungBetrag: number | null
}

const fmt = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

export default function KundeBottomSheet({ breakdown }: { breakdown: Breakdown }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="relative z-20 flex items-center gap-1.5 text-gray-900/60 text-xs hover:text-gray-800/90 transition-colors mt-2"
      >
        <ChevronUpIcon className="w-3.5 h-3.5" />
        Aufschluesselung anzeigen
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 kunde-bottom-sheet"
            style={{
              background: '#ffffff',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px 24px 0 0',
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 bg-zinc-700 rounded-full" />
            </div>

            <div className="px-6 pb-4">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-gray-900 font-bold text-lg" style={{ letterSpacing: '-0.03em' }}>Auszahlungs-Aufschluesselung</h3>
                <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-800 p-1.5 rounded-lg transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mb-6">
                <Row label="Reparaturkosten" value={breakdown.schadenhoehe} sublabel="lt. Gutachten" />
                {breakdown.nutzungsausfall > 0 && <Row label="Nutzungsausfall" value={breakdown.nutzungsausfall} sublabel="Tagessatz x Tage" />}
                {breakdown.gutachterHonorar > 0 && <Row label="Gutachterkosten" value={breakdown.gutachterHonorar} sublabel="zahlt Gegner" accent />}
                {breakdown.anwaltskosten > 0 && <Row label="Anwaltskosten" value={breakdown.anwaltskosten} sublabel="zahlt Gegner" accent />}
              </div>

              <div className="border-t border-white/10 pt-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-gray-900 font-bold text-lg">Gesamt</span>
                  <span className="text-gray-900 font-extrabold text-2xl tabular-nums" style={{ letterSpacing: '-0.03em' }}>{fmt(breakdown.total)}</span>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2.5">
                <p className="text-xs font-medium uppercase mb-2" style={{ color: '#9ca3af', letterSpacing: '0.05em' }}>Status</p>
                <StatusLine done label="Angefordert" />
                <StatusLine done={!!breakdown.regulierungBetrag} label="Regulierung angekuendigt" />
                <StatusLine done={false} label="Zahlung eingegangen" />
                <StatusLine done={false} label="An Sie ausgezahlt" />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function Row({ label, value, sublabel, accent }: { label: string; value: number; sublabel?: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-gray-700 text-sm">{label}</span>
        {sublabel && <span className="text-gray-400 text-xs ml-1.5">{sublabel}</span>}
      </div>
      <span className={`text-sm font-semibold tabular-nums ${accent ? 'text-green-400' : 'text-gray-900'}`}>{fmt(value)}</span>
    </div>
  )
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <CheckCircleIcon className="w-4 h-4 text-green-400 shrink-0" />
      ) : (
        <CircleDotIcon className="w-4 h-4 text-gray-400 shrink-0" />
      )}
      <span className={`text-sm ${done ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}
