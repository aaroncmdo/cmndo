// Pure Anzeige-Auflösung (Namens-Priorität), keine DB.
import type { NetzwerkRolle } from './types'

export type PartnerAnzeige = { profilId: string; rolle: NetzwerkRolle; name: string; ort: string | null }
type ProfilRow = {
  id: string
  rolle: string
  anzeigename: string | null
  vorname: string | null
  nachname: string | null
  firma: string | null
  ort: string | null
}
type SvRow = { firmenname: string | null } | null
type WerkstattRow = { name: string | null; adresse_ort: string | null } | null

export function bauePartnerAnzeige(
  profil: ProfilRow,
  sv: SvRow,
  werkstatt: WerkstattRow,
  flotteFirma: string | null = null,
): PartnerAnzeige {
  const nameAusProfil =
    profil.anzeigename ||
    [profil.vorname, profil.nachname].filter(Boolean).join(' ').trim() ||
    profil.firma ||
    'Partner'
  // Flotten-Firmenname (firmen_flotten_konten -> firmen.name) hat Vorrang vor dem Kontakt-Vornamen.
  const name = sv?.firmenname || werkstatt?.name || flotteFirma || nameAusProfil
  const ort = werkstatt?.adresse_ort ?? profil.ort ?? null
  return { profilId: profil.id, rolle: profil.rolle as NetzwerkRolle, name, ort }
}
