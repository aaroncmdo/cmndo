// src/lib/kasko-wb/__tests__/persistenz.test.ts
// Review #5864: der gemeinsame Schreibsatz (FlowLink, Portal, Dispatcher) — Befund 1 (null wird geschrieben),
// Befund 7 (status bei konvertierten Leads), Befund 8 (Mail-Dedup) als Regressionstests.
import { describe, it, expect } from 'vitest'
import { baueKaskoLeadPatch, baueKaskoTarifFelder, leseKaskoAltStand, sollBindungsMailSenden, type KaskoAltStand } from '../persistenz'
import type { KaskoTarifAuswahl, WbErgebnis } from '../types'

const auswahl: KaskoTarifAuswahl = { markeId: 'm1', markeName: 'HUK-COBURG', tarifId: 't1', tarifName: 'Classic SELECT', markerAntwort: null }
const gebunden = { freieWerkstattwahl: false, quelle: 'tarif' } as WbErgebnis
const frei = { freieWerkstattwahl: true, quelle: 'tarif' } as WbErgebnis
const unbekannt = { freieWerkstattwahl: null, quelle: 'unbekannt' } as WbErgebnis

const altGebundenWb: KaskoAltStand = { disqualifiziertGrundKey: 'werkstattbindung', freieWerkstattwahl: false, markeId: 'm1', tarifId: 't1', konvertiert: false }

describe('baueKaskoTarifFelder', () => {
  it('schreibt freie_werkstattwahl IMMER explizit — auch null (Befund 1: Korrektur gebunden -> unbekannt loescht false)', () => {
    const felder = baueKaskoTarifFelder(auswahl, unbekannt, { markeName: 'HUK-COBURG', tarifName: null })
    expect(felder).toHaveProperty('freie_werkstattwahl', null)
    expect(felder.werkstattbindung_quelle).toBe('unbekannt')
  })
  it('gebunden: false + Tariffelder aus Auswahl und Namen', () => {
    expect(baueKaskoTarifFelder(auswahl, gebunden, { markeName: 'HUK-COBURG', tarifName: 'Classic SELECT' })).toEqual({
      eigene_versicherung_marke_id: 'm1',
      eigene_versicherung_name: 'HUK-COBURG',
      eigene_kasko_tarif_id: 't1',
      eigene_kasko_tarif_name: 'Classic SELECT',
      werkstattbindung_quelle: 'tarif',
      freie_werkstattwahl: false,
    })
  })
})

describe('leseKaskoAltStand', () => {
  it('null-Zeile -> null', () => {
    expect(leseKaskoAltStand(null)).toBeNull()
    expect(leseKaskoAltStand(undefined)).toBeNull()
  })
  it('partielle Zeile: fehlende Spalten sind null/false', () => {
    expect(leseKaskoAltStand({ disqualifiziert_grund_key: 'werkstattbindung' })).toEqual({
      disqualifiziertGrundKey: 'werkstattbindung',
      freieWerkstattwahl: null,
      markeId: null,
      tarifId: null,
      konvertiert: false,
    })
  })
  it('konvertiert ueber Claim ODER Fall', () => {
    expect(leseKaskoAltStand({ konvertiert_zu_claim_id: 'c1' })?.konvertiert).toBe(true)
    expect(leseKaskoAltStand({ konvertiert_zu_fall_id: 'f1' })?.konvertiert).toBe(true)
    expect(leseKaskoAltStand({ konvertiert_zu_claim_id: null, konvertiert_zu_fall_id: null })?.konvertiert).toBe(false)
  })
})

describe('baueKaskoLeadPatch', () => {
  const felder = { werkstattbindung_quelle: 'tarif', freie_werkstattwahl: true }
  it('hebt eine Werkstattbindungs-Disqualifikation auf, wenn die neue Antwort frei ist (status neu)', () => {
    expect(baueKaskoLeadPatch(felder, frei, altGebundenWb)).toMatchObject({ ...felder, disqualifiziert: false, disqualifiziert_grund_key: null, status: 'neu' })
  })
  it('auch bei unbekannt (E3: durchlassen, Dispatch klaert)', () => {
    expect(baueKaskoLeadPatch(felder, unbekannt, altGebundenWb)).toMatchObject({ disqualifiziert: false, status: 'neu' })
  })
  it('konvertierter Lead -> status umgewandelt statt neu (Befund 7)', () => {
    expect(baueKaskoLeadPatch(felder, frei, { ...altGebundenWb, konvertiert: true }).status).toBe('umgewandelt')
  })
  it('gebunden bleibt gebunden: keine Re-Qualifikation', () => {
    expect(baueKaskoLeadPatch(felder, gebunden, altGebundenWb)).toEqual(felder)
  })
  it('anderer Disqualifikationsgrund bleibt unangetastet', () => {
    expect(baueKaskoLeadPatch(felder, frei, { ...altGebundenWb, disqualifiziertGrundKey: 'eigenverschulden' })).toEqual(felder)
  })
  it('kein Alt-Stand -> nur Tariffelder', () => {
    expect(baueKaskoLeadPatch(felder, frei, null)).toEqual(felder)
  })
})

describe('sollBindungsMailSenden', () => {
  it('frei/unbekannt: nie', () => {
    expect(sollBindungsMailSenden(frei, auswahl, null)).toBe(false)
    expect(sollBindungsMailSenden(unbekannt, auswahl, altGebundenWb)).toBe(false)
  })
  it('erste Bindung: ja (kein Alt-Stand oder vorher nicht gebunden)', () => {
    expect(sollBindungsMailSenden(gebunden, auswahl, null)).toBe(true)
    expect(sollBindungsMailSenden(gebunden, auswahl, { ...altGebundenWb, freieWerkstattwahl: null })).toBe(true)
    expect(sollBindungsMailSenden(gebunden, auswahl, { ...altGebundenWb, freieWerkstattwahl: true })).toBe(true)
  })
  it('unveraenderte Bestaetigung aus dem Re-Visit-Gate: nein (Befund 8)', () => {
    expect(sollBindungsMailSenden(gebunden, auswahl, altGebundenWb)).toBe(false)
  })
  it('anderer gebundener Tarif oder andere Marke: ja', () => {
    expect(sollBindungsMailSenden(gebunden, auswahl, { ...altGebundenWb, tarifId: 't2' })).toBe(true)
    expect(sollBindungsMailSenden(gebunden, auswahl, { ...altGebundenWb, markeId: 'm2' })).toBe(true)
  })
})
