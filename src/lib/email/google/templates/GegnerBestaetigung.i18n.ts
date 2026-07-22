// i18n-Strings fuer die GegnerBestaetigung-Email (Empfaenger = Unfallgegner).
// Der Airdrop-/Gegner-Flow ist heute deutschsprachig (auch die WA-/SMS-Bodies sind
// hart Deutsch) — daher aktuell nur 'de'. Struktur identisch zu MiniWizardMagicLink.i18n,
// damit spaeter Locales ergaenzt werden koennen (getX(locale) ?? de).

type S = {
  // subject line — branches on whether a name is present
  subject: (name: string) => string
  // salutation — branches on whether a name is present
  anrede: (name: string) => string
  // hidden preview text
  preview: string
  // body paragraph 1
  intro: string
  // body paragraph 2 (was nach der Bestaetigung passiert)
  ablauf: string
  // CTA button label
  cta: string
  // paragraph split around the inline <a href={APP_URL}> link
  linkHinweisPrefix: string
  linkHinweisSuffix: string
}

const de: S = {
  subject: (name) =>
    name ? `${name}, bitte bestätigen Sie Ihre Unfallmeldung` : 'Bitte bestätigen Sie Ihre Unfallmeldung',
  anrede: (name) => (name ? `Hallo ${name},` : 'Hallo,'),
  preview: 'Bestätigen Sie kurz Ihre Angaben zur Unfallmeldung',
  intro:
    'für Ihre Unfallmeldung bei Claimondo fehlt nur noch Ihre Bestätigung. Mit einem Klick auf den Button prüfen und bestätigen Sie Ihre Angaben.',
  ablauf:
    'Nach Ihrer Bestätigung melden wir den Schaden Ihrer Haftpflichtversicherung. Der Link ist 72 Stunden gültig.',
  cta: 'Angaben bestätigen',
  linkHinweisPrefix:
    'Bei Rückfragen antworten Sie einfach auf diese Email oder besuchen Sie ',
  linkHinweisSuffix: '.',
}

const ALL: Record<string, S> = { de }

export function getGegnerBestaetigungStrings(locale: string): S {
  return ALL[locale] ?? de
}
