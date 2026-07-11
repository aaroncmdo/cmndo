import { describe, it, expect } from 'vitest'
import { erkenneVorschauTyp } from '../vorschau-typ'

describe('erkenneVorschauTyp', () => {
  // --- PDF ---
  it('erkennt .pdf (lowercase)', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/gutachten.pdf')).toBe('pdf')
  })

  it('erkennt .PDF (uppercase)', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/gutachten.PDF')).toBe('pdf')
  })

  it('erkennt .pdf mit Query-String', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/gutachten.pdf?token=abc123')).toBe('pdf')
  })

  it('erkennt PDF via typ application/pdf', () => {
    expect(erkenneVorschauTyp('https://example.com/file', 'application/pdf')).toBe('pdf')
  })

  it('erkennt PDF via typ PDF (uppercase)', () => {
    expect(erkenneVorschauTyp('https://example.com/file', 'PDF')).toBe('pdf')
  })

  it('erkennt PDF via typ wenn url null ist', () => {
    expect(erkenneVorschauTyp(null, 'application/pdf')).toBe('pdf')
  })

  // --- Bild ---
  it('erkennt .jpg', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/foto.jpg')).toBe('bild')
  })

  it('erkennt .jpeg', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/foto.jpeg')).toBe('bild')
  })

  it('erkennt .PNG (uppercase)', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/screenshot.PNG')).toBe('bild')
  })

  it('erkennt .webp mit Query-String', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/bild.webp?x=1')).toBe('bild')
  })

  it('erkennt .heic', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/iphone-foto.heic')).toBe('bild')
  })

  it('erkennt .gif', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/animation.gif')).toBe('bild')
  })

  it('erkennt .avif', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/modern.avif')).toBe('bild')
  })

  // --- Andere ---
  it('klassifiziert .docx als andere', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/brief.docx')).toBe('andere')
  })

  it('klassifiziert null url (ohne typ) als andere', () => {
    expect(erkenneVorschauTyp(null)).toBe('andere')
  })

  it('klassifiziert leeren String als andere', () => {
    expect(erkenneVorschauTyp('')).toBe('andere')
  })

  it('klassifiziert .xlsx als andere', () => {
    expect(erkenneVorschauTyp('https://storage.example.com/tabelle.xlsx')).toBe('andere')
  })

  it('erkennt .pdf mit Hash', () => {
    expect(erkenneVorschauTyp('https://example.com/doc.pdf#page=2')).toBe('pdf')
  })
})
