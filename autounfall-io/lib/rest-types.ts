// Content-Layer-Typen fuer WP-7 (Pillars + Hubs + SF-Versicherer + nested-Artikel).
// Reine Typen — keine Imports (vermeidet Zyklen). Alle WP-7-Seiten sind
// „Article-shaped" und teilen die WP-2-Render-Parts. RestPage ist ein Article-
// Superset mit explizitem `route` (voller Pfad statt flachem Slug) + `breadcrumb`.
import type { ArticleAuthorId, ArticleFaq } from '@/lib/article-types'

export type RestPageKind = 'pillar' | 'hub' | 'article'

export interface RestBreadcrumbItem {
  name: string
  route: string
}

export interface RestPage {
  /** Voller Pfad inkl. fuehrendem Slash, z.B. /nutzungsausfall oder /fahrerflucht/strafen-bgh. */
  route: string
  kind: RestPageKind
  title: string
  h1: string
  h1Accent?: string
  description: string
  eyebrow: string
  datePublished: string
  dateModified: string
  author: ArticleAuthorId
  quickAnswer: string[]
  /** Markdown-Prosa (h2-Abschnitte), interne Links bereits auf Routen umgeschrieben. */
  body: string
  faq?: ArticleFaq[]
  sources?: string[]
  breadcrumb?: RestBreadcrumbItem[]
}
