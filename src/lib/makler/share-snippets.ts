// Geteilte Share-Snippet-Generierung fuer die Makler-Aktivierung (Success-Page + Wizard +
// /makler/promo). Aus Promo-Code + Firma + Basis-URL -> Landeseiten-URL, WhatsApp-Link,
// E-Mail-Signatur, Website-Embed. Nutzersichtbare Texte auf Deutsch, Kundennutzen-Framing
// (kein Provisions-Claim — UWG entkoppelt).

export type ShareSnippets = {
  url: string
  whatsappHref: string
  signatur: string
  embed: string
}

export function buildShareSnippets(code: string, firma: string, base: string): ShareSnippets {
  const cleanBase = base.replace(/\/+$/, '')
  const url = `${cleanBase}/m/${code}`
  const waText = `Kfz-Schaden? ${firma} empfiehlt Claimondo — unabhängigen Gutachter finden und den Schaden kostenlos regulieren lassen: ${url}`
  return {
    url,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(waText)}`,
    signatur: `${firma} · Kfz-Schaden? Kostenlos regulieren mit Claimondo: ${url}`,
    embed: `<a href="${url}" target="_blank" rel="noopener">Kfz-Schaden regulieren mit ${firma} · Claimondo</a>`,
  }
}

export type MaklerReferralSnippets = {
  url: string
  whatsappHref: string
  mailtoHref: string
}

// Snippets zum Werben WEITERER Makler (Empfehlungsstruktur) — anders als buildShareSnippets
// (Kunden-Landeseite /m/<code>): Ziel ist die Makler-Registrierung mit Werber-Bezug.
export function buildMaklerReferralSnippets(
  code: string,
  firma: string,
  base: string,
): MaklerReferralSnippets {
  const cleanBase = base.replace(/\/+$/, '')
  const url = `${cleanBase}/makler/registrieren?werber=${encodeURIComponent(code)}`
  const waText = `${firma} lädt Sie zum Claimondo Makler-Partnerprogramm ein — kostenlos registrieren und pro vermitteltem Gutachten verdienen: ${url}`
  const mailSubject = 'Einladung zum Claimondo Makler-Partnerprogramm'
  const mailBody = `Hallo,\n\n${firma} lädt Sie ein, Makler-Partner bei Claimondo zu werden.\nKostenlos registrieren: ${url}\n\nViele Grüße`
  return {
    url,
    whatsappHref: `https://wa.me/?text=${encodeURIComponent(waText)}`,
    mailtoHref: `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`,
  }
}
