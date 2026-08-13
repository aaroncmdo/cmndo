// AAR-182: Shared ZB1-Parser — extrahiert aus /api/ocr-fahrzeugschein damit
// sowohl der Fall-Endpoint als auch der Lead-Inbound-Webhook dieselbe Logik
// nutzt. Neue Felder (Baujahr aus Erstzulassung, AAR-181) leben jetzt hier.

const FIN_REGEX = /\b([A-HJ-NPR-Z0-9]{17})\b/gi
const DATE_REGEX = /\b(\d{2}\.\d{2}\.\d{4})\b/
const PLZ_ORT_REGEX = /\b(\d{5})\s+(.+)/
// Spec B (Aaron 14.07.): ZB1-Feld J = EU-/KBA-Fahrzeugklasse. Der HARTE Filter fuers Werkstatt-Matching
// (eine PKW-Werkstatt repariert keinen LKW) — und sie steht in JEDEM Schein, wir haben sie nur nie
// gelesen. M1=PKW · N1=Transporter · N2/N3=LKW · M2/M3=Bus · L3e/L4e=Motorrad · L1e/L2e/L5e-L7e=
// Leichtfahrzeug · O1-O4=Anhaenger · T/C/R/S=Land-/Forst. Kein KI, keine Schwacke-Lizenz noetig.
const FAHRZEUGKLASSE_REGEX = /\b(M[123]|N[123]|L[1-7]e|O[1-4]|[TCRS][1-4]?)\b/i

/**
 * Normalisiert die OCR-Ausgabe auf das Vokabular der `fahrzeugklassen`-Tabelle:
 *   'm1'   -> 'M1'      (Uppercase)
 *   'L3E'  -> 'L3e'     (das Suffix-e ist im EU-Vokabular klein)
 *   'T1'   -> 'T'       (die Tabelle fuehrt T/C/R/S; die Reparatur-Gruppe land_forst ist fuer
 *                        T1..T4 ohnehin dieselbe)
 */
function normalisiereFahrzeugklasse(roh: string): string {
  const k = roh.trim().toUpperCase()
  if (/^[TCRS]\d?$/.test(k)) return k[0]
  if (/^L[1-7]E$/.test(k)) return `${k[0]}${k[1]}e`
  return k
}

const HSN_REGEX = /\b(\d{4})\b/
const TSN_REGEX = /\b([A-Z0-9]{3})\b/i

// Amtliches Kennzeichen: 1-3 Buchstaben (Kreis) + 1-2 Buchstaben + 1-4 Ziffern.
// Als ANKER (^…$) — dient dazu, einen Wert zu BESTAETIGEN, nicht ihn irgendwo
// aus dem Fliesstext zu fischen (genau das erzeugte den Phantom-Wert "Q-F 2").
const KENNZEICHEN_ANKER = /^([A-ZÄÖÜ]{1,3})[\s-]?([A-Z]{1,2})[\s-]?(\d{1,4})[A-Z]?$/i

// B5 (13.08.): Feldcodes, die Google Vision je nach Scan-Layout ENTWEDER allein auf
// eine Zeile legt ODER zusammen mit der amtlichen Beschriftung:
//     "A"                        + Folgezeile "XX Z123"
//     "A Amtliches Kennzeichen"  + Folgezeile "XX Z123"
// Die bisherigen Anker (^A$, ^C\.?1\.2$, …) trafen nur die erste Form — im einzigen
// echten prod-Scan greift deshalb KEIN Label, und alle Halterfelder kamen aus
// Zufalls-Fallbacks (Straße = "C1.3 Anschnitt", Nachname = der Vorname).
const ZB1_FELDCODES = [
  'A', 'B', 'J', 'R',
  'C1', 'C1.1', 'C1.2', 'C1.3', 'C3', 'C4',
  'D1', 'D2', 'D3',
  '2.1', '2.2',
] as const

/** "C.1.1" / "C1.1" / "c11" -> "C11" — macht die Punkt-Schreibweisen vergleichbar. */
function normalisiereFeldCode(roh: string): string {
  return roh.toUpperCase().replace(/\./g, '')
}

