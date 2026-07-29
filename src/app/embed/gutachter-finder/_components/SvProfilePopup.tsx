'use client'

// AAR-956 WS2 (Marketing-Look, Aaron 11.06.) — Anonymes SV-Profil ÜBER dem Pin.
// 1:1 die Marketing-Design-Sprache von claimondo.de:
//   • Card  = <GlassSurface> (bg-white/70 + border-white/60 + shadow-glass-card + blur)
//   • Chips = rounded-full border bg-claimondo-bg text-claimondo-shield text-[0.8125rem]
//   • Text  = claimondo-navy (Headings) / claimondo-shield (Sekundär + Labels)
// View-only, anonyme Trust-Signale aus ladeAktiveSVs. KEINE PII. SV-Wahl = System (WS3).
//
// AAR-956 (Aaron 14.06.): Der Profil-INHALT ist als SvProfileInhalt / DeadPinProfileInhalt
// extrahiert — geteilt vom Map-Popup (PopupCard) UND vom Mobile-Bottom-Sheet (FinderMap).
// Eine Quelle für die Profil-Optik. `gross` = Sheet-Variante (größerer Avatar + Name).

import { ShieldCheck, MapPin, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { PartnerRangBadge } from '@/components/shared/PartnerRangBadge'
import type { AktiverSVPublic } from '@/lib/actions/gutachter-finder-actions'
import { GlassSurface } from './GlassSurface'

const TYP_LABEL: Record<string, string> = {
  'kfz-gutachter': 'Kfz-Sachverständiger',
}

// PopupCard = GlassSurface-Shell (Größe + Padding) NUR fürs Map-Popup. Das Bottom-Sheet
// bringt seine eigene Surface mit und rendert den *Inhalt* direkt.
function PopupCard({ children }: { children: React.ReactNode }) {
  return <GlassSurface className="min-w-[260px] max-w-[330px] p-4">{children}</GlassSurface>
}

function PopupAvatar({ children, gross = false }: { children: React.ReactNode; gross?: boolean }) {
  return (
    <div
      className={cn(
        // text-white + tailwind-merge-erkannte Größen (text-2xl/text-base) → Farbe koexistiert
        // konfliktfrei. (Custom-Typo-Tokens wie text-heading-sm/text-body droppten via Merge die
        // Farbe → Initiale erschien nicht weiß; Aaron 14.06.: „Initialen wieder weiß".)
        'flex flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo font-extrabold text-white',
        gross ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-base',
      )}
    >
      {children}
    </div>
  )
}

// Chip exakt im Marketing-Stil (claimondo.de): heller, umrandeter Pill mit shield-Text.
function Chip({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full border bg-claimondo-bg px-2.5 py-0.5 text-[0.75rem] font-semibold text-claimondo-shield',
        strong ? 'border-claimondo-ondo/30' : 'border-claimondo-border',
      )}
    >
      {children}
    </span>
  )
}

