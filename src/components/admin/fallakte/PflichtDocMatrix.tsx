'use client'

// AAR-542 (C5): Pflicht-Doc-Matrix — gruppierte Anzeige aller Katalog-Slots
// mit ihrem aktuellen Pflicht/Optional/Disabled-Status pro Fall.
//
// Indikatoren:
//   ● Pflicht  (freigeschaltet + Regel sagt Pflicht)
//   ○ Optional (freigeschaltet, aber nicht Pflicht)
//   ⊘ Disabled (nicht freigeschaltet — grau)
// Status-Ampel rechts: 🔴 offen | 🟡 hochgeladen/nachgereicht | 🟢 ok

import { useMemo, useState } from 'react'
import { ListChecksIcon, AlertTriangleIcon, InfoIcon } from 'lucide-react'
import type { PflichtDocMatrixEntry } from '@/lib/dokumente/pflicht-evaluator'
import { gruppiereMatrix } from '@/lib/dokumente/pflicht-evaluator'
import RegelDebugModal from './RegelDebugModal'

const KATEGORIE_LABEL: Record<string, string> = {
  stammdaten: 'Stammdaten',
  unfall: 'Unfallhergang',
  personenschaden: 'Personenschaden',
  fahrzeug: 'Fahrzeug',
  kosten: 'Kosten',
  kanzlei: 'Kanzlei',
  gutachten: 'Gutachten',
  sonstiges: 'Sonstiges',
  gutachter_verifizierung: 'SV-Verifizierung',
}

function statusBadge(entry: PflichtDocMatrixEntry) {
  if (!entry.freigeschaltet) return null
  if (entry.status === 'ok') {
    return {
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      label: 'Geprüft',
    }
  }
  if (entry.status === 'hochgeladen') {
    return {
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'Hochgeladen',
    }
  }
  if (entry.status === 'nachgereicht') {
    return {
      color: 'bg-orange-50 text-orange-700 border-orange-200',
      label: 'Nachreichen',
    }
  }
  return {
    color: 'bg-red-50 text-red-600 border-red-200',
    label: entry.pflicht ? 'Offen' : 'Optional',
  }
}

function indicator(entry: PflichtDocMatrixEntry): { glyph: string; color: string; title: string } {
  if (!entry.freigeschaltet) {
    return { glyph: '⊘', color: 'text-gray-300', title: 'Nicht freigeschaltet' }
  }
  if (entry.pflicht) {
    return { glyph: '●', color: 'text-[#4573A2]', title: 'Pflicht' }
  }
  return { glyph: '○', color: 'text-gray-400', title: 'Optional (freigeschaltet)' }
}

export default function PflichtDocMatrix({
  entries,
  isAdmin,
  onReEvaluate,
}: {
  entries: PflichtDocMatrixEntry[]
  isAdmin: boolean
  onReEvaluate?: () => void
}) {
  const groups = useMemo(() => gruppiereMatrix(entries), [entries])
  const [selected, setSelected] = useState<PflichtDocMatrixEntry | null>(null)

  const pflichtOffen = entries.filter(
    (e) => e.freigeschaltet && e.pflicht && e.status !== 'ok' && e.status !== 'hochgeladen',
  ).length
  const inkonsistenzen = entries.filter((e) => e.inkonsistenz !== null)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecksIcon className="w-3.5 h-3.5 text-[#4573A2]" />
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Pflicht-Matrix
          </h3>
          <span className="text-[10px] text-gray-400">
            — automatisch aus Fall-Daten abgeleitet
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pflichtOffen > 0 && (
            <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
              {pflichtOffen} offen
            </span>
          )}
          {isAdmin && onReEvaluate && (
            <button
              type="button"
              onClick={onReEvaluate}
              className="text-[10px] font-medium text-[#4573A2] hover:text-[#0D1B3E]"
              title="Matrix neu berechnen (lädt Fall-Daten aus der DB nach)"
            >
              Neu evaluieren
            </button>
          )}
        </div>
      </div>

      {isAdmin && inkonsistenzen.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-900">
            <strong>{inkonsistenzen.length} Inkonsistenz{inkonsistenzen.length > 1 ? 'en' : ''}:</strong>{' '}
            DB-Status und Katalog-Regel stimmen nicht überein. Details über Klick auf den Slot.
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            Keine Slots im Katalog — Seed ausstehend.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.kategorie} className="px-4 py-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                {KATEGORIE_LABEL[group.kategorie] ?? group.kategorie}{' '}
                <span className="text-gray-400 font-normal">({group.entries.length})</span>
              </h4>
              <ul className="space-y-1">
                {group.entries.map((e) => {
                  const ind = indicator(e)
                  const badge = statusBadge(e)
                  const isClickable = isAdmin
                  return (
                    <li
                      key={e.slot_id}
                      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${
                        !e.freigeschaltet ? 'opacity-60' : ''
                      } ${isClickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={() => {
                        if (isClickable) setSelected(e)
                      }}
                      title={e.regel_erklaerung}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`${ind.color} text-lg leading-none shrink-0 w-4 text-center`}
                          aria-label={ind.title}
                        >
                          {ind.glyph}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`text-sm truncate ${
                              e.freigeschaltet ? 'text-gray-800' : 'text-gray-500'
                            }`}
                          >
                            {e.label}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {e.regel_erklaerung}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {e.inkonsistenz && (
                          <AlertTriangleIcon
                            className="w-3 h-3 text-amber-500"
                            aria-label={
                              e.inkonsistenz === 'db_pflicht_ohne_regel'
                                ? 'DB sagt Pflicht, aber Regel nicht'
                                : 'Regel sagt Pflicht, aber DB noch nicht'
                            }
                          />
                        )}
                        {badge && (
                          <span
                            className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        )}
                        {isAdmin && (
                          <InfoIcon className="w-3 h-3 text-gray-300" aria-label="Details anzeigen" />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <RegelDebugModal entry={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
