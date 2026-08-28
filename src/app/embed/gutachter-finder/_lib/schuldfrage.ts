/**
 * Schuldfrage als GEO-Deeplink-Parameter (`?schuldfrage=`).
 *
 * Die KI hat im Gespraech ohnehin geklaert, wer den Schaden verursacht hat („mir ist
 * jemand hinten reingefahren"). Kommt der Wert mit, faellt im FlowLink der komplette
 * Quali-Schritt weg — `FlowWizardKfz` berechnet ihn als
 * `qualiPending = istIncomplete && !lead.disqualifiziert && !initialSchuldfrage`.
 * Ein gesetzter Wert nimmt den Schritt also ohne jede weitere Aenderung aus dem Wizard.
 *
 * ⚠ WARUM NUR ZWEI WERTE — die drei Tabellen erlauben NICHT dieselben (gemessen am
 * 28.08.2026 an den CHECK-Constraints auf prod):
 *
 *   gutachter_finder_anfragen   gegner · unklar · teilschuld
 *   leads                       gegner · unklar · eigenverantwortung
 *   flow_szenarien              gegner · unklar · eigenverantwortung
 *
 * Die Schnittmenge ist `{gegner, unklar}`. `teilschuld` gibt es nur links,
 * `eigenverantwortung` nur rechts — ein Wert aus der jeweils anderen Menge liefe beim
 * Promote (gfa → lead) in eine CHECK-Verletzung und wuerde **still verworfen**.
 *
 * Die naheliegende Rettung — clampen wie `clampSchadentyp` — waere hier falsch:
 * `eigenverantwortung → unklar` ist keine Normalisierung, sondern eine **Verfaelschung
 * einer Aussage ueber die Schuld**. Wer selbst schuld ist, hat keinen unklaren Fall.
 * Solche Faelle sollen den Quali-Schritt bewusst durchlaufen.
 *
 * Fachlich deckt sich das: `gegner` (Haftpflicht) und `unklar` sind genau die Faelle,
 * in denen die Begutachtung ueber uns laeuft. Selbstverschulden ist ein Kasko-Fall.
 */
export const SCHULDFRAGE_DEEPLINK = ['gegner', 'unklar'] as const

export type SchuldfrageDeeplink = (typeof SCHULDFRAGE_DEEPLINK)[number]

/**
 * Nimmt den rohen Query-Wert und gibt ihn nur zurueck, wenn er in BEIDEN Tabellen
 * erlaubt ist. Alles andere → `null`, der Wizard fragt dann normal.
 *
 * Bewusst tolerant bei der Schreibweise (Trim + Kleinschreibung), damit `Gegner` genauso
 * trifft wie `gegner` — eine KI formuliert nicht normiert.
 */
export function pruefeSchuldfrage(roh: unknown): SchuldfrageDeeplink | null {
  if (typeof roh !== 'string') return null
  const v = roh.trim().toLowerCase()
  return SCHULDFRAGE_DEEPLINK.find((w) => w === v) ?? null
}
