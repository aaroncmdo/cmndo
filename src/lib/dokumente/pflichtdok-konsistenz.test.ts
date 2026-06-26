// Smoke / Konsistenz-Test: "Werden die richtigen Pflichtdokumente abgefragt,
// je nachdem was der Kunde angegeben hat?"
//
// Hintergrund (Audit 2026-06-26): Es existieren VIER parallele Definitionen,
// welche Dokumente erwartet werden, die voneinander abweichen:
//   1. data-requirements.ts  DOC_DEFINITIONS (8 hardcoded Slots)
//        -> getOffeneDokumentAnforderungen()  = OPERATIVE Anzeige für
//           Kunde-Onboarding-Wizard + SV/KB-Fallakte + Banner
//   2. erwartung.ts          berechneErwartung()  = dokumentierte "SSoT",
//           genutzt von Dispatch-DokumenteAnfordernCard
//   3. dokument_katalog (DB) Rule-DSL freigeschaltet_wenn/pflicht_wenn
//   4. create-pflicht.ts     Supplementär-Block (nur 5 Slots; Katalog-Loop entfernt)
//
// Dieser Test sperrt die KONSISTENZ der beiden importierbaren reinen
// Quellen (1) und (2) gegen die konfigurierte Absicht des Katalogs (3) fest.
//
// GRÜNE Tests = Fälle, in denen alle Quellen übereinstimmen (Regressionsschutz).
// it.fails-Tests = bekannte DRIFTS. Sie sind erwartet-rot → die Suite bleibt
//   grün UND dokumentiert den Bug. Sobald jemand den Bug fixt, schlägt der
//   it.fails-Test in "unerwartet grün" um → Signal, das it.fails zu entfernen.

import { describe, it, expect } from 'vitest'
import { berechneErwartung } from './erwartung'
import { getOffeneDokumentAnforderungen } from '../claims/data-requirements'
import type { ClaimFull } from '../claims/types'

type Szenario = {
  personenschaden?: boolean
  sachschaden?: boolean
  polizeiVorOrt?: boolean
  fahrerflucht?: boolean
  leasing?: boolean
  zeugen?: boolean
  zb1Status?: string
}

// Szenario -> Lead-Datensatz (Vertrag von berechneErwartung).
function leadFrom(s: Szenario): Parameters<typeof berechneErwartung>[0] {
  return {
    zb1_status: s.zb1Status ?? 'offen',
    polizei_vor_ort: s.polizeiVorOrt ?? false,
    polizeibericht_pflicht: s.polizeiVorOrt ?? false,
    fahrerflucht: s.fahrerflucht ?? false,
    personenschaden_flag: s.personenschaden ?? false,
    sachschaden_flag: s.sachschaden ?? false,
    zeugen_vorhanden: s.zeugen ?? false,
    finanzierung_leasing: s.leasing ? 'leasing' : 'keine',
  }
}

// Szenario -> minimaler Claim (getOffeneDokumentAnforderungen liest nur
// polizei_vor_ort / hat_personenschaden / hat_sachschaden). convertLeadToClaim
// mappt personenschaden_flag->hat_personenschaden, sachschaden_flag->hat_sachschaden,
// polizei_vor_ort 1:1 (convert-lead-to-claim.ts:282-293).
function claimFrom(s: Szenario): ClaimFull {
  return {
    polizei_vor_ort: s.polizeiVorOrt ?? false,
    hat_personenschaden: s.personenschaden ?? false,
    hat_sachschaden: s.sachschaden ?? false,
  } as unknown as ClaimFull
}

// Pflicht-Slot-IDs aus berechneErwartung (Quelle 2).
function erwartungPflicht(s: Szenario): Set<string> {
  return new Set(
    berechneErwartung(leadFrom(s))
      .filter((x) => x.pflicht)
      .map((x) => x.slot_id),
  )
}

// Pflicht-Slot-IDs aus der OPERATIVEN Kunde-Anzeige (Quelle 1).
function dataReqPflicht(s: Szenario): Set<string> {
  return new Set(
    getOffeneDokumentAnforderungen(claimFrom(s), [], s.zb1Status ?? 'offen')
      .filter((x) => x.pflicht)
      .map((x) => x.slot_id),
  )
}