function Section({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/60">
        {titel}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

// AAR-956 (Aaron 14.06.): reiner Profil-Inhalt (ohne Surface) — geteilt von Map-Popup + Bottom-Sheet.
export function SvProfileInhalt({ sv, gross = false }: { sv: AktiverSVPublic; gross?: boolean }) {
  const stadt = sv.stadt ?? 'Ihrer Region'
  const initiale = sv.vorname_initiale ?? '·'
  const rolle = (sv.gutachter_typ ? TYP_LABEL[sv.gutachter_typ] : undefined) ?? 'Sachverständiger'
  const hatBewertung = sv.bewertungs_durchschnitt !== null && sv.bewertungs_anzahl !== null
  const specs = sv.spezifikationen_alle.length > 0 ? sv.spezifikationen_alle : sv.spezifikationen_top3
  const specsShown = specs.slice(0, 4)
  const specsRest = specs.length - specsShown.length
  const hatCredentials = sv.oeffentlich_bestellt || sv.mitgliedschaften.length > 0 || sv.qualifikationen.length > 0

  return (
    <div className="flex flex-col gap-2.5">
      {/* Kopf — Avatar + Rolle/Region + Verifiziert-Marker */}
      <div className="flex items-center gap-3">
        <PopupAvatar gross={gross}>{initiale}</PopupAvatar>
        <div className="min-w-0">
          {/* Vorname NUR bei aktiven Partnern (Aaron 12.06.) — dieses Profil wird ausschließlich für
              verifizierte SVs gerendert; Dead-Pins haben das anonyme DeadPinProfileInhalt. */}
          {sv.vorname ? (
            <>
              <div className={cn('font-bold leading-tight text-claimondo-navy', gross ? 'text-body' : 'text-body-sm')}>
                {sv.vorname}
              </div>
              <div className="text-[0.8125rem] font-medium text-claimondo-shield/80">
                {rolle} in {stadt}
              </div>
            </>
          ) : (
            <div className={cn('font-bold leading-tight text-claimondo-navy', gross ? 'text-body' : 'text-body-sm')}>
              {rolle} in {stadt}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1 text-[0.8125rem] font-medium text-claimondo-shield/80">
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
            Verifizierter Claimondo-Partner
          </div>
        </div>
      </div>

      {/* Partner-Tier-Badge (verdienter Rang) — ehrliches Trust-/Wahl-Signal */}
      {sv.rang && <PartnerRangBadge tier={sv.rang} sinnsatz={sv.rangSinnsatz} />}

      {/* 13b: Netzwerkpartner-Badge (Abo-Praedikat, nicht paket) */}
      {sv.istNetzwerkpartner && <Chip strong>Netzwerkpartner</Chip>}

      {/* Bewertung + Einsatzgebiet */}
      {(hatBewertung || sv.umkreis_km !== null) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {hatBewertung && (
            <GoogleBewertungBadge
              durchschnitt={sv.bewertungs_durchschnitt}
              anzahl={sv.bewertungs_anzahl}
              size="sm"
            />
          )}
          {sv.umkreis_km !== null && (
            <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-claimondo-shield/80">
              <MapPin className="h-3.5 w-3.5" />~{sv.umkreis_km} km Einsatzgebiet
            </span>
          )}
        </div>
      )}

      {/* Credentials */}
      {hatCredentials && (
        <div className="flex flex-wrap gap-2">
          {sv.oeffentlich_bestellt && <Chip strong>öffentlich bestellt &amp; vereidigt</Chip>}
          {sv.mitgliedschaften.map((m) => (
            <Chip key={m} strong>
              {m}
            </Chip>
          ))}
          {sv.qualifikationen.map((q) => (
            <Chip key={q} strong>
              {q}
            </Chip>
          ))}
        </div>
      )}

      {/* Spezialisierungen */}
      {specsShown.length > 0 && (
        <Section titel="Spezialisiert auf">
          {specsShown.map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
          {specsRest > 0 && <Chip>+{specsRest} weitere</Chip>}
        </Section>
      )}

      {/* Schadenarten */}
      {sv.schadenarten.length > 0 && (
        <Section titel="Schadenarten">
          {sv.schadenarten.slice(0, 3).map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
          {sv.schadenarten.length > 3 && <Chip>+{sv.schadenarten.length - 3} weitere</Chip>}
        </Section>
      )}

      {/* AAR-369: Selbstgeschriebener Profiltext (Bio) — SV-eigenes Trust-Signal. */}
      {sv.profilbeschreibung && (
        <p className="text-body-sm italic leading-relaxed text-claimondo-navy/70">
          „{sv.profilbeschreibung}"
        </p>
      )}

      <p className="text-[0.75rem] leading-relaxed text-claimondo-shield/60">
        Den passenden Gutachter wählt das System anhand Ihres Schadenorts.
      </p>
    </div>
  )
}

export function SvProfilePopup({ sv }: { sv: AktiverSVPublic }) {
  return (
    <PopupCard>
      <SvProfileInhalt sv={sv} />
    </PopupCard>
  )
}

// AAR-956 Dead-Pin-Light-Profil (Aaron 12.06.: „selber Wrapper wie die normalen Profile").
// Leak-safe — KEIN Name/Firma/Reviews/Specs (ein Dead-Pin ist ein nicht-verifizierter
// sv_lead). Nur Region (ort) + generischer Verfügbarkeits-Hinweis, im selben Kopf-Layout.
export function DeadPinProfileInhalt({ ort, gross = false }: { ort: string | null; gross?: boolean }) {
  const region = ort ?? 'Ihrer Nähe'
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <PopupAvatar gross={gross}>
          <MapPin className={gross ? 'h-7 w-7' : 'h-6 w-6'} />
        </PopupAvatar>
        <div className="min-w-0">
          <div className={cn('font-bold leading-tight text-claimondo-navy', gross ? 'text-body' : 'text-body-sm')}>
            Kfz-Gutachter in {region}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[0.8125rem] font-medium text-claimondo-shield/80">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            Termin online reservierbar
          </div>
        </div>
      </div>

      <p className="text-[0.75rem] leading-relaxed text-claimondo-shield/60">
        Wählen Sie einen Wunschtermin — wir bestätigen ihn nach Ihrer Anfrage telefonisch.
      </p>
    </div>
  )
}

export function DeadPinProfilePopup({ ort }: { ort: string | null }) {
  return (
    <PopupCard>
      <DeadPinProfileInhalt ort={ort} />
    </PopupCard>
  )
}
