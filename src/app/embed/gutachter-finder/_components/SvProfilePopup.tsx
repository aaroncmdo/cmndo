'use client'

// AAR-956 WS2 (Marketing-Look, Aaron 11.06.) — Anonymes SV-Profil ÜBER dem Pin.
// 1:1 die Marketing-Design-Sprache von claimondo.de:
//   • Card  = <GlassSurface> (bg-white/70 + border-white/60 + shadow-glass-card + blur)
//   • Chips = rounded-full border bg-claimondo-bg text-claimondo-shield text-[0.8125rem]
//             (exakt wie VersichererProfileCard / AssetHero / SchadensNetzwerk)
//   • Text  = claimondo-navy (Headings) / claimondo-shield (Sekundär + Labels)
// View-only, anonyme Trust-Signale aus ladeAktiveSVs. KEINE PII. SV-Wahl = System (WS3).

import { ShieldCheck, MapPin, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import type { AktiverSVPublic } from '@/lib/actions/gutachter-finder-actions'
import { GlassSurface } from './GlassSurface'

const TYP_LABEL: Record<string, string> = {
  'kfz-gutachter': 'Kfz-Sachverständiger',
}

// AAR-956 (Aaron 12.06.): EIN geteilter Popup-Wrapper für SV-Profil UND Dead-Pin-
// Light-Profil — damit beide exakt dieselbe Shell/Größe/Optik/Anchor haben. Das
// Light-Profil ist optisch ein vollwertiges Profil, nur mit leak-safem Inhalt.
function PopupCard({ children }: { children: React.ReactNode }) {
  return (
    <GlassSurface className="flex min-w-[270px] max-w-[330px] flex-col gap-3.5 p-5">
      {children}
    </GlassSurface>
  )
}

// Avatar-Kreis (Ondo-Fill) — geteilt: SV zeigt die Vorname-Initiale, Dead-Pin ein Pin-Icon.
function PopupAvatar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo text-heading-sm font-extrabold text-white">
      {children}
    </div>
  )
}

// Chip exakt im Marketing-Stil (claimondo.de): heller, umrandeter Pill mit shield-Text.
function Chip({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full border bg-claimondo-bg px-3 py-1 text-[0.8125rem] font-semibold text-claimondo-shield',
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
      <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/60">
        {titel}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function SvProfilePopup({ sv }: { sv: AktiverSVPublic }) {
  const stadt = sv.stadt ?? 'Ihrer Region'
  const initiale = sv.vorname_initiale ?? '·'
  const rolle = (sv.gutachter_typ ? TYP_LABEL[sv.gutachter_typ] : undefined) ?? 'Sachverständiger'
  const hatBewertung = sv.bewertungs_durchschnitt !== null && sv.bewertungs_anzahl !== null
  const specs = sv.spezifikationen_alle.length > 0 ? sv.spezifikationen_alle : sv.spezifikationen_top3
  const specsShown = specs.slice(0, 8)
  const specsRest = specs.length - specsShown.length
  const hatCredentials = sv.oeffentlich_bestellt || sv.mitgliedschaften.length > 0 || sv.qualifikationen.length > 0

  return (
    <PopupCard>
      {/* Kopf — Avatar + Rolle/Region + Verifiziert-Marker */}
      <div className="flex items-center gap-3">
        <PopupAvatar>{initiale}</PopupAvatar>
        <div className="min-w-0">
          {/* Vorname NUR bei aktiven Partnern (Aaron 12.06.) — dieses Popup wird ausschließlich für
              verifizierte SVs gerendert; Dead-Pins haben den anonymen DeadPinProfilePopup. */}
          {sv.vorname ? (
            <>
              <div className="text-body-sm font-bold leading-tight text-claimondo-navy">{sv.vorname}</div>
              <div className="text-[0.8125rem] font-medium text-claimondo-shield/80">
                {rolle} in {stadt}
              </div>
            </>
          ) : (
            <div className="text-body-sm font-bold leading-tight text-claimondo-navy">
              {rolle} in {stadt}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1 text-[0.8125rem] font-medium text-claimondo-shield/80">
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
            Verifizierter Claimondo-Partner
          </div>
        </div>
      </div>

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
          {sv.schadenarten.slice(0, 6).map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
          {sv.schadenarten.length > 6 && <Chip>+{sv.schadenarten.length - 6} weitere</Chip>}
        </Section>
      )}

      <p className="text-[0.8125rem] leading-relaxed text-claimondo-shield/60">
        Den passenden Gutachter wählt das System anhand Ihres Schadenorts.
      </p>
    </PopupCard>
  )
}

// AAR-956 Dead-Pin-Light-Profil (Aaron 12.06.: „selber Wrapper wie die normalen Profile").
// Leak-safe — KEIN Name/Firma/Reviews/Specs (ein Dead-Pin ist ein nicht-verifizierter
// sv_lead). Nur Region (ort) + generischer Verfügbarkeits-Hinweis, in DERSELBEN PopupCard +
// demselben Avatar/Kopf-Layout wie SvProfilePopup → optische Parität.
export function DeadPinProfilePopup({ ort }: { ort: string | null }) {
  const region = ort ?? 'Ihrer Nähe'
  return (
    <PopupCard>
      <div className="flex items-center gap-3">
        <PopupAvatar>
          <MapPin className="h-6 w-6" />
        </PopupAvatar>
        <div className="min-w-0">
          <div className="text-body-sm font-bold leading-tight text-claimondo-navy">
            Kfz-Gutachter in {region}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[0.8125rem] font-medium text-claimondo-shield/80">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            Termin online reservierbar
          </div>
        </div>
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-claimondo-shield/60">
        Wählen Sie einen Wunschtermin — wir bestätigen ihn nach Ihrer Anfrage telefonisch.
      </p>
    </PopupCard>
  )
}
