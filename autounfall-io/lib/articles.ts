import { allArticles } from '@/content/articles'
import type { Article } from '@/lib/article-types'

// Loader / Zugriff auf den Content-Layer. Typen + AUTHORS aus article-types
// werden hier mit re-exportiert, damit Consumer nur '@/lib/articles' brauchen.
export * from '@/lib/article-types'

const bySlug = new Map<string, Article>(allArticles.map((a) => [a.slug, a]))

export function getArticle(slug: string): Article | undefined {
  return bySlug.get(slug)
}

export function getAllArticles(): Article[] {
  return allArticles
}

export function getArticleSlugs(): string[] {
  return allArticles.map((a) => a.slug)
}
