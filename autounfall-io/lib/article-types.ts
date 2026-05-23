// Content-Layer-Typen + Autoren-Daten fuer den Artikel-Port (WP-2).
// Reine Typen/Daten — KEINE Imports (vermeidet Zyklen mit den Content-Modulen).
// STANDALONE: Autoren-Affiliation = Kitta & Sprafke UG, KEINE claimondo.de-URLs.

export type ArticleAuthorId = 'nicolas-kitta' | 'aaron-sprafke'

export interface ArticleFaq {
  q: string
  a: string
}

export interface ArticleGlanceItem {
  term: string
  detail: string
}

export interface ArticleHowTo {
  name: string
  steps: { name: string; text: string }[]
}

export interface ArticleHero {
  /** public-Pfad, z.B. /heroes/auffahrunfall.png (aus den Drive-Assets nach public/ kopiert) */
  src: string
  alt: string
  width: number
  height: number
}

export interface Article {
  slug: string // Route + Canonical: /<slug>
  title: string // <title> / og:title
  h1: string // sichtbare Headline (kann vom title abweichen)
  h1Accent?: string // optionales Akzent-Fragment in der h1 (italic + amber)
  description: string // Meta-Description
  eyebrow: string // z.B. "Schuldfrage · Schaden-Typ · 8 Min Lesezeit"
  pillar?: { name: string; slug: string } // Breadcrumb-Elternknoten
  hero?: ArticleHero // optional — Hero-Bild aus Drive-Assets
  datePublished: string // ISO (YYYY-MM-DD)
  dateModified: string
  author: ArticleAuthorId
  readingNote?: string // z.B. "~1.400 Wörter"
  quickAnswer: string[] // Absätze der Quick-Answer-Kapsel (Markdown-inline erlaubt)
  atAGlance?: ArticleGlanceItem[]
  body: string // Markdown-Prosa (h2-Abschnitte)
  faq?: ArticleFaq[]
  howto?: ArticleHowTo
  sources?: string[]
}

export interface Author {
  id: ArticleAuthorId
  name: string
  givenName: string
  familyName: string
  jobTitle: string
  sameAs: string[] // persönliche LinkedIn-Profile (keine Claimondo-Footprints)
  knowsAbout: string[]
}

export const AUTHORS: Record<ArticleAuthorId, Author> = {
  'nicolas-kitta': {
    id: 'nicolas-kitta',
    name: 'Nicolas Kitta',
    givenName: 'Nicolas',
    familyName: 'Kitta',
    jobTitle: 'Co-Founder & CEO, Kitta & Sprafke UG',
    sameAs: ['https://www.linkedin.com/in/nicolas-kitta-451947246/'],
    knowsAbout: ['Schadensrecht nach § 249 BGB', 'Anscheinsbeweis', 'Haftungsverteilung Verkehrsunfall'],
  },
  'aaron-sprafke': {
    id: 'aaron-sprafke',
    name: 'Aaron Sprafke',
    givenName: 'Aaron',
    familyName: 'Sprafke',
    jobTitle: 'Co-Founder & COO, Kitta & Sprafke UG',
    sameAs: ['https://de.linkedin.com/in/aaron-sprafke-355085237'],
    knowsAbout: ['Schadensregulierung', 'Kfz-Versicherungs-Prozesse'],
  },
}
