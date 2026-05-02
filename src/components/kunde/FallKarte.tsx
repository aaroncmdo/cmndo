// CMM-32 Polish: FallKarte für „Meine Fälle" — angepasst an das
// ClaimStepper-Designsystem (claimondo-Token, Phase-Fortschritt, Action-Banner).

import Link from 'next/link'
import { CheckIcon, ClockIcon, CalendarIcon, AlertTriangleIcon, ChevronRightIcon, CircleCheckIcon } from 'lucide-react'
import Kennzeichenhalter from './Kennzeichenhalter'
import type { KundeAktion } from '@/lib/kunde/jetzt-zu-tun'

export type FallKarteTermin = {
  typ: 'sv_begutachtung' | 'kb_beratung'
  start_zeit: string
  kanal: string | null
  video_link: string | null
  adresse: string | null
  sv_unterwegs_seit: string | null
  sv_angekommen_am: string | null
  sv_eta_minuten: number | null
}

export type FallKarteProps = {
  fall: {
    id: string
    fall_nummer: string | null
    status: string | null
    kennzeichen: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    schadens_datum: string | null
    // Lifecycle-Marker für Phasen-Ableitung
    sa_unterschrieben?: boolean | null
    gutachten_eingegangen_am?: string | null
    regulierung_am?: string | null
    abgeschlossen_am?: string | null
    vollmacht_signiert_am?: string | null
  }
  aktion: KundeAktion | null
  nextTermin: FallKarteTermin | null
  lastUpdate: string | null
  ungeleseneNachrichten?: number
}

// ─── Phase-Logik ─────────────────────────────────────────────────────────────

type PhaseKey = 'erfassung' | 'begutachtung' | 'regulierung' | 'abschluss'

const PHASEN: Array<{ key: PhaseKey; label: string }> = [
  { key: 'erfassung', label: 'Erfassung' },
  { key: 'begutachtung', label: 'Gutachten' },
  { key: 'regulierung', label: 'Regulierung' },
  { key: 'abschluss', label: 'Abschluss' },
]

function derivePhase(fall: FallKarteProps['fall']): PhaseKey {
  if (fall.abgeschlossen_am || fall.status === 'abgeschlossen') return 'abschluss'
  if (fall.gutachten_eingegangen_am || fall.regulierung_am) return 'regulierung'
  if (fall.sa_unterschrieben) return 'begutachtung'
  return 'erfassung'
}

function phaseIndex(key: PhaseKey): number {
  return PHASEN.findIndex((p) => p.key === key)
}

// ─── Termin-Format ────────────────────────────────────────────────────────────

function fmtTermin(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) +
      ' · ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
  } catch {
    return iso
  }
}

// ─── Action-Banner-Config ─────────────────────────────────────────────────────

type BannerConfig = {
  bg: string
  border: string
  textColor: string
  labelColor: string
  icon: React.ReactNode
}

