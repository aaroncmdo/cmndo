import { describe, it, expect } from 'vitest'
import { bewerteMapsZugang, MAPS_BOUNDARIES, type MapsFehlerZeile } from '../google-maps-zugang'
import { istZugangsFehler, MAPS_SERVER_BOUNDARY } from '@/lib/google-maps/melde-fehler'
import { istErlaubterBoundary } from '@/lib/observability/boundaries'

const z = (boundary: string, message: string): MapsFehlerZeile => ({ boundary, message })

describe('bewerteMapsZugang', () => {
  it('meldet ok, wenn nichts abgewiesen wurde', () => {
    const r = bewerteMapsZugang([], 1, 3, 24)
    expect(r.status).toBe('ok')
    expect(r.metric).toBe(0)
  })

  it('schlaegt schon bei EINEM Treffer an', () => {
    // ⚠ Absicht: ein Treffer = ein Nutzer, der keine Adresse eingeben konnte.
    // Wer hier auf 5 stellt, verschweigt genau den Fall, fuer den es gebaut ist.
    const r = bewerteMapsZugang([z('maps-server', 'OVER_QUERY_LIMIT')], 1, 3, 24)
    expect(r.status).toBe('warn')
    expect(r.metric).toBe(1)
  })

  it('stuft eine Haeufung als kritisch ein', () => {
    const r = bewerteMapsZugang(
      Array.from({ length: 4 }, () => z('maps-server', 'OVER_QUERY_LIMIT')), 1, 3, 24,
    )
    expect(r.status).toBe('crit')
  })

  it('nennt beim Kontingent eine ANDERE Massnahme als bei verweigertem Zugriff', () => {
    const kontingent = bewerteMapsZugang([z('maps-server', 'OVER_QUERY_LIMIT')], 1, 3, 24)
    expect(kontingent.detail).toContain('Limit anheben')

    const verweigert = bewerteMapsZugang([z('maps-server', 'REQUEST_DENIED')], 1, 3, 24)
    expect(verweigert.detail).toContain('Schlüssel/API/Billing')
  })

  it('weist Browser-Ablehnungen auf die Referrer-Einschraenkung hin', () => {
    const r = bewerteMapsZugang([z('maps', 'gm_authFailure')], 1, 3, 24)
    expect(r.detail).toContain('Referrer')
  })

  it('zaehlt beide Kanaele zusammen', () => {
    const r = bewerteMapsZugang(
      [z('maps', 'gm_authFailure'), z('maps-server', 'OVER_QUERY_LIMIT')], 1, 3, 24,
    )
    expect(r.metric).toBe(2)
    expect(r.detail).toContain('Browser')
    expect(r.detail).toContain('Tageskontingent')
  })

  it('haelt fest, dass die Adresseingabe still ausfaellt', () => {
    // Der Satz ist der Grund, warum jemand nachts reagiert statt zu warten.
    const r = bewerteMapsZugang([z('maps-server', 'OVER_QUERY_LIMIT')], 1, 3, 24)
    expect(r.detail).toContain('still')
  })
})

describe('istZugangsFehler', () => {
  it('erkennt Kontingent und verweigerten Zugriff', () => {
    expect(istZugangsFehler('OVER_QUERY_LIMIT')).toBe(true)
    expect(istZugangsFehler('REQUEST_DENIED')).toBe(true)
  })

  it('meldet ein leeres Ergebnis NICHT als Ausfall', () => {
    // ⚠ „nichts gefunden" ist eine Antwort. Wer das mitmeldet, baut einen
    // dauerhaft roten Waechter — und der wird weggeklickt.
    expect(istZugangsFehler('ZERO_RESULTS')).toBe(false)
    expect(istZugangsFehler('NOT_FOUND')).toBe(false)
  })

  it('meldet den eigenen Programmfehler NICHT als Betriebsstoerung', () => {
    expect(istZugangsFehler('INVALID_REQUEST')).toBe(false)
  })

  it('vertraegt fehlende Werte', () => {
    expect(istZugangsFehler(null)).toBe(false)
    expect(istZugangsFehler(undefined)).toBe(false)
    expect(istZugangsFehler('OK')).toBe(false)
  })
})

describe('Kanal-Vertrag', () => {
  // ⚠ DER FEHLER, DEN DIESE TESTS VERHINDERN: /api/client-error setzt jeden
  // unbekannten `boundary` still auf 'unknown'. Ein Melder, dessen Kanal dort
  // nicht eingetragen ist, schreibt zwar — aber der Check findet ihn nie.
  // Beim Bauen war die Liste tatsaechlich auf drei Werte begrenzt.

  it('laesst jeden Kanal durch, den der Check auswertet', () => {
    for (const k of MAPS_BOUNDARIES) {
      expect(istErlaubterBoundary(k)).toBe(true)
    }
  })

  it('nutzt im Server-Melder denselben Kanal, den der Check liest', () => {
    expect(MAPS_BOUNDARIES).toContain(MAPS_SERVER_BOUNDARY)
  })

  it('weist einen nicht eingetragenen Kanal ab', () => {
    // Gegenprobe: die Pruefung ist nicht pauschal wahr.
    expect(istErlaubterBoundary('maps-mobil')).toBe(false)
  })
})
