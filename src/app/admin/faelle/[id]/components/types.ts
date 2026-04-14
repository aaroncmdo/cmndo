// AAR-56 Welle 1: Zentrale Types fuer die FallakteClient Sub-Komponenten
// Extrahiert aus FallakteClient.tsx. Kann spaeter weitere Felder ergaenzen.

export type Fall = Record<string, unknown> & {
  id: string
  fall_nummer: string | null
  status: string
  lead_id: string | null
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  sv_id: string | null
  sv_termin: string | null
  kundenbetreuer_id: string | null
  versicherung_name: string | null
  anschlussschreiben_am: string | null
  regulierung_betrag: number | null
  ist_totalschaden: boolean | null
  mandatsnummer: string | null
  prioritaet: string | null
}

export type Lead = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  schadenfall_typ: string | null
  kunden_konstellation: string | null
  mandatstyp: string | null
  vollmacht_unterschrieben: boolean | null
} | null

export type Profile = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

export type SV = {
  id: string
  paket: string
  profile: { vorname: string | null; nachname: string | null; telefon: string | null; email: string | null } | null
} | null

export type Dokument = {
  id: string
  typ: string
  datei_url: string
  datei_name: string | null
  datei_groesse: number | null
  created_at: string
  kategorie: string | null
  hochgeladen_von: string | null
  hochgeladen_von_rolle: string | null
  quelle: string | null
  sichtbar_fuer: string[] | null
}

export type TimelineEvent = {
  id: string
  typ: string
  titel: string
  beschreibung?: string | null
  erstellt_von?: string | null
  lead_id?: string | null
  created_at: string
}

export type Task = {
  id: string
  titel: string
  status: string
  prioritaet: string | null
  faellig_am: string | null
  auto_erstellt: boolean
  lead_id?: string | null
  created_at: string
}

export type Nachricht = {
  id: string
  kanal: string
  sender_id: string | null
  sender_rolle?: string | null
  nachricht: string
  hat_anhang: boolean
  anhang_url: string | null
  lead_id?: string | null
  created_at: string
}

export type Tab =
  | 'uebersicht'
  | 'dokumente'
  | 'dateien'
  | 'qc'
  | 'timeline'
  | 'kommunikation'
  | 'kanzlei'
  | 'chat'
  | 'abrechnung'
  | 'tasks'
  | 'vs-regulierung'
