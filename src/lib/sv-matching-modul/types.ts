// AAR-941: Self-Service SV-Matching-Modul — Typen.
// Eine Quelle fuer Dispatch + /gutachter-finden + Self-Service-Wizard.

import type { SvMatchCandidate } from '@/lib/dispatch/findBestSV'

/**
 * Slot-Vorschlag in der kundensicheren Projektion. Nur ISO-Strings +
 * matchType-Ranking — kein internes Termin-/SV-Objekt.
 */
export type SlotVorschlag = {
  start: string // ISO
  end: string // ISO
  matchType: 'wunschtermin' | 'gleicher_tag' | 'nahe' | 'nach'
}

/**
 * KUNDENSICHERE SV-Projektion (AAR-941, Aaron 31.05. gelockt).
 *
 * NUR diese Felder gehen an den anon-Kunden. NIEMALS: score, reasons,
 * kontingentFrei, ablehnungen30d, paket, exakte ETA-Minuten, nachname,
 * interne FreeBusy-Details, Telefon/Email des SV (bis der Termin steht).
 *
 * `svId` ist ein opakes Buchungs-Handle (UUID) — downstream RLS-geschuetzt
 * (gutachter_termine/sachverstaendige sind nicht anon-lesbar), keine PII.
 */
export type OeffentlichesSvProfil = {
  svId: string
  vorname: string
  profilbild: string | null
  profilbeschreibung: string | null
  bewertungDurchschnitt: number | null
  bewertungAnzahl: number | null
  bewertungAktualisiert: string | null
  /** Datenschutz-gerundet, z.B. "ca. 10 km" — nie exakte Route/ETA. */
  distanzGerundet: string
  /** Fuer die Fall-A/Fall-B-UX (Prio-1 zur Wunschzeit frei?). */
  istWunschterminFrei: boolean
  slots: SlotVorschlag[]
}

/** Google-Bewertung aus google_bewertungen_cache (batch-nachgeladen). */
export type SvBewertung = {
  durchschnitt: number | null
  anzahl: number | null
  aktualisiert: string | null
}

/** Frische profiles-Felder (findBestSV liefert nur vorname+nachname). */
export type SvProfilFelder = {
  vorname: string | null
  avatar_url: string | null
  profilbeschreibung: string | null
}

export type ProjektionInput = {
  candidate: SvMatchCandidate
  bewertung: SvBewertung | null
  profil: SvProfilFelder | null
  slots: SlotVorschlag[]
}