const FELDCODES_NORMALISIERT = new Set<string>(ZB1_FELDCODES.map(normalisiereFeldCode))

/**
 * Zerlegt eine OCR-Zeile in Feldcode + Rest, sofern das erste Token ein bekannter
 * ZB1-Feldcode ist. `rest` ist je nach Layout die amtliche Beschriftung
 * ("Amtliches Kennzeichen") oder bereits der Wert ("14.01.2018" bei "B 14.01.2018").
 *
 * Bewusst gegen eine feste Code-Liste statt gegen ein generisches Muster: sonst
 * ginge eine Wertzeile wie "XX Z123" als Label "XX" durch.
 */
function zerlegeFeldZeile(zeile: string): { code: string; rest: string } | null {
  const kompakt = zeile.trim()
  const trenner = kompakt.search(/\s/)
  const kopf = trenner === -1 ? kompakt : kompakt.slice(0, trenner)
  const rest = trenner === -1 ? '' : kompakt.slice(trenner + 1).trim()
  const code = normalisiereFeldCode(kopf)
  return FELDCODES_NORMALISIERT.has(code) ? { code, rest } : null
}

/** Ist die Zeile ein Feld-LABEL (evtl. mit Beschriftung) statt eines Werts? */
function istFeldLabel(zeile: string): boolean {
  return zerlegeFeldZeile(zeile) !== null
}

/**
 * Bringt eine Hersteller-Schreibweise auf das kanonische Vokabular
 * ("FIAT" -> "Fiat", "BAYER. MOT. WERKE" -> "BMW"); ohne Treffer bleibt der Rohwert.
 *
 * Wird von BEIDEN Pfaden genutzt — Label-Treffer (D.1) und Keyword-Fallback —,
 * damit die Schreibweise nicht vom Scan-Layout abhaengt: der Label-Pfad lieferte
 * sonst "FIAT", der Fallback "Fiat", und ein Vergleich auf Herstellernamen
 * (Werkstatt-Matching) traefe je nach Scan ins Leere.
 */
function normalisiereHersteller(roh: string): string {
  for (const { patterns, normalized } of HERSTELLER_KEYWORDS) {
    if (patterns.some((p) => p.test(roh))) return normalized
  }
  return roh
}

// AAR-351: Hersteller-Keywords für Fallback-Extraktion, wenn das Label-
// basierte Matching (^D.1$ auf eigener Zeile) an der Vision-API-Fließtext-
// Ausgabe scheitert. Patterns decken ZB1-typische OCR-Varianten ab
// (z.B. "BAYER.MOT.WERKE" für BMW). Reihenfolge: spezifischere zuerst
// damit "MERCEDES-BENZ" vor "MERCEDES" matcht, "VOLKSWAGEN" vor "VW".
const HERSTELLER_KEYWORDS: Array<{ patterns: RegExp[]; normalized: string }> = [
  { patterns: [/BAYER\.?\s*MOT\.?\s*WERKE/i, /\bBMW\b/], normalized: 'BMW' },
  { patterns: [/\bMERCEDES[-\s]?BENZ\b/i, /\bDAIMLER\b/i, /\bMERCEDES\b/i], normalized: 'Mercedes-Benz' },
  { patterns: [/\bVOLKSWAGEN\b/i, /\bVOLKSW\b/i, /\bVW\b/], normalized: 'VW' },
  { patterns: [/\bAUDI\b/i], normalized: 'Audi' },
  { patterns: [/\bPORSCHE\b/i], normalized: 'Porsche' },
  { patterns: [/\bOPEL\b/i], normalized: 'Opel' },
  { patterns: [/\bFORD\b/i], normalized: 'Ford' },
  { patterns: [/\bTOYOTA\b/i], normalized: 'Toyota' },
  { patterns: [/\bMAZDA\b/i], normalized: 'Mazda' },
  { patterns: [/\bHYUNDAI\b/i], normalized: 'Hyundai' },
  { patterns: [/\bKIA\b/i], normalized: 'Kia' },
  { patterns: [/\bŠKODA\b/i, /\bSKODA\b/i], normalized: 'Skoda' },
  { patterns: [/\bSEAT\b/i], normalized: 'Seat' },
  { patterns: [/\bRENAULT\b/i], normalized: 'Renault' },
  { patterns: [/\bPEUGEOT\b/i], normalized: 'Peugeot' },
  { patterns: [/\bCITROËN\b/i, /\bCITROEN\b/i], normalized: 'Citroën' },
  { patterns: [/\bFIAT\b/i], normalized: 'Fiat' },
  { patterns: [/\bVOLVO\b/i], normalized: 'Volvo' },
  { patterns: [/\bNISSAN\b/i], normalized: 'Nissan' },
  { patterns: [/\bHONDA\b/i], normalized: 'Honda' },
  { patterns: [/\bSUZUKI\b/i], normalized: 'Suzuki' },
  { patterns: [/\bDACIA\b/i], normalized: 'Dacia' },
  { patterns: [/\bMINI\b/i], normalized: 'Mini' },
  { patterns: [/\bSMART\b/i], normalized: 'Smart' },
  { patterns: [/\bTESLA\b/i], normalized: 'Tesla' },
]

