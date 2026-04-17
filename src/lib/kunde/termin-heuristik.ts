// AAR-384: Heuristik "Termin beim Kunden zuhause vs. irgendwo anders".
//
// Wenn die Besichtigung beim Kunden zuhause stattfindet (z. B. Auto in
// der Einfahrt, Garage), braucht der Kunde KEIN Tracking — er ist ja
// sowieso da. Wenn die Besichtigung an einer Werkstatt / neutralen
// Adresse / anderem Ort stattfindet, hilft Tracking dem SV die
// Wartezeit zu verstehen.
//
// Vergleich: halter_* (leads) vs. schadens_* / besichtigungsort_adresse
// (faelle). Normalisiert durch Kleinschreibung + Whitespace-Kollaps +
// Entfernen von Umlaut-Varianten.

type MinLead = {
  halter_strasse?: string | null
  halter_plz?: string | null
  halter_ort?: string | null
}

type MinFall = {
  schadens_adresse?: string | null
  schadens_plz?: string | null
  schadens_ort?: string | null
  besichtigungsort_adresse?: string | null
}

function normalize(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Gibt true zurück wenn die Termin-Adresse (aus fall) mit sehr hoher
 * Wahrscheinlichkeit die Halter-Adresse (aus lead) ist.
 * Heuristik: PLZ muss matchen UND Straßenname muss enthalten sein
 * (entweder als Teil der Besichtigungsort-Adresse oder der Schadens-
 * Adresse). Bei unvollständigen Daten → false (safer default: Tracking
 * anbieten).
 */
export function terminBeiKundeZuhause(
  lead: MinLead | null,
  fall: MinFall | null,
): boolean {
  if (!lead || !fall) return false
  const halterPlz = (lead.halter_plz ?? '').trim()
  const halterStrasse = normalize(lead.halter_strasse)
  if (!halterPlz || !halterStrasse) return false

  // Zusammengebauter Termin-Adress-String
  const terminFull = normalize(
    fall.besichtigungsort_adresse ??
      [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort]
        .filter(Boolean)
        .join(' '),
  )
  if (!terminFull) return false

  // PLZ muss im Termin-String auftauchen
  if (!terminFull.includes(halterPlz)) return false

  // Straße (oder Hausnummer-freier Stamm) muss enthalten sein
  const strasseStamm = halterStrasse.split(' ')[0]
  if (strasseStamm.length < 3) return false
  return terminFull.includes(strasseStamm)
}
