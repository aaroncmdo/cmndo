'use client'

// CMM-32 Polish: FallKarte mit Brand-Hero (dunkler Gradient + Markenlogo in
// Originalfarben + Glow-Effekt) + 4-Phasen-Progress + 3D-Kennzeichenhalter.

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  CheckIcon,
  ClockIcon,
  CalendarIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CarIcon,
} from 'lucide-react'
import Kennzeichenhalter from './Kennzeichenhalter'
import type { KundeAktion } from '@/lib/kunde/jetzt-zu-tun'

// SimpleIcons-Slug-Map (ohne Farb-Override → echte Brand-Farben)
const SI_SLUG: Record<string, string | null> = {
  audi:            'audi',
  bmw:             'bmw',
  mercedes:        'mercedes',
  'mercedes-benz': 'mercedes',
  volkswagen:      'volkswagen',
  vw:              'volkswagen',
  porsche:         'porsche',
  ford:            'ford',
  toyota:          'toyota',
  honda:           'honda',
  hyundai:         'hyundai',
  kia:             'kia',
  renault:         'renault',
  peugeot:         'peugeot',
  citroen:         'citroen',
  fiat:            'fiat',
  seat:            'seat',
  skoda:           'skoda',
  cupra:           'cupra',
  volvo:           'volvo',
  mazda:           'mazda',
  nissan:          'nissan',
  mitsubishi:      'mitsubishi',
  suzuki:          'suzuki',
  tesla:           'tesla',
  mini:            'mini',
  'land rover':    'landrover',
  jaguar:          'jaguar',
  'alfa romeo':    'alfaromeo',
  lexus:           'lexus',
  infiniti:        'infiniti',
  jeep:            'jeep',
  chevrolet:       'chevrolet',
  ferrari:         'ferrari',
  maserati:        'maserati',
  opel:            null,
  smart:           null,
  dacia:           null,
  subaru:          null,
}

const CLEARBIT_DOMAIN: Record<string, string> = {
  opel:    'opel.com',
  smart:   'smart.com',
  dacia:   'dacia.com',
  subaru:  'subaru.com',
}

// ─── Brand-Hero-Image ─────────────────────────────────────────────────────────
// Läuft auf dunklem Hintergrund. SimpleIcons ohne Farb-Override → originale
// Brand-Farben. Glow via CSS drop-shadow filter.

