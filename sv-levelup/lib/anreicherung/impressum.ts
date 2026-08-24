import { zuE164 } from './telefon-e164'

/**
 * Rollenadressen sind zulaessig, tragen aber hoechstens 60 Sicherheit (F-16,
 * T-25) — hinter info@ steckt keine benennbare Person, was fuer die spaetere
 * Ansprache einen Unterschied macht.
 */
const ROLLEN = [
  'info', 'kontakt', 'office', 'mail', 'email', 'buero', 'kanzlei',
  'service', 'anfrage', 'post', 'zentrale', 'sekretariat',
]

export type ImpressumBefund = {
  email: string | null
  telefon: string | null
  person: string | null
  istRollenadresse: boolean
}

const BENANNTE_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

/**
 * Deutet HTML-Entities: dezimal `&#105;`, hexadezimal `&#x6e;` und die
 * handvoll benannter, die im Umfeld einer Adresse vorkommen.
 *
 * ⚠ Ohne das landet die Zeichenfolge selbst als "E-Mail" in der Datenbank —
 * echter Fall vom 18.08. (sv-rommerskirchen.de kodiert die Adresse so gegen
 * Spam-Ernter). Der Wert sah gefuellt aus und war unbrauchbar.
 */
export function deuteEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dez) => String.fromCodePoint(parseInt(dez, 10)))
    .replace(/&([a-z]+);/gi, (treffer, name) => BENANNTE_ENTITIES[name.toLowerCase()] ?? treffer)
}

function entobfuskiere(s: string): string {
  return deuteEntities(s)
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
}

const BILDENDUNG = /\.(png|jpe?g|gif|webp|svg|ico)$/i
/** Vollstaendige Adress-Form: genau ein @, TLD mit mindestens zwei Zeichen, kein Whitespace. */
const ADRESSE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/

export function extrahiere(html: string): ImpressumBefund {
  // Skripte und Styles raus, sonst landen Tracking- und CSS-Adressen im Befund
  const sauber = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  // mailto: hat Vorrang — das ist eine Absicht, kein Zufallstreffer
  const mailto = sauber.match(/mailto:([^"'>\s?]+)/i)
  let email: string | null = mailto ? deuteEntities(mailto[1]) : null

  const nurText = entobfuskiere(sauber.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')

  if (!email) {
    const treffer = nurText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    email = treffer ? treffer[0] : null
  }
  if (email) {
    email = email.toLowerCase().replace(/[.,;]+$/, '')
    // "logo@2x.png" sieht fuer den Regex wie eine Adresse aus
    if (BILDENDUNG.test(email)) email = null
  }
  // Auffangschutz fuer jede Verschleierung, die hier nicht vorhergesehen ist
  // (JavaScript-Zusammenbau, CSS-Umkehr, Unicode-Tricks): sieht das Ergebnis
  // nicht wie eine Adresse aus, gibt es keine Adresse. R-B — lieber kein Wert
  // als ein falscher, der gefuellt aussieht.
  if (email && !ADRESSE.test(email)) email = null

  const telTreffer = nurText.match(/(?:\+49|0049|0)[\d\s/().-]{6,}/)
  const telefon = telTreffer ? zuE164(telTreffer[0]) : null

  // Nur wenn EINDEUTIG eine Person genannt ist (F-15/F-16) — sonst null.
  //
  // ⚠ Anrede und Titel muessen VOR dem Namen abgezogen werden, sonst wandert
  // "Herr" in den Vornamen und der echte Nachname faellt hinten raus. Echter
  // Fall (18.08., sv-bergk.de): "Geschäftsführer: Herr Patrick Brandenburg"
  // ergab vorname="Herr", nachname="Patrick".
  const VORSATZ = String.raw`(?:Herrn?|Frau|Dipl\.-?\s?Ing\.?|Dr\.?|Prof\.?|Ing\.?)`
  const personTreffer = nurText.match(
    new RegExp(
      String.raw`(?:Inhaber(?:in)?|Gesch(?:ä|ae)ftsf(?:ü|ue)hrer(?:in)?|vertreten durch)` +
      String.raw`\s*:?\s*((?:${VORSATZ}\s+)*[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)`,
    ),
  )
  let person = personTreffer
    ? personTreffer[1].replace(new RegExp(String.raw`${VORSATZ}\s*`, 'g'), '').trim()
    : null
  // Bleibt nach dem Abziehen kein Vor- UND Nachname uebrig, ist es kein Name.
  // Nicht auf Truthiness pruefen: der Leerstring ist falsy und rutschte durch.
  if (person !== null && person.split(/\s+/).filter(Boolean).length < 2) person = null

  const lokalteil = email ? email.split('@')[0] : ''
  return { email, telefon, person, istRollenadresse: ROLLEN.includes(lokalteil) }
}
