// Verkehrsrechts-Partnerkanzlei generisch (Cowork-Entscheidung 2026-06-12 —
// ueberschreibt die alte „LexDrive bleibt benannt"-Linie). Die namentliche Nennung
// (frueher „LexDrive UG", Link lex-drive.com) wird site-weit entfernt; das
// E-E-A-T-/Trust-Signal bleibt unbenannt erhalten.
//
// Diese Funktion laeuft NUR ueber GENERIERTE Bodies/FAQ/quickAnswer im Merge-Layer
// (content/articles/index.ts, content/rest-pages/index.ts) → die *.generated.ts-
// Dateien bleiben unveraendert (git diff = 0). Manuelle Vergleichs-Seiten
// (Claimondo-Kontext, UWG-§6-Transparenz) sind bewusst AUSGENOMMEN.
//
// Singular „Partnerkanzlei" (real = 1 Kanzlei) — auf Plural umstellbar, sobald ≥2.

// „Partnerkanzlei" ist feminin — der Kasus haengt am Wort DAVOR, nicht am Namen,
// den wir ersetzen. Ein einziger Ersatzstring kann deshalb nicht ueberall passen:
//   Nominativ/Akkusativ → „unsere"   („durch unsere …", „… ist unsere …")
//   Dativ/Genitiv       → „unserer"  („mit unserer …", „Kosten unserer …")
// Vor dem Split stand hier nur „unsere“, was live 85 Stellen auf 30 Seiten
// verunstaltete („In Partnerschaft mit unsere Verkehrsrechts-Partnerkanzlei“) —
// grossteils in meta-descriptions, also sichtbar in den Google-Ergebnissen.
const PARTNER_NOM = 'unsere Verkehrsrechts-Partnerkanzlei'
const PARTNER_DAT = 'unserer Verkehrsrechts-Partnerkanzlei'

// Praepositionen, die Dativ fordern (+ Genitiv-Praepositionen — feminin gleiche Form).
const DATIV_PRAEP = 'mit|bei|von|zu|nach|aus|seit|gegenüber|wegen|während|trotz'

export function genericizePartner(text: string): string {
  return (
    text
      // 1) Markdown-Link, der LexDrive nennt, auf lex-drive.com → generisch + /gutachter-finden
      .replace(
        /\[[^\]]*?LexDrive[^\]]*?\]\(https?:\/\/(?:www\.)?lex-drive\.com[^)]*\)/gi,
        `[${PARTNER_NOM}](/gutachter-finden)`,
      )
      // 2) sonstige lex-drive.com-Linkziele in Markdown → /gutachter-finden
      .replace(/\(https?:\/\/(?:www\.)?lex-drive\.com[^)]*\)/gi, '(/gutachter-finden)')
      // 3) nackte URLs
      .replace(/https?:\/\/(?:www\.)?lex-drive\.com[^\s)"'\]]*/gi, '/gutachter-finden')
      // 4) Bindestrich-Kompositum („LexDrive-Mandanten", „LexDrive-Partnerschaft").
      //    Hier passt KEIN Artikel-Wort: im Text steht schon einer davor („die
      //    LexDrive-Mandanten"). Nur das Namensglied wird generisch.
      .replace(/LexDrive-(?=[A-Za-zäöüÄÖÜß])/g, 'Kanzlei-')
      // 5) „(Partner-)Kanzlei LexDrive (UG)" → „Verkehrsrechts-Partnerkanzlei"
      //    (ohne „unsere" — das Bezugswort traegt hier bereits seinen Artikel)
      .replace(/(?:Partner-?)?[Kk]anzlei\s+LexDrive(?:\s+UG)?/g, 'Verkehrsrechts-Partnerkanzlei')
      // 6) Artikel + Name → das Possessivpronomen ERSETZT den Artikel, sonst
      //    entstuende „die Anwaltskosten der unsere …". Genitiv/Dativ vs. Nom/Akk.
      .replace(/\b(?:der|des)\s+LexDrive(?:\s+UG)?\b/g, PARTNER_DAT)
      .replace(/\b(?:die|das|den|dem)\s+LexDrive(?:\s+UG)?\b/g, PARTNER_NOM)
      // 7) Dativ-/Genitiv-Praeposition davor → „unserer" (Schreibweise der
      //    Praeposition bleibt erhalten, damit Satzanfaenge gross bleiben)
      .replace(
        new RegExp(`\\b(${DATIV_PRAEP})\\s+LexDrive(?:\\s+UG)?\\b`, 'gi'),
        (_m, praep: string) => `${praep} ${PARTNER_DAT}`,
      )
      // 8) „LexDrive UG" → generisch (Nominativ/Akkusativ)
      .replace(/LexDrive\s+UG/gi, PARTNER_NOM)
      // 9) verbleibendes „LexDrive"
      .replace(/LexDrive/gi, PARTNER_NOM)
  )
}

