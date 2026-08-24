import { TEILBEFUND_SCHWELLE } from './registry'

/**
 * Design-Spec §3.2 (CONTRACT F-05).
 *
 * Der Nenner sind die tatsaechlich ERHEBBAREN Punkte, nicht die Gesamtpunkte:
 * ein Modul ohne Zugang (kein Ads-Konto, keine GSC-Freigabe, gesperrte
 * robots.txt) faellt aus dem Nenner heraus, statt mit 0 bewertet zu werden
 * (R-B).
 *
 * Unter der Schwelle gibt es GAR KEINEN Wert — ein auf einem Drittel der
 * Kriterien normierter Score sieht aus wie eine Messung und ist keine.
 */
export function berechneScore(
  istPunkte: number,
  punkteErhebbar: number,
): { score: number | null; keinScore: boolean } {
  if (punkteErhebbar <= 0) return { score: null, keinScore: true }
  if (punkteErhebbar < TEILBEFUND_SCHWELLE) return { score: null, keinScore: true }
  return { score: Math.round((istPunkte / punkteErhebbar) * 100), keinScore: false }
}
