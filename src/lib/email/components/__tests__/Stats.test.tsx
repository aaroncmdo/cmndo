import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { StatGrid, StatusPill } from '../Stats'

describe('Stats', () => {
  it('rendert 2x2-Kacheln und Status-Pill', async () => {
    const html = await render(
      <>
        <StatusPill>In Bearbeitung</StatusPill>
        <StatGrid items={[{ label: 'Fallnummer', value: 'CLM-1' }, { label: 'Versicherung', value: 'HUK' }]} />
      </>,
    )
    expect(html).toContain('In Bearbeitung')
    expect(html).toContain('Fallnummer')
    expect(html).toContain('CLM-1')
    expect(html).toContain('HUK')
  })
})
