'use client'

// AAR-213: Lead-Preis-Tabelle als Overlay statt externer Tab. Zeigt die
// 33 Stufen + einen ROI-Rechner der dem SV anzeigt wieviel er netto pro
// Fall bzw. pro Monat verdient — nachdem der Claimondo-Lead-Preis vom
// Gutachter-Honorar abgezogen wurde.

import { useMemo, useState } from 'react'
import { XIcon, CalculatorIcon, InfoIcon, TrendingUpIcon } from 'lucide-react'

export type LeadpreisRow = {
  schadenhoehe_bis_netto: number
  paketpreis_netto: number
  einzelpreis_netto: number
}

export default function LeadPreisOverlay({
  open,
  onClose,
  rows,
  kontingent,
  paketLabel,
  maxFaelleMonat,
}: {
  open: boolean
  onClose: () => void
  rows: LeadpreisRow[]
  kontingent: number
  paketLabel: string
  maxFaelleMonat: number
}) {
  // ROI-Rechner State — Durchschnittswerte, einfach zu pflegen.
  // Default-Schadenhöhe 6.000 EUR (typisch für Karosserieschäden), Honorar
  // 15% des Schadens als grobe Marktannahme (Gutachter-Hub).
  const [avgSchaden, setAvgSchaden] = useState<number>(6000)
  const [avgHonorar, setAvgHonorar] = useState<number>(900)

  // Lead-Preis aus der Tabelle per Schadenhöhe-Lookup (erste Zeile wo
  // schadenhoehe_bis_netto >= avgSchaden). Fallback: letzte Zeile.
  const leadPreisLookup = useMemo(() => {
    if (!rows.length) return { paket: 0, einzel: 0, stufe: '—' }
    const sorted = [...rows].sort((a, b) => a.schadenhoehe_bis_netto - b.schadenhoehe_bis_netto)
    const match = sorted.find(r => Number(r.schadenhoehe_bis_netto) >= avgSchaden) ?? sorted[sorted.length - 1]
    return {
      paket: Number(match.paketpreis_netto),
      einzel: Number(match.einzelpreis_netto),
      stufe: `bis ${eur(Number(match.schadenhoehe_bis_netto))} EUR`,
    }
  }, [avgSchaden, rows])

  const nettoProFall = Math.max(0, avgHonorar - leadPreisLookup.paket)
  const nettoProMonat = nettoProFall * maxFaelleMonat
  const roiFaktor = leadPreisLookup.paket > 0
    ? (avgHonorar / leadPreisLookup.paket).toFixed(1)
    : '—'

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leadpreis-overlay-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D1B3E]/60 backdrop-blur-sm"
      onClick={(e) => {
        // Klick aufs Backdrop schließt — Klicks in Content nicht.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-[#0D1B3E] to-[#1E3A5F] text-white shrink-0">
          <div>
            <h2 id="leadpreis-overlay-title" className="text-lg font-semibold">Lead-Preis-Tabelle + ROI-Rechner</h2>
            <p className="text-[11px] text-white/70 mt-0.5">33 Stufen · Paket {paketLabel} · {kontingent} Fälle im Kontingent</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content scrollbar */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ROI-Rechner */}
          <section className="bg-gradient-to-br from-[#4573A2]/5 to-[#7BA3CC]/5 border border-[#7BA3CC]/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalculatorIcon className="w-4 h-4 text-[#0D1B3E]" />
              <h3 className="text-sm font-semibold text-[#0D1B3E]">ROI-Rechner — was bleibt bei dir?</h3>
            </div>
            <p className="text-xs text-[#1E3A5F] mb-4">
              Trage dein durchschnittliches Gutachter-Honorar ein. Wir ziehen den Claimondo-Lead-Preis
              für die passende Schadenstufe ab und zeigen dir, was du netto pro Fall und pro Monat behältst.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Typische Schadenhöhe (netto, EUR)
                </label>
                <input
                  type="number"
                  value={avgSchaden}
                  onChange={(e) => setAvgSchaden(Math.max(0, Number(e.target.value) || 0))}
                  min={0}
                  step={100}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Dein Gutachter-Honorar pro Fall (netto, EUR)
                </label>
                <input
                  type="number"
                  value={avgHonorar}
                  onChange={(e) => setAvgHonorar(Math.max(0, Number(e.target.value) || 0))}
                  min={0}
                  step={10}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
                />
              </div>
            </div>

            {/* ROI-Zusammenfassung */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Passende Stufe" value={leadPreisLookup.stufe} />
              <Stat label="Lead-Preis (im Kontingent)" value={`${eur(leadPreisLookup.paket)} €`} />
              <Stat label="Netto pro Fall" value={`${eur(nettoProFall)} €`} highlight />
              <Stat
                label={`Netto bei ${maxFaelleMonat} Fällen/Monat`}
                value={`${eur(nettoProMonat)} €`}
                highlight
              />
            </div>
            {nettoProFall > 0 ? (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-[#0D1B3E]">
                <TrendingUpIcon className="w-3.5 h-3.5" />
                <span>
                  Du verdienst das <strong>{roiFaktor}-fache</strong> deines Lead-Preises. Jeder Fall ist profitabel.
                </span>
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-700">
                <InfoIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Bei dieser Honorar-Höhe deckt der Lead-Preis dein Honorar — prüfe ob dein Satz noch marktüblich ist
                  oder ob du auf eine höhere Schadenstufe zielen kannst.
                </span>
              </div>
            )}

            {/* Honorar-Upload Hinweis (Phase 2) */}
            <p className="mt-4 pt-3 border-t border-[#7BA3CC]/20 text-[10px] text-gray-500">
              Tipp: Du kannst deine eigene Honorartabelle (pro Schadenstufe) später im Profil hinterlegen —
              dann rechnen wir automatisch stufenweise und zeigen dir die exakte Marge je Fall.
            </p>
          </section>

          {/* Erläuterung */}
          <section className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-[#0D1B3E] mb-2">Wie funktioniert die Berechnung?</p>
            <ul className="text-xs text-gray-700 space-y-1.5 list-disc pl-4">
              <li>
                Solange du innerhalb deines monatlichen Kontingents (<strong>{paketLabel}</strong>) bist, gilt
                der <strong>Paket-Preis</strong>. Ab dem ersten Fall über dem Kontingent gilt der <strong>Einzel-Preis</strong>.
              </li>
              <li>
                Pro Fall im Kontingent werden <strong>150 EUR</strong> von deinem Werbebudget verrechnet
                (solange Guthaben vorhanden), den Rest zahlst du in der Monatsabrechnung.
              </li>
            </ul>
          </section>

          {/* Tabelle */}
          <section>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">
              Alle {rows.length} Stufen
            </p>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Schadenhöhe (Netto-RK bis)</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Paket-Preis (im Kontingent)</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Einzel-Preis (über Kontingent)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800 font-medium tabular-nums">
                        {eur(Number(row.schadenhoehe_bis_netto))} EUR
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                        {eur(Number(row.paketpreis_netto))} EUR
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                        {eur(Number(row.einzelpreis_netto))} EUR
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                <p className="text-[10px] text-gray-400">Alle Preise netto zzgl. 19% MwSt</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 ${highlight ? 'bg-[#0D1B3E] text-white' : 'bg-white border border-gray-200'}`}>
      <p className={`text-[9px] uppercase tracking-wider ${highlight ? 'text-white/60' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? 'text-white' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function eur(v: number): string {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
