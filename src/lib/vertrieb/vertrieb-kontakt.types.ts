// src/lib/vertrieb/vertrieb-kontakt.types.ts
// Vertrieb-CRM P0: die vereinte "Vertrieb-Kontakt"-Projektion (Lead ODER aktiver
// Partner) über alle 5 Silos. Schmales gemeinsames Schema mit kind-Discriminant +
// den rohen stufe-Treibern je kind (nur das jeweils Relevante gefüllt).
// Eigene Abstraktion (Partner-Beziehung) — NICHT die ops-WorkItem-Union.
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

export type VertriebKind = 'sv-lead' | 'partner-lead' | 'sv' | 'makler' | 'werkstatt'

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
}

export type VertriebKontakt = VertriebKontaktRow & { stufe: VertriebStufe }
