import type { Metadata } from 'next'
import { restPages } from '@/content/rest-pages.generated'
import type { RestPage } from '@/lib/rest-types'

// Loader fuer die WP-7-Seiten. Routing-Strategie (kollisionsfrei zu WP-2 `[article]`):
//  - flache statische Segmente (Pillars + Master-Hubs + flache hub-sf): route mit
//    genau 1 Pfadsegment → eigener app/<slug>/page.tsx.
//  - [slug]-Resolver unter /schadenfreiheitsklasse, /fahrerflucht, /nutzungsausfall:
//    route mit 2 Segmenten → app/<parent>/[slug]/page.tsx.
export * from '@/lib/rest-types'

const byRoute = new Map<string, RestPage>(restPages.map((p) => [p.route, p]))

export function getRestPage(route: string): RestPage | undefined {
  return byRoute.get(route)
}

export function getAllRestPages(): RestPage[] {
  return restPages
}

const segs = (route: string) => route.replace(/^\/+|\/+$/g, '').split('/')

/** Flache Top-Level-Seiten (1 Segment) → statische Segment-Ordner. */
export function getFlatRestRoutes(): string[] {
  return restPages.filter((p) => segs(p.route).length === 1).map((p) => p.route)
}

/** Sub-Slugs unter einem Parent (2 Segmente), z.B. parent='schadenfreiheitsklasse'. */
export function getRestSlugsUnder(parent: string): string[] {
  return restPages
    .filter((p) => {
      const s = segs(p.route)
      return s.length === 2 && s[0] === parent
    })
    .map((p) => segs(p.route)[1])
}

/** Alle indexierbaren WP-7-Routen (fuer sitemap.ts). */
export function getRestRoutes(): string[] {
  return restPages.map((p) => p.route)
}

/** generateMetadata-Helper fuer die WP-7-Routen (canonical = route). */
export function restMetadata(route: string): Metadata {
  const page = getRestPage(route)
  if (!page) return {}
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: route },
    openGraph: {
      type: 'article',
      url: route,
      title: page.title,
      description: page.description,
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
  }
}
