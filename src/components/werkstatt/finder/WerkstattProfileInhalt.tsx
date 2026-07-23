'use client'

// Geteilter Werkstatt-Profil-Inhalt (ohne Surface) — analog SvProfileInhalt, abgespeckt.
// Fuers Embed-Map-Pin-Popup (voll) + wiederverwendbar. Reine Anzeige, keine Logik.
// Named (Werkstatt-Firmenname). KEIN Rang/Credentials/Einsatzgebiet/Schadenarten/Bio.

import { ShieldCheck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { istBelastbareBewertung, type MatchGrund } from '@/lib/werkstatt/matching/rank-vorschlaege'

export type WerkstattProfilData = {
  name: string
  ort: string | null
  verifiziert: boolean
  googleRating: number | null
  googleAnzahl: number | null
  gruende: MatchGrund[]
  distanzKm?: number
  fahrzeugGruppen?: string[] | null
}

const GRUPPE_LABEL: Record<string, string> = {
  pkw: 'PKW',
  transporter: 'Transporter',
  lkw: 'LKW',
  wohnmobil: 'Wohnmobil',
  motorrad: 'Motorrad',
}

// Chip im Marketing-Stil (wie SvProfileInhalt.Chip) — <span>, kein handrolled Button/Card.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-claimondo-border bg-claimondo-bg px-2.5 py-0.5 text-[0.75rem] font-semibold text-claimondo-shield">
      {children}
    </span>
  )
}

export function WerkstattProfileInhalt({
  data,
  gross = false,
  zeigeFahrzeugGruppen = false,
  zeigeDistanz = false,
}: {
  data: WerkstattProfilData
  gross?: boolean
  zeigeFahrzeugGruppen?: boolean
  zeigeDistanz?: boolean
}) {
  const ort = data.ort ?? 'Ihrer Nähe'
  // Badge nur bei belastbarer Bewertung (>= 4,0 & >= 5) — konsistent mit dem Ranking-Chip.
  const hatBewertung = istBelastbareBewertung(data.googleRating, data.googleAnzahl)
  // marke + gewerk als Chips; distanz/trust raus (stehen anderswo — wie in der WerkstattFinder-Card).
  const grundChips = data.gruende.filter((g) => g.typ === 'marke' || g.typ === 'gewerk')
  const gruppen = (data.fahrzeugGruppen ?? []).map((g) => GRUPPE_LABEL[g] ?? g)
  const zeigeDistanzZeile = zeigeDistanz && data.distanzKm != null && Number.isFinite(data.distanzKm)

  return (
    <div className="flex flex-col gap-2.5">
      {/* Kopf: Icon + Firmenname + Region + Verifiziert-Marker */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo text-white',
            gross ? 'h-14 w-14' : 'h-10 w-10',
          )}
        >
          <Wrench className={gross ? 'h-6 w-6' : 'h-5 w-5'} />
        </div>
        <div className="min-w-0">
          <div className={cn('font-bold leading-tight text-claimondo-navy', gross ? 'text-body' : 'text-body-sm')}>
            {data.name}
          </div>
          <div className="text-[0.8125rem] font-medium text-claimondo-shield/80">Werkstatt in {ort}</div>
          {data.verifiziert && (
            <div className="mt-1 flex items-center gap-1 text-[0.8125rem] font-medium text-claimondo-shield/80">
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Verifizierter Claimondo-Partner
            </div>
          )}
        </div>
      </div>

      {/* Bewertung (+ optional Distanz) */}
      {(hatBewertung || zeigeDistanzZeile) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {hatBewertung && <GoogleBewertungBadge durchschnitt={data.googleRating} anzahl={data.googleAnzahl} size="sm" />}
          {zeigeDistanzZeile && (
            <span className="text-[0.8125rem] font-medium text-claimondo-shield/80">
              {data.distanzKm!.toFixed(1).replace('.', ',')} km entfernt
            </span>
          )}
        </div>
      )}

      {/* Marken- + Gewerke-Chips */}
      {grundChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {grundChips.map((g, i) => (
            <Chip key={`${g.typ}-${i}`}>{g.text}</Chip>
          ))}
        </div>
      )}

      {/* Optional: Fahrzeug-Gruppen */}
      {zeigeFahrzeugGruppen && gruppen.length > 0 && (
        <div>
          <div className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/60">
            Bedient
          </div>
          <div className="flex flex-wrap gap-2">
            {gruppen.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
