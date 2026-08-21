// Bruecke: unsere Stadt-Slugs -> amtlicher Gemeindeschluessel (AGS, 8-stellig).
//
// WOFUER: JEDE amtliche Quelle schluesselt darauf — KBA-Fahrzeugbestand,
// Unfallatlas, Destatis-Gemeindeverzeichnis. Unsere Staedte tragen nur
// slug/name/lat/lng. Ohne diese Bruecke ist keine davon nutzbar; das war bei
// der Unfallatlas-Pruefung am 19.08.2026 der offene Punkt.
//
// ⭐ Der Abgleich VALIDIERT SICH SELBST: stimmt der AGS, muss der Pkw-Bestand
// plausibel zur gepflegten Einwohnerzahl passen. Ein Fehlgriff auf ein
// gleichnamiges Dorf faellt damit sofort auf — ein reiner Namensvergleich
// muesste sonst raten.
//
// Reine Logik, ohne Netz/Datei — der CLI-Teil liegt in
// scripts/generate-stadt-amtsdaten.mjs.

/** Verwaltungszusaetze, die das KBA an Gemeindenamen haengt. */
const ZUSAETZE =
  /,\s*(ST|STADT|LANDESHAUPTSTADT|HANSESTADT|FREIE UND HANSESTADT|KREISSTADT|UNIVERSITAETSSTADT|WISSENSCHAFTSSTADT|DOKUMENTA-STADT|BAD|GKST|M)\.?$/

/**
 * Gemeindename auf eine vergleichbare Form bringen.
 *
 * Das KBA schreibt GROSS, mit aufgeloesten Umlauten und Zusaetzen:
 * `BOEBLINGEN,ST.` · `STUTTGART,LANDESHAUPTSTADT` · `HUERTH`.
 * Unsere Namen sind normal geschrieben (`Böblingen`, `Hürth`).
 *
 * ⚠ Bewusst NICHT aggressiver: Leerzeichen und Bindestriche fallen weg
 * (`Bergisch Gladbach` == `BERGISCH-GLADBACH`), aber Buchstaben bleiben — sonst
 * kollabieren verschiedene Orte auf denselben Schluessel.
 */
export function normalisiereGemeindename(name) {
  return String(name ?? '')
    .toUpperCase()
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ß/g, 'SS')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(ZUSAETZE, '')
    .replace(/[^A-Z0-9]/g, '')
}

/** Grob erwartbare Motorisierung: Pkw je Einwohner. */
const QUOTE_MIN = 0.25
const QUOTE_MAX = 0.9

/**
 * Passt der Pkw-Bestand zur Einwohnerzahl?
 *
 * `false` heisst NICHT "falscher Treffer", sondern "ansehen". Wolfsburg liegt
 * real bei 1,01 (VW-Werksflotte) — echt, aber auffaellig. Wer hohe Werte
 * durchwinkt, kann einen echten Fehlgriff nicht mehr davon unterscheiden.
 */
export function plausibel(pkw, einwohner) {
  if (!einwohner || !Number.isFinite(einwohner) || einwohner <= 0) return false
  const quote = pkw / einwohner
  return quote >= QUOTE_MIN && quote <= QUOTE_MAX
}

/**
 * Ordnet Staedte den Gemeinden zu.
 *
 * @param staedte    [{ slug, name, einwohner }]
 * @param gemeinden  [{ ags, name, pkw }]  — alle deutschen Gemeinden
 * @param overrides  { slug: ags }         — fuer Namen, die kein Abgleich trifft
 * @returns { treffer, ohneTreffer, auffaellig }
 */
export function ordneStaedteZu(staedte, gemeinden, overrides = {}) {
  const nachAgs = new Map(gemeinden.map((g) => [g.ags, g]))
  const nachName = new Map()
  for (const g of gemeinden) {
    const k = normalisiereGemeindename(g.name)
    if (!nachName.has(k)) nachName.set(k, [])
    nachName.get(k).push(g)
  }

  const treffer = {}
  const ohneTreffer = []
  const auffaellig = []

  for (const s of staedte) {
    let gemeinde = null

    if (overrides[s.slug]) {
      gemeinde = nachAgs.get(overrides[s.slug]) ?? null
    } else {
      const kandidaten = nachName.get(normalisiereGemeindename(s.name)) ?? []
      // Bei Namensgleichheit die Gemeinde mit der passendsten Groesse: ein
      // gleichnamiges Dorf hat einen Bruchteil der Fahrzeuge.
      gemeinde = kandidaten.length
        ? kandidaten.reduce((a, b) =>
            Math.abs(b.pkw - s.einwohner * 0.5) < Math.abs(a.pkw - s.einwohner * 0.5) ? b : a,
          )
        : null
    }

    if (!gemeinde) {
      ohneTreffer.push(s.slug)
      continue
    }
    treffer[s.slug] = { ags: gemeinde.ags, kbaName: gemeinde.name, pkw: gemeinde.pkw }
    if (!plausibel(gemeinde.pkw, s.einwohner)) {
      auffaellig.push({
        slug: s.slug,
        ags: gemeinde.ags,
        pkw: gemeinde.pkw,
        einwohner: s.einwohner,
        quote: s.einwohner ? Number((gemeinde.pkw / s.einwohner).toFixed(2)) : null,
      })
    }
  }

  return { treffer, ohneTreffer, auffaellig }
}

/** Gepflegte Einwohner-Angabe ("62 Tsd." / "1,1 Mio.") als Zahl. */
export function einwohnerAusText(text) {
  const t = String(text ?? '')
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  if (t.includes('Mio')) return Math.round(n * 1_000_000)
  if (t.includes('Tsd')) return Math.round(n * 1000)
  return Math.round(n)
}
