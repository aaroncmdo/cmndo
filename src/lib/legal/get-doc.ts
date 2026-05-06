import 'server-only'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Quelle der Wahrheit: src/content/legal/*.md
// Inhalte stammen aus dem Drive-Folder (01_AGB / 02_Datenschutz / 04_Impressum
// / 05_Nutzungsbedingungen) und werden via scripts/convert-legal-txt.mjs
// importiert. Markdown-Form ermoeglicht spaeteres Editieren ohne Code-Push.

export type LegalDocSlug =
  | 'agb'
  | 'datenschutz'
  | 'impressum'
  | 'nutzungsbedingungen'

export type LegalDoc = {
  slug: LegalDocSlug
  titel: string
  markdown: string
}

const TITEL: Record<LegalDocSlug, string> = {
  agb: 'Allgemeine Geschäftsbedingungen',
  datenschutz: 'Datenschutzerklärung',
  impressum: 'Impressum',
  nutzungsbedingungen: 'Nutzungsbedingungen',
}

export function getLegalDoc(slug: LegalDocSlug): LegalDoc {
  const path = join(process.cwd(), 'src/content/legal', `${slug}.md`)
  const markdown = readFileSync(path, 'utf8')
  return { slug, titel: TITEL[slug], markdown }
}

export function getAllLegalDocs(): Record<LegalDocSlug, LegalDoc> {
  return {
    agb: getLegalDoc('agb'),
    datenschutz: getLegalDoc('datenschutz'),
    impressum: getLegalDoc('impressum'),
    nutzungsbedingungen: getLegalDoc('nutzungsbedingungen'),
  }
}
