/**
 * Selektoren fuer nutzersichtbare CTA-Texte, die schon einmal umbenannt wurden.
 *
 * Warum tolerant (alt|neu) statt einfach der neue Text:
 * Diese Specs laufen gegen PROD. Zwischen „Umbenennung ist auf staging gemergt"
 * und „prod-Deploy ist durch" liegen bei uns regelmaessig 10-30 Minuten — in
 * diesem Fenster zeigt prod noch den ALTEN Text, das Repo kennt schon den NEUEN.
 * Ein harter Selektor ist dann rot, ohne dass irgendetwas kaputt ist; genau so
 * hat der Vertrags-Button am 01.09. das journey-gate der Release-Runde geblockt
 * (#5808 aenderte `step_sa.cta_sign`, drei Specs suchten weiter den alten Text).
 * Dasselbe gilt in die andere Richtung fuer einen Rollback.
 *
 * ⚠ Das ist bewusst KEIN Auslesen von `src/i18n/messages/de.json`: das Repo ist
 * der Stand von HEUTE, prod der Stand des letzten Deploys. Gegen prod zu testen
 * heisst, beide Staende zu akzeptieren, solange die Umbenennung frisch ist.
 *
 * Ist eine Umbenennung lange durch, darf der alte Zweig hier raus.
 */

/**
 * Signatur-CTA im SA-/Vollmacht-Schritt (`step_sa.cta_sign`).
 * alt: „SA unterzeichnen" → neu seit #5808 (01.09.2026): „Beauftragung unterschreiben".
 */
export const CTA_SA_UNTERSCHREIBEN = /SA unterzeichnen|Beauftragung unterschreiben/i
