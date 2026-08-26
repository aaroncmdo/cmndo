import { TEILBEFUND_SCHWELLE } from './registry'

/**
 * Anteil der gewaehlten Punkte, der wirklich gemessen worden sein muss.
 *
 * ⚠ WARUM ES DIESE ZWEITE BEDINGUNG GIBT (25.08.2026): Vorher hing alles am
 * Nenner NACH der Messung — und der schrumpft, sobald Module scheitern
 * (gesperrte robots.txt, Betrieb in der Kartensuche nicht auffindbar, Modul
 * noch nicht gebaut). Ein Check, bei dem der Nutzer 116 Punkte gewaehlt hatte
 * und 74 gemessen werden konnten, bekam damit GAR KEINEN Wert — bestraft
 * wurde er fuer Fehlstellen, auf die er keinen Einfluss hat.
 *
 * An echten Checks gemessen: drei Laeufe mit IDENTISCHER Modulliste hatten
 * 116, 74 und 57 erhebbare Punkte. Nur der erste bekam einen Score.
 *
 * Der Vertrag lautet jetzt: genug GEWAEHLT (Aussagekraft) und genug davon
 * MESSBAR (Verlaesslichkeit). Beides einzeln geprueft, weil es zwei
 * verschiedene Maengel sind.
 */
export const MIN_MESSQUOTE = 0.5

export type ScoreErgebnis = {
  score: number | null
  keinScore: boolean
  /** Warum es keinen Wert gibt — fuer die Anzeige. */
  grund?: 'zu_wenig_umfang' | 'zu_viel_ungemessen'
}

/**
 * Design-Spec §3.2 (CONTRACT F-05).
 *
 * Der Nenner sind die tatsaechlich ERHEBBAREN Punkte, nicht die Gesamtpunkte:
 * ein Modul ohne Zugang (kein Ads-Konto, keine GSC-Freigabe, gesperrte
 * robots.txt) faellt aus dem Nenner heraus, statt mit 0 bewertet zu werden
 * (R-B).
 *
 * Zwei Gruende, warum es GAR KEINEN Wert gibt:
 *
 * 1. **Zu wenig Umfang** — der Nutzer hat weniger als die halbe Gesamtpunktzahl
 *    gewaehlt. Ein auf einem Drittel der Kriterien normierter Score sieht aus
 *    wie eine Messung und ist keine (T-04). Das ist der Massenlauf-Teilbefund.
 * 2. **Zu viel ungemessen** — genug gewaehlt, aber ueber die Haelfte davon
 *    lieferte nichts. Dann ist der Prozentwert zwar rechenbar, steht aber auf
 *    zu wenigen Beinen.
 *
 * `punkteGewaehlt` faellt auf `punkteErhebbar` zurueck: wo nichts scheiterte,
 * sind beide gleich, und das alte Verhalten bleibt.
 */
export function berechneScore(
  istPunkte: number,
  punkteErhebbar: number,
  punkteGewaehlt: number = punkteErhebbar,
): ScoreErgebnis {
  if (punkteErhebbar <= 0) return { score: null, keinScore: true, grund: 'zu_viel_ungemessen' }

  // ⚠ Umfang zuerst: ein Teilbefund mit zwei Modulen soll „zu wenig Umfang"
  // heissen, auch wenn beide sauber gemessen haben.
  if (punkteGewaehlt < TEILBEFUND_SCHWELLE) {
    return { score: null, keinScore: true, grund: 'zu_wenig_umfang' }
  }

  if (punkteErhebbar < punkteGewaehlt * MIN_MESSQUOTE) {
    return { score: null, keinScore: true, grund: 'zu_viel_ungemessen' }
  }

  return { score: Math.round((istPunkte / punkteErhebbar) * 100), keinScore: false }
}
