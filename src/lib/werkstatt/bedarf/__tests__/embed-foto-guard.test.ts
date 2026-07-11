import { describe, it, expect } from 'vitest'
import { pruefeEmbedFotos, MAX_FOTOS, MAX_BYTES, ERLAUBTE_TYPEN } from '../embed-foto-guard'
import type { EmbedFoto } from '../embed-foto-guard'

const foto = (data = 'abc', media_type = 'image/jpeg'): EmbedFoto => ({ data, media_type })

describe('pruefeEmbedFotos', () => {
  it('>3 Bilder -> nur erste 3', () => {
    const fotos = [foto('a'), foto('b'), foto('c'), foto('d')]
    const result = pruefeEmbedFotos(fotos)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.images).toHaveLength(3)
      expect(result.images[0].data).toBe('a')
      expect(result.images[2].data).toBe('c')
    }
  })

  it('falscher media_type -> gefiltert', () => {
    const fotos = [foto('a', 'image/gif'), foto('b', 'image/jpeg')]
    const result = pruefeEmbedFotos(fotos)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.images).toHaveLength(1)
      expect(result.images[0].data).toBe('b')
    }
  })

  it('oversized base64 -> gefiltert (len*0.75 > MAX_BYTES)', () => {
    // base64 length for > 5MB decoded: need len > MAX_BYTES / 0.75 = 6_666_667 chars
    const bigData = 'A'.repeat(Math.ceil(MAX_BYTES / 0.75) + 1)
    const fotos = [foto(bigData), foto('small')]
    const result = pruefeEmbedFotos(fotos)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.images).toHaveLength(1)
      expect(result.images[0].data).toBe('small')
    }
  })

  it('alle raus -> {ok:false}', () => {
    const fotos = [foto('a', 'image/bmp'), foto('b', 'application/pdf')]
    expect(pruefeEmbedFotos(fotos)).toEqual({ ok: false })
  })

  it('gueltige Fotos -> {ok:true, images}', () => {
    const fotos = [foto('x', 'image/png'), foto('y', 'image/webp')]
    const result = pruefeEmbedFotos(fotos)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.images).toHaveLength(2)
    }
  })

  it('leere Eingabe -> {ok:false}', () => {
    expect(pruefeEmbedFotos([])).toEqual({ ok: false })
  })

  it('Konstanten korrekt', () => {
    expect(MAX_FOTOS).toBe(3)
    expect(MAX_BYTES).toBe(5_000_000)
    expect(ERLAUBTE_TYPEN).toContain('image/jpeg')
    expect(ERLAUBTE_TYPEN).toContain('image/png')
    expect(ERLAUBTE_TYPEN).toContain('image/webp')
  })
})
