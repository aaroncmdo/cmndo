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
 * Das Vokabular unserer eigenen Berater-API — und der Grund, warum es Aliase braucht.
 *
 * `GET /api/v1/pruefe-anspruch` nimmt `schuldfrage=[unverschuldet|teilschuld|selbst|unklar]`.
 * Das steht so in llms-full.txt und in der OpenAPI-Spec, die KI-Assistenten direkt als Tool
 * importieren. Ein Assistent, der erst den Anspruch prueft und dann den Buchungslink baut,
 * traegt seinen Wert (`unverschuldet`) voellig folgerichtig weiter — und der faellt hier
 * ohne Alias still weg. Genau die Reibung, die `schadenart` drei Tage lang wirkungslos
 * gemacht hat, nur eine Ebene hoeher: nicht die Allowlist verwirft, sondern die Wertpruefung.
 *
 * `teilschuld` und `selbst` bekommen bewusst KEINEN Alias — sie haben in `leads` kein
 * Gegenstueck (s.o.), und beide Faelle gehoeren ohnehin ins Gespraech mit einem Berater.
 */
const ALIASE: Record<string, SchuldfrageDeeplink> = {
  unverschuldet: 'gegner',
  // Wie die KI es im Gespraech formuliert haette, wenn sie unsere Spaltennamen nicht kennt.
  gegnerisch: 'gegner',
  fremdverschulden: 'gegner',
  offen: 'unklar',
  strittig: 'unklar',
}

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
  const treffer = SCHULDFRAGE_DEEPLINK.find((w) => w === v)
  if (treffer) return treffer
  return ALIASE[v] ?? null
}
