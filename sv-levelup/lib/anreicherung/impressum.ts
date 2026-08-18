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

function entobfuskiere(s: string): string {
  return s
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
}

const BILDENDUNG = /\.(png|jpe?g|gif|webp|svg|ico)$/i

export function extrahiere(html: string): ImpressumBefund {
  // Skripte und Styles raus, sonst landen Tracking- und CSS-Adressen im Befund
  const sauber = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  // mailto: hat Vorrang — das ist eine Absicht, kein Zufallstreffer
  const mailto = sauber.match(/mailto:([^"'>\s?]+)/i)
  let email: string | null = mailto ? mailto[1] : null

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

  const telTreffer = nurText.match(/(?:\+49|0049|0)[\d\s/().-]{6,}/)
  const telefon = telTreffer ? zuE164(telTreffer[0]) : null

  // Nur wenn EINDEUTIG eine Person genannt ist (F-15/F-16) — sonst null
  const personTreffer = nurText.match(
    /(?:Inhaber(?:in)?|Gesch(?:ä|ae)ftsf(?:ü|ue)hrer(?:in)?|vertreten durch)\s*:?\s*((?:Dipl\.-?\s?Ing\.?\s*|Dr\.?\s*|Ing\.?\s*)*[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+)/,
  )
  const person = personTreffer
    ? personTreffer[1].replace(/(?:Dipl\.-?\s?Ing\.?|Dr\.?|Ing\.?)\s*/g, '').trim()
    : null

  const lokalteil = email ? email.split('@')[0] : ''
  return { email, telefon, person, istRollenadresse: ROLLEN.includes(lokalteil) }
}
