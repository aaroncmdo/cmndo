// KFZ-172 Phase 3: OCR-Parsing-Patterns fuer verschiedene Dokument-Typen.
// Regex-basiert, robust mit Fallbacks. Wird von der OCR Edge Function
// aufgerufen nachdem Google Vision API den Text extrahiert hat.

export type FahrzeugscheinData = {
  fin: string | null
  kennzeichen: string | null
  halter: string | null
  erstzulassung: string | null
  hersteller: string | null
  modell: string | null
}

export type VersicherungsscheinData = {
  versicherer: string | null
  vsnummer: string | null
  versicherter: string | null
  vertragsbeginn: string | null
}

export type FuehrerscheinData = {
  vorname: string | null
  nachname: string | null
  geburtsdatum: string | null
  klasse: string | null
}

export type UnfallberichtData = {
  datum: string | null
  ort: string | null
  beteiligte: string | null
}

export function parseFahrzeugschein(text: string): FahrzeugscheinData {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const all = lines.join(' ')

  // FIN: 17-stellig, alphanumerisch, oft nach "E" oder "Fahrzeug-Ident"
  const finMatch = all.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
  const fin = finMatch?.[1] ?? null

  // Kennzeichen: DE Format z.B. K-AB 1234 oder K AB 1234
  const kzMatch = all.match(/\b([A-ZÄÖÜ]{1,3}[\s-][A-Z]{1,2}\s?\d{1,4})\b/)
  const kennzeichen = kzMatch?.[1]?.replace(/\s+/g, ' ') ?? null

  // Halter: nach "C.1" oder "Name" (Feld C.1 im Fahrzeugschein)
  const halterMatch = all.match(/C\.?1[.:)\s]+([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)+)/)
  const halter = halterMatch?.[1] ?? null

  // Erstzulassung: Datum nach "B" (Feld B im Fahrzeugschein)
  const ezMatch = all.match(/\b(\d{2}[./]\d{2}[./]\d{4})\b/)
  const erstzulassung = ezMatch?.[1] ?? null

  // Hersteller: nach "D.1" oder "Marke"
  const herstellerMatch = all.match(/D\.?1[.:)\s]+([A-ZÄÖÜ][A-Za-zÄÖÜäöü\s-]+?)(?:\s{2}|$)/)
  const hersteller = herstellerMatch?.[1]?.trim() ?? null

  // Modell: nach "D.2" oder "Handelsbezeichnung"
  const modellMatch = all.match(/D\.?2[.:)\s]+(.+?)(?:\s{2}|$)/)
  const modell = modellMatch?.[1]?.trim() ?? null

  return { fin, kennzeichen, halter, erstzulassung, hersteller, modell }
}

export function parseVersicherungsschein(text: string): VersicherungsscheinData {
  const all = text.replace(/\n/g, ' ')

  // Versicherer: oft der Name oben im Dokument
  const versichererPatterns = [
    /(?:Allianz|HUK|DEVK|AXA|Generali|ADAC|HDI|LVM|VHV|Württembergische|Gothaer|Zurich|R\+V|Ergo|Debeka|Signal Iduna|Provinzial|SV Sparkassen)/i,
  ]
  let versicherer: string | null = null
  for (const p of versichererPatterns) {
    const m = all.match(p)
    if (m) { versicherer = m[0]; break }
  }

  // Versicherungsnummer
  const vsMatch = all.match(/(?:VS|Versicherungsschein|Police)[-.:\s]*Nr\.?\s*[:\s]?\s*(\S+)/i)
  const vsnummer = vsMatch?.[1] ?? null

  // Versicherter Name
  const vtMatch = all.match(/(?:Versicherungsnehmer|VN)[:\s]+([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)+)/i)
  const versicherter = vtMatch?.[1] ?? null

  // Vertragsbeginn
  const beginMatch = all.match(/(?:Beginn|Vertragsbeginn|ab)[:\s]*(\d{2}[./]\d{2}[./]\d{4})/i)
  const vertragsbeginn = beginMatch?.[1] ?? null

  return { versicherer, vsnummer, versicherter, vertragsbeginn }
}

export function parseFuehrerschein(text: string): FuehrerscheinData {
  const all = text.replace(/\n/g, ' ')

  // Felder 1 (Nachname) und 2 (Vorname) im EU-Fuehrerschein
  const nachnameMatch = all.match(/1\.?\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)*)/)
  const vornameMatch = all.match(/2\.?\s+([A-ZÄÖÜ][a-zäöüß]+)/)
  const gebMatch = all.match(/3\.?\s+(\d{2}[./]\d{2}[./]\d{4})/)
  const klasseMatch = all.match(/(?:9\.?\s+|Klasse[:\s]+)([ABCDE][A-Z0-9,\s]*)/i)

  return {
    vorname: vornameMatch?.[1] ?? null,
    nachname: nachnameMatch?.[1] ?? null,
    geburtsdatum: gebMatch?.[1] ?? null,
    klasse: klasseMatch?.[1]?.trim() ?? null,
  }
}

export function parseUnfallbericht(text: string): UnfallberichtData {
  const all = text.replace(/\n/g, ' ')

  const datumMatch = all.match(/(?:Unfalldatum|Datum|am)[:\s]*(\d{2}[./]\d{2}[./]\d{4})/i)
  const ortMatch = all.match(/(?:Unfallort|Ort|in)[:\s]+([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ]?[a-zäöüß]+)*)/i)
  const beteiligteMatch = all.match(/(?:Beteiligte|Fahrzeug)[:\s]+(.{10,80})/i)

  return {
    datum: datumMatch?.[1] ?? null,
    ort: ortMatch?.[1] ?? null,
    beteiligte: beteiligteMatch?.[1]?.trim() ?? null,
  }
}
