'use client'

// AAR-759 (Phase 1): Read-only Mietwagen-Status-Anzeige für Kunde + SV +
// Admin-Einblicke. Zeigt Mietwagen-Daten, Tage-Counter, Limit-Warnung,
// Rechnungs-Upload-Hinweis. Write-Funktionalität (Admin-Edit + Kunde-
// Upload) ist Phase-2-Follow-up.

import { AlertTriangleIcon, CarIcon, ClockIcon, ReceiptIcon } from 'lucide-react'

type Props = {
  rolle: 'admin' | 'kb' | 'kunde' | 'sv'
  fall: {
    mietwagen_hat?: boolean | null
    mietwagen_seit_datum?: string | null
    mietwagen_limit_tage?: number | null
    mietwagen_limit_grund?: string | null
    mietwagen_rechnung_vorhanden?: boolean | null
    mietwagen_argumentations_puffer?: number | null
    mietwagen_vermieter?: string | null
  }
  className?: string
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

function berechneTage(seit: string | null | undefined): number | null {
  if (!seit) return null
  const start = new Date(seit).getTime()
  const now = new Date(new Date().toDateString()).getTime()
  return Math.floor((now - start) / (1000 * 60 * 60 * 24))
}

export function MietwagenStatusCard({ rolle, fall, className = '' }: Props) {
  // Nichts rendern wenn kein Mietwagen vorliegt
  if (!fall.mietwagen_hat) return null

  const tageIm = berechneTage(fall.mietwagen_seit_datum)
  const limit = fall.mietwagen_limit_tage ?? null
  const restTage = limit != null && tageIm != null ? limit - tageIm : null
  const puffer = fall.mietwagen_argumentations_puffer ?? 3
  const ueberLimit = restTage != null && restTage < 0
  const ueberPuffer = restTage != null && restTage < -puffer

  const warnungState = ueberPuffer
    ? 'kritisch'
    : ueberLimit
      ? 'dringend'
      : restTage != null && restTage <= 3
        ? 'warnung'
        : 'normal'

  const warnungCls =
    warnungState === 'kritisch'
      ? 'bg-red-50 border border-red-200 text-red-800'
      : warnungState === 'dringend'
        ? 'bg-orange-50 border border-orange-200 text-orange-800'
        : warnungState === 'warnung'
          ? 'bg-amber-50 border border-amber-200 text-amber-800'
          : null

  const warnungText =
    warnungState === 'kritisch'
      ? `Limit um ${Math.abs(restTage ?? 0)} Tage überschritten — Argumentations-Puffer ausgeschöpft. Ab jetzt auf eigene Kosten.`
      : warnungState === 'dringend'
        ? `Limit um ${Math.abs(restTage ?? 0)} Tage überschritten. Claimondo kann noch bis zu ${puffer} Tage gegenüber der VS argumentieren.`
        : warnungState === 'warnung'
          ? `Noch ${restTage} Tag${restTage === 1 ? '' : 'e'} bis zur geplanten Abgabe.`
          : null

  return (
    <section
      className={`bg-white rounded-ios-md border border-claimondo-border p-4 space-y-3 ${className}`}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo flex items-center gap-2">
        <CarIcon className="w-3.5 h-3.5" /> Mietwagen
      </h3>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {fall.mietwagen_seit_datum && (
          <div>
            <p className="text-claimondo-ondo">Abholung</p>
            <p className="text-claimondo-navy font-medium">
              {fmtDate(fall.mietwagen_seit_datum)}
            </p>
          </div>
        )}
        {tageIm != null && (
          <div>
            <p className="text-claimondo-ondo flex items-center gap-1">
              <ClockIcon className="w-3 h-3" /> Tage genutzt
            </p>
            <p className="text-claimondo-navy font-medium">
              {tageIm} {tageIm === 1 ? 'Tag' : 'Tage'}
            </p>
          </div>
        )}
        {limit != null && (
          <div>
            <p className="text-claimondo-ondo">Limit</p>
            <p className="text-claimondo-navy font-medium">
              {limit} Tage
              {fall.mietwagen_limit_grund && (
                <span className="block text-[10px] text-claimondo-ondo/70 mt-0.5">
                  {fall.mietwagen_limit_grund}
                </span>
              )}
            </p>
          </div>
        )}
        {fall.mietwagen_vermieter && (
          <div>
            <p className="text-claimondo-ondo">Vermieter</p>
            <p className="text-claimondo-navy font-medium truncate">
              {fall.mietwagen_vermieter}
            </p>
          </div>
        )}
      </div>

      {warnungCls && warnungText && (
        <div className={`rounded-ios-lg px-3 py-2 text-xs flex items-start gap-2 ${warnungCls}`}>
          <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{warnungText}</span>
        </div>
      )}

      <div className="border-t border-claimondo-border pt-3 flex items-start gap-2 text-xs">
        <ReceiptIcon
          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
            fall.mietwagen_rechnung_vorhanden ? 'text-emerald-600' : 'text-amber-600'
          }`}
        />
        <div className="flex-1">
          <p className="text-claimondo-navy font-medium">
            {fall.mietwagen_rechnung_vorhanden
              ? 'Rechnung liegt vor'
              : 'Rechnung fehlt noch'}
          </p>
          {!fall.mietwagen_rechnung_vorhanden && rolle === 'kunde' && (
            <p className="text-claimondo-ondo/80 mt-0.5">
              Bitte laden Sie die Rechnung vom Vermieter hoch, sobald Sie sie haben.
              Wir reichen sie bei der Versicherung ein.
            </p>
          )}
          {!fall.mietwagen_rechnung_vorhanden && (rolle === 'admin' || rolle === 'kb') && (
            <p className="text-claimondo-ondo/80 mt-0.5">
              Reminder läuft über den Mitteilungs-Resolver. Bei Bedarf manuell nachfassen.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
