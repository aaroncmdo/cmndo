// Geteilte Lesehilfe fuer leads/claims.auswertung_unverbindlich (Mig 20260830230040).
//
// Zwei Consumer: das Dispatch-Sektion-Panel (Lead) und die SV-Fallakten-Karte (Claim).
// Bewusst hier statt zweimal dieselben Label-Maps — pure, ohne React/Server-Direktive,
// damit Client- UND Server-Component sie importieren koennen.
//
// ⚠ Diese Auswertung ist NICHT dasselbe wie die Foto-Vorschaetzung
// (getAnspruchVorschauFuerFall): die hier stammt aus drei angeklickten Antworten und ist
// statisch, die andere ist fallbezogen aus echten Fotos gerechnet. Der Auftrag ist da
// ausdruecklich — "wer sie später gleich behandelt, verwechselt Kontext mit Messung".
// Deshalb bekommen beide eine EIGENE Karte, keine gemeinsame.

/** tier-Klartext. Spiegelt resolveTier() aus claimondo-marketing/lib/check/result-model.ts. */
export const AUSWERTUNG_TIER_LABEL: Record<string, string> = {
  voll: 'Vollanspruch gegen die Gegenseite (§ 249)',
  quote: 'Anteiliger Anspruch — Teilschuld angegeben (§ 254)',
  pruefen: 'Schuldfrage offen — Prüfung nötig',
  kasko: 'Eigenverschulden — Kasko-Weg',
}

const ANTWORT_LABEL: Record<string, Record<string, string>> = {
  schuld: {
    gegner: 'Schuld: der Unfallgegner',
    teils: 'Schuld: teils ich, teils der Gegner',
    unklar: 'Schuld: noch unklar',
    selbst: 'Schuld: ich selbst',
  },
  unfall_her: {
    unter_woche: 'Unfall: vor weniger als 1 Woche',
    bis_monat: 'Unfall: vor 1–4 Wochen',
    ueber_monat: 'Unfall: vor über einem Monat',
  },
  gutachten: {
    nein: 'Gutachten: noch keins',
    versicherung: 'Gutachten: die gegnerische Versicherung will eins schicken',
    ja: 'Gutachten: liegt vor',
  },
}

export type AuswertungAnzeige = {
  tier: string
  tierLabel: string
  antwortZeilen: string[]
  erstelltAm: string | null
  /** true bei gutachten='versicherung' — zeitkritisch: der Kunde hat freie SV-Wahl. */
  gegnerVsWillGutachter: boolean
}

/**
 * Liest das jsonb-Feld defensiv. Es kann alles enthalten (jsonb ohne Schema-Zwang),
 * daher jede Ebene einzeln pruefen statt zu casten.
 * Liefert null, wenn kein verwertbarer tier drinsteht -> Aufrufer rendert nichts.
 */
export function leseAuswertung(roh: unknown): AuswertungAnzeige | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null
  const obj = roh as Record<string, unknown>
  const tier = typeof obj.tier === 'string' ? obj.tier : null
  if (!tier) return null

  const antworten =
    obj.antworten && typeof obj.antworten === 'object' && !Array.isArray(obj.antworten)
      ? (obj.antworten as Record<string, unknown>)
      : {}

  const antwortZeilen = Object.entries(antworten)
    .map(([feld, wert]) => (typeof wert === 'string' ? ANTWORT_LABEL[feld]?.[wert] : undefined))
    .filter((z): z is string => Boolean(z))

  // timeZone explizit: ohne sie rendern Server (UTC) und Client (lokal) verschieden
  // -> Hydration-Mismatch (React #418).
  let erstelltAm: string | null = null
  if (typeof obj.erstellt_am === 'string') {
    const d = new Date(obj.erstellt_am)
    if (!Number.isNaN(d.getTime())) {
      erstelltAm = d.toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    }
  }

  return {
    tier,
    tierLabel: AUSWERTUNG_TIER_LABEL[tier] ?? tier,
    antwortZeilen,
    erstelltAm,
    gegnerVsWillGutachter: antworten.gutachten === 'versicherung',
  }
}