export interface ZB1ExtractedData {
  kennzeichen: string | null
  erstzulassung: string | null
  fahrzeug_baujahr: number | null
  halter_nachname: string | null
  halter_vorname: string | null
  halter_strasse: string | null
  halter_plz: string | null
  halter_stadt: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  fahrzeug_farbe: string | null
  fin_vin: string | null
  hsn: string | null
  tsn: string | null
  brn: string | null
  /** Spec B: EU-/KBA-Fahrzeugklasse aus Feld J (M1 | N1 | L3e | ...) -> Werkstatt-Matching. */
  fahrzeugklasse: string | null
}

// AAR-CMM: ZB1-Feld R = Farbe des Fahrzeugs. Vision-OCR liefert die Farbe
// meist in Großbuchstaben als Klartext direkt nach dem "R"-Label.
const FARBE_KEYWORDS = [
  'SCHWARZ', 'WEISS', 'WEIß', 'GRAU', 'SILBER', 'BLAU', 'ROT', 'GRÜN', 'GRUEN',
  'GELB', 'BRAUN', 'BEIGE', 'GOLD', 'ORANGE', 'VIOLETT', 'LILA', 'BORDEAUX',
  'ANTHRAZIT', 'BRONZE', 'KUPFER', 'CHAMPAGNER', 'CREME', 'TÜRKIS', 'TUERKIS',
] as const

