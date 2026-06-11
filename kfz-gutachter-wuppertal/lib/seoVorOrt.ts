import { seoBodyFor } from './cluster'

// BRIEF 08l A2 · Der "Vor Ort in ganz {Stadt}"-Absatz zieht aus dem SEO-Body
// in Block 1 der Lokal-Strecke (EinsatzgebietSection) — Copy dort gerendert,
// SeoBodySection ueberspringt ihn (kein Duplikat).
// 08o O6: Markierung jetzt EDITORIAL via `vorort: true` im SEO_BODY-Datenfeld
// statt Trigger-Regex auf dem Fliesstext — gleiche Abschaffung wie beim
// H3-Trigger-Katalog (Fehlgriff-Klasse N9-Hochwasser/O6-Leverkusen).
export function vorortAbsatzFor(stadtSlug: string): string | null {
  return seoBodyFor(stadtSlug).find((a) => a.vorort)?.text ?? null
}
