// TDD: Task 10 — resolveWerkstattOrt pure-helper unit test.
// Run red first (helper does not exist yet), then green after implementation.

import { describe, it, expect } from 'vitest'
import { resolveWerkstattOrt } from '../werkstatt-ort'

const werkstattGeo = { lat: 50.9333, lng: 6.9608, adresse: 'Musterstraße 1, 50667 Köln' }
const eingabeOrt = { lat: 51.5074, lng: 0.1278, adresse: 'Baker Street, London' }

describe('resolveWerkstattOrt', () => {
  it('"ja" → werkstattGeo', () => {
    expect(resolveWerkstattOrt('ja', werkstattGeo, eingabeOrt)).toEqual(werkstattGeo)
  })

  it('"nein" → eingabe', () => {
    expect(resolveWerkstattOrt('nein', werkstattGeo, eingabeOrt)).toEqual(eingabeOrt)
  })

  it('"ja" mit eingabe=null → werkstattGeo', () => {
    expect(resolveWerkstattOrt('ja', werkstattGeo, null)).toEqual(werkstattGeo)
  })

  it('"nein" mit eingabe=null → null', () => {
    expect(resolveWerkstattOrt('nein', werkstattGeo, null)).toBeNull()
  })
})