export function parseZB1Fields(fullText: string): ZB1ExtractedData {
  const result: ZB1ExtractedData = {
    kennzeichen: null, erstzulassung: null, fahrzeug_baujahr: null,
    halter_nachname: null, halter_vorname: null,
    halter_strasse: null, halter_plz: null, halter_stadt: null,
    fahrzeug_hersteller: null, fahrzeug_modell: null, fahrzeug_farbe: null,
    fin_vin: null, hsn: null, tsn: null, brn: null, fahrzeugklasse: null,
  }

  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = lines[i + 1] ?? ''
    const trimmed = line.replace(/[()[\]]/g, '').trim()

    if (!result.fin_vin) {
      const finMatch = line.match(FIN_REGEX)
      if (finMatch) result.fin_vin = finMatch[0].toUpperCase()
    }
    // B5: Feldcode ermitteln — traegt die Zeile die amtliche Beschriftung hinter
    // dem Code ("A Amtliches Kennzeichen"), steht sie in `feld.rest`.
    const feld = zerlegeFeldZeile(trimmed)
    const code = feld?.code ?? null

    if (code === 'A') {
      // Der Wert steht je nach Scan im Rest derselben Zeile oder in der naechsten.
      // Beide werden gegen das Kennzeichen-Muster GEPRUEFT statt blind uebernommen —
      // sonst landet die Beschriftung ("Amtliches Kennzeichen") im Feld.
      for (const kandidat of [feld!.rest, nextLine]) {
        const m = kandidat.trim().match(KENNZEICHEN_ANKER)
        if (m) {
          result.kennzeichen = kandidat.trim()
          break
        }
      }
    }
    if (code === 'B') {
      const dateMatch = (feld!.rest.match(DATE_REGEX) ?? nextLine.match(DATE_REGEX))
      if (dateMatch) result.erstzulassung = dateMatch[1]
    }
    if ((code === 'C11' || code === 'C1') && nextLine) {
      // ZB1-Konvention: "NACHNAME, VORNAME" — OCR verschluckt das Komma
      // aber häufig. Daher: Komma bevorzugt, sonst Whitespace-Heuristik.
      const split = splitHalterName(nextLine.trim())
      result.halter_nachname = split.nachname
      result.halter_vorname = split.vorname
    }
    if (code === 'C12' && nextLine && !result.halter_vorname) {
      // ZB1 listet C.1.2 = Vorname(n) als eigenes Subfeld
      result.halter_vorname = nextLine.trim()
    }
    if (code === 'C13' || code === 'C3' || code === 'C4') {
      // Anschrift: die naechsten bis zu drei Zeilen tragen Strasse und "PLZ Ort" —
      // in BEIDEN Reihenfolgen. Der einzige echte prod-Scan listet "12345 Berlin"
      // UEBER "Hauptstr. 1", das idealisierte Layout genau umgekehrt. Deshalb wird
      // je Zeile am PLZ-Muster entschieden, statt auf feste Positionen zu setzen.
      for (let k = 1; k <= 3; k++) {
        const kandidat = lines[i + k]
        if (!kandidat || istFeldLabel(kandidat)) break
        const plzMatch = kandidat.match(/^(\d{5})\s+(\S.*)$/)
        if (plzMatch) {
          if (!result.halter_plz) {
            result.halter_plz = plzMatch[1]
            result.halter_stadt = plzMatch[2].trim()
          }
        } else if (!result.halter_strasse) {
          result.halter_strasse = kandidat
        }
      }
    }
    // Bei D.1/D.2/D.3/R steht der Wert im prod-Layout HINTER dem Code ("D1 FIAT",
    // "D3 Fiat 500"), im idealisierten Layout in der Folgezeile. Deshalb `rest`
    // zuerst — sonst laese "D1 FIAT" die naechste Zeile ("312") als Hersteller.
    const restOderNaechste = (feld?.rest || nextLine).trim()
    if (code === 'D1' && restOderNaechste) {
      result.fahrzeug_hersteller = normalisiereHersteller(restOderNaechste)
    }
    // D.3 = Handelsbezeichnung (z.B. "GOLF VII") — bevorzugt, weil
    // D.2 oft kryptische Typcodes ("AUV") liefert.
    if (code === 'D3' && restOderNaechste) {
      result.fahrzeug_modell = restOderNaechste
    }
    if (code === 'D2' && restOderNaechste && !result.fahrzeug_modell) {
      result.fahrzeug_modell = restOderNaechste
    }
    // R = Farbe des Fahrzeugs
    if (code === 'R' && restOderNaechste && !result.fahrzeug_farbe) {
      result.fahrzeug_farbe = restOderNaechste
    }
    // J = EU-/KBA-Fahrzeugklasse (Spec B): der harte Filter fuers Werkstatt-Matching.
    if (code === 'J' && !result.fahrzeugklasse) {
      const klasseMatch = restOderNaechste.match(FAHRZEUGKLASSE_REGEX)
      if (klasseMatch) result.fahrzeugklasse = normalisiereFahrzeugklasse(klasseMatch[1])
    }
    if (code === '21') {
      const hsnMatch = restOderNaechste.match(HSN_REGEX)
      if (hsnMatch) result.hsn = hsnMatch[1]
    }
    if (code === '22') {
      const tsnMatch = restOderNaechste.match(TSN_REGEX)
      if (tsnMatch) result.tsn = tsnMatch[1].toUpperCase()
    }
  }

  if (!result.fin_vin) {
    const allFins = fullText.match(FIN_REGEX)
    if (allFins && allFins.length > 0) {
      result.fin_vin = allFins[0].toUpperCase()
    }
  }
  if (!result.kennzeichen) {
    // B5: ZEILENWEISE gegen den Anker statt frei im Fliesstext zu suchen. Die alte
    // Variante lief ueber den GESAMTEN Text und verband dabei Zeilenenden mit
    // Zeilenanfaengen — aus den Zeilen "Q" und "F2 001354" wurde so das Phantom-
    // Kennzeichen "Q-F 2", das ueber `ziehVehicleNach` bis in SA und Gutachten
    // gewandert waere. Ein falsches Kennzeichen ist schaedlicher als keines.
    for (const kandidat of lines) {
      if (istFeldLabel(kandidat)) continue
      if (KENNZEICHEN_ANKER.test(kandidat.trim())) {
        result.kennzeichen = kandidat.trim()
        break
      }
    }
  }

  // AAR-351: Fallback-Runde für Felder die ohne Label-Match null geblieben
  // sind. Vision API liefert ZB1-Feld-Codes oft nicht auf eigenen Zeilen —
  // die Heuristiken hier springen dann als Backup ein.

  // Hersteller-Fallback: OCR-Keywords im Fließtext
  if (!result.fahrzeug_hersteller) {
    const treffer = normalisiereHersteller(fullText)
    if (treffer !== fullText) result.fahrzeug_hersteller = treffer
  }

  // Erstzulassung-Fallback: ältestes plausibles DD.MM.YYYY-Datum. Erstzulassung
  // ist per Definition älter als Ausstellungsdatum (I.1) oder TÜV-Termin —
  // daher nehmen wir das Datum mit dem frühesten Timestamp, sofern 1980..jetzt+1.
  if (!result.erstzulassung) {
    const dates = Array.from(fullText.matchAll(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g))
    const maxYear = new Date().getFullYear() + 1
    let oldest: { str: string; ts: number } | null = null
    for (const [full, dd, mm, yyyy] of dates) {
      const year = Number(yyyy)
      if (year < 1980 || year > maxYear) continue
      const ts = Date.parse(`${yyyy}-${mm}-${dd}`)
      if (Number.isNaN(ts)) continue
      if (!oldest || ts < oldest.ts) oldest = { str: full, ts }
    }
    if (oldest) result.erstzulassung = oldest.str
  }

  // Halter-Adresse-Fallback über PLZ-Anker. Deutsche PLZ sind 5-stellig +
  // Ortsname. Wir suchen die erste Zeile im Text die exakt so beginnt und
  // nehmen die Zeile davor als Straße, die Zeile zwei drüber als Name.
  // Das matcht das ZB1-Layout C.1 (Name) → C.3 (Straße) → PLZ + Ort.
  if (!result.halter_plz) {
    for (let i = 0; i < lines.length; i++) {
      const plzMatch = lines[i].match(/^(\d{5})\s+(\S.*)$/)
      if (!plzMatch) continue
      result.halter_plz = plzMatch[1]
      result.halter_stadt = plzMatch[2].trim()

      // Zeile davor = Straße (nicht wenn es ein Feld-Label wie "C.3" ist)
      // B5: `istFeldLabel` statt des alten `^[A-Z]\.?\d*$` — der erkannte nur den
      // NACKTEN Code. Traegt die Zeile die Beschriftung mit ("C1.3 Anschnitt"),
      // rutschte sie durch und das Formular-Label landete als Halteranschrift im
      // Lead — und von dort in die Sicherungsabtretung.
      if (!result.halter_strasse && i > 0) {
        const prev = lines[i - 1]
        if (prev && !istFeldLabel(prev) && prev.length > 2) {
          result.halter_strasse = prev
        }
      }

      // 2 Zeilen davor = Name (optional Vorname nach Komma)
      if (!result.halter_nachname && i > 1) {
        const nameLine = lines[i - 2]
        const isLabel = istFeldLabel(nameLine)
        const isNumeric = /^\d+$/.test(nameLine)
        if (nameLine && !isLabel && !isNumeric && nameLine.length > 1) {
          const parts = nameLine.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
          if (parts.length >= 2) {
            result.halter_nachname = parts[0]
            result.halter_vorname = parts[1]
          } else {
            result.halter_nachname = nameLine
          }
        }
      }
      break
    }
  }

  // HSN-Fallback: erste 4-stellige Zahl auf eigener Zeile, die kein Jahr
  // ist (1900-2100 ausgeschlossen). ZB1 listet HSN üblicherweise als
  // Standalone-Token direkt nach Feld "2.1".
  if (!result.hsn) {
    for (const line of lines) {
      const m = line.match(/^(\d{4})$/)
      if (!m) continue
      const n = Number(m[1])
      if (n >= 1900 && n <= 2100) continue
      result.hsn = m[1]
      break
    }
  }

  // Lackfarbe-Fallback: Keyword-Suche im Fließtext
  if (!result.fahrzeug_farbe) {
    for (const farbe of FARBE_KEYWORDS) {
      const re = new RegExp(`\\b${farbe}\\b`, 'i')
      if (re.test(fullText)) {
        result.fahrzeug_farbe = farbe
          .replace('WEIß', 'WEISS')
          .replace('GRUEN', 'GRÜN')
          .replace('TUERKIS', 'TÜRKIS')
        break
      }
    }
  }

  // BRN-Fallback: Label "BRN" oder "Bundesweite Registriernummer" gefolgt
  // von alphanumerischem 7-9-stelligem Code. ZB1 druckt die BRN i.d.R. als
  // eigenständige Zeile direkt nach dem Label im Sicherheitsdruck.
  if (!result.brn) {
    const brnLabel = fullText.match(
      /\b(?:BRN|Bundesweite\s+Registriernummer)\b[:\s]*([A-Z0-9]{7,12})\b/i,
    )
    if (brnLabel) result.brn = brnLabel[1].toUpperCase()
  }

  // Vor/Nachname-Fallback: wenn nur Nachname-Feld gefüllt aber whitespace-
  // separierte Tokens enthält (OCR hat Komma verschluckt), Split nochmal
  // mit Whitespace-Heuristik.
  if (result.halter_nachname && !result.halter_vorname) {
    const split = splitHalterName(result.halter_nachname)
    if (split.vorname) {
      result.halter_nachname = split.nachname
      result.halter_vorname = split.vorname
    }
  }

  // AAR-181: Baujahr aus Erstzulassung ableiten (DD.MM.YYYY → YYYY)
  if (result.erstzulassung) {
    const m = result.erstzulassung.match(/(\d{4})\s*$/)
    if (m) {
      const y = Number(m[1])
      const maxYear = new Date().getFullYear() + 1
      if (y >= 1990 && y <= maxYear) result.fahrzeug_baujahr = y
    }
  }

  return result
}

