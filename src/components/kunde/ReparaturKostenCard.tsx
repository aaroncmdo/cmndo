// R4 (Repair-Audit): Kosten-Framing fuer die Werkstatt-Reparatur-Route (Selbstzahler/Kasko).
// SaeuleMeinGeld ist hier korrekt unterdrueckt (kein Gutachten) — diese Karte ist der Ersatz:
// sie sagt dem Kunden, WAS er zahlt (Selbstzahler = selbst; Kasko = Selbstbehalt laut Police),
// statt ihn nur mit der nackten KVA-Schaetzung allein zu lassen. Reine Display-Karte; es gibt
// KEIN gespeichertes Selbstbehalt-/Schlussrechnungs-Betrag-Feld (verifiziert) — daher Kasko
// bewusst generisch ("laut Police") + Schlussrechnung nur als Beleg-Link.
import { Card } from '@/components/primitives'
import { WalletIcon, FileTextIcon } from 'lucide-react'

function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function ReparaturKostenCard({
  abrechnungsweg,
  kvaNetto,
  kvaBrutto,
  schlussrechnungUrl,
}: {
  abrechnungsweg: string | null
  kvaNetto: number | null
  kvaBrutto: number | null
  schlussrechnungUrl: string | null
}) {
  const istSelbstzahler = abrechnungsweg === 'selbstzahler'
  const kva = kvaBrutto ?? kvaNetto ?? null
  const kvaLabel = kvaBrutto != null ? 'brutto' : 'netto'

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">
            {istSelbstzahler ? 'Diese Reparatur zahlen Sie selbst' : 'Kasko-Reparatur'}
          </h2>
        </div>

        {istSelbstzahler ? (
          <p className="text-body-sm text-claimondo-ondo">
            Du beauftragst die Reparatur als Selbstzahler.{' '}
            {kva != null
              ? `Voraussichtliche Kosten: ${formatEuro(kva)} (${kvaLabel}, laut Kostenvoranschlag). `
              : 'Die Werkstatt erstellt Ihnen zunächst einen Kostenvoranschlag. '}
            Der endgültige Betrag steht mit der Schlussrechnung der Werkstatt fest.
          </p>
        ) : (
          <p className="text-body-sm text-claimondo-ondo">
            Deine Kasko-Versicherung übernimmt die Reparaturkosten. Dein Eigenanteil (Selbstbehalt)
            richtet sich nach deiner Police
            {kva != null
              ? ` — die voraussichtlichen Reparaturkosten liegen bei ${formatEuro(kva)} (${kvaLabel}).`
              : '.'}
          </p>
        )}

        {schlussrechnungUrl && (
          <a
            href={schlussrechnungUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-claimondo-navy hover:text-claimondo-ondo"
          >
            <FileTextIcon className="h-4 w-4" />
            Schlussrechnung ansehen
          </a>
        )}
      </div>
    </Card>
  )
}
