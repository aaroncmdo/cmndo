import { describe, it, expect } from 'vitest'
import { parseStorageUrl } from '../url'

// Hintergrund (14.07.): fall-dokumente ist ein PRIVATER Bucket. Je nach
// STORAGE_USE_SIGNED_URLS speichert die App entweder eine public-URL (auf einem
// privaten Bucket => HTTP 400, tot) oder eine signed-URL mit TTL 1h (=> nach 1h tot).
// Wer so eine gespeicherte URL SPAeTER wiederverwenden will (BKat-Vision gibt sie an
// Anthropic, das sie ohne Auth fetcht), muss Bucket+Pfad rausholen und FRISCH signieren.
describe('parseStorageUrl', () => {
  it('parst eine public-URL zu Bucket + Pfad', () => {
    expect(
      parseStorageUrl('https://x.supabase.co/storage/v1/object/public/fall-dokumente/leads/abc/polizeibericht_1.png'),
    ).toEqual({ bucket: 'fall-dokumente', path: 'leads/abc/polizeibericht_1.png' })
  })

  it('parst eine signed-URL und wirft den ?token-Query weg', () => {
    expect(
      parseStorageUrl(
        'https://x.supabase.co/storage/v1/object/sign/fall-dokumente/leads/abc/p.png?token=eyJhbGciOi.abc-123',
      ),
    ).toEqual({ bucket: 'fall-dokumente', path: 'leads/abc/p.png' })
  })

  it('parst eine authenticated-URL', () => {
    expect(
      parseStorageUrl('https://x.supabase.co/storage/v1/object/authenticated/gutachten/f/g.pdf'),
    ).toEqual({ bucket: 'gutachten', path: 'f/g.pdf' })
  })

  it('behält verschachtelte Pfade vollständig', () => {
    expect(
      parseStorageUrl('https://x.supabase.co/storage/v1/object/public/b/a/b/c/d/e.jpg'),
    ).toEqual({ bucket: 'b', path: 'a/b/c/d/e.jpg' })
  })

  it('gibt null für Nicht-Storage-URLs, Müll und Leerwerte', () => {
    expect(parseStorageUrl('https://example.com/foo.png')).toBeNull()
    expect(parseStorageUrl('/claimondo-logo.svg')).toBeNull()
    expect(parseStorageUrl('')).toBeNull()
    expect(parseStorageUrl(null)).toBeNull()
    expect(parseStorageUrl(undefined)).toBeNull()
  })

  it('gibt null wenn Bucket oder Pfad fehlt', () => {
    expect(parseStorageUrl('https://x.supabase.co/storage/v1/object/public/fall-dokumente')).toBeNull()
    expect(parseStorageUrl('https://x.supabase.co/storage/v1/object/public/fall-dokumente/')).toBeNull()
  })

  it('dekodiert prozent-kodierte Pfadsegmente (Leerzeichen/Umlaute im Dateinamen)', () => {
    expect(
      parseStorageUrl('https://x.supabase.co/storage/v1/object/public/b/leads/abc/mein%20bericht.png'),
    ).toEqual({ bucket: 'b', path: 'leads/abc/mein bericht.png' })
  })
})
