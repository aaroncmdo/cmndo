/**
 * Umkreis-Box: das kleinste Lat/Lng-Rechteck, das einen Radius um einen Punkt
 * VOLLSTÄNDIG enthält.
 *
 * Zweck: einen Radius-Filter in die DATENBANK vorziehen, statt alle Zeilen zu
 * holen und im JS zu verwerfen. Der Haversine-Filter bleibt danach unverändert
 * stehen — die Box ersetzt ihn nicht, sie verkleinert nur die Menge, die ihn
 * erreicht.
 *
 * ⚠ DIE EINE EIGENSCHAFT, DIE ZÄHLEN MUSS: Die Box ist ein SUPERSET des
 * Kreises. Wäre sie irgendwo schmaler, verschwänden Kandidaten still — genau
 * der Fehler, den der Aufrufer gerade behebt. Deshalb ist sie bewusst etwas zu
 * groß: der Haversine-Filter sortiert die Ecken des Rechtecks danach ohnehin
 * korrekt aus.
 *
 * Warum nicht `bboxForRoute` aus `@/lib/mapbox/blitzer`: die rechnet mit fest
 * 70 km je Längengrad ("grob genug für Puffer" — für einen Kartenpuffer von
 * 500 m stimmt das). Auf 54,9° N, dem Nordrand des deutschen Datenbestands,
 * sind es 63,9 km — eine daraus gebaute Box wäre 9 % zu SCHMAL und schnitte
 * Kandidaten weg.
 */

/** Meridian-Grad in km (WGS84-Mittel). Über die Breite praktisch konstant. */
const KM_PRO_GRAD_LAT = 111.32

/**
 * Sicherheitsmarge auf beide Achsen. Fängt Rundung und die Abweichung des
 * Kugelmodells von der Erdabplattung ab (< 0,3 %) — lieber ein paar Kandidaten
 * zu viel prüfen als einen zu wenig finden.
 */
const MARGE = 1.02

export type UmkreisBox = {
  latVon: number
  latBis: number
  lngVon: number
  lngBis: number
}

/**
 * @param lat Mittelpunkt, Grad
 * @param lng Mittelpunkt, Grad
 * @param radiusKm Radius, der vollständig in die Box passen muss
 */
export function umkreisBox(lat: number, lng: number, radiusKm: number): UmkreisBox {
  const dLat = ((radiusKm * MARGE) / KM_PRO_GRAD_LAT)

  // ⚠ Der Kreis ist an seinem POLNÄHEREN Rand am breitesten, nicht in der
  // Mitte: je näher am Pol, desto kürzer ein Längengrad, desto MEHR Grad
  // deckt dieselbe Strecke ab. Mit cos(Mittelpunkt) gerechnet wäre die Box
  // oben zu schmal.
  const extremLat = Math.min(89.9, Math.abs(lat) + dLat)
  const cosExtrem = Math.max(Math.cos((extremLat * Math.PI) / 180), 1e-6)
  const dLng = (radiusKm * MARGE) / (KM_PRO_GRAD_LAT * cosExtrem)

  return {
    latVon: lat - dLat,
    latBis: lat + dLat,
    // Über 180° hinaus wird NICHT umgebrochen: ein Rechteck kann den
    // Datumswechsel nicht abbilden, und ein stillschweigend umgeklappter
    // Bereich fände die falschen Zeilen. Für den deutschen Bestand
    // (5,9°–15,0° O, gemessen 09.09.2026) ist der Fall unerreichbar; die
    // Grenzen bleiben deshalb roh und damit ehrlich.
    lngVon: lng - dLng,
    lngBis: lng + dLng,
  }
}
