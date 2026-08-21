import { describe, expect, it, vi } from 'vitest'
import type { Db } from '../../anreicherung/schreiben'
import { beurteileZeile, loescheAusland, planeHeilung, trageOrtNach, type HeilZeile } from '../heilung'

function zeile(p: Partial<HeilZeile>): HeilZeile {
  return { id: 'id-1', firma: 'Beispiel', adresse: null, ort: null, ...p }
}

describe('beurteileZeile', () => {
  it('erkennt eine oesterreichische Anschrift', () => {
    // Echter Datensatz aus dem Lauf vom 20.08.
    const b = beurteileZeile(zeile({ adresse: 'Weignersdorf 2, 4202 Hellmonsödt, Österreich' }))
    expect(b.art).toBe('ausland')
  })

  it('erkennt Luxemburg — vierstellige Postleitzahl, Landesname am Ende', () => {
    const b = beurteileZeile(zeile({ adresse: '106 Haaptstrooss, 9645 Derenbach Wintger, Luxemburg' }))
    expect(b.art).toBe('ausland')
  })

  it('traegt einen Ort mit Schraegstrich nach', () => {
    // ⚠ Der Grund, warum 111 deutsche Betriebe ohne Ort dastanden.
    const b = beurteileZeile(zeile({ adresse: 'Ährenfeld 54, 08606 Oelsnitz/Vogtland' }))
    expect(b.art).toBe('ort_nachtragbar')
    if (b.art !== 'ort_nachtragbar') throw new Error('unerwartet')
    expect(b.plz).toBe('08606')
    expect(b.ort).toBe('Oelsnitz/Vogtland')
  })

  it('traegt einen Ort mit Klammerzusatz nach', () => {
    const b = beurteileZeile(zeile({ adresse: 'Zum Bildsteinfelsen 17, 79875 Dachsberg (Südschwarzwald)' }))
    expect(b.art).toBe('ort_nachtragbar')
    if (b.art !== 'ort_nachtragbar') throw new Error('unerwartet')
    expect(b.ort).toBe('Dachsberg (Südschwarzwald)')
  })

  it('traegt einen Ort mit Ziffer nach', () => {
    // ⚠ „40235 Düsseldorf-Stadtbezirk 2" — beim ersten Heilungslauf als
    // „unklar" liegengeblieben, weil die Fortsetzung keine Ziffern zuliess.
    const b = beurteileZeile(zeile({ adresse: 'Bruchstraße 76, 40235 Düsseldorf-Stadtbezirk 2' }))
    expect(b.art).toBe('ort_nachtragbar')
    if (b.art !== 'ort_nachtragbar') throw new Error('unerwartet')
    expect(b.ort).toBe('Düsseldorf-Stadtbezirk 2')
  })

  it('haelt zwei Zahlen hintereinander NICHT fuer einen Ortsnamen', () => {
    // Die Gegenprobe zur Ziffern-Erlaubnis: das erste Zeichen bleibt ein
    // Buchstabe, sonst waere „67890" hier der Ort.
    const b = beurteileZeile(zeile({ adresse: 'Musterweg 1, 12345 67890' }))
    expect(b.art).toBe('unklar')
  })

  it('laesst eine vollstaendige Zeile in Ruhe', () => {
    const b = beurteileZeile(zeile({ adresse: 'Weseler Str. 675, 48163 Münster, Deutschland', ort: 'Münster' }))
    expect(b.art).toBe('in_ordnung')
  })

  it('LOESCHT NICHT, wenn die Postleitzahl fehlt, aber auch kein Land dasteht', () => {
    // ⭐ Die zweite Huerde. Ein unlesbares Muster ist ein Muster-Fehler, kein
    // Grund zu loeschen — sonst raeumt eine spaetere Regex-Luecke stillschweigend
    // echte deutsche Betriebe ab, und niemand sieht es je.
    const b = beurteileZeile(zeile({ adresse: 'Hinter der Kirche, Musterhausen' }))
    expect(b.art).toBe('unklar')
  })

  it('loescht Frankreich trotz fuenfstelliger Postleitzahl', () => {
    // Der Landesname ist das staerkere Merkmal — er steht explizit da.
    const b = beurteileZeile(zeile({ adresse: '12 Rue de la Paix, 67000 Strasbourg, Frankreich' }))
    expect(b.art).toBe('ausland')
  })

  it('meldet eine Zeile ohne Anschrift als unklar statt sie zu loeschen', () => {
    const b = beurteileZeile(zeile({ adresse: null }))
    expect(b.art).toBe('unklar')
  })

  it('beurteilt dieselbe Anschrift zweimal gleich', () => {
    // ⚠ `AUSLAND` traegt kein g-Flag. Traege es eins, waere `.test()`
    // zustandsbehaftet und liefe beim zweiten Aufruf ins Leere — ein Fehler,
    // der sich als „jede zweite Zeile bleibt stehen" zeigen wuerde.
    const a = zeile({ adresse: 'Weignersdorf 2, 4202 Hellmonsödt, Österreich' })
    expect(beurteileZeile(a).art).toBe('ausland')
    expect(beurteileZeile(a).art).toBe('ausland')
  })
})

