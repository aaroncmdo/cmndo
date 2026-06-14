import type { Article } from '@/lib/article-types'
import { generatedArticles } from '@/content/articles.generated'
import { manualArticles } from '@/content/articles.manual'
import { deepGenerifyContent } from '@/lib/genericize-partner'

// 71 flat-canonical ARTICLE-*.html → automatisch portiert nach
// content/articles.generated.ts (scripts/port-articles.py, Quelle: Prototyp-HTML).
// NICHT enthalten (eigene Routen/WPs): Nested-Canonical-Artikel
// (/fahrerflucht/*, /nutzungsausfall/*, /schadenfreiheitsklasse/*) gehoeren in
// Hub-Sub-Routen; der SF-Rechner ist eine WebApplication (WP-4 Tools).
//
// manualArticles = handgepflegte Artikel ausserhalb des Ports (content/
// articles.manual.ts), z.B. /kba-schluesselnummer (Brief-02 C1).
// Verkehrsrechts-Partnerkanzlei generisch (Cowork 2026-06-12): die namentliche
// Nennung (frueher LexDrive UG) wird in den GENERIERTEN Artikeln via Deep-Transform
// entfernt — generated.ts bleibt unveraendert. Manuelle Artikel enthalten keine Nennung.
export const allArticles: Article[] = [...generatedArticles.map(deepGenerifyContent), ...manualArticles]
