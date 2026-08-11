import { describe, it, expect } from 'vitest'
import { EMBED_SCRIPT_HOST, monikaSnippet, loginSnippet } from './embed-host'

describe('embed-host snippets', () => {
  it('nutzt den Prod-App-Host, nicht die 404-Marketing-Domain', () => {
    expect(EMBED_SCRIPT_HOST).toBe('https://app.claimondo.de')
    // Regression: der alte Snippet-Host claimondo.de liefert /embed/* als 404.
    expect(monikaSnippet('x')).not.toContain('https://claimondo.de/embed')
    expect(loginSnippet('x')).not.toContain('https://claimondo.de/embed')
  })

  it('baut das Monika-Snippet mit slug', () => {
    expect(monikaSnippet('kfz-muensterland')).toBe(
      '<script src="https://app.claimondo.de/embed/monika.js" data-site-id="kfz-muensterland" defer></script>',
    )
  })

  it('baut das Login-Snippet mit slug', () => {
    expect(loginSnippet('kfz-muensterland')).toBe(
      '<script src="https://app.claimondo.de/embed/claimondo-login.js" data-site-id="kfz-muensterland" defer></script>',
    )
  })
})
