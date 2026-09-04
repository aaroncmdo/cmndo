// Clarity-Projekt-IDs, die NICHT aus NEXT_PUBLIC_CLARITY_ID kommen.
//
// Eine Tag-ID ist kein Geheimnis — sie steht im ausgelieferten Skript. Sie hier
// als Konstante zu fuehren statt als Umgebungsvariable hat einen praktischen
// Grund: NEXT_PUBLIC_*-Werte werden beim BUILD in den Code eingebacken. Eine
// fehlende oder falsche Variable faellt dann erst am ausgelieferten Bundle auf,
// und ein Nachtragen wirkt erst nach einem neuen Build (genau diese Falle hat
// den OAIQ-Pixel wochenlang still stillgelegt). Eine Konstante im Code ist
// versioniert, reviewbar und kann nicht zwischen Umgebungen auseinanderlaufen.

/**
 * Eigenes Projekt fuer die beiden Ziele der ChatGPT-Anzeigen (`/check` und
 * `/gutachter-finden`), damit bezahlter Verkehr getrennt auswertbar ist und
 * nicht im Gesamtrauschen der Website untergeht (Aaron 04.09.2026).
 *
 * ⚠ Beide Seiten stehen zusaetzlich in SKIP_ROUTES von ClarityInit. Clarity
 * vertraegt nur EINE Project-ID pro Seitenaufruf (`window.clarity` ist global);
 * ohne den Skip liefen zwei Projekte gleichzeitig und beide Aufzeichnungen
 * waeren unbrauchbar — ohne dass irgendwo ein Fehler erschiene.
 */
export const CLARITY_ID_ANZEIGEN_ZIELE = 'y7ve121jr0'
