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
