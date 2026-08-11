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
 * AUSNAHME (13b LOCKED — loest die fruehere AAR-956-paket-Ableitung ab):
 * `istTopPartner` ist das Netzwerkpartner-ABO-PRAEDIKAT (istNetzwerkpartner,
 * aus ladeZahlendeSvSet), NICHT der rohe paket-Wert — ein SV mit aktivem/
 * comped Abo in sv_netzwerk_abonnements → true, alle anderen (auch jedes
 * paket) → false. Bewusst als Produkt-Feature (Partner-Sichtbarkeit), nicht als
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
   * 13b LOCKED (K3): folgt dem Netzwerkpartner-Abo-Praedikat (istNetzwerkpartner),
   * NICHT paket — ein SV mit aktivem/comped Abo → true, sonst (auch premium/pro/
   * standard ohne Abo) → false. Fail-closed: fehlt istNetzwerkpartner am Input, ist
   * istTopPartner false. NUR fuer die visuelle Hervorhebung im Embed-Slot-Picker.
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
  /**
   * Ebene-2 (relational, Design §5.2): dieser SV ist ein ZAHLENDER Freund des attribuierenden
   * Owners (?werkstatt=<id> → Freundes-Graph ∩ Netzwerkpartner-Abo). Nur gesetzt, wenn ein Owner
   * injiziert wurde; sonst false. Steuert die "Netzwerkpartner"-Hervorhebung im Slot-Picker
   * (SvSlotAuswahl-Badge, Aaron 09.08.: Wortlaut "Netzwerkpartner", NICHT "In Ihrem Netzwerk" —
   * es ist das Netzwerk des Owners/der Werkstatt, nicht des Kunden) + die Gold-Pin-Prominenz (#5111).
   */
  imNetzwerk: boolean
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
  /** 13b: zahlender Netzwerkpartner (Abo, aus ladeZahlendeSvSet). Loest die paket-basierte
   *  istTopPartner-Plakette ab. Vom Loader batch-gesetzt; fehlt er -> false (fail-closed). */
  istNetzwerkpartner?: boolean
  /** Ebene-2 (relational): zahlender Freund des attribuierenden Owners. Fehlt -> false. */
  imNetzwerk?: boolean
}