function BrandHeroImage({ hersteller }: { hersteller: string | null }) {
  const [failed, setFailed] = useState(false)
  const [siOk, setSiOk] = useState(true)

  if (!hersteller) {
    return <CarIcon className="w-14 h-14 text-white/30" />
  }

  const key = hersteller.toLowerCase().trim()
  const siSlug = key in SI_SLUG ? SI_SLUG[key] : null
  // Keine Farbe angeben → SimpleIcons liefert echte Brand-Farben (SVG)
  const siUrl = siSlug ? `https://cdn.simpleicons.org/${siSlug}` : null
  const clearbitDomain = CLEARBIT_DOMAIN[key] ?? null
  const clearbitUrl = clearbitDomain ? `https://logo.clearbit.com/${clearbitDomain}` : null

  if (!failed && siOk && siUrl) {
    return (
      <Image
        src={siUrl}
        alt={`${hersteller} Logo`}
        width={80}
        height={80}
        unoptimized
        className="object-contain"
        style={{
          // Glow-Effekt: macht das Logo leuchtend auf dem dunklen BG
          filter: 'drop-shadow(0 0 18px rgba(255,255,255,0.35)) drop-shadow(0 0 6px rgba(255,255,255,0.55)) brightness(1.15)',
        }}
        onError={() => setSiOk(false)}
      />
    )
  }

  if (!failed && clearbitUrl) {
    return (
      <Image
        src={clearbitUrl}
        alt={`${hersteller} Logo`}
        width={72}
        height={72}
        unoptimized
        className="object-contain rounded-lg"
        style={{
          filter: 'drop-shadow(0 0 16px rgba(255,255,255,0.30)) brightness(1.1)',
        }}
        onError={() => setFailed(true)}
      />
    )
  }

  // Fallback: Car-Icon + Hersteller-Initial
  return (
    <div className="flex flex-col items-center gap-1">
      <CarIcon className="w-10 h-10 text-white/40" />
      <span className="text-[11px] font-semibold text-white/50 tracking-widest uppercase">
        {hersteller.slice(0, 3)}
      </span>
    </div>
  )
}

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
      d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) +
      ' · ' +
      d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) +
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

  return (
    <Link
      href={`/kunde/faelle/${fall.id}`}
      className="block rounded-3xl overflow-hidden shadow-[0_2px_12px_rgba(13,27,62,0.08),0_8px_32px_rgba(13,27,62,0.06)] border border-claimondo-border/50 transition-all hover:shadow-[0_6px_24px_rgba(13,27,62,0.14),0_16px_48px_rgba(13,27,62,0.10)] hover:-translate-y-0.5 active:scale-[0.99]"
    >
      {/* ── Hero: Markenlogo auf Werkstatt-Hintergrund ── */}
      <div
        className="relative h-[140px] flex items-center justify-center overflow-hidden"
        style={{
          /* Werkstatt-Atmosphäre: dunkle Halle mit Overhead-Deckenstrahler */
          background: [
            /* Deckenstrahler links */
            'radial-gradient(ellipse 55% 100% at 18% -10%, rgba(255,220,140,0.18) 0%, transparent 55%)',
            /* Deckenstrahler mitte (direkt über Logo) */
            'radial-gradient(ellipse 50% 90% at 50% -10%, rgba(255,235,180,0.14) 0%, transparent 55%)',
            /* Deckenstrahler rechts */
            'radial-gradient(ellipse 55% 100% at 82% -10%, rgba(255,220,140,0.16) 0%, transparent 55%)',
            /* Boden-Reflex: glänzender Betonboden spiegelt Licht zurück */
            'radial-gradient(ellipse 80% 35% at 50% 110%, rgba(80,110,170,0.22) 0%, transparent 70%)',
            /* Seitenwände: leicht heller als Decke */
            'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 100%)',
            /* Basis: fast schwarz, dunkler als normales navy */
            'linear-gradient(180deg, #080c14 0%, #0a0f1c 50%, #060810 100%)',
          ].join(', '),
        }}
      >
        {/* Leuchtstreifen an der Decke: schmale Linie oben = Neonröhre */}
        <div
          className="absolute top-0 inset-x-0"
          style={{
            height: '2px',
            background: 'linear-gradient(90deg, transparent 5%, rgba(255,230,150,0.4) 30%, rgba(255,240,180,0.55) 50%, rgba(255,230,150,0.4) 70%, transparent 95%)',
          }}
        />
        {/* Boden-Lichtlinie: Spiegelung der Neonröhre */}
        <div
          className="absolute bottom-0 inset-x-0"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, transparent 15%, rgba(80,110,200,0.25) 40%, rgba(100,130,220,0.30) 50%, rgba(80,110,200,0.25) 60%, transparent 85%)',
          }}
        />
        {/* Bodenseitige Aufhellung für Übergang zum weißen Card-Body */}
        <div
          className="absolute bottom-0 inset-x-0 h-10"
          style={{
            background: 'linear-gradient(to top, rgba(248,249,251,0.10) 0%, transparent 100%)',
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center justify-center">
          <BrandHeroImage hersteller={fall.fahrzeug_hersteller} />
        </div>

        {/* Phase-Dots top-right */}
        <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
          {PHASEN.map((phase, idx) => {
            const done   = idx < aktiveIdx
            const active = idx === aktiveIdx
            return (
              <div key={phase.key} className="flex items-center gap-1">
                {idx > 0 && (
                  <div
                    className={`w-2.5 h-px rounded-full ${
                      done || active ? 'bg-white/60' : 'bg-white/20'
                    }`}
                  />
                )}
                <div
                  className={`rounded-full flex items-center justify-center transition-all ${
                    done
                      ? 'w-3 h-3 bg-white/80'
                      : active
                        ? 'w-3 h-3 bg-white ring-2 ring-white/30'
                        : 'w-2 h-2 bg-white/20'
                  }`}
                  title={phase.label}
                >
                  {done && <CheckIcon className="w-1.5 h-1.5 text-claimondo-navy" strokeWidth={3.5} />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Ungelesene-Badge top-left */}
        {typeof ungeleseneNachrichten === 'number' && ungeleseneNachrichten > 0 && (
          <div className="absolute top-3 left-3 z-10">
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-claimondo-ondo text-white leading-none">
              {ungeleseneNachrichten}
            </span>
          </div>
        )}

        {/* Fall-Nummer bottom-left */}
        <div className="absolute bottom-2.5 left-3.5 z-10">
          <p className="text-[10px] font-semibold text-white/50 tracking-wide">
            {fall.fall_nummer ?? fall.id.slice(0, 8)}
          </p>
        </div>
      </div>

      {/* ── Body: Kennzeichen + Fahrzeugname ── */}
      <div
        className="px-4 pt-4 pb-3 space-y-3"
        style={{
          background: 'linear-gradient(180deg, #f8f9fb 0%, #ffffff 40%)',
        }}
      >
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

        <div className="text-center space-y-0.5">
          {fahrzeug && (
            <p className="text-sm font-semibold text-claimondo-navy leading-tight">{fahrzeug}</p>
          )}
          {fall.schadens_datum && (
            <p className="text-[11px] text-claimondo-ondo/60">
              Unfall {new Date(fall.schadens_datum).toLocaleDateString('de-DE')}
            </p>
          )}
        </div>

        {/* Nächster Termin */}
        {nextTermin && !abgeschlossen && (
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