describe('planeHeilung', () => {
  it('sortiert einen gemischten Bestand in die vier Faecher', () => {
    const plan = planeHeilung([
      zeile({ id: '1', adresse: 'Weignersdorf 2, 4202 Hellmonsödt, Österreich' }),
      zeile({ id: '2', adresse: 'Ährenfeld 54, 08606 Oelsnitz/Vogtland' }),
      zeile({ id: '3', adresse: 'Weseler Str. 675, 48163 Münster', ort: 'Münster' }),
      zeile({ id: '4', adresse: null }),
    ])
    expect(plan.ausland).toHaveLength(1)
    expect(plan.nachtragbar).toHaveLength(1)
    expect(plan.unklar).toHaveLength(1)
    expect(plan.inOrdnung).toBe(1)
  })
})

function db(antwort: { data?: unknown[]; error?: { message: string } }): { db: Db; kette: Record<string, ReturnType<typeof vi.fn>> } {
  const kette = {
    delete: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
  }
  kette.delete.mockReturnValue(kette)
  kette.update.mockReturnValue(kette)
  kette.eq.mockReturnValue(kette)
  kette.select.mockResolvedValue({ data: antwort.data ?? null, error: antwort.error ?? null })
  return { db: { from: () => kette } as unknown as Db, kette }
}

describe('loescheAusland', () => {
  it('schraenkt die Loeschung IMMER auf die eigene Quelle ein', () => {
    // ⭐ Die Sperre gehoert in die WHERE-Klausel, nicht in den Aufrufer. Ein
    // Loeschpfad darf sich nicht darauf verlassen, richtig gerufen zu werden —
    // daneben liegen importierte Bestandsleads.
    const { db: d, kette } = db({ data: [{ id: 'x' }] })
    void loescheAusland(d, 'x')
    expect(kette.eq).toHaveBeenCalledWith('quelle', 'places_discovery')
  })

  it('meldet einen Fehlschlag, wenn keine Zeile getroffen wurde', async () => {
    // ⚠ supabase-js wirft nicht. Ohne diese Pruefung sieht „nichts geloescht"
    // exakt aus wie „geloescht".
    const r = await loescheAusland(db({ data: [] }).db, 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('keine Zeile getroffen')
  })

  it('reicht den Datenbankfehler weiter', async () => {
    const r = await loescheAusland(db({ error: { message: 'permission denied' } }).db, 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('permission denied')
  })

  it('meldet Erfolg, wenn genau eine Zeile wegfiel', async () => {
    const r = await loescheAusland(db({ data: [{ id: 'x' }] }).db, 'x')
    expect(r.ok).toBe(true)
  })
})

describe('trageOrtNach', () => {
  it('schreibt Postleitzahl und Ort und prueft die Zeile', async () => {
    const { db: d, kette } = db({ data: [{ id: 'x' }] })
    const r = await trageOrtNach(d, 'x', '08606', 'Oelsnitz/Vogtland')
    expect(r.ok).toBe(true)
    expect(kette.update).toHaveBeenCalledWith({ plz: '08606', ort: 'Oelsnitz/Vogtland' })
    expect(kette.eq).toHaveBeenCalledWith('quelle', 'places_discovery')
  })

  it('meldet einen Fehlschlag, wenn keine Zeile getroffen wurde', async () => {
    const r = await trageOrtNach(db({ data: [] }).db, 'x', '1', 'a')
    expect(r.ok).toBe(false)
  })
})
