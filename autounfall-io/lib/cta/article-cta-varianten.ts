// Kontext-abhaengige Varianten fuer den Artikel-Footer-CTA (ArticleCta).
//
// WARUM: Der CTA war auf ~120 rest-pages identisch ("Unverschuldet verunfallt?
// Beweise sichern lassen"). Gemessen (nginx-Log 01.-11.08.2026) kommen aber ~60 %
// der Formular-Besucher von /schadenfreiheitsklasse/* — Menschen, die ihren
// SF-Rabatt recherchieren, nicht einen Gutachter suchen. 113 echte Browser
// standen auf dem Formular, 0 haben abgesendet: Intent-Mismatch, kein Bug.
//
// Die SFK-Variante baut die inhaltliche Bruecke (unverschuldet -> keine
// Rueckstufung -> dafuer muss die Haftung dokumentiert sein) und traegt ein
// ref-Attribut, damit die Herkunft im Lead sichtbar wird (quelle_variant war
// bisher NULL fuer alle ~120 ArticleCta-Instanzen).
//
// Data/View-Trennung nach dem Muster von lib/tools/kuerzungs-checker-data.ts.

export type CtaVariante = {
  /** Ueberschrift, Teil 1 (normal gesetzt) */
  h2Pre: string
  /** Ueberschrift, Teil 2 (kursiv hervorgehoben) */
  h2Highlight: string
  body: string
  trust: string
  button: string
  /** ?ref=-Wert fuer die Lead-Attribution; null = kein Parameter */
  ref: string | null
}

/** Unveraendert der Bestandstext — gilt fuer alle Seiten ohne eigene Variante. */
export const DEFAULT_CTA: CtaVariante = {
  h2Pre: 'Unverschuldet verunfallt?',
  h2Highlight: 'Beweise sichern lassen',
  body:
    'Ein unabhängiges Gutachten dokumentiert Schaden und Hergang — die Grundlage Ihrer Forderung. Bei Fremdverschulden kostenfrei.',
  trust: 'Bei unverschuldetem Unfall kostenfrei · § 249 BGB',
  button: 'Sachverständigen anfragen',
  ref: null,
}

/**
 * ref muss ^[a-z0-9_-]{1,64}$ erfuellen (Validierung in
 * app/gutachter-finden/actions.ts) — sonst wird die Attribution still verworfen.
 */
export function sanitizeRef(wert: string): string {
  return wert
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

/** Liefert die passende Variante zur Route (z. B. '/schadenfreiheitsklasse/huk24'). */
export function ctaVarianteFuerRoute(route?: string | null): CtaVariante {
  const pfad = (route ?? '').trim()

  // Schadenfreiheitsklasse-Cluster: SF-Rabatt-Recherche, nicht Gutachter-Suche.
  if (pfad === '/schadenfreiheitsklasse' || pfad.startsWith('/schadenfreiheitsklasse/')) {
    const slug = pfad.slice('/schadenfreiheitsklasse'.length).replace(/^\//, '')
    const ref = slug ? sanitizeRef(`sfk-${slug}`) : 'sfk'
    return {
      h2Pre: 'Unverschuldet?',
      h2Highlight: 'Dann darf Ihre SF-Klasse nicht sinken',
      body:
        'Wer den Unfall nicht verursacht hat, wird nicht zurückgestuft — die Gegenseite zahlt. Voraussetzung: Schaden und Hergang sind sauber dokumentiert. Genau das leistet ein unabhängiges Gutachten.',
      trust: 'Bei unverschuldetem Unfall kostenfrei · § 249 BGB',
      button: 'Schaden dokumentieren lassen',
      ref,
    }
  }

  return DEFAULT_CTA
}

/** Baut das CTA-Ziel inkl. Attribution. */
export function ctaHref(variante: CtaVariante): string {
  return variante.ref ? `/gutachter-finden?ref=${variante.ref}` : '/gutachter-finden'
}
