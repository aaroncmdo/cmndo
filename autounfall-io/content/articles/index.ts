import type { Article } from '@/lib/article-types'
import { auffahrunfall } from './auffahrunfall'

// Registry aller portierten Artikel. Der WP-2-Bulk-Port haengt hier die
// weiteren 81 ARTICLE-*-Module an (jeweils ein File je Slug).
export const allArticles: Article[] = [auffahrunfall]
