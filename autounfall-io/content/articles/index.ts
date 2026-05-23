import type { Article } from '@/lib/article-types'
import { generatedArticles } from '@/content/articles.generated'

// 71 flat-canonical ARTICLE-*.html → automatisch portiert nach
// content/articles.generated.ts (scripts/port-articles.py, Quelle: Prototyp-HTML).
// NICHT enthalten (eigene Routen/WPs): Nested-Canonical-Artikel
// (/fahrerflucht/*, /nutzungsausfall/*, /schadenfreiheitsklasse/*) gehoeren in
// Hub-Sub-Routen; der SF-Rechner ist eine WebApplication (WP-4 Tools).
export const allArticles: Article[] = generatedArticles