/**
 * Entfernt den Partnerschafts-Nachsatz am ENDE einer meta-description.
 *
 * Warum nur dort: Nach der Entnamung nennt der Satz keinen Namen mehr, ist also
 * kein Trust-Signal — kostet in der description aber ~57 der rund 160 Zeichen,
 * die Google anzeigt. Die Entnamung hat ihn zudem um 26 Zeichen verlaengert
 * („LexDrive." → „unserer Verkehrsrechts-Partnerkanzlei.") und damit 10 von 13
 * zu langen descriptions ueberhaupt erst ueber die Grenze geschoben.
 *
 * Der Hinweis bleibt auf der SEITE sichtbar (components/article/parts.tsx) und im
 * Body — er verschwindet nur aus dem Suchergebnis-Snippet.
 *
 * ⚠ Bewusst nur am Zeilenende ($): mitten im Text ist „In Partnerschaft mit …"
 * tragender Inhalt (z.B. „… In Partnerschaft mit LexDrive entstanden …").
 */
export function stripPartnerNachsatzAusDescription(text: string): string {
  return (
    text
      // „…, in Partnerschaft mit LexDrive." → Komma wird zum Satzschluss,
      // sonst endet die description ohne Punkt.
      .replace(/\s*,\s*in Partnerschaft mit LexDrive(?:\s+UG)?\s*\.\s*$/, '.')
      // „… . In Partnerschaft mit LexDrive." → der Punkt davor traegt den Satz
      .replace(/\s*In Partnerschaft mit LexDrive(?:\s+UG)?\s*\.\s*$/, '')
  )
}

// Strukturelle Keys, die NICHT angefasst werden (Routen/Slugs/IDs/Daten/Enums/Bildpfade).
const SKIP_KEYS = new Set([
  'slug', 'route', 'url', 'src', 'author', 'kind', 'cluster', 'datePublished', 'dateModified',
])

// Felder, die als meta-description im <head> landen (lib/rest.ts, app/[article]/page.tsx).
// NICHT `metaDesc` (Decoder): das Feld wird zusaetzlich als sichtbarer Text auf der
// Uebersicht gerendert (app/versicherer-decoder/page.tsx) — und traegt den Nachsatz
// ohnehin nirgends (0 von 21 gemessen).
const DESCRIPTION_KEYS = new Set(['description'])

// Deep-Transform: genericizePartner auf ALLE String-Felder eines Content-Objekts
// (Article/RestPage/Decoder, inkl. atAGlance/sections/tldr/metaDesc), strukturelle
// Keys ausgenommen. Nur lex-drive-/LexDrive-Strings aendern sich.
export function deepGenerifyContent<T>(value: T): T {
  if (typeof value === 'string') return genericizePartner(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => deepGenerifyContent(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.has(k)) out[k] = v
      else if (DESCRIPTION_KEYS.has(k) && typeof v === 'string') {
        // ⚠ Reihenfolge: ZUERST strippen, DANN entnamen. Umgekehrt sucht der Strip
        // nach „LexDrive", das die Entnamung gerade ersetzt hat — er liefe ins Leere.
        out[k] = genericizePartner(stripPartnerNachsatzAusDescription(v))
      } else out[k] = deepGenerifyContent(v)
    }
    return out as T
  }
  return value
}