/**
 * Splittet einen Halter-Namen wie er aus ZB1-OCR kommt in Vor/Nachname.
 *
 * Regel: ZB1 schreibt offiziell "NACHNAME, VORNAME". Vision-API verschluckt
 * Kommas oft → Fallback über Whitespace + Großbuchstaben-Heuristik.
 *
 * Beispiele:
 *   "Mustermann, Max"        → { nachname: "Mustermann", vorname: "Max" }
 *   "MUSTERMANN MAX"         → { nachname: "MUSTERMANN", vorname: "MAX" } (UPPERCASE = Nachname)
 *   "Max Mustermann"         → { nachname: "Mustermann", vorname: "Max" } (Mixedcase = letzter Token Nachname)
 *   "Müller-Schmidt, Hans"   → { nachname: "Müller-Schmidt", vorname: "Hans" }
 *   "von der Heide, Peter"   → { nachname: "von der Heide", vorname: "Peter" }
 *   "Mustermann"             → { nachname: "Mustermann", vorname: null }
 */
export function splitHalterName(raw: string): {
  nachname: string | null
  vorname: string | null
} {
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  if (!cleaned) return { nachname: null, vorname: null }

  // 1) Komma/Semikolon-Split (ZB1-Standard)
  if (/[,;]/.test(cleaned)) {
    const parts = cleaned.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) return { nachname: parts[0], vorname: parts[1] }
    if (parts.length === 1) return { nachname: parts[0], vorname: null }
  }

  // 2) Whitespace-Split: 2+ Tokens
  const tokens = cleaned.split(/\s+/)
  if (tokens.length === 1) return { nachname: tokens[0], vorname: null }

  // Wenn alle Tokens UPPERCASE → ZB1-Layout "NACHNAME VORNAME"
  // (DIN-Schreibweise auf Behördendokumenten)
  const allUpper = tokens.every((t) => t === t.toUpperCase() && /[A-ZÄÖÜß]/.test(t))
  if (allUpper) {
    // Erstes Token = Nachname (kann Bindestrich-Doppelname sein, schon im Token)
    return { nachname: tokens[0], vorname: tokens.slice(1).join(' ') }
  }

  // Mixedcase ("Max Mustermann"): letztes Token = Nachname.
  // Adelstitel/Präfixe (von, van, de, zu, ten) bleiben am Nachnamen kleben:
  // "von der Heide" → vorname=erste Tokens, nachname=ab erstem Präfix.
  const PREFIXES = new Set(['von', 'van', 'de', 'der', 'den', 'zu', 'ten', 'le', 'la', 'di', 'da', 'del'])
  const prefixIdx = tokens.findIndex((t, i) => i > 0 && PREFIXES.has(t.toLowerCase()))
  if (prefixIdx > 0) {
    return {
      vorname: tokens.slice(0, prefixIdx).join(' '),
      nachname: tokens.slice(prefixIdx).join(' '),
    }
  }
  return {
    vorname: tokens.slice(0, -1).join(' '),
    nachname: tokens[tokens.length - 1],
  }
}

