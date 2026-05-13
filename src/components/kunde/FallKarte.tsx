'use client'

// CMM-32 Polish: FallKarte — kompakter Header mit Logo-Square (wie ClaimSummary)
// + 4-Phasen-Progress + 3D-Kennzeichenhalter. Kein großer Hero-Bereich mehr.

import Link from 'next/link'
import {
  CheckIcon,
  ClockIcon,
  CalendarIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
  CircleCheckIcon,
} from 'lucide-react'
import Kennzeichenhalter from './Kennzeichenhalter'
import FahrzeugRenderImage from '@/components/fahrzeug/FahrzeugRenderImage'
import type { KundeAktion } from '@/lib/kunde/jetzt-zu-tun'

// ─── Typen ────────────────────────────────────────────────────────────────────

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
    sa_unterschrieben?: boolean | null
    gutachten_eingegangen_am?: string | null
    regulierung_am?: string | null
    abgeschlossen_am?: string | null
    vollmacht_signiert_am?: string | null
    kanzlei_wunsch?: string | null
  }
  aktion: KundeAktion | null
  nextTermin: FallKarteTermin | null
  lastUpdate: string | null
  ungeleseneNachrichten?: number
}

// ─── Phasen ───────────────────────────────────────────────────────────────────

type PhaseKey = 'erfassung' | 'begutachtung' | 'regulierung' | 'abschluss'

const PHASEN: Array<{ key: PhaseKey; label: string }> = [
  { key: 'erfassung',    label: 'Erfassung'    },
  { key: 'begutachtung', label: 'Gutachten'    },
  { key: 'regulierung',  label: 'Regulierung'  },
  { key: 'abschluss',    label: 'Abschluss'    },
]

function derivePhase(fall: FallKarteProps['fall']): PhaseKey {
  if (fall.abgeschlossen_am || fall.status === 'abgeschlossen') return 'abschluss'
  if (fall.gutachten_eingegangen_am || fall.regulierung_am)      return 'regulierung'
  if (fall.sa_unterschrieben)                                    return 'begutachtung'
  return 'erfassung'
}

// ─── Termin-Format ────────────────────────────────────────────────────────────

function fmtTermin(iso: string): string {
  try {
    const d = new Date(iso)
    return (
      d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' }) +
      ' · ' +
      d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }) +
      ' Uhr'
    )
  } catch {
    return iso
  }
}

// ─── Action-Banner ────────────────────────────────────────────────────────────

type BannerCfg = {
  bg: string; border: string; textColor: string; labelColor: string
  icon: React.ReactNode
}

