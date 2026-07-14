// src/lib/vertrieb/vertrieb-kontakt.types.ts
// Vertrieb-CRM P0: die vereinte "Vertrieb-Kontakt"-Projektion (Lead ODER aktiver
// Partner) über alle 5 Silos. Schmales gemeinsames Schema mit kind-Discriminant +
// den rohen stufe-Treibern je kind (nur das jeweils Relevante gefüllt).
// Eigene Abstraktion (Partner-Beziehung) — NICHT die ops-WorkItem-Union.
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

// P1: sv-lead entfällt — Leads kommen nur noch aus partner_leads (role-getaggt).
// sv_leads (Dead-Pins) bleiben nur in der getDeadPins-Karte, nicht in dieser View.
export type VertriebKind = 'partner-lead' | 'sv' | 'makler' | 'werkstatt' | 'firmen-flotte'

/** P1 Typ×Rolle-Modell: die zwei UI-Achsen. */
export type VertriebRolle = 'sv' | 'makler' | 'werkstatt' | 'firmen-flotte'
export type VertriebTyp = 'partner' | 'lead'

/** Rohzeile aus v_vertrieb_kontakt (Task 3) — Spalten == diese Felder. */
export type VertriebKontaktRow = {
  id: string
  kind: VertriebKind
  name: string | null
  email: string | null
  telefon: string | null
  plz: string | null
  ort: string | null
  lat: number | null
  lng: number | null
  owner_id: string | null
  quelle: string | null
  erstellt_am: string | null
  // rohe stufe-Treiber (nullable, nur das je kind Relevante gefüllt):
  roh_status: string | null // makler/werkstatt/partner_leads.status
  roh_ist_aktiv: boolean | null // sv/sv_leads.ist_aktiv
  roh_gesperrt: boolean | null // gesperrt_seit/gesperrt_am != null
  roh_verifiziert: boolean | null // sv.verifiziert
  roh_portal_zugang: boolean | null // sv.portal_zugang_freigeschaltet
  roh_onboarding_offen: boolean | null // sv: !vertrag ∨ verif-offen ; makler/ws: !onboarding_abgeschlossen
  roh_warteliste: string | null // sv_leads.warteliste_status/claim_status
  notizen: string | null // P2.1: vereinheitlichtes Notizen-Feld (sv.notizen / partner_leads.notiz / …)
  rolle: string | null // P1: View liefert 'sv'|'makler'|'werkstatt' (partner_leads.rolle normalisiert)
}

// P1: + abgeleitete UI-Achsen typ (Partner/Lead) und rolle (SV/Makler/Werkstatt).
export type VertriebKontakt = VertriebKontaktRow & {
  stufe: VertriebStufe
  typ: VertriebTyp
  rolle: VertriebRolle
}
