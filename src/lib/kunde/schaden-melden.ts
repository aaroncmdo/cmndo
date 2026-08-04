// Sub-Projekt 1 (Kunde-Portal 1+): In-Portal-Schadenmeldung — reine Eingabe-
// Validierung + Mapping auf die createLead-Inputs (base + extra). Die Orchestrierung
// (createLead -> convertLeadToFall -> ensureVehicleForClaim) liegt in
// src/app/kunde/schaden-melden/actions.ts. Diese Datei ist bewusst pure + testbar:
// keine DB, keine Seiteneffekte, damit die Feld-/Whitelist-Logik golden-getestet ist.
//
// Spaltennamen 06.07. gegen information_schema.leads verifiziert (kein Raten):
//   base:  source_channel,status,vorname,nachname,telefon,email
//   extra: kunde_id,schadens_art,unfalldatum,unfall_uhrzeit,unfallhergang,unfallort,
//          fahrzeug_standort_plz,fahrzeug_standort_adresse,kennzeichen,
//          fahrzeug_hersteller,fahrzeug_modell,gegner_bekannt,ist_fahrzeughalter,
//          qualifizierungs_phase,sprache,schuldfrage,eigene_versicherung

import { qualiAusSchadensart } from '@/lib/werkstatt/abrechnungsweg'

export const SCHADENSARTEN = ['haftpflicht', 'vollkasko', 'teilkasko', 'eigenverschulden', 'unbekannt'] as const
export type Schadensart = (typeof SCHADENSARTEN)[number]

export type SchadenMeldenForm = {
  kennzeichen?: string | null
  fahrzeugHersteller?: string | null
  fahrzeugModell?: string | null
  unfalldatum?: string | null // ISO yyyy-mm-dd
  unfallUhrzeit?: string | null
  unfallhergang?: string | null
  unfallort?: string | null // Adresse/Strasse des Schadenorts
  schadenPlz?: string | null // Pflicht, 5-stellig (Dispatch-Anker)
  schadensart?: string | null // wird gegen Whitelist normalisiert
  gegnerBekannt?: boolean | null
  istFahrzeughalter?: boolean | null
}

export type KundeKontext = {
  userId: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
  sprache?: string | null
}

export type LeadBaseInput = {
  source_channel: string
  status: 'neu'
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
}

export type LeadExtraInput = {
  kunde_id: string
  schadens_art: Schadensart
  // Abrechnungsweg-Audit (03.08.): Quali-Achse aus schadens_art abgeleitet, sonst abrechnungsweg=null beim Convert.
  schuldfrage: 'gegner' | 'eigenverantwortung' | null
  eigene_versicherung: 'ja' | 'nein' | null
  unfalldatum: string | null
  unfall_uhrzeit: string | null
  unfallhergang: string | null
  unfallort: string | null
  fahrzeug_standort_plz: string
  unfallort_plz: string
  fahrzeug_standort_adresse: string | null
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  gegner_bekannt: boolean
  ist_fahrzeughalter: boolean
  qualifizierungs_phase: 'konvertiert'
  sprache: string | null
}

export type BuildResult =
  | { ok: true; base: LeadBaseInput; extra: LeadExtraInput }
  | { ok: false; error: string }

const PLZ_RE = /^\d{5}$/

/** Freitext trimmen; leere Strings -> null (saubere Nullwerte statt ''). */
function clean(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  return t.length > 0 ? t : null
}

/** Unbekannte/ungueltige Schadensart faellt sicher auf 'unbekannt' (wie der Converter). */
export function normalizeSchadensart(v: string | null | undefined): Schadensart {
  return (SCHADENSARTEN as readonly string[]).includes(v ?? '') ? (v as Schadensart) : 'unbekannt'
}

/**
 * Validiert das Wizard-Formular + baut die createLead-Inputs. PLZ (5-stellig)
 * ist Pflicht — sie ist der Dispatch-/Gutachter-Anker. kunde_id setzt den
 * Kunden als geschaedigter (sonst findet getKundeFaelle den Fall nicht).
 */
export function buildSchadenLeadInput(form: SchadenMeldenForm, kunde: KundeKontext): BuildResult {
  if (!kunde.userId) {
    return { ok: false, error: 'Kein eingeloggter Kunde.' }
  }
  const plz = (form.schadenPlz ?? '').trim()
  if (!PLZ_RE.test(plz)) {
    return { ok: false, error: 'Bitte eine gültige 5-stellige PLZ des Schadenorts angeben.' }
  }
  const adresse = clean(form.unfallort)
  const base: LeadBaseInput = {
    source_channel: 'kunde_portal',
    status: 'neu',
    vorname: clean(kunde.vorname),
    nachname: clean(kunde.nachname),
    telefon: clean(kunde.telefon),
    email: clean(kunde.email),
  }
  const schadensart = normalizeSchadensart(form.schadensart)
  const quali = qualiAusSchadensart(schadensart)
  const extra: LeadExtraInput = {
    kunde_id: kunde.userId,
    schadens_art: schadensart,
    // Quali aus der Versicherungs-Klassifikation (sonst abrechnungsweg=null beim Sofort-Convert)
    schuldfrage: quali?.schuldfrage ?? null,
    eigene_versicherung: quali?.eigeneVersicherung ?? null,
    unfalldatum: clean(form.unfalldatum),
    unfall_uhrzeit: clean(form.unfallUhrzeit),
    unfallhergang: clean(form.unfallhergang),
    unfallort: adresse,
    fahrzeug_standort_plz: plz,
    // B5-Fix (Entry-Point-Audit): die Pflicht-PLZ des Schadenorts ZUSAETZLICH nach unfallort_plz —
    // convertLeadToClaim liest claims.schadenort_plz aus lead.unfallort_plz (das bisher nie befuellt
    // wurde, F6/Aaron 14.07. "Form-Wiring folgt"). Ohne das strandete die Pflicht-PLZ am Lead.
    unfallort_plz: plz,
    // Kunde-Selbstmeldung: der genannte Schadenort ist zugleich der Fahrzeug-Standort.
    fahrzeug_standort_adresse: adresse,
    kennzeichen: clean(form.kennzeichen),
    fahrzeug_hersteller: clean(form.fahrzeugHersteller),
    fahrzeug_modell: clean(form.fahrzeugModell),
    gegner_bekannt: form.gegnerBekannt ?? false,
    ist_fahrzeughalter: form.istFahrzeughalter ?? true,
    qualifizierungs_phase: 'konvertiert',
    sprache: clean(kunde.sprache) ?? 'de',
  }
  return { ok: true, base, extra }
}
