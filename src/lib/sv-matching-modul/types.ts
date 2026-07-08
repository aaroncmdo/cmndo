// AAR-941: Self-Service SV-Matching-Modul — Typen.
// Eine Quelle fuer Dispatch + /gutachter-finden + Self-Service-Wizard.

import type { SvMatchCandidate } from '@/lib/dispatch/findBestSV'
import type { Tier } from '@/lib/partner-rang/types'

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
 * AUSNAHME (Aaron 14.06., AAR-956): `istTopPartner` ist ein ABGELEITETES
 * Boolean (paket !== 'basic'), NICHT der rohe paket-Wert — es signalisiert dem
 * Slot-Picker nur, ob ein zahlender Partner (Tier-1) oder ein Basic-SV (Tier-2)
 * vorliegt, damit Tier-1 sichtbar hervorgehoben wird. Der exakte paket-Tier
 * (premium/pro/standard) bleibt verborgen — premium/pro/standard kollabieren
 * alle zu `true`. Bewusst als Produkt-Feature (Partner-Sichtbarkeit), nicht als
 * Leck: nur die Partner-JA/NEIN-Stufe verlaesst das Modul.
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
  /**
   * AAR-956 (Aaron 14.06.): abgeleitet aus paket !== 'basic'. Tier-1 = zahlender
   * Partner (premium/pro/standard) → true; Tier-2 = Basic-SV → false. NUR fuer die
   * visuelle Hervorhebung im Embed-Slot-Picker; verraet den exakten paket-Tier nie.
   */
  istTopPartner: boolean
  /**
   * AAR-956 Partner-Tier: verdienter Rang (Bronze/Silber/Gold) aus partner_rang;
   * null = kein oeffentlicher Rang. Loest die paket-basierte istTopPartner-Plakette
   * im Slot-Picker durch ein ehrliches Tier-Signal ab. (istTopPartner bleibt fuer
   * die bestehende API-v1-Back-Compat im Typ.)
   */
  rang: Tier | null
  rangSinnsatz: string | null
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
  /** Verdienter Partner-Rang (aus partner_rang, vom Loader batch-nachgeladen). Optional:
   *  nur der Loader setzt ihn; fehlt er, projiziert toOeffentlichesSvProfil rang=null. */
  rang?: { tier: Tier; sinnsatz: string | null } | null
}