function getBannerCfg(severity: KundeAktion['severity'], variant: KundeAktion['variant']): BannerCfg {
  if (variant === 'live') return {
    bg: 'bg-emerald-50', border: 'border-emerald-200',
    textColor: 'text-emerald-800', labelColor: 'text-emerald-700',
    icon: (
      <span className="relative inline-flex h-2.5 w-2.5 shrink-0 mt-0.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
    ),
  }
  if (severity === 'success') return {
    bg: 'bg-emerald-50', border: 'border-emerald-200',
    textColor: 'text-emerald-800', labelColor: 'text-emerald-700',
    icon: <CircleCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />,
  }
  if (severity === 'critical') return {
    bg: 'bg-amber-50', border: 'border-amber-300',
    textColor: 'text-amber-900', labelColor: 'text-amber-800',
    icon: <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />,
  }
  if (severity === 'warning') return {
    bg: 'bg-amber-50', border: 'border-amber-200',
    textColor: 'text-amber-800', labelColor: 'text-amber-700',
    icon: <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />,
  }
  return {
    bg: 'bg-claimondo-ondo/5', border: 'border-claimondo-light-blue/30',
    textColor: 'text-claimondo-navy', labelColor: 'text-claimondo-shield',
    icon: <ClockIcon className="w-3.5 h-3.5 text-claimondo-ondo/60 shrink-0 mt-0.5" />,
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FallKarte({
  fall,
  aktion,
  nextTermin,
  lastUpdate: _lastUpdate,
  ungeleseneNachrichten,
}: FallKarteProps) {
  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')
  const aktivePhase = derivePhase(fall)
  const aktiveIdx   = PHASEN.findIndex((p) => p.key === aktivePhase)
  const abgeschlossen = aktivePhase === 'abschluss'
  const svLive = nextTermin?.sv_unterwegs_seit || nextTermin?.sv_angekommen_am

  // Wrapper-Border: 1:1 aus ClaimStepper (gleiche Priority-Reihenfolge).
  // Drei Termin-Zustände:
  //   • Bevorstehend   → nextTermin gesetzt, Zeit in der Zukunft → normal anzeigen
  //   • Verstrichen    → nextTermin gesetzt, Zeit abgelaufen, durchgefuehrt_am = null
  //                      (kein No-Show markiert) → rose Warnung
  //   • Abgeschlossen  → durchgefuehrt_am gesetzt → ladeFallKartenMeta filtert raus
  //                      → nextTermin = null → nichts anzeigen (DB ist Quelle der Wahrheit)
  //
  //   1. Termin verstrichen (start+60min in Vergangenheit, kein SV live)  → rose
  //   2. Nachbesichtigung ausstehend                                       → amber
  //   3. Kanzlei-Wunsch offen (nach Gutachten, noch nicht entschieden)    → violet
  //   4. LexDrive-Vollmacht ausstehend                                     → #0e5be9
  //   5. Fall abgeschlossen                                                → emerald
  //   6. Default                                                           → neutral
  const terminVerstrichen =
    !!nextTermin &&
    !svLive &&
    new Date(nextTermin.start_zeit).getTime() + 60 * 60 * 1000 < Date.now()

  const nachbesichtigungPending = aktion?.state === 'nachbesichtigung-waehlen'

  const kanzleiWunschOffen =
    aktivePhase === 'regulierung' &&
    !fall.vollmacht_signiert_am &&
    (!fall.kanzlei_wunsch ||
      fall.kanzlei_wunsch === 'noch_unentschieden' ||
      fall.kanzlei_wunsch === 'nicht_gefragt')

  const lexdriveAusstehend = aktion?.state === 'vollmacht-unterschreiben'

  const wrapperBorder = terminVerstrichen
    ? 'border-2 border-red-400'
    : nachbesichtigungPending
      ? 'border-2 border-amber-400'
      : kanzleiWunschOffen
      ? 'border-2 border-claimondo-ondo/60'
      : lexdriveAusstehend
        ? 'border-2 border-[#0e5be9]'
        : abgeschlossen
          ? 'border-2 border-emerald-400'
          : 'border border-claimondo-border'

  return (
    <Link
      href={`/kunde/faelle/${fall.id}`}
      className={`block rounded-2xl overflow-hidden bg-white ${wrapperBorder} transition-all hover:-translate-y-0.5 active:scale-[0.99]`}
      style={{
        boxShadow: [
          /* Glas-Kante oben + links — weißer Inset-Highlight */
          'inset 0 1px 0 rgba(255,255,255,0.95)',
          'inset 1px 0 0 rgba(255,255,255,0.65)',
          /* Glas-Kante unten + rechts — subtile Abdunkelung */
          'inset 0 -1px 0 rgba(13,27,62,0.06)',
          'inset -1px 0 0 rgba(13,27,62,0.04)',
          /* Outer Drop-Shadow */
          '0 2px 12px rgba(13,27,62,0.07)',
          '0 6px 24px rgba(13,27,62,0.05)',
        ].join(', '),
      }}
    >
      {/* ── Header: Logo-Square + Fahrzeuginfo + Phase-Dots ── */}
      <div className="px-4 py-4 flex items-center gap-3 border-b border-claimondo-navy/10 bg-claimondo-bg">
        {/* Logo-Square — gleiche Sprache wie ClaimSummary-Header */}
        <div
          className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--brand-primary, #0D1B3E) 0%, var(--brand-primary-dark, #14254f) 100%)' }}
        >
          <FahrzeugRenderImage
            hersteller={fall.fahrzeug_hersteller}
            modell={fall.fahrzeug_modell}
            lackfarbe={null}
            width={44}
            dark
          />
        </div>

        {/* Fahrzeuginfo */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 font-semibold truncate">
            {fall.fall_nummer ?? fall.id.slice(0, 8)}
          </p>
          <p className="text-sm font-bold text-claimondo-navy leading-tight truncate">
            {fahrzeug || 'Fahrzeug'}
          </p>
          {fall.schadens_datum && (
            <p className="text-[11px] text-claimondo-ondo/60 mt-0.5">
              Unfall {new Date(fall.schadens_datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
            </p>
          )}
        </div>

        {/* Rechts: Ungelesene-Badge + Phase-Dots */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {typeof ungeleseneNachrichten === 'number' && ungeleseneNachrichten > 0 && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-claimondo-ondo text-white leading-none">
              {ungeleseneNachrichten}
            </span>
          )}
          {/* Phase-Dots — navy auf hellem BG */}
          <div className="flex items-center gap-0.5">
            {PHASEN.map((phase, idx) => {
              const done   = idx < aktiveIdx
              const active = idx === aktiveIdx
              return (
                <div key={phase.key} className="flex items-center gap-0.5">
                  {idx > 0 && (
                    <div className={`w-2.5 h-px rounded-full ${done || active ? 'bg-claimondo-navy/50' : 'bg-claimondo-border'}`} />
                  )}
                  <div
                    className={`rounded-full flex items-center justify-center transition-all ${
                      done
                        ? 'w-3 h-3 bg-claimondo-navy'
                        : active
                          ? 'w-3 h-3 bg-claimondo-navy ring-2 ring-claimondo-navy/20'
                          : 'w-2 h-2 bg-claimondo-border'
                    }`}
                    title={phase.label}
                  >
                    {done && <CheckIcon className="w-1.5 h-1.5 text-white" strokeWidth={3.5} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Body: Kennzeichenhalter + Termin ── */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        {fall.kennzeichen && (
          <div className="flex justify-center">
            <Kennzeichenhalter
              kennzeichen={fall.kennzeichen}
              size="sm"
              hideHuPlakette
              hideBolts
              tilt
            />
          </div>
        )}

        {/* Bevorstehender Termin — nur wenn noch nicht verstrichen */}
        {nextTermin && !abgeschlossen && !terminVerstrichen && (
          <div className="rounded-xl bg-white border border-claimondo-border/60 shadow-sm px-3 py-2">
            {svLive ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <span className="relative inline-flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {nextTermin.sv_angekommen_am
                  ? 'Gutachter ist vor Ort'
                  : `Gutachter unterwegs${nextTermin.sv_eta_minuten ? ` · ${nextTermin.sv_eta_minuten} Min.` : ''}`}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs font-medium text-claimondo-navy">
                <CalendarIcon className="w-3.5 h-3.5 text-claimondo-ondo/60 shrink-0" />
                {fmtTermin(nextTermin.start_zeit)}
              </p>
            )}
          </div>
        )}
        {/* Verstrichen — Termin in Vergangenheit, durchgefuehrt_am noch nicht gesetzt */}
        {nextTermin && !abgeschlossen && terminVerstrichen && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-700">
              <AlertTriangleIcon className="w-3.5 h-3.5 shrink-0" />
              Termin verstrichen · {fmtTermin(nextTermin.start_zeit)}
            </p>
          </div>
        )}
      </div>

      {/* ── Footer: Action-Banner ── */}
      {aktion && !abgeschlossen
        ? (() => {
            const cfg = getBannerCfg(aktion.severity, aktion.variant)
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
                  <ChevronRightIcon className={`w-3.5 h-3.5 ${cfg.textColor} opacity-40 shrink-0 mt-0.5`} />
                </div>
              </div>
            )
          })()
        : abgeschlossen
          ? (
            <div className="mx-3 mb-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <CircleCheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <p className="text-xs font-semibold text-emerald-700">Fall abgeschlossen</p>
              </div>
            </div>
          )
          : (
            <div className="mx-3 mb-3 rounded-2xl bg-claimondo-ondo/5 border border-claimondo-light-blue/30 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-3.5 h-3.5 text-claimondo-ondo/60 shrink-0" />
                <p className="text-xs font-medium text-claimondo-shield">
                  Phase: {PHASEN[aktiveIdx]?.label ?? 'In Bearbeitung'}
                </p>
              </div>
            </div>
          )
      }
    </Link>
  )
}
