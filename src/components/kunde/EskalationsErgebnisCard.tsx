// AAR-558 (C9): Eskalations-Ergebnis-Card für das Kunde-Portal.
// Zeigt das jüngste Tag-14/21/28-Ergebnis der VS-Eskalation — transparente
// Kommunikation „was hat Kanzlei mit Versicherung besprochen". Daten aus
// faelle_kunde_view.

import { MessageSquareWarningIcon } from 'lucide-react'

interface EskalationSchritt {
  tag: 14 | 21 | 28
  ergebnis: string | null
  ergebnisAm: string | null
}

interface Props {
  tag14Ergebnis: string | null
  tag14Am: string | null
  tag21Ergebnis: string | null
  tag21Am: string | null
  tag28Ergebnis: string | null
  tag28Am: string | null
}

const ERGEBNIS_LABEL: Record<string, string> = {
  zusage: 'Zusage der Versicherung',
  teilzusage: 'Teilzusage',
  ablehnung: 'Ablehnung',
  keine_reaktion: 'Keine Reaktion',
  rueckfrage: 'Rückfrage offen',
  vergleichsangebot: 'Vergleichsangebot',
}

const ERGEBNIS_FARBE: Record<string, string> = {
  zusage: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  teilzusage: 'bg-amber-50 text-amber-700 border-amber-200',
  ablehnung: 'bg-red-50 text-red-700 border-red-200',
  keine_reaktion: 'bg-gray-50 text-gray-700 border-gray-200',
  rueckfrage: 'bg-blue-50 text-blue-700 border-blue-200',
  vergleichsangebot: 'bg-violet-50 text-violet-700 border-violet-200',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function EskalationsErgebnisCard({
  tag14Ergebnis,
  tag14Am,
  tag21Ergebnis,
  tag21Am,
  tag28Ergebnis,
  tag28Am,
}: Props) {
  const schritte: EskalationSchritt[] = [
    { tag: 14, ergebnis: tag14Ergebnis, ergebnisAm: tag14Am },
    { tag: 21, ergebnis: tag21Ergebnis, ergebnisAm: tag21Am },
    { tag: 28, ergebnis: tag28Ergebnis, ergebnisAm: tag28Am },
  ]

  const belegt = schritte.filter((s) => !!s.ergebnis)
  if (belegt.length === 0) return null

  const juengster = belegt[belegt.length - 1]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquareWarningIcon className="w-4 h-4 text-[#4573A2]" />
        <p className="text-sm font-semibold text-[#0D1B3E]">Stand der Eskalation</p>
      </div>

      <div className="space-y-2">
        {schritte.map((s) => {
          const farbe = s.ergebnis ? ERGEBNIS_FARBE[s.ergebnis] ?? 'bg-gray-50 text-gray-700 border-gray-200' : ''
          return (
            <div
              key={s.tag}
              className={`rounded-md border px-3 py-2 flex items-start gap-2 ${
                s.ergebnis ? farbe : 'border-dashed border-gray-200 bg-gray-50/50'
              }`}
            >
              <span className="text-xs font-mono mt-0.5 shrink-0">Tag {s.tag}</span>
              <div className="min-w-0 flex-1">
                {s.ergebnis ? (
                  <>
                    <p className="text-xs font-medium">
                      {ERGEBNIS_LABEL[s.ergebnis] ?? s.ergebnis}
                    </p>
                    {s.ergebnisAm && (
                      <p className="text-[10px] opacity-70">am {formatDate(s.ergebnisAm)}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400">ausstehend</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-100">
        {juengster.ergebnis === 'zusage' || juengster.ergebnis === 'teilzusage'
          ? 'Gute Nachrichten — die Versicherung hat positiv reagiert.'
          : 'Unsere Partnerkanzlei ist in direktem Kontakt mit der Versicherung — Sie müssen nichts tun.'}
      </p>
    </div>
  )
}
