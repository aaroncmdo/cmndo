// 2026-05-07 Design-Review Item 5c: Abschluss-Aktionen-Card.
// Rendert nur wenn der Fall abgeschlossen ist (`abgeschlossen_am` gesetzt).
// Drei Hauptaktionen: PDF herunterladen, Reklamation oeffnen, Google-
// Bewertung. Sichtbares „Erledigt"-Signal mit grünem Check oben.

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
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

export default async function KundeAbschlussCard({
  fallId,
  fallNummer,
  abgeschlossenAm,
  gutachtenUrl,
  googleReviewUrl,
}: Props) {
  if (!abgeschlossenAm) return null

  const t = await getTranslations('abschluss')

  return (
    <div className="rounded-2xl border-2 border-success/30 bg-success-soft p-5 space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2Icon className="w-6 h-6 text-success shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-success-strong font-semibold">
            {t('badge')}
          </p>
          <h2 className="text-lg font-bold text-claimondo-navy mt-0.5">
            {t('titel', { fallNummer: fallNummer ?? '' })}
          </h2>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            {t('untertitel', { datum: fmtDate(abgeschlossenAm) })}
          </p>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${googleReviewUrl ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2`}>
        {gutachtenUrl ? (
          <a
            href={gutachtenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-white border border-claimondo-border hover:border-claimondo-ondo rounded-ios-xl px-3 py-2.5 text-sm font-medium text-claimondo-navy transition-colors"
          >
            <FileDownIcon className="w-4 h-4" />
            {t('gutachtenPdf')}
          </a>
        ) : (
          <span
            className="inline-flex items-center justify-center gap-2 bg-claimondo-border/30 border border-claimondo-border rounded-ios-xl px-3 py-2.5 text-sm font-medium text-claimondo-ondo/60 cursor-not-allowed"
            title={t('gutachtenNichtFreigegeben')}
          >
            <FileDownIcon className="w-4 h-4" />
            {t('gutachtenNv')}
          </span>
        )}

        {/* Reklamation -> der Kunde-Chat dieses Falls. Vorher: toter Anker `#chat?reklamation=1`
            (die #chat-Zone existiert nicht; Query im Fragment war zudem kaputt). Der Chat lebt als
            Route /kunde/chat und selektiert per ?fall=<fallId> den Thread dieses Falls. */}
        <Link
          href={`/kunde/chat?fall=${fallId}`}
          className="inline-flex items-center justify-center gap-2 bg-white border border-claimondo-border hover:border-warning/40 rounded-ios-xl px-3 py-2.5 text-sm font-medium text-claimondo-navy transition-colors"
        >
          <AlertCircleIcon className="w-4 h-4 text-warning-strong" />
          {t('reklamation')}
        </Link>

        {/* Bewerten nur wenn der SV ein Google-Business-Profil hat (google_place_id -> googleReviewUrl).
            Ohne Ziel wurde vorher ein toter Anker `#bewerten` gerendert; ohne Review-Ziel entfaellt der
            Button jetzt (das Grid oben faellt auf 2 Spalten). */}
        {googleReviewUrl && (
          <a
            href={googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-claimondo-navy hover:bg-claimondo-ondo text-white rounded-ios-xl px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <StarIcon className="w-4 h-4" />
            {t('bewerten')}
          </a>
        )}
      </div>
    </div>
  )
}
