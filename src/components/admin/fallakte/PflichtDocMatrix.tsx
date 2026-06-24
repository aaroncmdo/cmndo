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
      color: 'bg-success-soft text-success-strong border-success/30',
      label: 'Geprüft',
    }
  }
  if (entry.status === 'hochgeladen') {
    return {
      color: 'bg-warning-soft text-warning-strong border-warning/30',
      label: 'Hochgeladen',
    }
  }
  if (entry.status === 'nachgereicht') {
    return {
      color: 'bg-warning-soft text-warning-strong border-warning/30',
      label: 'Nachreichen',
    }
  }
  return {
    color: 'bg-danger-soft text-danger border-danger/30',
    label: entry.pflicht ? 'Offen' : 'Optional',
  }
}

function indicator(entry: PflichtDocMatrixEntry): { glyph: string; color: string; title: string } {
  if (!entry.freigeschaltet) {
    return { glyph: '⊘', color: 'text-claimondo-ondo/50', title: 'Nicht freigeschaltet' }
  }
  if (entry.pflicht) {
    return { glyph: '●', color: 'text-claimondo-ondo', title: 'Pflicht' }
  }
  return { glyph: '○', color: 'text-claimondo-ondo/70', title: 'Optional (freigeschaltet)' }
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
    <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-claimondo-border flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecksIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
          <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider">
            Pflicht-Matrix
          </h3>
          <span className="text-[10px] text-claimondo-ondo/70">
            — automatisch aus Fall-Daten abgeleitet
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pflichtOffen > 0 && (
            <span className="text-[10px] font-medium text-danger bg-danger-soft border border-danger/30 rounded-full px-2 py-0.5">
              {pflichtOffen} offen
            </span>
          )}
          {isAdmin && onReEvaluate && (
            <button
              type="button"
              onClick={onReEvaluate}
              className="text-[10px] font-medium text-claimondo-ondo hover:text-claimondo-navy"
              title="Matrix neu berechnen (lädt Fall-Daten aus der DB nach)"
            >
              Neu evaluieren
            </button>
          )}
        </div>
      </div>

      {isAdmin && inkonsistenzen.length > 0 && (
        <div className="bg-warning-soft border-b border-warning/30 px-4 py-2 flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="text-[11px] text-warning-strong">
            <strong>{inkonsistenzen.length} Inkonsistenz{inkonsistenzen.length > 1 ? 'en' : ''}:</strong>{' '}
            DB-Status und Katalog-Regel stimmen nicht überein. Details über Klick auf den Slot.
          </div>
        </div>
      )}

      <div className="divide-y divide-claimondo-border">
        {groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-claimondo-ondo/70">
            Keine Slots im Katalog — Seed ausstehend.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.kategorie} className="px-4 py-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-2">
                {KATEGORIE_LABEL[group.kategorie] ?? group.kategorie}{' '}
                <span className="text-claimondo-ondo/70 font-normal">({group.entries.length})</span>
              </h4>
              <ul className="space-y-1">
                {group.entries.map((e) => {
                  const ind = indicator(e)
                  const badge = statusBadge(e)
                  const isClickable = isAdmin
                  return (
                    <li
                      key={e.slot_id}
                      className={`flex items-center justify-between gap-2 rounded-ios-md px-2 py-1.5 ${
                        !e.freigeschaltet ? 'opacity-60' : ''
                      } ${isClickable ? 'cursor-pointer hover:bg-claimondo-bg' : ''}`}
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
                              e.freigeschaltet ? 'text-claimondo-navy' : 'text-claimondo-ondo'
                            }`}
                          >
                            {e.label}
                          </p>
                          <p className="text-[10px] text-claimondo-ondo/70 truncate">
                            {e.regel_erklaerung}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {e.inkonsistenz && (
                          <AlertTriangleIcon
                            className="w-3 h-3 text-warning"
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
                          <InfoIcon className="w-3 h-3 text-claimondo-ondo/50" aria-label="Details anzeigen" />
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
