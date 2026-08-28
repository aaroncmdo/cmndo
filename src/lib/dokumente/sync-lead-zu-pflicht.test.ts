import { describe, it, expect } from 'vitest'
import { storagePfadAusUrl, fehlendeAktenZeilen } from './sync-lead-zu-pflicht'

/**
 * ANLASS (Prod-Messung 28.08.): Ein Pflicht-Slot stand auf 'hochgeladen' MIT URL — und die
 * Dokumentenliste der Akte war leer. `convert-lead-to-fall` zog nur `unfallfotos` nach
 * `fall_dokumente` nach, alles andere blieb allein im Slot:
 *
 *   CLM-2026-03507  fahrzeugschein / polizeibericht  →  0 Zeilen in fall_dokumente
 *   CLM-2026-05265  fahrzeugschein                   →  0
 *
 * SV und KB arbeiten mit der Akte; was dort nicht steht, existiert fuer sie nicht.
 */

const slot = (id: string, typ: string, url: string) => ({ id, dokument_typ: typ, url })

describe('storagePfadAusUrl', () => {
  it('liest den Pfad aus einer public-URL', () => {
    expect(storagePfadAusUrl(
      'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/abc/fahrzeugschein_1.jpg',
    )).toBe('leads/abc/fahrzeugschein_1.jpg')
  })

  it('liest ihn auch aus einer signierten URL — der Praefix unterscheidet sich', () => {
    expect(storagePfadAusUrl(
      'https://x.supabase.co/storage/v1/object/sign/fall-dokumente/leads/abc/polizeibericht_2.jpg?token=ey123',
    )).toBe('leads/abc/polizeibericht_2.jpg')
  })

  it('schneidet Query-String und Fragment ab — die gehoeren nicht zum Pfad', () => {
    expect(storagePfadAusUrl('…/fall-dokumente/a/b.jpg?x=1#frag')).toBe('a/b.jpg')
  })

  it('liefert null, wenn der Bucket nicht vorkommt', () => {
    expect(storagePfadAusUrl('https://example.com/irgendwas.jpg')).toBeNull()
  })

  it('liefert null bei leer/null/undefined', () => {
    expect(storagePfadAusUrl(null)).toBeNull()
    expect(storagePfadAusUrl(undefined)).toBeNull()
    expect(storagePfadAusUrl('')).toBeNull()
    expect(storagePfadAusUrl('…/fall-dokumente/')).toBeNull()   // Bucket ohne Datei
  })
})

describe('fehlendeAktenZeilen — der reale Fehlerfall', () => {
  it('legt die fehlende Zeile fuer einen belegten Slot an', () => {
    const r = fehlendeAktenZeilen([slot('pd-1', 'fahrzeugschein', '…/fall-dokumente/leads/a/zb1.jpg')], new Set())
    expect(r).toEqual([{ pflichtdokument_id: 'pd-1', dokument_typ: 'fahrzeugschein', storage_path: 'leads/a/zb1.jpg' }])
  })

  it('laesst eine bereits vorhandene Datei in Ruhe (idempotent)', () => {
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'fahrzeugschein', '…/fall-dokumente/leads/a/zb1.jpg')],
      new Set(['leads/a/zb1.jpg']),
    )
    expect(r).toHaveLength(0)
  })
})

describe('… ohne Doppeleintraege', () => {
  it('Slot-Aliase auf DIESELBE Datei ergeben EINE Zeile', () => {
    // polizeibericht + polizeiliche_unfallmitteilung zeigen auf dieselbe URL.
    const url = '…/fall-dokumente/leads/a/polizei.jpg'
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'polizeibericht', url), slot('pd-2', 'polizeiliche_unfallmitteilung', url)],
      new Set(),
    )
    expect(r).toHaveLength(1)
    expect(r[0].dokument_typ).toBe('polizeibericht')   // der erste gewinnt
  })

  it('schadensfotos + unfallfotos ebenso', () => {
    const url = '…/fall-dokumente/leads/a/foto.jpg'
    expect(fehlendeAktenZeilen(
      [slot('pd-1', 'schadensfotos', url), slot('pd-2', 'unfallfotos', url)], new Set(),
    )).toHaveLength(1)
  })

  it('der unfallfotos-Nachzug lief VORHER — seine Datei wird nicht doppelt angelegt', () => {
    // convert-lead-to-fall Schritt 5 legt schadensfotos an, Schritt 7 ruft diesen Sync.
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'schadensfotos', '…/fall-dokumente/leads/a/foto.jpg'),
       slot('pd-2', 'fahrzeugschein', '…/fall-dokumente/leads/a/zb1.jpg')],
      new Set(['leads/a/foto.jpg']),
    )
    expect(r.map((x) => x.dokument_typ)).toEqual(['fahrzeugschein'])
  })

  it('verschiedene Dateien bleiben verschiedene Zeilen', () => {
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'fahrzeugschein', '…/fall-dokumente/leads/a/zb1.jpg'),
       slot('pd-2', 'polizeibericht', '…/fall-dokumente/leads/a/pol.jpg')],
      new Set(),
    )
    expect(r).toHaveLength(2)
  })
})

describe('Abgrenzung', () => {
  it('ein Slot ohne verwertbare URL wird uebersprungen', () => {
    expect(fehlendeAktenZeilen([slot('pd-1', 'fahrzeugschein', 'https://example.com/extern.jpg')], new Set()))
      .toHaveLength(0)
  })

  it('ein Slot ohne dokument_typ wird uebersprungen', () => {
    expect(fehlendeAktenZeilen(
      [{ id: 'pd-1', dokument_typ: null, url: '…/fall-dokumente/leads/a/x.jpg' }], new Set(),
    )).toHaveLength(0)
  })

  it('leere Eingabe ergibt leere Ausgabe', () => {
    expect(fehlendeAktenZeilen([], new Set())).toEqual([])
  })
})