/**
 * Ruft die Google Cloud Vision API auf und liefert den extrahierten Rohtext +
 * geparste ZB1-Felder zurück. Wird sowohl vom Fall-API-Endpoint als auch vom
 * Twilio-Inbound-Webhook (AAR-182 Lead-Pfad) genutzt.
 */
export async function runZB1Ocr(base64Image: string): Promise<{
  fullText: string
  extracted: ZB1ExtractedData
} | { error: string; status?: number }> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) return { error: 'GOOGLE_VISION_API_KEY nicht konfiguriert', status: 500 }

  // Strip data URI prefix if present
  const payload = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image

  // AAR-350: fetch() in try/catch — DNS-Fehler, Timeout oder abgeschaltete
  // Vision-API haben bisher die komplette Server-Action crashen lassen.
  let response: Response
  try {
    response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: payload },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      },
    )
  } catch (err) {
    console.error(
      '[AAR-350] Vision API fetch crashed:',
      err instanceof Error ? err.message : err,
    )
    return {
      error: `Netzwerk-Fehler Vision API: ${err instanceof Error ? err.message : 'Unbekannt'}`,
      status: 502,
    }
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '<kein Body>')
    console.error('[AAR-182] Vision API error:', errText)
    return { error: `Google Vision API Fehler: ${response.status}`, status: 502 }
  }
  // AAR-350: JSON-Parse ebenfalls defensiv — eine HTML-Fehlerseite (bei
  // Proxy-/Gateway-Fehlern keine Seltenheit) würde sonst die Action crashen.
  let data: unknown
  try {
    data = await response.json()
  } catch (err) {
    console.error(
      '[AAR-350] Vision API JSON-Parse crashed:',
      err instanceof Error ? err.message : err,
    )
    return {
      error: `Vision API lieferte ungültiges JSON: ${err instanceof Error ? err.message : 'Unbekannt'}`,
      status: 502,
    }
  }
  const fullText =
    (data as { responses?: Array<{ fullTextAnnotation?: { text?: string } }> })
      .responses?.[0]?.fullTextAnnotation?.text ?? ''
  const extracted = parseZB1Fields(fullText)
  return { fullText, extracted }
}
