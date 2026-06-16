import { CalendarCheckIcon, UserCheckIcon, AlertTriangleIcon } from 'lucide-react'
import {
  type TerminGutachterInfo,
  TONE_BADGE,
  terminStatusLabel,
  terminStatusTone,
  formatTerminKurz,
} from '@/lib/dispatch/lead-termin-gutachter'

// AAR-956: Single-Source-Readout fuer den Lead-Detail. Eine Quelle
// (v_lead_termin_gutachter) beantwortet "hat der Kunde schon einen Termin?" und
// "hat er schon einen Gutachter?" — reconciled ueber dispatch-/self-service-Termin
// + Gutachter-Finder-Kundenwunsch, inkl. Divergenz-Warnung (gebucht ≠ Wunsch).
// Rein praesentational; null → kein Banner.
export default function LeadTerminGutachterBanner({
  info,
}: {
  info: TerminGutachterInfo | null
}) {
  if (!info || (!info.hat_termin && !info.hat_gutachter)) return null

  return (
    <div className="mb-4 space-y-3 rounded-ios-xl border border-claimondo-border bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-claimondo-shield">
        Termin &amp; Gutachter
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Termin */}
        <div className="flex items-start gap-2">
          <CalendarCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-claimondo-ondo/70">Termin</p>
            {info.hat_termin ? (
              <p className="text-sm font-medium text-claimondo-navy">
                {formatTerminKurz(info.termin_start)}
                <span
                  className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_BADGE[terminStatusTone(info.termin_status)]}`}
                >
                  {terminStatusLabel(info.termin_status)}
                </span>
              </p>
            ) : (
              <p className="text-sm text-claimondo-ondo/60">Noch kein Termin</p>
            )}
          </div>
        </div>

        {/* Gutachter */}
        <div className="flex items-start gap-2">
          <UserCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-claimondo-ondo/70">Gutachter</p>
            {info.hat_gutachter ? (
              <p className="text-sm font-medium text-claimondo-navy">
                {info.gutachter_name ?? 'Gutachter zugewiesen'}
                <span
                  className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    info.gutachter_quelle === 'gebucht' ? TONE_BADGE.success : TONE_BADGE.neutral
                  }`}
                >
                  {info.gutachter_quelle === 'gebucht' ? 'gebucht' : 'Kundenwunsch'}
                </span>
              </p>
            ) : (
              <p className="text-sm text-claimondo-ondo/60">Noch kein Gutachter</p>
            )}
          </div>
        </div>
      </div>

      {/* Divergenz: gebuchter Gutachter ≠ urspruenglicher Kundenwunsch */}
      {info.gutachter_divergiert && (
        <div className={`flex items-start gap-2 rounded-ios-md px-3 py-2 ${TONE_BADGE.warning}`}>
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-xs">
            Gebuchter Gutachter weicht vom Kundenwunsch ab — der Kunde wählte im Finder
            ursprünglich <span className="font-semibold">{info.kunden_pick_name ?? '—'}</span>.
          </p>
        </div>
      )}
    </div>
  )
}