describe('Pflichtdokumente-Konsistenz: erwartung vs. operative Kunde-Anzeige', () => {
  // ─── GRÜN: konsistente Fälle (Regressionsschutz) ─────────────────────────

  it('Standard-Schaden: fahrzeugschein ist in BEIDEN Quellen Pflicht', () => {
    expect(erwartungPflicht({}).has('fahrzeugschein')).toBe(true)
    expect(dataReqPflicht({}).has('fahrzeugschein')).toBe(true)
  })

  it('Standard-Schaden: Unfallfotos sind in BEIDEN Quellen Pflicht', () => {
    expect(erwartungPflicht({}).has('unfallfotos')).toBe(true)
    expect(dataReqPflicht({}).has('unfallfotos')).toBe(true)
  })

  it('Personenschaden: aerztliches_attest ist in BEIDEN Quellen Pflicht', () => {
    expect(erwartungPflicht({ personenschaden: true }).has('aerztliches_attest')).toBe(true)
    expect(dataReqPflicht({ personenschaden: true }).has('aerztliches_attest')).toBe(true)
  })

  it('Sachschaden: sachschaden_foto ist in BEIDEN Quellen Pflicht', () => {
    expect(erwartungPflicht({ sachschaden: true }).has('sachschaden_foto')).toBe(true)
    expect(dataReqPflicht({ sachschaden: true }).has('sachschaden_foto')).toBe(true)
  })

  it('ZB1 bereits bestätigt: fahrzeugschein ist in BEIDEN Quellen NICHT Pflicht', () => {
    expect(erwartungPflicht({ zb1Status: 'bestaetigt' }).has('fahrzeugschein')).toBe(false)
    expect(dataReqPflicht({ zb1Status: 'bestaetigt' }).has('fahrzeugschein')).toBe(false)
  })

  it('Polizei vor Ort: polizeibericht ist in BEIDEN Quellen Pflicht', () => {
    expect(erwartungPflicht({ polizeiVorOrt: true }).has('polizeibericht')).toBe(true)
    expect(dataReqPflicht({ polizeiVorOrt: true }).has('polizeibericht')).toBe(true)
  })

  // ─── DRIFT (erwartet-rot via it.fails — dokumentiert die Bugs) ────────────

  // DRIFT 1: Leasing/Finanzierung -> freigabe_bank. Katalog = Pflicht +
  // kunde-uploadbar, berechneErwartung = Pflicht. Aber die operative
  // Kunde-Anzeige (8-Slot-Hardcode) kennt freigabe_bank NICHT -> Leasing-Kunde
  // wird im Haupt-Checklist nie zur Bank-/Leasing-Freigabe verpflichtet.
  it.fails('DRIFT: Leasing -> freigabe_bank fehlt in der operativen Kunde-Anzeige', () => {
    expect(erwartungPflicht({ leasing: true }).has('freigabe_bank')).toBe(true) // berechneErwartung: korrekt
    expect(dataReqPflicht({ leasing: true }).has('freigabe_bank')).toBe(true) // operativ: FEHLT -> rot
  })

  // DRIFT 2: Fahrerflucht ohne Polizei. create-pflicht legt polizeibericht als
  // Pflicht-Zeile an, aber die operative Anzeige liest fahrerflucht gar nicht
  // und filtert polizeibericht über polizei_vor_ort (=false) raus.
  it.fails('DRIFT: Fahrerflucht ohne Polizei -> polizeibericht fehlt in operativer Anzeige', () => {
    // berechneErwartung erfasst den Fall korrekt:
    expect(erwartungPflicht({ fahrerflucht: true, polizeiVorOrt: false }).has('polizeibericht')).toBe(true)
    // operative Anzeige NICHT:
    expect(dataReqPflicht({ fahrerflucht: true, polizeiVorOrt: false }).has('polizeibericht')).toBe(true)
  })

  // DRIFT 3: diagnosebericht-Pflicht-Konflikt. berechneErwartung = optional,
  // operative Anzeige + Katalog = Pflicht. Die zwei Quellen widersprechen sich.
  it.fails('DRIFT: diagnosebericht-Pflicht widerspricht zwischen den Quellen', () => {
    const pers: Szenario = { personenschaden: true }
    expect(erwartungPflicht(pers).has('diagnosebericht')).toBe(dataReqPflicht(pers).has('diagnosebericht'))
  })

  // DRIFT 4: Zeugen-Slot-ID-Mismatch. berechneErwartung nutzt 'zeugenaussage',
  // der Katalog 'zeugenbericht' -> derselbe Beleg unter zwei IDs, Diff erwartet<->vorhanden
  // matcht nie. Hier prüfen wir die Katalog-ID im erwartung-Output.
  it.fails('DRIFT: Zeugen-Slot heißt in erwartung "zeugenaussage" statt Katalog-"zeugenbericht"', () => {
    const ids = berechneErwartung(leadFrom({ zeugen: true })).map((x) => x.slot_id)
    expect(ids).toContain('zeugenbericht')
  })
})
