'use client'

// Embed-Map-Pin-Profil: GlassSurface-Shell (wie SvProfilePopup) + geteiltes WerkstattProfileInhalt.
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { WerkstattProfileInhalt, type WerkstattProfilData } from '@/components/werkstatt/finder/WerkstattProfileInhalt'
import { GlassSurface } from './GlassSurface'

// Exportiert: auch der Mobil-Bottom-Sheet (WerkstattProfileSheet) mappt Vorschlag -> Profil-Daten.
export function toProfil(w: WerkstattVorschlag): WerkstattProfilData {
  return {
    name: w.name,
    ort: w.adresse_ort ?? null,
    verifiziert: w.verifiziert === true,
    googleRating: w.google_rating ?? null,
    googleAnzahl: w.google_review_count ?? null,
    gruende: w.gruende,
    distanzKm: w.distanz_km,
    fahrzeugGruppen: w.fahrzeug_gruppen,
  }
}

export function WerkstattProfilePopup({ w }: { w: WerkstattVorschlag }) {
  return (
    <GlassSurface className="min-w-[260px] max-w-[330px] p-4">
      <WerkstattProfileInhalt data={toProfil(w)} gross zeigeDistanz zeigeFahrzeugGruppen />
    </GlassSurface>
  )
}
