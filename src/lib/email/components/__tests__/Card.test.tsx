import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { Card } from '../Card'

describe('Card', () => {
  it('rendert weiße Content-Box mit Inhalt', async () => {
    const html = await render(<Card><p>Inhalt</p></Card>)
    expect(html).toContain('Inhalt')
    expect(html).toContain('#ffffff') // weiße Fläche
  })
})
