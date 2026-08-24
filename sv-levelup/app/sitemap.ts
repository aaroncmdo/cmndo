import type { MetadataRoute } from 'next'

/**
 * Nur die Startseite.
 *
 * Alles andere ist entweder token-geschuetzt (Befund, Plan, Auswertung) oder
 * eine Anmeldung — nichts davon gehoert in einen Index. Eine Sitemap, die
 * Seiten nennt, die niemand finden soll, waere eine Einladung.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://sv-levelup.claimondo.de',
      lastModified: new Date('2026-08-20'),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
