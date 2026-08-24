import { PlacesFehler, type Betrieb, type Profil } from '../../places'
import { kernName } from '../../anreicherung/kern-name'
import { istClientseitig, sichtbarerText } from '../html'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`verz: 12`). */
export const VERZ_PUNKTE = 12
export const UMKREIS_KM = 25
export const SUCHBEGRIFF = 'Kfz-Sachverständiger'

/**
 * Punktverteilung — BESCHLUSS.
 *
 * ⭐ Was dieses Modul NICHT tut: fremde Branchenverzeichnisse abfragen. Dafuer
 * gibt es keine API, es bliebe nur das Auslesen der Portalseiten — und dafuer
 * gibt weder deren robots.txt noch R-G Deckung.
 *
 * Gemessen wird stattdessen die WURZEL, aus der Verzeichniseintraege
 * entstehen: Stimmen Name, Adresse und Telefonnummer auf der Website mit dem
 * Google-Profil ueberein? Widerspruechliche Firmendaten sind der haeufigste
 * Grund, warum ein Betrieb oertlich schlechter laeuft als er sollte — Google
 * kann zwei Adressen nicht zu einem Betrieb zusammenfuehren.
 */
export const GEWICHTE = { adresseDa: 3, adresseGleich: 4, telefonGleich: 3, nameGleich: 2 }

const LABEL: Record<keyof typeof GEWICHTE, string> = {
  adresseDa: 'Adresse auf der Website',
  adresseGleich: 'Adresse stimmt mit dem Profil überein',
  telefonGleich: 'Telefonnummer stimmt überein',
  nameGleich: 'Firmenname stimmt überein',
}

const SCHLUESSEL = Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[]
const MIN_KERN = 4

/**
 * Nur Ziffern, auf die nationale Form gebracht.
 *
 * ⚠ „0251 / 30 17 98 98", „+49 251 30179898" und „0251-30179898" sind
 * DIESELBE Nummer. Ein Vergleich auf Zeichenketten meldete hier einen
 * Widerspruch, den es nicht gibt — und der Sachverstaendige suchte einen
 * Fehler in seinen Daten.
 */
export function nurZiffern(s: string): string {
  const z = s.replace(/\D/g, '')
  return z.startsWith('49') ? `0${z.slice(2)}` : z
}

/** Gleich, wenn die eine Nummer auf die andere endet — Durchwahlen weichen ab. */
function gleicheNummer(a: string, b: string): boolean {
  const x = nurZiffern(a)
  const y = nurZiffern(b)
  if (x.length < 6 || y.length < 6) return false
  return x === y || x.endsWith(y) || y.endsWith(x)
}

/**
 * Straßenname mit Hausnummer.
 *
 * ⚠ HÖCHSTENS ein Wort vor dem Suffix. Ohne diese Grenze frisst der Ausdruck
 * alles bis zum ersten „Str." — im eigenen Test waren das dreissig Saetze
 * Fliesstext, die als Strassenname galten. Zwei Formen kommen vor:
 *   angehaengt   „Hafenweg 3", „Bahnhofstraße 12"   → ein Wort
 *   getrennt     „Weseler Str. 675 B"                → zwei Woerter
 *
 * `\b` hinter dem Suffix ist Pflicht: sonst greift „weg" auch in „wegen". ⚠ Es
 * gehoert aber NUR an die Suffixe ohne Punkt — nach „Str." gibt es keine
 * Wortgrenze (Punkt und Leerzeichen sind beide Nicht-Wort-Zeichen), und mit
 * einem `\b` dahinter faende der Ausdruck „Weseler Str. 675" nie.
 */
const STRASSE = /\b((?:[A-Za-zÄÖÜäöüß\-]+ )?[A-Za-zÄÖÜäöüß\-]*(?:(?:straße|strasse|weg|platz|allee|ring|damm|gasse|ufer|chaussee)\b|str\.))\s*(\d+\s*[a-zA-Z]?)\b/i

/** Postleitzahl und Straße mit Hausnummer aus einer Adresszeile. */
export function adressTeile(s: string): { plz: string | null; strasse: string | null } {
  const plz = s.match(/\b(\d{5})\b/)?.[1] ?? null
  const m = s.match(STRASSE)
  return {
    plz,
    strasse: m ? `${m[1].trim().replace(/\s+/g, ' ')} ${m[2].trim().replace(/\s+/g, '')}` : null,
  }
}

/** Vergleichbar machen: Kleinschreibung, „str." wie „straße", ohne Leerzeichen. */
function strassenKern(s: string): string {
  return s.toLowerCase()
    .replace(/stra(ß|ss)e/g, 'str')
    .replace(/str\./g, 'str')
    .replace(/[^a-zäöüß0-9]/g, '')
}

