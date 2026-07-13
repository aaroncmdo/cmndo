// Vertrieb-CRM P2: Lead-Detail-Typen + reine Mapping-Fn (DRY, testbar; KEIN 'use server').
export type LeadAktivitaet = {
  id: string
  typ: string
  text: string | null
  erstellt_von_name: string | null
  erstellt_am: string
}

export type VertriebLeadDetail = {
  id: string
  status: string
  einstufung: string | null
  notiz: string | null
  ansprechpartner: {
    vorname: string | null
    nachname: string | null
    position: string | null
    email: string | null
    telefon: string | null
  }
  aktivitaeten: LeadAktivitaet[]
}

type LeadRow = {
  id: string
  status: string
  einstufung: string | null
  notiz: string | null
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
  ansprechpartner_position: string | null
  ansprechpartner_email: string | null
  ansprechpartner_telefon: string | null
}
type AktRow = { id: string; typ: string; text: string | null; erstellt_von: string | null; erstellt_am: string }

/** Reine Fn: rohe Lead- + Aktivitaets-Zeilen + Namens-Map -> VertriebLeadDetail. */
export function mapLeadDetail(lead: LeadRow, akts: AktRow[], nameById: Record<string, string>): VertriebLeadDetail {
  return {
    id: lead.id,
    status: lead.status,
    einstufung: lead.einstufung,
    notiz: lead.notiz,
    ansprechpartner: {
      vorname: lead.ansprechpartner_vorname,
      nachname: lead.ansprechpartner_nachname,
      position: lead.ansprechpartner_position,
      email: lead.ansprechpartner_email,
      telefon: lead.ansprechpartner_telefon,
    },
    aktivitaeten: akts.map((a) => ({
      id: a.id,
      typ: a.typ,
      text: a.text,
      erstellt_am: a.erstellt_am,
      erstellt_von_name: a.erstellt_von ? (nameById[a.erstellt_von] ?? null) : null,
    })),
  }
}
