// 2026-05-07 Design-Review Item 5c: Abschluss-Aktionen-Card.
// Rendert nur wenn der Fall abgeschlossen ist (`abgeschlossen_am` gesetzt).
// Drei Hauptaktionen: PDF herunterladen, Reklamation oeffnen, Google-
// Bewertung. Sichtbares „Erledigt"-Signal mit grünem Check oben.

import Link from 'next/link'
import { CheckCircle2Icon, FileDownIcon, AlertCircleIcon, StarIcon } from 'lucide-react'

type Props = {
  fallId: string
  fallNummer: string | null
  abgeschlossenAm: string | null
  /** Direkt-Link auf das Erstgutachten-PDF aus dem Storage. */
  gutachtenUrl: string | null
  /** Wenn vorhanden, Bewerten-Button springt zu Google-Review. */
  googleReviewUrl?: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function KundeAbschlussCard({
  fallId,
  fallNummer,
  abgeschlossenAm,
  gutachtenUrl,
  googleReviewUrl,
}: Props) {
  if (!abgeschlossenAm) return null

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2Icon className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
            Abgeschlossen
          </p>
          <h2 className="text-lg font-bold text-claimondo-navy mt-0.5">
            Ihr Fall {fallNummer ?? ''} ist erledigt
          </h2>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            Abgeschlossen am {fmtDate(abgeschlossenAm)} · Vielen Dank für Ihr Vertrauen.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {gutachtenUrl ? (
          <a
            href={gutachtenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-white border border-claimondo-border hover:border-claimondo-ondo rounded-ios-xl px-3 py-2.5 text-sm font-medium text-claimondo-navy transition-colors"
          >
            <FileDownIcon className="w-4 h-4" />
            Gutachten (PDF)
          </a>
        ) : (
          <span
            className="inline-flex items-center justify-center gap-2 bg-claimondo-border/30 border border-claimondo-border rounded-ios-xl px-3 py-2.5 text-sm font-medium text-claimondo-ondo/60 cursor-not-allowed"
            title="Gutachten-PDF noch nicht freigegeben"
          >
            <FileDownIcon className="w-4 h-4" />
            Gutachten (n.v.)
          </span>
        )}

        <Link
          href={`/kunde/faelle/${fallId}#chat?reklamation=1`}
          className="inline-flex items-center justify-center gap-2 bg-white border border-claimondo-border hover:border-amber-400 rounded-ios-xl px-3 py-2.5 text-sm font-medium text-claimondo-navy transition-colors"
        >
          <AlertCircleIcon className="w-4 h-4 text-amber-600" />
          Reklamation öffnen
        </Link>

        {googleReviewUrl ? (
          <a
            href={googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-claimondo-navy hover:bg-claimondo-ondo text-white rounded-ios-xl px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <StarIcon className="w-4 h-4" />
            Bewerten
          </a>
        ) : (
          <Link
            href={`/kunde/faelle/${fallId}#bewerten`}
            className="inline-flex items-center justify-center gap-2 bg-claimondo-navy hover:bg-claimondo-ondo text-white rounded-ios-xl px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <StarIcon className="w-4 h-4" />
            Bewerten
          </Link>
        )}
      </div>
    </div>
  )
}
