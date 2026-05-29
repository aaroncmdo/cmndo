import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { Hero } from '../Hero'
import { VehicleCard } from '../VehicleCard'

describe('Hero + VehicleCard', () => {
  it('rendert Logo, Headline und Fahrzeug-Karte', async () => {
    const html = await render(
      <Hero logoUrl="https://claimondo.de/claimondo-wortmarke.svg" headline="Willkommen, Max." subline="0 €">
        <VehicleCard imageUrl="https://cdn.imagin.studio/car.png" label="Ihr Fahrzeug" value="BMW 320d" />
      </Hero>,
    )
    expect(html).toContain('Willkommen, Max.')
    expect(html).toContain('claimondo-wortmarke.svg')
    expect(html).toContain('cdn.imagin.studio/car.png')
    expect(html).toContain('BMW 320d')
    expect(html).toContain('#C9A84C') // Gold-Akzent
  })
})
