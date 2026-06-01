// AAR-941: Daten-Leak-Schutz — Projektion vom internen SvMatchCandidate auf
// das kundensichere OeffentlichesSvProfil. Die Self-Service-UI bekommt NUR
// das Ergebnis dieser Funktion, nie das rohe candidate-Objekt.

import type { OeffentlichesSvProfil, ProjektionInput } from './types'

/**
 * Distanz datenschutz-gerundet auf 5-km-Schritte, Minimum 5 km.
 * "ca. 10 km" — verraet nie die exakte Entfernung/Route (Aaron 31.05.).
 */
export function rundeDistanz(km: number): string {
  const sicher = Number.isFinite(km) && km > 0 ? km : 0
  const gerundet = Math.max(5, Math.round(sicher / 5) * 5)
  return `ca. ${gerundet} km`
}

/**
 * Baut aus dem internen (leaky) SvMatchCandidate + Bewertung + frischen
 * profiles-Feldern + Slots die kundensichere Projektion. Es werden
 * AUSSCHLIESSLICH Whitelist-Felder gesetzt — score/reasons/paket/
 * kontingentFrei/ablehnungen30d/etaFromBueroMin/nachname verlassen diese
 * Funktion nie. Vorname kommt aus profiles (nie candidate.name, das den
 * Nachnamen enthaelt).
 */
export function toOeffentlichesSvProfil(input: ProjektionInput): OeffentlichesSvProfil {
  const { candidate, bewertung, profil, slots } = input
  const vorname = (profil?.vorname ?? '').trim()
  return {
    svId: candidate.svId,
    vorname: vorname.length > 0 ? vorname : 'Ihr Gutachter',
    profilbild: profil?.avatar_url ?? null,
    profilbeschreibung: profil?.profilbeschreibung ?? null,
    bewertungDurchschnitt: bewertung?.durchschnitt ?? null,
    bewertungAnzahl: bewertung?.anzahl ?? null,
    bewertungAktualisiert: bewertung?.aktualisiert ?? null,
    distanzGerundet: rundeDistanz(candidate.distanzKm),
    istWunschterminFrei: candidate.verfuegbarAmWunschtermin === true,
    slots,
  }
}
