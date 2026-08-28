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
    expect(storagePfadAusUrl('https://x.supabase.co/storage/v1/object/public/fall-dokumente/a/b.jpg?x=1#frag')).toBe('a/b.jpg')
  })

  // ⭐⭐ Das Feld heisst „url", traegt aber zwei Formen. Auf prod gemessen (10 belegte Slots):
  // 3x volle URL, 7x nackter Pfad. Eine erste Fassung kannte nur Form 1 — der Fix haette die
  // MEHRHEIT der realen Faelle nicht getroffen, bei gruenen Tests. Ein Feldname ist kein
  // Formatvertrag.
  it('akzeptiert den nackten Storage-Pfad (Form 2, die haeufigere)', () => {
    expect(storagePfadAusUrl('leads/bea4fa1d-a803-44c6-91fa-529b1a7dfe98/zb1_flow_1786294077662.webp'))
      .toBe('leads/bea4fa1d-a803-44c6-91fa-529b1a7dfe98/zb1_flow_1786294077662.webp')
  })

  it('auch die claims/-Variante', () => {
    expect(storagePfadAusUrl('claims/3007e987/pflicht/unfallfotos/1786294682191_x.jpeg'))
      .toBe('claims/3007e987/pflicht/unfallfotos/1786294682191_x.jpeg')
  })

  it('ein fuehrender Slash wird normalisiert', () => {
    expect(storagePfadAusUrl('/leads/a/b.jpg')).toBe('leads/a/b.jpg')
  })

  it('eine FREMDE URL bleibt null — daraus einen Pfad zu raten waere falsch', () => {
    expect(storagePfadAusUrl('https://example.com/irgendwas.jpg')).toBeNull()
    expect(storagePfadAusUrl('http://cdn.fremd.de/a/b.jpg')).toBeNull()
  })

  it('ein Einzelwort ohne Verzeichnis ist kein Pfad', () => {
    expect(storagePfadAusUrl('kaputt.jpg')).toBeNull()
  })

  // Diese drei kommen aus parseStorageUrl (@/lib/storage/url) — deshalb wird der zentrale
  // Helfer genutzt statt eines eigenen Parsers.
  it('dekodiert prozent-kodierte Segmente', () => {
    expect(storagePfadAusUrl(
      'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/mein%20schein.jpg',
    )).toBe('leads/a/mein schein.jpg')
  })

  it('kennt auch die authenticated-Variante', () => {
    expect(storagePfadAusUrl(
      'https://x.supabase.co/storage/v1/object/authenticated/fall-dokumente/leads/a/b.jpg',
    )).toBe('leads/a/b.jpg')
  })

  it('eine Storage-URL auf einen ANDEREN Bucket ist nicht unsere Datei', () => {
    expect(storagePfadAusUrl(
      'https://x.supabase.co/storage/v1/object/public/gutachten/leads/a/b.pdf',
    )).toBeNull()
  })

  it('liefert null bei leer/null/undefined', () => {
    expect(storagePfadAusUrl(null)).toBeNull()
    expect(storagePfadAusUrl(undefined)).toBeNull()
    expect(storagePfadAusUrl('')).toBeNull()
    expect(storagePfadAusUrl('https://x.supabase.co/storage/v1/object/public/fall-dokumente/')).toBeNull()   // Bucket ohne Datei
  })
})

describe('fehlendeAktenZeilen — der reale Fehlerfall', () => {
  it('legt die fehlende Zeile fuer einen belegten Slot an', () => {
    const r = fehlendeAktenZeilen([slot('pd-1', 'fahrzeugschein', 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/zb1.jpg')], new Set())
    expect(r).toEqual([{ pflichtdokument_id: 'pd-1', dokument_typ: 'fahrzeugschein', storage_path: 'leads/a/zb1.jpg' }])
  })

  it('laesst eine bereits vorhandene Datei in Ruhe (idempotent)', () => {
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'fahrzeugschein', 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/zb1.jpg')],
      new Set(['leads/a/zb1.jpg']),
    )
    expect(r).toHaveLength(0)
  })
})

describe('… ohne Doppeleintraege', () => {
  it('Slot-Aliase auf DIESELBE Datei ergeben EINE Zeile', () => {
    // polizeibericht + polizeiliche_unfallmitteilung zeigen auf dieselbe URL.
    const url = 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/polizei.jpg'
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'polizeibericht', url), slot('pd-2', 'polizeiliche_unfallmitteilung', url)],
      new Set(),
    )
    expect(r).toHaveLength(1)
    expect(r[0].dokument_typ).toBe('polizeibericht')   // der erste gewinnt
  })

  it('schadensfotos + unfallfotos ebenso', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/foto.jpg'
    expect(fehlendeAktenZeilen(
      [slot('pd-1', 'schadensfotos', url), slot('pd-2', 'unfallfotos', url)], new Set(),
    )).toHaveLength(1)
  })

  it('der unfallfotos-Nachzug lief VORHER — seine Datei wird nicht doppelt angelegt', () => {
    // convert-lead-to-fall Schritt 5 legt schadensfotos an, Schritt 7 ruft diesen Sync.
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'schadensfotos', 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/foto.jpg'),
       slot('pd-2', 'fahrzeugschein', 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/zb1.jpg')],
      new Set(['leads/a/foto.jpg']),
    )
    expect(r.map((x) => x.dokument_typ)).toEqual(['fahrzeugschein'])
  })

  it('verschiedene Dateien bleiben verschiedene Zeilen', () => {
    const r = fehlendeAktenZeilen(
      [slot('pd-1', 'fahrzeugschein', 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/zb1.jpg'),
       slot('pd-2', 'polizeibericht', 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/pol.jpg')],
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
      [{ id: 'pd-1', dokument_typ: null, url: 'https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/a/x.jpg' }], new Set(),
    )).toHaveLength(0)
  })

  it('leere Eingabe ergibt leere Ausgabe', () => {
    expect(fehlendeAktenZeilen([], new Set())).toEqual([])
  })
})