function findeEigenen(betriebe: Betrieb[], firmenname: string | null): Betrieb | null {
  if (!firmenname?.trim()) return null
  const gesucht = kernName(firmenname).replace(/\s+/g, '')
  if (gesucht.length < MIN_KERN) return null
  return betriebe.find((b) => {
    const kandidat = kernName(b.name).replace(/\s+/g, '')
    if (kandidat.length < MIN_KERN) return false
    return kandidat.includes(gesucht) || gesucht.includes(kandidat)
  }) ?? null
}

/**
 * Modul `verz` — stimmen die Firmendaten ueberein?
 *
 * ⚠ Steht in der Registry mit `braucht: null`, misst aber gegen das
 * Places-Profil. Kein Widerspruch: ohne Profil bleiben die drei Vergleiche
 * `nichtErhoben` mit Grund, und ob ueberhaupt eine Adresse auf der Website
 * steht, ist weiter messbar. Die Registry ist Vertrag und wird nicht geaendert.
 */
export async function messeVerz(
  k: Messkontext & { firmenname?: string | null },
): Promise<Messergebnis> {
  const erhoben = k.jetzt()
  const url = k.websiteUrl?.trim()

  if (!url) {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'verz',
        grund: 'Für diesen Check ist keine Website hinterlegt — es gibt keine Angaben, die man abgleichen könnte.',
      }],
    }
  }

  const quelle = `${url} · abgeglichen mit dem Google-Unternehmensprofil`
  const antwort = await k.hole(url)

  if (antwort.status !== 200 || !antwort.text) {
    const grund = antwort.status === 0
      ? `${url} war nicht erreichbar.`
      : `${url} antwortete mit Status ${antwort.status}.`
    return {
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const html = antwort.text

  // ⚠ Eine Anwendung liefert ihre Firmendaten erst im Browser aus. „Keine
  // Adresse auf der Website" waere dort schlicht falsch (R-B).
  if (istClientseitig(html)) {
    const grund =
      'Die Seite baut ihre Inhalte erst im Browser auf — welche Firmenangaben ein Leser sieht, ist ohne ' +
      'Browser nicht feststellbar.'
    return {
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const text = sichtbarerText(html)
  const seite = adressTeile(text)
  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // 1 · Steht ueberhaupt eine Adresse da?
  //
  // ⚠ Drei Faelle, nicht zwei. Viele deutsche Strassen tragen kein Suffix
  // („Am Mittelhafen 10" ist eine echte Muensteraner Anschrift) — der
  // Ausdruck findet sie nicht. Steht eine Postleitzahl da, aber keine
  // erkennbare Strasse, ist das NICHT FESTSTELLBAR, nicht „fehlt": Der
  // Vorwurf „keine Anschrift" waere in genau diesen Faellen falsch (R-B).
  const hatAdresse = Boolean(seite.plz && seite.strasse)
  if (seite.plz && !seite.strasse) {
    befunde.push(nichtErhoben(
      'adresseDa', LABEL.adresseDa, GEWICHTE.adresseDa,
      `Auf der Seite steht die Postleitzahl ${seite.plz}, aber keine Straße in einer Form, die sich ` +
      'zweifelsfrei erkennen lässt — etwa bei Namen ohne „-straße" oder „-weg".',
      quelle, erhoben,
    ))
  } else {
    befunde.push(befund(
      'adresseDa', LABEL.adresseDa, hatAdresse,
      hatAdresse ? GEWICHTE.adresseDa : 0, GEWICHTE.adresseDa, quelle, erhoben,
      hatAdresse
        ? `Gefunden: ${seite.strasse}, ${seite.plz}`
        : 'Keine Anschrift im Seitentext gefunden. Sie gehört sichtbar auf die Seite — Kunden und Suchmaschinen lesen sie dort.',
    ))
  }

  // 2-4 · Der Abgleich braucht das Profil
  let profil: Profil | null = null
  let profilGrund: string | null = null
  try {
    if (!k.standort) {
      profilGrund = 'Ohne Standort lässt sich das Unternehmensprofil nicht finden.'
    } else {
      const treffer = await k.places.suchText(SUCHBEGRIFF, { ...k.standort, km: UMKREIS_KM })
      const eigener = findeEigenen(treffer, k.firmenname ?? null)
      if (eigener) profil = await k.places.profil(eigener.placeId)
      if (!profil) {
        profilGrund = k.firmenname?.trim()
          ? `„${k.firmenname}" war in der Kartensuche nicht auffindbar — es gibt keine zweite Fassung zum Abgleich.`
          : 'Für diesen Check ist kein Firmenname hinterlegt — das eigene Profil lässt sich nicht identifizieren.'
      }
    }
  } catch (err) {
    const t = err instanceof PlacesFehler ? err.status : (err as Error).message
    profilGrund = `Die Kartensuche antwortete nicht verwertbar (${t}) — kein Abgleich möglich.`
  }

  if (!profil) {
    const grund = profilGrund ?? 'Kein Unternehmensprofil zum Abgleich gefunden.'
    for (const s of ['adresseGleich', 'telefonGleich', 'nameGleich'] as const) {
      befunde.push(nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben))
    }
    return { befunde, fehlstellen }
  }

  const imProfil = adressTeile(profil.adresse ?? '')

  // Adresse: PLZ und Straßenkern müssen beide passen. Eine gleiche PLZ allein
  // heisst nur „selbe Stadt".
  if (!hatAdresse || !imProfil.plz || !imProfil.strasse) {
    befunde.push(nichtErhoben(
      'adresseGleich', LABEL.adresseGleich, GEWICHTE.adresseGleich,
      hatAdresse
        ? 'Im Unternehmensprofil ist keine vollständige Anschrift hinterlegt.'
        : 'Auf der Website wurde keine vollständige Anschrift gefunden — es gibt nichts zu vergleichen.',
      quelle, erhoben,
    ))
  } else {
    const gleich = seite.plz === imProfil.plz &&
      strassenKern(seite.strasse!) === strassenKern(imProfil.strasse)
    befunde.push(befund(
      'adresseGleich', LABEL.adresseGleich, gleich,
      gleich ? GEWICHTE.adresseGleich : 0, GEWICHTE.adresseGleich, quelle, erhoben,
      gleich
        ? 'Website und Unternehmensprofil nennen dieselbe Anschrift.'
        // ⚠ BEIDE Fassungen nennen — sonst weiss niemand, welche stimmt.
        : `Website: „${seite.strasse}, ${seite.plz}" · Profil: „${imProfil.strasse}, ${imProfil.plz}". ` +
          'Google kann zwei Anschriften nicht zu einem Betrieb zusammenführen.',
    ))
  }

  // Telefon
  const seitenNummer = text.match(/\b(?:\+49[\s/-]?|0)\d{2,5}[\s/-]?\d[\d\s/-]{4,}/)?.[0] ?? null
  if (!seitenNummer || !profil.telefon) {
    befunde.push(nichtErhoben(
      'telefonGleich', LABEL.telefonGleich, GEWICHTE.telefonGleich,
      !seitenNummer
        ? 'Auf der Website wurde keine Telefonnummer gefunden.'
        : 'Im Unternehmensprofil ist keine Telefonnummer hinterlegt.',
      quelle, erhoben,
    ))
  } else {
    const gleich = gleicheNummer(seitenNummer, profil.telefon)
    befunde.push(befund(
      'telefonGleich', LABEL.telefonGleich, gleich,
      gleich ? GEWICHTE.telefonGleich : 0, GEWICHTE.telefonGleich, quelle, erhoben,
      gleich
        ? 'Dieselbe Nummer auf Website und Profil.'
        : `Website: „${seitenNummer.trim()}" · Profil: „${profil.telefon}". Anrufer landen je nach Weg woanders.`,
    ))
  }

  // Name — über den Kern, nicht über die Zeichenkette
  const eigenerKern = kernName(k.firmenname ?? '').replace(/\s+/g, '')
  const profilKern = kernName(profil.name).replace(/\s+/g, '')
  if (eigenerKern.length < MIN_KERN || profilKern.length < MIN_KERN) {
    befunde.push(nichtErhoben(
      'nameGleich', LABEL.nameGleich, GEWICHTE.nameGleich,
      'Die Namen bestehen überwiegend aus Gattungswörtern — ein Abgleich wäre nicht belastbar.',
      quelle, erhoben,
    ))
  } else {
    const gleich = eigenerKern.includes(profilKern) || profilKern.includes(eigenerKern)
    befunde.push(befund(
      'nameGleich', LABEL.nameGleich, gleich,
      gleich ? GEWICHTE.nameGleich : 0, GEWICHTE.nameGleich, quelle, erhoben,
      gleich
        ? `Im Profil geführt als „${profil.name}".`
        : `Angegeben: „${k.firmenname}" · im Profil: „${profil.name}".`,
    ))
  }

  return { befunde, fehlstellen }
}
