import { describe, it, expect } from 'vitest'
import { ausStorageUrl, aufloesen, REFERENZ_QUELLEN } from '../referenz-check'

const SIGNIERT =
  'https://paizkjajbuxxksdoycev.supabase.co/storage/v1/object/sign/fall-dokumente/' +
  'leads/f44ab2ce-96e2-40b5-8d0a-f40826c0a382/polizeibericht_1784240738750.jpg?token=eyJhbGciOiJIUzI1NiJ9.abc'

describe('ausStorageUrl', () => {
  it('liest Bucket und Pfad aus einer signierten URL', () => {
    expect(ausStorageUrl(SIGNIERT)).toEqual({
      bucket: 'fall-dokumente',
      pfad: 'leads/f44ab2ce-96e2-40b5-8d0a-f40826c0a382/polizeibericht_1784240738750.jpg',
    })
  })

  it('liest sie auch aus einer public-URL', () => {
    expect(ausStorageUrl('https://x.supabase.co/storage/v1/object/public/avatare/u/1.png'))
      .toEqual({ bucket: 'avatare', pfad: 'u/1.png' })
  })

  it('dekodiert Prozent-Escapes im Pfad', () => {
    expect(ausStorageUrl('https://x.supabase.co/storage/v1/object/vertraege/a/Mein%20Vertrag.pdf')?.pfad)
      .toBe('a/Mein Vertrag.pdf')
  })

  it('gibt null bei einer Fremd-URL', () => {
    expect(ausStorageUrl('https://example.com/datei.pdf')).toBeNull()
  })
})

describe('aufloesen', () => {
  it('nimmt bei relativem Pfad den Bucket der Quelle', () => {
    expect(aufloesen('sv-pflicht/abc/sv_widerrufsbelehrung/1.pdf', 'fall-dokumente')).toEqual({
      art: 'storage', bucket: 'fall-dokumente', pfad: 'sv-pflicht/abc/sv_widerrufsbelehrung/1.pdf', signiert: false,
    })
  })

  // ⭐ DER eigentliche Grund fuer diese Tests: Beim ersten Lauf am 21.08. hat das Skript
  // `bucket + volle URL` aneinandergehaengt und 9 gesunde Dateien als "tot" gemeldet.
  it('erkennt eine volle URL AUCH in einer Spalte, die eigentlich Pfade traegt', () => {
    const r = aufloesen(SIGNIERT, 'fall-dokumente')
    expect(r).toMatchObject({ art: 'storage', bucket: 'fall-dokumente', signiert: true })
    if (r.art === 'storage') {
      expect(r.pfad.startsWith('leads/')).toBe(true)
      expect(r.pfad).not.toContain('https://') // kein zusammengeklebter Unsinn
    }
  })

  it('markiert signierte URLs (sie laufen ab, die Datei bleibt)', () => {
    const r = aufloesen(SIGNIERT, null)
    expect(r.art === 'storage' && r.signiert).toBe(true)
  })

  it('markiert unsignierte URLs NICHT als signiert', () => {
    const r = aufloesen('https://x.supabase.co/storage/v1/object/public/avatare/u/1.png', null)
    expect(r.art === 'storage' && r.signiert).toBe(false)
  })

  it('erkennt data:-URIs als nicht pruefbar (inline, keine Datei)', () => {
    expect(aufloesen('data:image/png;base64,iVBORw0KGgo=', null).art).toBe('data')
  })

  it('erkennt Fremd-URLs als extern', () => {
    expect(aufloesen('https://example.com/x.pdf', 'fall-dokumente').art).toBe('extern')
  })

  it('behandelt einen relativen Pfad ohne Quellen-Bucket als extern statt zu raten', () => {
    expect(aufloesen('irgendwas/datei.pdf', null).art).toBe('extern')
  })
})

describe('REFERENZ_QUELLEN', () => {
  it('enthaelt keine doppelte Tabelle+Spalte', () => {
    const keys = REFERENZ_QUELLEN.map((q) => `${q.tabelle}.${q.spalte}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('deckt die drei Quellen ab, in denen am 21.08. tote Referenzen lagen', () => {
    const keys = REFERENZ_QUELLEN.map((q) => `${q.tabelle}.${q.spalte}`)
    expect(keys).toContain('pflichtdokumente.dokument_url')
    expect(keys).toContain('fall_dokumente.storage_path')
    expect(keys).toContain('vertraege_unterzeichnet.pdf_storage_path')
  })

  it('nennt fuer jede Quelle Kontextfelder — sonst ist ein Treffer nicht zuzuordnen', () => {
    for (const q of REFERENZ_QUELLEN) expect(q.kontext.length).toBeGreaterThan(0)
  })
})
