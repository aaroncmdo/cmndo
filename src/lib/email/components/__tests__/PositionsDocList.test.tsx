import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { PositionsTable } from '../PositionsTable'
import { DocumentList } from '../DocumentList'

describe('PositionsTable', () => {
  it('rendert Positionen + Gesamt', async () => {
    const html = await render(
      <PositionsTable
        positionen={[{ bezeichnung: 'Grundhonorar', betrag: '420,00 €' }, { bezeichnung: 'Nebenkosten', betrag: '38,50 €' }]}
        gesamt="458,50 €"
      />,
    )
    expect(html).toContain('Grundhonorar')
    expect(html).toContain('458,50 €')
    expect(html).toContain('Gesamt')
  })
})

describe('DocumentList', () => {
  it('rendert Links + Meta, null bei leer', async () => {
    const html = await render(
      <DocumentList title="Dokumente" items={[{ label: 'Polizeibericht', url: 'https://x/p.pdf', meta: 'PDF · 2.3 MB' }]} />,
    )
    expect(html).toContain('Polizeibericht')
    expect(html).toContain('https://x/p.pdf')
    expect(html).toContain('PDF · 2.3 MB')
    const empty = await render(<DocumentList items={[]} />)
    expect(empty).not.toContain('<ul')
  })
})