function bannerConfig(severity: KundeAktion['severity'], variant: KundeAktion['variant']): BannerConfig {
  if (variant === 'live') {
    return {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      textColor: 'text-emerald-800',
      labelColor: 'text-emerald-700',
      icon: (
        <span className="relative inline-flex h-2.5 w-2.5 shrink-0 mt-0.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
      ),
    }
  }
  if (severity === 'success') {
    return {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      textColor: 'text-emerald-800',
      labelColor: 'text-emerald-700',
      icon: <CircleCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />,
    }
  }
  if (severity === 'critical') {
    return {
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      textColor: 'text-amber-900',
      labelColor: 'text-amber-800',
      icon: <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />,
    }
  }
  if (severity === 'warning') {
    return {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      textColor: 'text-amber-800',
      labelColor: 'text-amber-700',
      icon: <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />,
    }
  }
  // neutral / info
  return {
    bg: 'bg-claimondo-ondo/5',
    border: 'border-claimondo-light-blue/30',
    textColor: 'text-claimondo-navy',
    labelColor: 'text-claimondo-shield',
    icon: <ClockIcon className="w-3.5 h-3.5 text-claimondo-ondo/60 shrink-0 mt-0.5" />,
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FallKarte({
  fall,
  aktion,
  nextTermin,
  lastUpdate,
  ungeleseneNachrichten,
}: FallKarteProps) {
  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')
  const aktivePhase = derivePhase(fall)
  const aktiveIdx = phaseIndex(aktivePhase)
  const abgeschlossen = aktivePhase === 'abschluss'

  const svLive = nextTermin?.sv_unterwegs_seit || nextTermin?.sv_angekommen_am

  return (
    <Link
      href={`/kunde/faelle/${fall.id}`}
      className="block rounded-3xl bg-gradient-to-br from-white via-white to-[#f3f6fb] shadow-[0_2px_12px_rgba(13,27,62,0.06),0_8px_30px_rgba(13,27,62,0.04)] border border-claimondo-border/60 overflow-hidden transition-shadow hover:shadow-[0_4px_20px_rgba(13,27,62,0.10),0_12px_40px_rgba(13,27,62,0.08)] active:scale-[0.99]"
    >
      {/* Header-Streifen: Claim-Nr + Ungelesene + Phase-Dots */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2 border-b border-claimondo-border/30">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold text-claimondo-navy tracking-wide">
            {fall.fall_nummer ?? fall.id.slice(0, 8)}
          </p>
          {typeof ungeleseneNachrichten === 'number' && ungeleseneNachrichten > 0 && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-claimondo-ondo text-white leading-none">
              {ungeleseneNachrichten}
            </span>
          )}
        </div>

        {/* 4-Phasen Progress */}
        <div className="flex items-center gap-1">
          {PHASEN.map((phase, idx) => {
            const done = idx < aktiveIdx
            const active = idx === aktiveIdx
            return (
              <div key={phase.key} className="flex items-center gap-1">
                {idx > 0 && (
                  <div
                    className={`w-3 h-px rounded-full ${done || active ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`}
                  />
                )}
                <div
                  className={`rounded-full transition-all ${
                    done
                      ? 'w-3 h-3 bg-claimondo-ondo flex items-center justify-center'
                      : active
                        ? 'w-3 h-3 bg-claimondo-navy ring-2 ring-claimondo-navy/20'
                        : 'w-2.5 h-2.5 bg-claimondo-border'
                  }`}
                  title={phase.label}
                >
                  {done && <CheckIcon className="w-2 h-2 text-white" strokeWidth={3} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Body: Kennzeichenhalter + Fahrzeug-Info */}
      <div className="px-4 py-4 space-y-3">
        {fall.kennzeichen && (
          <div className="flex justify-center">
            <Kennzeichenhalter
              kennzeichen={fall.kennzeichen}
              size="sm"
              hideHuPlakette
              hideBolts
            />
          </div>
        )}

        <div className="text-center space-y-0.5">
          {fahrzeug && (
            <p className="text-sm font-semibold text-claimondo-navy leading-tight">{fahrzeug}</p>
          )}
          {fall.schadens_datum && (
            <p className="text-[11px] text-claimondo-ondo/70">
              Unfall {new Date(fall.schadens_datum).toLocaleDateString('de-DE')}
            </p>
          )}
        </div>

        {/* Nächster Termin — kompakt */}
        {nextTermin && !abgeschlossen && (
          <div className="rounded-xl bg-white/80 border border-claimondo-border/50 px-3 py-2">
            {svLive ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <span className="relative inline-flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {nextTermin.sv_angekommen_am
                  ? 'Gutachter ist vor Ort'
                  : `Gutachter unterwegs${nextTermin.sv_eta_minuten ? ` · ETA ${nextTermin.sv_eta_minuten} Min.` : ''}`}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs font-medium text-claimondo-navy">
                <CalendarIcon className="w-3.5 h-3.5 text-claimondo-ondo/60 shrink-0" />
                {fmtTermin(nextTermin.start_zeit)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action-Banner oder aktive Phase-Info */}
      {aktion && !abgeschlossen ? (
        (() => {
          const cfg = bannerConfig(aktion.severity, aktion.variant)
          return (
            <div className={`mx-3 mb-3 rounded-2xl ${cfg.bg} border ${cfg.border} px-3.5 py-2.5`}>
              <div className="flex items-start gap-2">
                {cfg.icon}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${cfg.labelColor} leading-tight`}>
                    {aktion.titel}
                  </p>
                  {aktion.beschreibung && (
                    <p className={`text-[11px] ${cfg.textColor} mt-0.5 leading-snug line-clamp-2`}>
                      {aktion.beschreibung}
                    </p>
                  )}
                </div>
                <ChevronRightIcon className={`w-3.5 h-3.5 ${cfg.textColor} opacity-50 shrink-0 mt-0.5`} />
              </div>
            </div>
          )
        })()
      ) : abgeschlossen ? (
        <div className="mx-3 mb-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <CircleCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <p className="text-xs font-semibold text-emerald-700">Fall abgeschlossen</p>
          </div>
        </div>
      ) : (
        <div className="mx-3 mb-3 rounded-2xl bg-claimondo-ondo/5 border border-claimondo-light-blue/30 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-3.5 h-3.5 text-claimondo-ondo/60 shrink-0" />
            <p className="text-xs font-medium text-claimondo-shield">
              {PHASEN[aktiveIdx]?.label ?? 'In Bearbeitung'}
            </p>
          </div>
        </div>
      )}
    </Link>
  )
}
