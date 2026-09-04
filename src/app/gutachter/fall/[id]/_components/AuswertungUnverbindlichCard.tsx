import type { AuswertungAnzeige } from '@/lib/anspruch/auswertung-unverbindlich'

/**
 * SV-Fallakte: read-only Karte mit der Selbstauskunft des Kunden aus der Anspruchsprüfung
 * (claims.auswertung_unverbindlich, Mig 20260830230040).
 *
 * BEWUSST eine eigene Karte neben AnspruchVorschauCard, nicht dieselbe: die dort stammt aus
 * echten Schadenfotos und ist fallbezogen gerechnet, diese hier aus drei angeklickten
 * Antworten und ist statisch. Wer beides in eine Karte legt, verwechselt Kontext mit Messung.
 *
 * Enthält bewusst KEINEN Eurobetrag — die im Kunden-Funnel gezeigten Spannen sind für jeden
 * mit derselben Schuldangabe identisch und werden gar nicht gerechnet.
 *
 * Card-Markup bewusst wie in AnspruchVorschauCard (getönt, bg-claimondo-bg) statt
 * shared/SectionCard: die beiden Karten stehen direkt untereinander und gehören zusammen
 * (unverbindliche Vorab-Info), SectionCard ist weiß — das risse sie optisch auseinander.
 * Zudem ist SectionCard 'use client'; diese Karte bleibt so eine reine Server-Component.
 * check:component-set --ratchet meldet dafür 0 neue Verletzer.
 */
export function AuswertungUnverbindlichCard({ auswertung }: { auswertung: AuswertungAnzeige }) {
  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-4">
      <h3 className="text-heading-sm font-bold text-claimondo-navy">Selbstauskunft des Kunden</h3>
      <p className="mt-1 text-caption text-claimondo-shield">
        Aus der Anspruchsprüfung auf claimondo.de — drei angeklickte Antworten. Unverbindlich,
        keine Messung und kein Ersatz für Ihr Gutachten.
      </p>

      <p className="mt-3 text-body-sm font-semibold text-claimondo-navy">{auswertung.tierLabel}</p>

      {auswertung.antwortZeilen.length > 0 && (
        <ul className="mt-2 space-y-1">
          {auswertung.antwortZeilen.map((zeile) => (
            <li key={zeile} className="text-body-sm text-claimondo-shield">
              {zeile}
            </li>
          ))}
        </ul>
      )}

      {/* Für den SV die wichtigste Einzelangabe: die Gegenseite will einen eigenen Gutachter
          schicken. Das ist zeitkritisch — der Geschädigte darf seinen SV frei wählen. */}
      {auswertung.gegnerVsWillGutachter && (
        <p className="mt-3 rounded-ios-md border border-claimondo-ondo/25 bg-white p-3 text-body-sm font-medium text-claimondo-navy">
          Zeitkritisch: Der Kunde gab an, die gegnerische Versicherung wolle einen eigenen
          Gutachter schicken. Er darf seinen Sachverständigen frei wählen.
        </p>
      )}

      {auswertung.erstelltAm && (
        <p className="mt-2 text-caption text-claimondo-shield">
          Angegeben am {auswertung.erstelltAm} — Einschätzung von damals, nicht von heute.
        </p>
      )}
    </div>
  )
}
